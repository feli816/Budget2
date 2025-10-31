import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'crypto';
import ExcelJS from 'exceljs';

import { pool, withTransaction } from '../db.js';
import { HttpError, badRequest, conflict, mapDatabaseError, notFound } from '../errors.js';

const router = Router();

const ENABLE_UPLOAD = process.env.ENABLE_UPLOAD === '1';
const ENABLE_XLSX = process.env.ENABLE_XLSX === '1';
const DISABLE_DB = process.env.DISABLE_DB === '1';

// Mémoire locale pour simuler un "import_batch" en mode hors-DB
let __stubMemory = new Map();
let __stubSeq = 1;

// Middleware d'upload no-op par défaut
let uploadSingle = (req, res, next) => next();

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

if (ENABLE_UPLOAD) {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const multer = (await import('multer')).default;
  const upload = multer({
    dest: UPLOAD_DIR,
    limits: {
      fileSize: 15 * 1024 * 1024,
    },
  });
  uploadSingle = upload.single('file');
}

const HEADER_ROW = 9;
const IBAN_REGEX = /[A-Z]{2}\d{2}[A-Z0-9]{11,}/i;

function parseStartRow(value) {
  if (value === null || value === undefined) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const number = Number.parseInt(raw, 10);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number;
}

function resolveWorksheetRows(startRow) {
  if (!Number.isInteger(startRow) || startRow <= 0) {
    return { headerRowNumber: HEADER_ROW, firstDataRowNumber: HEADER_ROW + 1 };
  }

  if (startRow === 1) {
    return { headerRowNumber: 1, firstDataRowNumber: 2 };
  }

  const headerRowNumber = Math.max(1, startRow - 1);
  const firstDataRowNumber = Math.max(headerRowNumber + 1, startRow);
  return { headerRowNumber, firstDataRowNumber };
}

async function parseStubFile() {
  const p = path.join(process.cwd(), 'backend/fixtures/liste_operations.sample.json');
  const raw = JSON.parse(await fs.readFile(p, 'utf8'));
  const rows = (raw.rows || []).map((r) => {
    const debit = Number.isFinite(r.debit) ? -Math.abs(r.debit) : 0;
    const credit = Number.isFinite(r.credit) ? Math.abs(r.credit) : 0;
    const amount = Number((credit + debit).toFixed(2));
    const iban = (r.iban || raw.metadata?.iban || '')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .trim();
    return {
      occurred_on: r.occurred_on,
      description: r.description || '',
      value_date: r.value_date || null,
      amount,
      balance_after: r.balance_after ?? null,
      iban: iban || null,
    };
  });
  return { metadata: raw.metadata || {}, rows };
}

function toText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value.richText) return value.richText.map((part) => part.text).join('');
  if (value.text) return value.text;
  if (value.result !== undefined) return toText(value.result);
  return String(value);
}

function normalizeHeader(value) {
  const text = toText(value).trim();
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeLabel(value) {
  const text = toText(value).trim();
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function normalizeIban(value) {
  if (!value) return null;
  const text = toText(value).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!text) return null;
  if (!IBAN_REGEX.test(text)) return null;
  return text;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = toText(value).replace(/\s+/g, '').replace(/'/g, '').replace(/\u00A0/g, '').replace(',', '.');
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function parseExcelDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const result = new Date(excelEpoch);
    result.setUTCDate(result.getUTCDate() + Math.floor(value));
    return result;
  }
  const text = toText(value).trim();
  if (!text) return null;

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  const dotMatch = text.match(/^(\d{2})[.](\d{2})[.](\d{4})$/);
  if (dotMatch) {
    const [, d, m, y] = dotMatch;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  const slashMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  return null;
}

function formatDate(value) {
  const date = parseExcelDate(value);
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function computeTransactionHash(iban, date, amount, label) {
  const hash = createHash('sha256');
  const normalizedLabel = normalizeLabel(label);
  hash.update(`${iban}|${date}|${Number(amount).toFixed(2)}|${normalizedLabel}`);
  return hash.digest('hex');
}

function extractMetadata(worksheet, headerRowNumber = HEADER_ROW) {
  const metadata = {
    iban: null,
    expected_start_balance: null,
    expected_end_balance: null,
  };

  for (let rowIndex = 1; rowIndex < headerRowNumber; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    row.eachCell((cell, colNumber) => {
      const rawText = toText(cell.value);
      if (!rawText) return;

      const normalized = normalizeHeader(rawText);

      // IBAN: sur la cellule ou sa voisine de droite
      if (!metadata.iban) {
        const candidate = normalizeIban(rawText);
        if (candidate) {
          metadata.iban = candidate;
        } else {
          const rightCell = row.getCell(colNumber + 1);
          const rightCandidate = normalizeIban(rightCell?.value);
          if (rightCandidate) metadata.iban = rightCandidate;
        }
      }

      if (!metadata.expected_start_balance && /(soldeinitial|soldedebut)/.test(normalized)) {
        const neighbor = parseNumber(row.getCell(colNumber + 1)?.value);
        if (neighbor !== null) metadata.expected_start_balance = neighbor;
      }

      if (!metadata.expected_end_balance && /(soldefinal|soldefin)/.test(normalized)) {
        const neighbor = parseNumber(row.getCell(colNumber + 1)?.value);
        if (neighbor !== null) metadata.expected_end_balance = neighbor;
      }
    });
  }

  return metadata;
}

function parseWorksheet(worksheet, headerRowNumber = HEADER_ROW, firstDataRowNumber) {
  const headerRow = worksheet.getRow(headerRowNumber);
  if (!headerRow || headerRow.cellCount === 0) {
    throw new HttpError(400, `Ligne d'en-têtes introuvable (ligne ${headerRowNumber} attendue).`);
  }

  const headerMap = new Map();
  headerRow.eachCell((cell, colNumber) => {
    const normalized = normalizeHeader(cell.value);
    if (!normalized) return;

    // mapping étendu (inclut "date d execution", "operations")
    if (['dateoperation', 'date comptable', 'date operation', 'date d execution'].includes(normalized)) {
      headerMap.set(colNumber, 'occurred_on');
    } else if (['datevaleur', 'date valeur'].includes(normalized)) {
      headerMap.set(colNumber, 'value_date');
    } else if (['description', 'libelle', 'libelleoperation', 'libelle operation', 'operations'].includes(normalized)) {
      headerMap.set(colNumber, 'description');
    } else if (normalized === 'debit') {
      headerMap.set(colNumber, 'debit');
    } else if (normalized === 'credit') {
      headerMap.set(colNumber, 'credit');
    } else if (['solde', 'soldeapresoperation', 'solde apres operation'].includes(normalized)) {
      headerMap.set(colNumber, 'balance');
    } else if (['compte', 'iban', 'compteiban', 'compte iban'].includes(normalized)) {
      headerMap.set(colNumber, 'iban');
    }
  });

  if (!headerMap.size) {
    throw new HttpError(400, 'Colonnes attendues introuvables dans l\'onglet "Liste des opérations".');
  }

  const rows = [];
  const startRowNumber = firstDataRowNumber && firstDataRowNumber > headerRowNumber ? firstDataRowNumber : headerRowNumber + 1;

  for (let rowNumber = startRowNumber; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    if (!row || row.cellCount === 0) continue;

    const record = { rowNumber };
    headerMap.forEach((field, colNumber) => {
      const cell = row.getCell(colNumber);
      record[field] = cell?.value ?? null;
    });

    const rawDescription = toText(record.description).trim();
    const occurredOn = formatDate(record.occurred_on);
    const valueDate = formatDate(record.value_date);
    const debit = parseNumber(record.debit);
    const credit = parseNumber(record.credit);

    let amount = null;
    if (debit !== null && credit !== null) {
      amount = Number((credit - debit).toFixed(2));
    } else if (debit !== null) {
      amount = Number((-Math.abs(debit)).toFixed(2));
    } else if (credit !== null) {
      amount = Number(Math.abs(credit).toFixed(2));
    }

    const balanceAfter = parseNumber(record.balance);
    const iban = record.iban ? normalizeIban(record.iban) : null;

    // ligne vide
    if (!rawDescription && amount === null && !occurredOn) continue;

    rows.push({
      rowNumber,
      occurred_on: occurredOn,
      value_date: valueDate,
      description: rawDescription,
      raw_description: toText(record.description).trim(),
      amount,
      balance_after: balanceAfter !== null ? Number(balanceAfter.toFixed(2)) : null,
      iban,
    });
  }

  return rows;
}

async function parseExcelFile(buffer, options = {}) {
  if (!ENABLE_XLSX) {
    // CI/dev: lecture du stub JSON
    return parseStubFile();
  }

  if (!buffer || buffer.length === 0) {
    throw badRequest('Aucun fichier Excel reçu.');
  }

  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.getWorksheet('Liste des opérations');
  if (!worksheet) {
    throw new HttpError(400, 'Onglet "Liste des opérations" introuvable.');
  }

  const { headerRowNumber, firstDataRowNumber } = resolveWorksheetRows(options.startRow);

  const metadata = extractMetadata(worksheet, headerRowNumber);
  const rows = parseWorksheet(worksheet, headerRowNumber, firstDataRowNumber);

  rows.sort((a, b) => {
    if (a.occurred_on && b.occurred_on && a.occurred_on !== b.occurred_on) {
      return a.occurred_on.localeCompare(b.occurred_on);
    }
    return a.rowNumber - b.rowNumber;
  });

  const netChange = rows.reduce((acc, row) => acc + (row.amount ?? 0), 0);
  const rowsWithBalance = rows.filter((row) => row.balance_after !== null);

  if (metadata.expected_end_balance === null && rowsWithBalance.length) {
    metadata.expected_end_balance = rowsWithBalance[rowsWithBalance.length - 1].balance_after;
  }
  if (metadata.expected_start_balance === null && rowsWithBalance.length) {
    metadata.expected_start_balance = rowsWithBalance[0].balance_after;
    if (rowsWithBalance[0].amount !== null) {
      metadata.expected_start_balance = Number((rowsWithBalance[0].balance_after - rowsWithBalance[0].amount).toFixed(2));
    }
  }

  if (metadata.expected_end_balance !== null && metadata.expected_start_balance === null) {
    metadata.expected_start_balance = Number((metadata.expected_end_balance - netChange).toFixed(2));
  } else if (metadata.expected_start_balance !== null && metadata.expected_end_balance === null) {
    metadata.expected_end_balance = Number((metadata.expected_start_balance + netChange).toFixed(2));
  }

  return { metadata, rows };
}

async function loadExistingHashes(client, iban, minDate, maxDate) {
  const hashes = new Set();
  if (!iban || !minDate || !maxDate) return hashes;

  const { rows } = await client.query(
    `SELECT t.description, t.amount, t.occurred_on
     FROM transaction t
     JOIN account a ON a.id = t.account_id
     WHERE a.iban = $1
       AND t.occurred_on BETWEEN $2 AND $3`,
    [iban, minDate, maxDate],
  );

  for (const row of rows) {
    hashes.add(computeTransactionHash(iban, row.occurred_on, Number(row.amount), row.description));
  }

  return hashes;
}

function buildFallbackCategories(categories) {
  const byKind = new Map();
  const preferences = {
    income: ['Divers', 'Autres'],
    expense: ['Divers', 'Autres'],
    transfer: ['Divers'],
  };

  for (const category of categories) {
    if (!byKind.has(category.kind)) byKind.set(category.kind, category);
    const preferredNames = preferences[category.kind] || [];
    if (preferredNames.includes(category.name)) byKind.set(category.kind, category);
  }

  return byKind;
}

router.post('/excel', uploadSingle, async (req, res, next) => {
  const hasFile = Boolean(req.file);
  const uploadedFilePath = hasFile && req.file?.path ? req.file.path : null;

  try {
    if (ENABLE_UPLOAD && !hasFile) {
      throw badRequest('Aucun fichier reçu.');
    }
    if (hasFile && !req.file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw badRequest('Format invalide : un fichier .xlsx est attendu.');
    }

    const buffer = hasFile && uploadedFilePath ? await fs.readFile(uploadedFilePath) : Buffer.alloc(0);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const manualIbanInput = body.iban ?? body.IBAN ?? null;
    const startRowInput = body.start_row ?? body.startRow ?? null;

    const manualIban = normalizeIban(manualIbanInput);
    const startRow = parseStartRow(startRowInput);

    const parsed = ENABLE_UPLOAD
      ? await parseExcelFile(buffer, { startRow })
      : await parseStubFile();

    if (manualIban) {
      parsed.metadata.iban = manualIban;
    }

    const fileHash = hasFile ? createHash('sha256').update(buffer).digest('hex') : null;

    if (!parsed.rows.length) {
      throw badRequest('Aucune opération détectée dans le fichier.');
    }

    const ibans = new Set();
    for (const row of parsed.rows) {
      if (row.iban) ibans.add(row.iban);
    }
    if (parsed.metadata.iban) ibans.add(parsed.metadata.iban);
    if (manualIban) ibans.add(manualIban);
    if (!ibans.size) {
      throw badRequest("Impossible de déterminer l'IBAN du compte associé.");
    }

    // ----- MODE HORS-DB : on retourne un rapport sans rien écrire -----
    if (DISABLE_DB) {
      const importBatchId = __stubSeq++;
      const totalsParsed = parsed.rows.length;

      const report = {
        totals: { parsed: totalsParsed, created: totalsParsed, ignored: 0 },
        ignored: { duplicates: 0, missing_account: 0, invalid: 0 },
        categories: [], // pas de règles appliquées sans DB
        accounts: [],   // pas d’ID compte sans DB
        balances: {
          expected: {
            start: parsed.metadata?.expected_start_balance ?? null,
            end: parsed.metadata?.expected_end_balance ?? null,
          },
          actual: { start: null, end: null },
        },
      };

      const stubBatch = {
        id: importBatchId,
        source: 'excel',
        original_filename: req.file?.originalname ?? 'stub.json',
        status: 'completed',
        rows_count: totalsParsed,
        report,
      };

      __stubMemory.set(String(importBatchId), stubBatch);

      return res.status(201).json({
        import_batch_id: importBatchId,
        report,
      });
    }

    // ----- MODE AVEC DB -----
    const result = await withTransaction(async (client) => {
      const insertImportBatchQuery = {
        text: `INSERT INTO import_batch (source, original_filename, hash, status)
               VALUES ($1::text, $2::text, $3::text, $4::text)
               RETURNING *`,
        values: ['excel', req.file?.originalname ?? 'stub.json', fileHash ?? 'stub', 'pending'],
      };

      const createdAt = await client.query(insertImportBatchQuery);
      const importBatch = createdAt.rows[0];

      if (!importBatch?.id) {
        throw new Error('Failed to create import batch.');
      }

      try {
        const accountRows = await client.query(
          'SELECT id, name, iban, currency_code FROM account WHERE iban = ANY($1)',
          [Array.from(ibans)],
        );
        const accountsByIban = new Map();
        for (const account of accountRows.rows) {
          accountsByIban.set(normalizeIban(account.iban), account);
        }

        const { rows: categoryRows } = await client.query('SELECT id, name, kind FROM category');
        const categoriesById = new Map(categoryRows.map((c) => [c.id, c]));
        const fallbackCategories = buildFallbackCategories(categoryRows);

        const { rows: ruleRows } = await client.query(
          `SELECT id, target_kind, category_id, keywords, priority
           FROM rule
           WHERE enabled = TRUE
           ORDER BY priority DESC, created_at ASC`,
        );
        const rules = ruleRows.map((rule) => ({
          ...rule,
          keywords: (rule.keywords || []).map((kw) => normalizeLabel(kw)),
        }));

        const hashesByAccount = new Map();
        const rowsByAccount = new Map();
        for (const row of parsed.rows) {
          const iban = row.iban || parsed.metadata.iban;
          const normalizedIban = normalizeIban(iban);
          if (!normalizedIban) continue;
          if (!rowsByAccount.has(normalizedIban)) rowsByAccount.set(normalizedIban, []);
          rowsByAccount.get(normalizedIban).push(row);
        }

        for (const [iban, rowsForAccount] of rowsByAccount.entries()) {
          const dates = rowsForAccount.map((r) => r.occurred_on).filter(Boolean).sort();
          if (!dates.length) {
            hashesByAccount.set(iban, new Set());
            continue;
          }
          const existingHashes = await loadExistingHashes(client, iban, dates[0], dates[dates.length - 1]);
          hashesByAccount.set(iban, existingHashes);
        }

        const seenHashes = new Set();
        const createdTransactions = [];
        const summary = {
          totals: { parsed: parsed.rows.length, created: 0 },
          ignored: { duplicates: 0, missing_account: 0, invalid: 0 },
          categories: new Map(),
          accounts: new Map(),
          balances: {
            expected: {
              start: parsed.metadata.expected_start_balance,
              end: parsed.metadata.expected_end_balance,
            },
            actual: { start: null, end: null },
          },
        };

        for (const row of parsed.rows) {
          const iban = normalizeIban(row.iban || parsed.metadata.iban);
          const account = iban ? accountsByIban.get(iban) : null;
          if (!iban || !account) {
            summary.ignored.missing_account += 1;
            continue;
          }

          if (!row.occurred_on || row.amount === null || !row.description) {
            summary.ignored.invalid += 1;
            continue;
          }

          const hash = computeTransactionHash(iban, row.occurred_on, row.amount, row.description);
          let accountHashes = hashesByAccount.get(iban);
          if (!accountHashes) {
            accountHashes = new Set();
            hashesByAccount.set(iban, accountHashes);
          }
          if (seenHashes.has(hash) || accountHashes.has(hash)) {
            summary.ignored.duplicates += 1;
            continue;
          }

          const normalizedDescription = normalizeLabel(row.description);
          const kind = row.amount >= 0 ? 'income' : 'expense';
          let appliedRuleId = null;
          let categoryId = null;

          for (const rule of rules) {
            if (rule.target_kind !== kind) continue;
            if (!rule.keywords.length) continue;
            if (rule.keywords.some((kw) => kw && normalizedDescription.includes(kw))) {
              categoryId = rule.category_id;
              appliedRuleId = rule.id;
              break;
            }
          }

          if (!categoryId) {
            const fallback = fallbackCategories.get(kind);
            if (fallback) categoryId = fallback.id;
          }

          const values = [
            account.id,
            importBatch.id,
            appliedRuleId,
            null,
            categoryId ?? null,
            null,
            row.occurred_on,
            row.value_date ?? null,
            row.amount,
            account.currency_code || 'CHF',
            row.description,
            row.raw_description || row.description,
            row.balance_after ?? null,
            'real',
          ];

          const inserted = await client.query(
            `INSERT INTO transaction (
               account_id, import_batch_id, rule_id, project_id, category_id, external_id,
               occurred_on, value_date, amount, currency_code, description, raw_description, balance_after, status
             )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
             RETURNING *`,
            values,
          );

          const transaction = inserted.rows[0];
          console.log('✅ Transaction inserted', {
            accountId: account.id,
            occurred_on: row.occurred_on,
            amount: row.amount,
            description: row.description,
          });
          createdTransactions.push(transaction);
          seenHashes.add(hash);
          accountHashes.add(hash);

          summary.totals.created += 1;

          if (!summary.accounts.has(account.id)) {
            summary.accounts.set(account.id, {
              id: account.id,
              name: account.name,
              iban: account.iban,
              created: 0,
            });
          }
          summary.accounts.get(account.id).created += 1;

          if (categoryId) {
            const category = categoriesById.get(categoryId);
            if (category) {
              if (!summary.categories.has(category.id)) {
                summary.categories.set(category.id, {
                  id: category.id,
                  name: category.name,
                  kind: category.kind,
                  count: 0,
                });
              }
              summary.categories.get(category.id).count += 1;
            }
          }
        }

        summary.totals.ignored =
          summary.ignored.duplicates + summary.ignored.missing_account + summary.ignored.invalid;

        if (createdTransactions.length) {
          const net = createdTransactions.reduce((acc, trx) => acc + Number(trx.amount), 0);
          const lastWithBalance = [...createdTransactions]
            .filter((trx) => trx.balance_after !== null)
            .sort((a, b) => new Date(a.occurred_on) - new Date(b.occurred_on));

          if (lastWithBalance.length) {
            const endBalance = Number(lastWithBalance[lastWithBalance.length - 1].balance_after);
            summary.balances.actual.end = Number.isFinite(endBalance) ? endBalance : null;
            if (summary.balances.actual.end !== null) {
              summary.balances.actual.start = Number((summary.balances.actual.end - net).toFixed(2));
            }
          }
        }

        const report = {
          totals: summary.totals,
          ignored: summary.ignored,
          categories: Array.from(summary.categories.values()).sort((a, b) => b.count - a.count),
          accounts: Array.from(summary.accounts.values()),
          balances: summary.balances,
        };

        await client.query(
          `UPDATE import_batch
           SET status = $2, rows_count = $3, message = $4
           WHERE id = $1`,
          [importBatch.id, 'completed', parsed.rows.length, JSON.stringify(report)],
        );

        return { importBatch, report };
      } catch (error) {
        await client.query(
          'UPDATE import_batch SET status = $2, message = $3 WHERE id = $1',
          [importBatch.id, 'failed', error.message ?? 'Import failed'],
        );
        throw error;
      }
    });

    return res.status(201).json({
      import_batch_id: result.importBatch.id,
      report: result.report,
    });
  } catch (error) {
    if (error?.code === '23505') {
      next(conflict('Ce fichier a déjà été importé.'));
      return;
    }
    next(mapDatabaseError(error));
  } finally {
    if (uploadedFilePath) {
      try {
        await fs.unlink(uploadedFilePath);
      } catch (unlinkErr) {
        if (unlinkErr?.code !== 'ENOENT') {
          console.warn('Impossible de supprimer le fichier uploadé', unlinkErr);
        }
      }
    }
  }
});

function toNumberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeReport(rawReport) {
  const baseReport = {
    totals: { parsed: 0, created: 0, ignored: 0 },
    ignored: { duplicates: 0, missing_account: 0, invalid: 0 },
    accounts: [],
    categories: [],
    balances: {
      expected: { start: null, end: null },
      actual: { start: null, end: null },
    },
  };

  if (!rawReport || typeof rawReport !== 'object') {
    return baseReport;
  }

  const totalsSource = rawReport.totals && typeof rawReport.totals === 'object' ? rawReport.totals : {};
  const ignoredSource = rawReport.ignored && typeof rawReport.ignored === 'object' ? rawReport.ignored : {};
  const balancesSource = rawReport.balances && typeof rawReport.balances === 'object' ? rawReport.balances : {};

  const accounts = Array.isArray(rawReport.accounts)
    ? rawReport.accounts.map((account) => ({
        id:
          account?.id === null || account?.id === undefined
            ? null
            : String(account.id),
        name: typeof account?.name === 'string' ? account.name : '',
        iban:
          account?.iban === null || account?.iban === undefined
            ? null
            : String(account.iban),
        created: toNumberOrZero(account?.created),
      }))
    : [];

  const categories = Array.isArray(rawReport.categories)
    ? rawReport.categories.map((category) => ({
        id:
          category?.id === null || category?.id === undefined
            ? null
            : Number(category.id),
        name: typeof category?.name === 'string' ? category.name : '',
        kind: typeof category?.kind === 'string' ? category.kind : null,
        count: toNumberOrZero(category?.count),
      }))
    : [];

  const expectedSource = balancesSource.expected && typeof balancesSource.expected === 'object'
    ? balancesSource.expected
    : {};
  const actualSource = balancesSource.actual && typeof balancesSource.actual === 'object' ? balancesSource.actual : {};

  return {
    totals: {
      parsed: toNumberOrZero(totalsSource.parsed),
      created: toNumberOrZero(totalsSource.created),
      ignored: toNumberOrZero(totalsSource.ignored),
    },
    ignored: {
      duplicates: toNumberOrZero(ignoredSource.duplicates),
      missing_account: toNumberOrZero(ignoredSource.missing_account),
      invalid: toNumberOrZero(ignoredSource.invalid),
    },
    accounts,
    categories,
    balances: {
      expected: {
        start: toNumberOrNull(expectedSource.start),
        end: toNumberOrNull(expectedSource.end),
      },
      actual: {
        start: toNumberOrNull(actualSource.start),
        end: toNumberOrNull(actualSource.end),
      },
    },
  };
}

async function getGlobalImportSummary() {
  if (DISABLE_DB) {
    return {
      imports_count: 0,
      transactions_total: 0,
      transactions_created: 0,
      transactions_ignored: 0,
      accounts: [],
      categories: [],
      balances: { actual: { start: null, end: null } },
    };
  }

  const client = await pool.connect();
  try {
    const { rows: importStatsRows } = await client.query(
      `SELECT COUNT(*)::bigint AS imports_count, COALESCE(SUM(rows_count), 0)::bigint AS transactions_total
           FROM import_batch`,
    );
    const importsCount = Number(importStatsRows[0]?.imports_count ?? 0);
    const transactionsTotal = Number(importStatsRows[0]?.transactions_total ?? 0);

    const { rows: transactionsCreatedRows } = await client.query(
      `SELECT COUNT(*)::bigint AS transactions_created FROM transaction`,
    );
    const transactionsCreated = Number(transactionsCreatedRows[0]?.transactions_created ?? 0);

    const transactionsIgnored = Math.max(transactionsTotal - transactionsCreated, 0);

    const { rows: accountRows } = await client.query(
      `SELECT a.id, a.name, a.iban, COUNT(t.id)::bigint AS created
           FROM transaction t
           JOIN account a ON a.id = t.account_id
          GROUP BY a.id, a.name, a.iban
          ORDER BY a.name ASC, a.id ASC`,
    );
    const accounts = accountRows.map((row) => {
      const id = Number(row.id);
      return {
        id: Number.isFinite(id) ? id : null,
        name: row.name ?? '',
        iban: row.iban ?? null,
        created: Number(row.created ?? 0),
      };
    });

    const { rows: categoryRows } = await client.query(
      `SELECT c.id, c.name, c.kind, COUNT(t.id)::bigint AS count
           FROM transaction t
           JOIN category c ON c.id = t.category_id
          GROUP BY c.id, c.name, c.kind
          ORDER BY COUNT(t.id) DESC, c.name ASC, c.id ASC`,
    );
    const categories = categoryRows.map((row) => {
      const id = Number(row.id);
      return {
        id: Number.isFinite(id) ? id : null,
        name: row.name ?? '',
        kind: row.kind ?? null,
        count: Number(row.count ?? 0),
      };
    });

    const { rows: importDetailRows } = await client.query(
      `SELECT ib.id,
              ib.original_filename AS filename,
              ib.imported_at AS created_at,
              ib.rows_count AS total_transactions,
              COALESCE(stats.created_transactions, 0)::bigint AS created_transactions,
              GREATEST(ib.rows_count - COALESCE(stats.created_transactions, 0), 0)::bigint AS ignored_transactions,
              ib.status
         FROM import_batch ib
         LEFT JOIN (
                SELECT import_batch_id,
                       COUNT(*)::bigint AS created_transactions
                  FROM transaction
                 WHERE import_batch_id IS NOT NULL
                 GROUP BY import_batch_id
              ) AS stats
           ON stats.import_batch_id = ib.id
        ORDER BY ib.imported_at DESC NULLS LAST, ib.id DESC`,
    );
    const importDetails = importDetailRows.map((row) => {
      const id = Number(row.id);
      const totalTransactions = Number(row.total_transactions ?? 0);
      const createdTransactions = Number(row.created_transactions ?? 0);
      const ignoredTransactions = Number(row.ignored_transactions ?? 0);
      return {
        id: Number.isFinite(id) ? id : null,
        filename: row.filename ?? null,
        created_at: row.created_at ?? null,
        total_transactions: Number.isFinite(totalTransactions) ? totalTransactions : 0,
        created_transactions: Number.isFinite(createdTransactions) ? createdTransactions : 0,
        ignored_transactions: Number.isFinite(ignoredTransactions) ? ignoredTransactions : 0,
        status: row.status ?? null,
      };
    });

    const { rows: sumAmountRows } = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_amount FROM transaction`,
    );
    const netAmountRaw = sumAmountRows[0]?.total_amount;
    const netAmount = Number(netAmountRaw);

    const { rows: balanceRows } = await client.query(
      `SELECT balance_after
           FROM transaction
          WHERE balance_after IS NOT NULL
          ORDER BY occurred_on DESC NULLS LAST, id DESC
          LIMIT 1`,
    );
    const actualEndRaw = balanceRows[0]?.balance_after;
    const actualEnd = Number.isFinite(Number(actualEndRaw)) ? Number(actualEndRaw) : null;

    let actualStart = null;
    if (actualEnd !== null && Number.isFinite(netAmount)) {
      actualStart = Number((actualEnd - netAmount).toFixed(2));
    }

    return {
      imports_count: importsCount,
      transactions_total: transactionsTotal,
      transactions_created: transactionsCreated,
      transactions_ignored: transactionsIgnored,
      accounts,
      categories,
      balances: { actual: { start: actualStart, end: actualEnd } },
      import_details: importDetails,
    };
  } finally {
    client.release();
  }
}

router.get('/summary', async (req, res, next) => {
  try {
    const summary = await getGlobalImportSummary();
    return res.json({ summary });
  } catch (error) {
    next(error);
  }
});

router.get('/summary/export', async (req, res, next) => {
  try {
    if (!ENABLE_XLSX) {
      throw new HttpError(503, "Export XLSX désactivé.");
    }

    const data = await getGlobalImportSummary();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Résumé global');

    const headerStyle = {
      font: { bold: true },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      },
    };
    const dataBorder = {
      border: {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      },
    };

    const title = sheet.addRow(['Résumé global des imports']);
    title.font = { size: 14, bold: true };
    title.alignment = { horizontal: 'center' };
    sheet.mergeCells(`A${title.number}:C${title.number}`);
    sheet.addRow([]);

    const summaryRows = [
      ['Imports traités', data.imports_count],
      ['Transactions analysées', data.transactions_total],
      ['Transactions créées', data.transactions_created],
      ['Transactions ignorées', data.transactions_ignored],
    ];
    summaryRows.forEach((values) => {
      const row = sheet.addRow(values);
      row.eachCell((cell) => {
        cell.border = dataBorder.border;
      });
    });
    sheet.addRow([]);

    const comptesTitle = sheet.addRow(['Comptes']);
    comptesTitle.getCell(1).font = { bold: true };
    comptesTitle.getCell(1).border = dataBorder.border;
    const comptesHeader = sheet.addRow(['Nom', 'IBAN', 'Transactions créées']);
    comptesHeader.eachCell((cell) => {
      cell.font = headerStyle.font;
      cell.alignment = headerStyle.alignment;
      cell.border = headerStyle.border;
    });
    (data.accounts || []).forEach((acc) => {
      const row = sheet.addRow([acc.name, acc.iban, acc.created]);
      row.eachCell((cell) => {
        cell.border = dataBorder.border;
      });
    });
    sheet.addRow([]);

    const categoriesTitle = sheet.addRow(['Catégories']);
    categoriesTitle.getCell(1).font = { bold: true };
    categoriesTitle.getCell(1).border = dataBorder.border;
    const categoriesHeader = sheet.addRow(['Nom', 'Type', 'Transactions']);
    categoriesHeader.eachCell((cell) => {
      cell.font = headerStyle.font;
      cell.alignment = headerStyle.alignment;
      cell.border = headerStyle.border;
    });
    (data.categories || []).forEach((cat) => {
      const row = sheet.addRow([cat.name, cat.kind, cat.count]);
      row.eachCell((cell) => {
        cell.border = dataBorder.border;
      });
    });
    sheet.addRow([]);

    const balancesTitle = sheet.addRow(['Balances']);
    balancesTitle.getCell(1).font = { bold: true };
    balancesTitle.getCell(1).border = dataBorder.border;
    const balancesHeader = sheet.addRow(['Type', 'Montant']);
    balancesHeader.eachCell((cell) => {
      cell.font = headerStyle.font;
      cell.alignment = headerStyle.alignment;
      cell.border = headerStyle.border;
    });
    [
      ['Solde initial', data.balances?.actual?.start],
      ['Solde final', data.balances?.actual?.end],
    ].forEach((values) => {
      const row = sheet.addRow(values);
      row.eachCell((cell) => {
        cell.border = dataBorder.border;
      });
    });

    sheet.columns.forEach((column) => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const text = toText(cell.value);
        maxLength = Math.max(maxLength, text.length);
      });
      column.width = maxLength < 10 ? 10 : maxLength + 2;
    });

    const detailsSheet = workbook.addWorksheet('Détails des imports');
    const detailsTitle = detailsSheet.addRow(['Détails par import']);
    detailsTitle.font = { size: 14, bold: true };
    detailsTitle.alignment = { horizontal: 'center' };
    detailsSheet.mergeCells(`A${detailsTitle.number}:G${detailsTitle.number}`);
    detailsSheet.addRow([]);

    const detailHeaders = [
      'ID',
      'Nom du fichier',
      'Date',
      'Transactions totales',
      'Créées',
      'Ignorées',
      'Statut',
    ];
    const detailsHeaderRow = detailsSheet.addRow(detailHeaders);
    detailsHeaderRow.eachCell((cell) => {
      cell.font = headerStyle.font;
      cell.alignment = headerStyle.alignment;
      cell.border = headerStyle.border;
    });

    (data.import_details || []).forEach((detail) => {
      const formattedDate = detail.created_at
        ? new Date(detail.created_at).toISOString().slice(0, 10)
        : '';
      const row = detailsSheet.addRow([
        detail.id,
        detail.filename,
        formattedDate,
        detail.total_transactions,
        detail.created_transactions,
        detail.ignored_transactions,
        detail.status || '',
      ]);
      row.eachCell((cell) => {
        cell.border = dataBorder.border;
      });
    });

    detailsSheet.columns.forEach((column) => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const text = toText(cell.value);
        maxLength = Math.max(maxLength, text.length);
      });
      column.width = maxLength < 10 ? 10 : maxLength + 2;
    });

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const safeFileName = encodeURIComponent(`Résumé_global_imports_${today}.xlsx`);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeFileName}`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (DISABLE_DB) {
      const hit = __stubMemory.get(String(req.params.id));
      if (!hit) {
        throw notFound('Import introuvable (mode hors-DB)');
      }
      return res.json({
        import_batch_id: hit.id ?? Number(req.params.id),
        report: normalizeReport(hit.report ?? hit.message ?? hit),
      });
    }

    const { rows } = await pool.query('SELECT * FROM import_batch WHERE id = $1', [req.params.id]);
    if (!rows.length) {
      throw notFound('Import introuvable');
    }
    const batch = rows[0];
    let parsedMessage = null;
    if (batch.message) {
      try {
        parsedMessage = JSON.parse(batch.message);
      } catch (error) {
        parsedMessage = null;
      }
    }

    const rawReport = parsedMessage?.report ?? parsedMessage;
    const baseReport = normalizeReport(rawReport);

    const parsedTotal = Number.isFinite(Number(batch.rows_count))
      ? Number(batch.rows_count)
      : baseReport.totals.parsed;

    const { rows: transactionRows } = await pool.query(
      `SELECT t.id, t.account_id, t.amount, t.balance_after, t.occurred_on,
              a.name AS account_name, a.iban AS account_iban,
              c.id AS category_id, c.name AS category_name, c.kind AS category_kind
         FROM transaction t
         LEFT JOIN account a ON a.id = t.account_id
         LEFT JOIN category c ON c.id = t.category_id
        WHERE t.import_batch_id = $1
        ORDER BY t.occurred_on ASC, t.id ASC`,
      [batch.id],
    );

    const createdTotal = transactionRows.length;
    const totalsIgnored = Math.max(parsedTotal - createdTotal, 0);

    const ignoredDetails = { ...baseReport.ignored };
    let ignoredSum =
      ignoredDetails.duplicates + ignoredDetails.missing_account + ignoredDetails.invalid;
    if (!ignoredSum && totalsIgnored > 0) {
      ignoredDetails.duplicates = totalsIgnored;
      ignoredSum = totalsIgnored;
    }
    if (ignoredSum !== totalsIgnored) {
      const diff = totalsIgnored - ignoredSum;
      if (diff > 0) {
        ignoredDetails.duplicates += diff;
      } else if (diff < 0) {
        let remaining = -diff;
        const reduceDuplicates = Math.min(ignoredDetails.duplicates, remaining);
        ignoredDetails.duplicates -= reduceDuplicates;
        remaining -= reduceDuplicates;
        if (remaining > 0) {
          const reduceMissing = Math.min(ignoredDetails.missing_account, remaining);
          ignoredDetails.missing_account -= reduceMissing;
          remaining -= reduceMissing;
        }
        if (remaining > 0) {
          const reduceInvalid = Math.min(ignoredDetails.invalid, remaining);
          ignoredDetails.invalid -= reduceInvalid;
        }
      }
    }

    const accountsMap = new Map();
    for (const row of transactionRows) {
      const accountId = row.account_id ? String(row.account_id) : null;
      if (!accountsMap.has(accountId)) {
        accountsMap.set(accountId, {
          id: accountId,
          name: row.account_name ?? '',
          iban: row.account_iban ?? null,
          created: 0,
        });
      }
      accountsMap.get(accountId).created += 1;
    }
    const accounts = Array.from(accountsMap.values()).sort((a, b) => {
      const nameA = a.name || '';
      const nameB = b.name || '';
      return nameA.localeCompare(nameB);
    });

    const categoriesMap = new Map();
    for (const row of transactionRows) {
      if (!row.category_id) continue;
      const categoryId = Number(row.category_id);
      if (!categoriesMap.has(categoryId)) {
        categoriesMap.set(categoryId, {
          id: categoryId,
          name: row.category_name ?? '',
          kind: row.category_kind ?? null,
          count: 0,
        });
      }
      categoriesMap.get(categoryId).count += 1;
    }
    const categories = Array.from(categoriesMap.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return (a.name || '').localeCompare(b.name || '');
    });

    const netAmount = transactionRows.reduce((acc, trx) => {
      const amount = Number(trx.amount);
      return Number.isFinite(amount) ? acc + amount : acc;
    }, 0);

    let actualEnd = null;
    const transactionsWithBalance = transactionRows.filter(
      (trx) => trx.balance_after !== null && trx.balance_after !== undefined,
    );
    if (transactionsWithBalance.length) {
      const last = transactionsWithBalance[transactionsWithBalance.length - 1];
      const end = Number(last.balance_after);
      if (Number.isFinite(end)) {
        actualEnd = end;
      }
    }

    let actualStart = null;
    if (actualEnd !== null) {
      const startCandidate = Number((actualEnd - netAmount).toFixed(2));
      if (Number.isFinite(startCandidate)) {
        actualStart = startCandidate;
      }
    }

    const balances = {
      expected: baseReport.balances.expected,
      actual: {
        start: actualStart ?? baseReport.balances.actual.start,
        end: actualEnd ?? baseReport.balances.actual.end,
      },
    };

    const report = {
      totals: { parsed: parsedTotal, created: createdTotal, ignored: totalsIgnored },
      ignored: ignoredDetails,
      accounts,
      categories,
      balances,
    };

    return res.json({
      import_batch_id: batch.id,
      report,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/commit', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE import_batch SET status = 'completed' WHERE id = $1`,
      [req.params.id],
    );
    if (!rowCount) {
      throw notFound('Import introuvable');
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
