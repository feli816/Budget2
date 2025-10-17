import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { HttpError, mapDatabaseError, notFound } from '../errors.js';

const router = Router();

const kindEnum = z.enum(['income', 'expense', 'transfer']);

const baseSchema = z.object({
  name: z.string().trim().min(1),
  kind: kindEnum,
  description: z.string().trim().optional().nullable(),
});

const createSchema = baseSchema;
const updateSchema = baseSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field must be provided',
});

router.get('/', async (req, res, next) => {
  try {
    const kindFilter = req.query.kind;
    let rows;
    const select = 'SELECT id, name, kind FROM category';
    if (kindFilter) {
      kindEnum.parse(kindFilter);
      ({ rows } = await pool.query(`${select} WHERE kind = $1 ORDER BY name ASC`, [kindFilter]));
    } else {
      ({ rows } = await pool.query(`${select} ORDER BY kind ASC, name ASC`));
    }
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const payload = createSchema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO category (name, kind, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [payload.name, payload.kind, payload.description ?? null],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM category WHERE id = $1', [req.params.id]);
    if (!rows.length) {
      throw notFound('Category not found');
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
    if (payload.kind !== undefined) {
      entries.push('kind');
      values.push(payload.kind);
    }
    if (payload.description !== undefined) {
      entries.push('description');
      values.push(payload.description ?? null);
    }

    if (!entries.length) {
      throw new HttpError(400, 'No fields to update');
    }

    const setClause = entries.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const query = `UPDATE category SET ${setClause} WHERE id = $1 RETURNING *`;
    const { rows } = await pool.query(query, [req.params.id, ...values]);
    if (!rows.length) {
      throw notFound('Category not found');
    }
    res.json(rows[0]);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM category WHERE id = $1', [req.params.id]);
    if (!rowCount) {
      throw notFound('Category not found');
    }
    res.status(204).send();
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

export default router;
