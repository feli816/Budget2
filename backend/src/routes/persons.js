import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { mapDatabaseError } from '../errors.js';

const router = Router();

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z
    .union([z.string().trim().email('Invalid email address'), z.literal('').transform(() => null)])
    .optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, name, email FROM person ORDER BY name ASC');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const payload = createSchema.parse(req.body);
    const email = payload.email ?? null;
    const { rows } = await pool.query(
      `INSERT INTO person (name, email)
       VALUES ($1, $2)
       RETURNING id, name, email`,
      [payload.name, email],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(mapDatabaseError(error));
  }
});

export default router;
