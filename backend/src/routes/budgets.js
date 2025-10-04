import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { HttpError, mapDatabaseError, notFound } from '../errors.js';

const router = Router();

const currencyRegex = /^[A-Z]{3}$/;
const monthPattern = /^\d{4}-\d{2}$/;

const baseMonthly = z.object({
  scope: z.string().trim().min(1),
  category_id: z.number().int().positive(),
  period: z
    .string()
    .trim()
    .regex(monthPattern, 'Period must be formatted YYYY-MM'),
  ceiling_amount: z.number().finite(),
  currency_code: z
    .string()
    .trim()
    .regex(currencyRegex, 'Currency must be a 3-letter ISO code')
    .default('CHF'),
});

const monthlyCreateSchema = baseMonthly;
const monthlyUpdateSchema = baseMonthly.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field must be provided',
});

const baseAnnual = z.object({
  scope: z.string().trim().min(1),
  category_id: z.number().int().positive(),
  year: z.number().int(),
  ceiling_amount: z.number().finite(),
  currency_code: z
    .string()
    .trim()
    .regex(currencyRegex, 'Currency must be a 3-letter ISO code')
    .default('CHF'),
});

const annualCreateSchema = baseAnnual;
const annualUpdateSchema = baseAnnual.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field must be provided',
});

function toMonthDate(period) {
  return `${period}-01`;
}

router.get('/monthly', async (req, res, next) => {
  try {
    const clauses = [];
    const values = [];

    if (req.query.scope) {
      values.push(req.query.scope);
      clauses.push(`scope = $${values.length}`);
    }
    if (req.query.category_id) {
      const categoryId = Number(req.query.category_id);
      if (!Number.isInteger(categoryId)) {
        throw new HttpError(400, 'category_id must be an integer');
      }
      values.push(categoryId);
      clauses.push(`category_id = $${values.length}`);
    }
    if (req.query.period) {
      if (!monthPattern.test(String(req.query.period))) {
        throw new HttpError(400, 'period must follow YYYY-MM');
      }
      values.push(toMonthDate(req.query.period));
      clauses.push(`period_month = $${values.length}`);
    }

    let query = 'SELECT * FROM budget_monthly';
    if (clauses.length) {
      query += ` WHERE ${clauses.join(' AND ')}`;
    }
    query += ' ORDER BY period_month DESC, id DESC';

    const { rows } = await pool.query(query, values);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/monthly', async (req, res, next) => {
  try {
    const payload = monthlyCreateSchema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO budget_monthly (scope, category_id, period_month, ceiling_amount, currency_code)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [payload.scope, payload.category_id, toMonthDate(payload.period), payload.ceiling_amount, payload.currency_code ?? 'CHF'],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.get('/monthly/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM budget_monthly WHERE id = $1', [req.params.id]);
    if (!rows.length) {
      throw notFound('Monthly budget not found');
    }
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.put('/monthly/:id', async (req, res, next) => {
  try {
    const payload = monthlyUpdateSchema.parse(req.body);
    const entries = [];
    const values = [];

    if (payload.scope !== undefined) {
      entries.push('scope');
      values.push(payload.scope);
    }
    if (payload.category_id !== undefined) {
      entries.push('category_id');
      values.push(payload.category_id);
    }
    if (payload.period !== undefined) {
      entries.push('period_month');
      values.push(toMonthDate(payload.period));
    }
    if (payload.ceiling_amount !== undefined) {
      entries.push('ceiling_amount');
      values.push(payload.ceiling_amount);
    }
    if (payload.currency_code !== undefined) {
      entries.push('currency_code');
      values.push(payload.currency_code);
    }

    if (!entries.length) {
      throw new HttpError(400, 'No fields to update');
    }

    const setClause = entries.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const query = `UPDATE budget_monthly SET ${setClause} WHERE id = $1 RETURNING *`;
    const { rows } = await pool.query(query, [req.params.id, ...values]);
    if (!rows.length) {
      throw notFound('Monthly budget not found');
    }
    res.json(rows[0]);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.delete('/monthly/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM budget_monthly WHERE id = $1', [req.params.id]);
    if (!rowCount) {
      throw notFound('Monthly budget not found');
    }
    res.status(204).send();
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.get('/annual', async (req, res, next) => {
  try {
    const clauses = [];
    const values = [];

    if (req.query.scope) {
      values.push(req.query.scope);
      clauses.push(`scope = $${values.length}`);
    }
    if (req.query.category_id) {
      const categoryId = Number(req.query.category_id);
      if (!Number.isInteger(categoryId)) {
        throw new HttpError(400, 'category_id must be an integer');
      }
      values.push(categoryId);
      clauses.push(`category_id = $${values.length}`);
    }
    if (req.query.year) {
      const year = Number(req.query.year);
      if (!Number.isInteger(year)) {
        throw new HttpError(400, 'year must be an integer');
      }
      values.push(year);
      clauses.push(`year = $${values.length}`);
    }

    let query = 'SELECT * FROM budget_annual';
    if (clauses.length) {
      query += ` WHERE ${clauses.join(' AND ')}`;
    }
    query += ' ORDER BY year DESC, id DESC';

    const { rows } = await pool.query(query, values);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/annual', async (req, res, next) => {
  try {
    const payload = annualCreateSchema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO budget_annual (scope, category_id, year, ceiling_amount, currency_code)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [payload.scope, payload.category_id, payload.year, payload.ceiling_amount, payload.currency_code ?? 'CHF'],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.get('/annual/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM budget_annual WHERE id = $1', [req.params.id]);
    if (!rows.length) {
      throw notFound('Annual budget not found');
    }
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.put('/annual/:id', async (req, res, next) => {
  try {
    const payload = annualUpdateSchema.parse(req.body);
    const entries = [];
    const values = [];

    if (payload.scope !== undefined) {
      entries.push('scope');
      values.push(payload.scope);
    }
    if (payload.category_id !== undefined) {
      entries.push('category_id');
      values.push(payload.category_id);
    }
    if (payload.year !== undefined) {
      entries.push('year');
      values.push(payload.year);
    }
    if (payload.ceiling_amount !== undefined) {
      entries.push('ceiling_amount');
      values.push(payload.ceiling_amount);
    }
    if (payload.currency_code !== undefined) {
      entries.push('currency_code');
      values.push(payload.currency_code);
    }

    if (!entries.length) {
      throw new HttpError(400, 'No fields to update');
    }

    const setClause = entries.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const query = `UPDATE budget_annual SET ${setClause} WHERE id = $1 RETURNING *`;
    const { rows } = await pool.query(query, [req.params.id, ...values]);
    if (!rows.length) {
      throw notFound('Annual budget not found');
    }
    res.json(rows[0]);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

router.delete('/annual/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM budget_annual WHERE id = $1', [req.params.id]);
    if (!rowCount) {
      throw notFound('Annual budget not found');
    }
    res.status(204).send();
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

export default router;
