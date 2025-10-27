import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { HttpError, mapDatabaseError, notFound } from '../errors.js';

const router = Router();

const targetKind = z.enum(['income', 'expense', 'transfer']);

const idParam = z.coerce.number().int().positive();

const baseSchema = z.object({
  target_kind: targetKind,
  category_id: z.number().int().positive(),
  keywords: z.array(z.string().trim().min(1)).optional(),
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
});

const createSchema = baseSchema;

const updateSchema = baseSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field must be provided',
});

const reorderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.number().int().positive(),
        priority: z.number().int(),
      }),
    )
    .min(1),
});

router.get('/', async (req, res, next) => {
  try {
    const whereClauses = [];
    const values = [];

    if (req.query.target_kind) {
      targetKind.parse(req.query.target_kind);
      values.push(req.query.target_kind);
      whereClauses.push(`target_kind = $${values.length}`);
    }

    if (req.query.enabled !== undefined) {
      const enabled = req.query.enabled === 'true';
      values.push(enabled);
      whereClauses.push(`enabled = $${values.length}`);
    }

    const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const query = `SELECT id, target_kind, category_id, keywords, priority, enabled, created_at FROM rule ${where} ORDER BY priority DESC, created_at ASC`;
    const { rows } = await pool.query(query, values);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const payload = createSchema.parse(req.body);
    const keywords = payload.keywords ?? [];
    const priority = payload.priority ?? 0;
    const enabled = payload.enabled ?? true;
    const { rows } = await pool.query(
      `INSERT INTO rule (target_kind, category_id, keywords, priority, enabled)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, target_kind, category_id, keywords, priority, enabled, created_at`,
      [payload.target_kind, payload.category_id, keywords, priority, enabled],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = idParam.parse(req.params.id);
    const { rows } = await pool.query(
      'SELECT id, target_kind, category_id, keywords, priority, enabled, created_at FROM rule WHERE id = $1',
      [id],
    );
    if (!rows.length) {
      throw notFound('Rule not found');
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

    if (payload.target_kind !== undefined) {
      entries.push('target_kind');
      values.push(payload.target_kind);
    }
    if (payload.category_id !== undefined) {
      entries.push('category_id');
      values.push(payload.category_id);
    }
    if (payload.keywords !== undefined) {
      entries.push('keywords');
      values.push(payload.keywords ?? []);
    }
    if (payload.priority !== undefined) {
      entries.push('priority');
      values.push(payload.priority);
    }
    if (payload.enabled !== undefined) {
      entries.push('enabled');
      values.push(payload.enabled);
    }

    if (!entries.length) {
      throw new HttpError(400, 'No fields to update');
    }

    const id = idParam.parse(req.params.id);
    const setClause = entries.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const query = `UPDATE rule SET ${setClause} WHERE id = $1 RETURNING id, target_kind, category_id, keywords, priority, enabled, created_at`;
    const { rows } = await pool.query(query, [id, ...values]);
    if (!rows.length) {
      throw notFound('Rule not found');
    }
    res.json(rows[0]);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = idParam.parse(req.params.id);
    const { rowCount } = await pool.query('DELETE FROM rule WHERE id = $1', [id]);
    if (!rowCount) {
      throw notFound('Rule not found');
    }
    res.status(204).send();
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.post('/reorder', async (req, res, next) => {
  try {
    const payload = reorderSchema.parse({
      ...req.body,
      items: Array.isArray(req.body?.items)
        ? req.body.items.map((item) => ({
            ...item,
            id: Number(item.id),
          }))
        : req.body?.items,
    });
    await withTransaction(async (client) => {
      for (const item of payload.items) {
        const { rowCount } = await client.query('UPDATE rule SET priority = $2 WHERE id = $1', [item.id, item.priority]);
        if (!rowCount) {
          throw notFound(`Rule ${item.id} not found`);
        }
      }
    });
    res.json({ updated: payload.items.length });
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

export default router;
