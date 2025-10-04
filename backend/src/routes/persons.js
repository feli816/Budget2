import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { HttpError, mapDatabaseError, notFound } from '../errors.js';

const router = Router();

const baseSchema = z.object({
  name: z.string().trim().min(1),
  email: z
    .string()
    .trim()
    .email()
    .optional()
    .nullable(),
});

const createSchema = baseSchema.extend({
  id: z.string().trim().min(1).optional(),
});

const updateSchema = baseSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field must be provided',
});

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM person ORDER BY created_at ASC');
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
      `INSERT INTO person (id, name, email)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, payload.name, payload.email ?? null],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM person WHERE id = $1', [req.params.id]);
    if (!rows.length) {
      throw notFound('Person not found');
    }
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const payload = updateSchema.parse(req.body);
    const fields = [];
    const values = [];

    if (payload.name !== undefined) {
      fields.push('name');
      values.push(payload.name);
    }

    if (payload.email !== undefined) {
      fields.push('email');
      values.push(payload.email ?? null);
    }

    if (!fields.length) {
      throw new HttpError(400, 'No fields to update');
    }

    const setClauses = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const query = `UPDATE person SET ${setClauses} WHERE id = $1 RETURNING *`;
    const { rows } = await pool.query(query, [req.params.id, ...values]);
    if (!rows.length) {
      throw notFound('Person not found');
    }
    res.json(rows[0]);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM person WHERE id = $1', [req.params.id]);
    if (!rowCount) {
      throw notFound('Person not found');
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
