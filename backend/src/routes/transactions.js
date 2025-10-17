import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { HttpError, mapDatabaseError, notFound } from '../errors.js';

const router = Router();

const currencyRegex = /^[A-Z]{3}$/;
const dateSchema = z.coerce.date({ required_error: 'occurred_on is required' });

const baseSchema = z.object({
  account_id: z.string().trim().min(1),
  import_batch_id: z.number().int().positive().optional(),
  rule_id: z.string().trim().min(1).optional(),
  project_id: z.string().trim().min(1).optional(),
  category_id: z.number().int().positive().optional(),
  external_id: z.string().trim().optional().nullable(),
  occurred_on: dateSchema,
  value_date: z.coerce.date().optional(),
  amount: z.number().finite(),
  currency_code: z
    .string()
    .trim()
    .regex(currencyRegex, 'Currency must be a 3-letter ISO code')
    .default('CHF'),
  description: z.string().trim().min(1),
  raw_description: z.string().trim().optional().nullable(),
  balance_after: z.number().finite().optional(),
  status: z.string().trim().min(1).default('real'),
});

const createSchema = baseSchema;
const updateSchema = baseSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field must be provided',
});

router.get('/', async (req, res, next) => {
  try {
    const clauses = [];
    const values = [];

    if (req.query.account_id) {
      values.push(req.query.account_id);
      clauses.push(`account_id = $${values.length}`);
    }

    if (req.query.category_id) {
      const categoryId = Number(req.query.category_id);
      if (!Number.isInteger(categoryId)) {
        throw new HttpError(400, 'category_id must be an integer');
      }
      values.push(categoryId);
      clauses.push(`category_id = $${values.length}`);
    }

    if (req.query.q) {
      values.push(`%${req.query.q}%`);
      clauses.push(`description ILIKE $${values.length}`);
    }

    let query =
      'SELECT id, account_id, category_id, occurred_on, amount, currency_code, description, raw_description, status FROM transaction';
    if (clauses.length) {
      query += ` WHERE ${clauses.join(' AND ')}`;
    }
    query += ' ORDER BY occurred_on DESC, id DESC';

    if (req.query.limit !== undefined) {
      const limit = Number(req.query.limit);
      if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
        throw new HttpError(400, 'limit must be an integer between 1 and 100');
      }
      values.push(limit);
      query += ` LIMIT $${values.length}`;
    }

    if (req.query.offset !== undefined) {
      const offset = Number(req.query.offset);
      if (!Number.isInteger(offset) || offset < 0) {
        throw new HttpError(400, 'offset must be a non-negative integer');
      }
      values.push(offset);
      query += ` OFFSET $${values.length}`;
    }

    const { rows } = await pool.query(query, values);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const payload = createSchema.parse(req.body);
    const values = [
      payload.account_id,
      payload.import_batch_id ?? null,
      payload.rule_id ?? null,
      payload.project_id ?? null,
      payload.category_id ?? null,
      payload.external_id ?? null,
      payload.occurred_on,
      payload.value_date ?? null,
      payload.amount,
      payload.currency_code ?? 'CHF',
      payload.description,
      payload.raw_description ?? null,
      payload.balance_after ?? null,
      payload.status ?? 'real',
    ];
    const { rows } = await pool.query(
      `INSERT INTO transaction (
         account_id, import_batch_id, rule_id, project_id, category_id, external_id,
         occurred_on, value_date, amount, currency_code, description, raw_description, balance_after, status
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      values,
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM transaction WHERE id = $1', [req.params.id]);
    if (!rows.length) {
      throw notFound('Transaction not found');
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

    const add = (field, value) => {
      entries.push(field);
      values.push(value);
    };

    if (payload.account_id !== undefined) add('account_id', payload.account_id);
    if (payload.import_batch_id !== undefined) add('import_batch_id', payload.import_batch_id ?? null);
    if (payload.rule_id !== undefined) add('rule_id', payload.rule_id ?? null);
    if (payload.project_id !== undefined) add('project_id', payload.project_id ?? null);
    if (payload.category_id !== undefined) add('category_id', payload.category_id ?? null);
    if (payload.external_id !== undefined) add('external_id', payload.external_id ?? null);
    if (payload.occurred_on !== undefined) add('occurred_on', payload.occurred_on);
    if (payload.value_date !== undefined) add('value_date', payload.value_date ?? null);
    if (payload.amount !== undefined) add('amount', payload.amount);
    if (payload.currency_code !== undefined) add('currency_code', payload.currency_code);
    if (payload.description !== undefined) add('description', payload.description);
    if (payload.raw_description !== undefined) add('raw_description', payload.raw_description ?? null);
    if (payload.balance_after !== undefined) add('balance_after', payload.balance_after ?? null);
    if (payload.status !== undefined) add('status', payload.status);

    if (!entries.length) {
      throw new HttpError(400, 'No fields to update');
    }

    const setClause = entries.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const query = `UPDATE transaction SET ${setClause} WHERE id = $1 RETURNING *`;
    const { rows } = await pool.query(query, [req.params.id, ...values]);
    if (!rows.length) {
      throw notFound('Transaction not found');
    }
    res.json(rows[0]);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM transaction WHERE id = $1', [req.params.id]);
    if (!rowCount) {
      throw notFound('Transaction not found');
    }
    res.status(204).send();
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

export default router;
