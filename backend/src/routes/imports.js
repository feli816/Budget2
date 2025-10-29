import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'crypto';

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

if (ENABLE_UPLOAD) {
  const multer = (await import('multer')).default;
  const upload = multer({
    storage: multer.memoryStorage(),
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
  try {
    const hasFile = Boolean(req.file);
    if (ENABLE_UPLOAD && !hasFile) {
      throw badRequest('Aucun fichier reçu.');
    }
    if (hasFile && !req.file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw badRequest('Format invalide : un fichier .xlsx est attendu.');
    }

    const buffer = hasFile ? req.file.buffer : Buffer.alloc(0);
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
        totals: { parsed: totalsParsed, created: totalsParsed },
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
      const createdAt = await client.query(
        `INSERT INTO import_batch (source, original_filename, hash, status)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        ['excel', req.file?.originalname ?? 'stub.json', fileHash ?? 'stub', 'pending'],
      );
      const importBatch = createdAt.rows[0];

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

    res.status(201).json({
      import_batch_id: result.importBatch.id,
      report: result.report,
    });
  } catch (error) {
    if (error?.code === '23505') {
      next(conflict('Ce fichier a déjà été importé.'));
      return;
    }
    next(mapDatabaseError(error));
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (DISABLE_DB) {
      const hit = __stubMemory.get(String(req.params.id));
      if (!hit) {
        throw notFound('Import introuvable (mode hors-DB)');
      }
      return res.json(hit);
    }

    const { rows } = await pool.query('SELECT * FROM import_batch WHERE id = $1', [req.params.id]);
    if (!rows.length) {
      throw notFound('Import introuvable');
    }
    const batch = rows[0];
    let report = null;
    if (batch.message) {
      try {
        report = JSON.parse(batch.message);
      } catch (error) {
        report = null;
      }
    }

    res.json({ ...batch, report });
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
