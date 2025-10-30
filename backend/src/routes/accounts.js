import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { HttpError, mapDatabaseError, notFound } from '../errors.js';

const router = Router();

const currencyRegex = /^[A-Z]{3}$/;

const ownerPersonIdSchema = z.preprocess(
  (value) => {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    if (typeof value === 'number') {
      return String(value);
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }

    return value;
  },
  z.string().trim().min(1).nullable().optional(),
);

const insertAccountQuery = [
  'INSERT INTO account (id, name, iban, opening_balance, currency_code, owner_person_id)',
  "VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''))",
  'RETURNING *',
].join('\n');

const baseSchema = z.object({
  name: z.string().trim().min(1),
  iban: z
    .string()
    .trim()
    .min(5)
    .optional()
    .nullable(),
  opening_balance: z.coerce.number().finite().default(0),
  currency_code: z
    .string()
    .trim()
    .regex(currencyRegex, 'Currency must be a 3-letter ISO code')
    .default('CHF'),
  owner_person_id: ownerPersonIdSchema,
});

const createSchema = baseSchema.extend({
  id: z.string().trim().min(1).optional(),
});

const updateSchema = baseSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field must be provided',
});

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, iban, currency_code FROM account ORDER BY name ASC',
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const payload = createSchema.parse(req.body);
    const id = payload.id ?? randomUUID();
    const values = [
      id,
      payload.name,
      payload.iban ?? null,
      payload.opening_balance ?? 0,
      payload.currency_code ?? 'CHF',
      payload.owner_person_id ?? null,
    ];
    const { rows } = await pool.query(insertAccountQuery, values);
    res.status(201).json(rows[0]);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM account WHERE id = $1', [req.params.id]);
    if (!rows.length) {
      throw notFound('Account not found');
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
    if (payload.iban !== undefined) {
      entries.push('iban');
      values.push(payload.iban ?? null);
    }
    if (payload.opening_balance !== undefined) {
      entries.push('opening_balance');
      values.push(payload.opening_balance);
    }
    if (payload.currency_code !== undefined) {
      entries.push('currency_code');
      values.push(payload.currency_code);
    }
    if (payload.owner_person_id !== undefined) {
      entries.push('owner_person_id');
      values.push(payload.owner_person_id ?? null);
    }

    if (!entries.length) {
      throw new HttpError(400, 'No fields to update');
    }

    const setClause = entries.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const query = `UPDATE account SET ${setClause} WHERE id = $1 RETURNING *`;
    const { rows } = await pool.query(query, [req.params.id, ...values]);
    if (!rows.length) {
      throw notFound('Account not found');
    }
    res.json(rows[0]);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM account WHERE id = $1', [req.params.id]);
    if (!rowCount) {
      throw notFound('Account not found');
    }
    res.status(204).send();
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

export default router;
