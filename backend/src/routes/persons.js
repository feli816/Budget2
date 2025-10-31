import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, name, email FROM person ORDER BY name ASC');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

export default router;
