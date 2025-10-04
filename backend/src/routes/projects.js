import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { HttpError, mapDatabaseError, notFound } from '../errors.js';

const router = Router();

const baseSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  target_amount: z.number().finite().optional(),
  budget_amount: z.number().finite().optional(),
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
});

const createSchema = baseSchema.extend({
  id: z.string().trim().min(1).optional(),
});

const updateSchema = baseSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field must be provided',
});

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM project ORDER BY created_at ASC');
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
      `INSERT INTO project (id, name, description, target_amount, budget_amount, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        id,
        payload.name,
        payload.description ?? null,
        payload.target_amount ?? null,
        payload.budget_amount ?? null,
        payload.start_date ?? null,
        payload.end_date ?? null,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM project WHERE id = $1', [req.params.id]);
    if (!rows.length) {
      throw notFound('Project not found');
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
    if (payload.budget_amount !== undefined) {
      entries.push('budget_amount');
      values.push(payload.budget_amount ?? null);
    }
    if (payload.start_date !== undefined) {
      entries.push('start_date');
      values.push(payload.start_date ?? null);
    }
    if (payload.end_date !== undefined) {
      entries.push('end_date');
      values.push(payload.end_date ?? null);
    }

    if (!entries.length) {
      throw new HttpError(400, 'No fields to update');
    }

    const setClause = entries.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const query = `UPDATE project SET ${setClause} WHERE id = $1 RETURNING *`;
    const { rows } = await pool.query(query, [req.params.id, ...values]);
    if (!rows.length) {
      throw notFound('Project not found');
    }
    res.json(rows[0]);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM project WHERE id = $1', [req.params.id]);
    if (!rowCount) {
      throw notFound('Project not found');
    }
    res.status(204).send();
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

export default router;
