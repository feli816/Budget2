import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { HttpError, mapDatabaseError, notFound } from '../errors.js';

const router = Router();

const baseSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  target_amount: z.number().finite().optional(),
  category_id: z.number().int().positive().optional(),
});

const createSchema = baseSchema.extend({
  id: z.string().trim().min(1).optional(),
});

const updateSchema = baseSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field must be provided',
});

const ledgerActionSchema = z.object({
  amount: z.number().positive(),
  occurred_on: z.coerce.date(),
  note: z.string().trim().optional().nullable(),
  transaction_id: z.number().int().positive().optional(),
});

const transferSchema = ledgerActionSchema.extend({
  to_provision_id: z.string().trim().min(1),
});

const cancelSchema = z.object({
  ledger_entry_id: z.number().int().positive(),
  note: z.string().trim().optional().nullable(),
  occurred_on: z.coerce.date().optional(),
});

async function ensureProvisionExists(id) {
  const { rows } = await pool.query('SELECT id FROM provision WHERE id = $1', [id]);
  if (!rows.length) {
    throw notFound('Provision not found');
  }
  return rows[0];
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM provision ORDER BY created_at ASC');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const payload = createSchema.parse(req.body);
    const id = payload.id ?? randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO provision (id, name, description, target_amount, category_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, payload.name, payload.description ?? null, payload.target_amount ?? null, payload.category_id ?? null],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM provision WHERE id = $1', [req.params.id]);
    if (!rows.length) {
      throw notFound('Provision not found');
    }
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const payload = updateSchema.parse(req.body);
    const entries = [];
    const values = [];

    if (payload.name !== undefined) {
      entries.push('name');
      values.push(payload.name);
    }
    if (payload.description !== undefined) {
      entries.push('description');
      values.push(payload.description ?? null);
    }
    if (payload.target_amount !== undefined) {
      entries.push('target_amount');
      values.push(payload.target_amount ?? null);
    }
    if (payload.category_id !== undefined) {
      entries.push('category_id');
      values.push(payload.category_id ?? null);
    }

    if (!entries.length) {
      throw new HttpError(400, 'No fields to update');
    }

    const setClause = entries.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const query = `UPDATE provision SET ${setClause} WHERE id = $1 RETURNING *`;
    const { rows } = await pool.query(query, [req.params.id, ...values]);
    if (!rows.length) {
      throw notFound('Provision not found');
    }
    res.json(rows[0]);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM provision WHERE id = $1', [req.params.id]);
    if (!rowCount) {
      throw notFound('Provision not found');
    }
    res.status(204).send();
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.get('/:id/ledger', async (req, res, next) => {
  try {
    await ensureProvisionExists(req.params.id);
    const { rows } = await pool.query(
      'SELECT * FROM provision_ledger WHERE provision_id = $1 ORDER BY occurred_on DESC, id DESC',
      [req.params.id],
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/fund', async (req, res, next) => {
  try {
    const payload = ledgerActionSchema.parse(req.body);
    await ensureProvisionExists(req.params.id);
    const { rows } = await pool.query(
      `INSERT INTO provision_ledger (provision_id, transaction_id, entry_kind, amount, occurred_on, note)
       VALUES ($1, $2, 'fund', $3, $4, $5)
       RETURNING *`,
      [req.params.id, payload.transaction_id ?? null, payload.amount, payload.occurred_on, payload.note ?? null],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.post('/:id/consume', async (req, res, next) => {
  try {
    const payload = ledgerActionSchema.parse(req.body);
    await ensureProvisionExists(req.params.id);
    const { rows } = await pool.query(
      `INSERT INTO provision_ledger (provision_id, transaction_id, entry_kind, amount, occurred_on, note)
       VALUES ($1, $2, 'consume', $3, $4, $5)
       RETURNING *`,
      [req.params.id, payload.transaction_id ?? null, payload.amount, payload.occurred_on, payload.note ?? null],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.post('/:id/transfer', async (req, res, next) => {
  try {
    const payload = transferSchema.parse(req.body);
    const occurredOn = payload.occurred_on;
    const note = payload.note ?? null;

    const result = await withTransaction(async (client) => {
      const source = await client.query('SELECT id FROM provision WHERE id = $1', [req.params.id]);
      if (!source.rows.length) {
        throw notFound('Provision not found');
      }
      const target = await client.query('SELECT id FROM provision WHERE id = $1', [payload.to_provision_id]);
      if (!target.rows.length) {
        throw notFound('Target provision not found');
      }

      const debit = await client.query(
        `INSERT INTO provision_ledger (provision_id, transaction_id, entry_kind, amount, occurred_on, note)
         VALUES ($1, $2, 'adjust', $3, $4, $5)
         RETURNING *`,
        [
          req.params.id,
          payload.transaction_id ?? null,
          -payload.amount,
          occurredOn,
          note ?? `Transfer to ${payload.to_provision_id}`,
        ],
      );

      const credit = await client.query(
        `INSERT INTO provision_ledger (provision_id, transaction_id, entry_kind, amount, occurred_on, note)
         VALUES ($1, $2, 'adjust', $3, $4, $5)
         RETURNING *`,
        [
          payload.to_provision_id,
          payload.transaction_id ?? null,
          payload.amount,
          occurredOn,
          note ?? `Transfer from ${req.params.id}`,
        ],
      );

      return { debit: debit.rows[0], credit: credit.rows[0] };
    });
    res.status(201).json(result);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.post('/:id/cancel', async (req, res, next) => {
  try {
    const payload = cancelSchema.parse(req.body);
    const occurredOn = payload.occurred_on ?? new Date();

    const { rows } = await pool.query(
      'SELECT * FROM provision_ledger WHERE id = $1 AND provision_id = $2',
      [payload.ledger_entry_id, req.params.id],
    );
    if (!rows.length) {
      throw notFound('Ledger entry not found for this provision');
    }

    const original = rows[0];
    const amount = Number(original.amount) * -1;

    const { rows: insertRows } = await pool.query(
      `INSERT INTO provision_ledger (provision_id, transaction_id, entry_kind, amount, occurred_on, note)
       VALUES ($1, $2, 'adjust', $3, $4, $5)
       RETURNING *`,
      [
        req.params.id,
        original.transaction_id ?? null,
        amount,
        occurredOn,
        payload.note ?? `Cancellation of ledger ${original.id}`,
      ],
    );

    res.status(201).json(insertRows[0]);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

export default router;
