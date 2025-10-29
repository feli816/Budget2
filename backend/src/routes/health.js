import express from 'express';
const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    ENABLE_UPLOAD: process.env.ENABLE_UPLOAD === '1',
    ENABLE_XLSX: process.env.ENABLE_XLSX === '1',
    DISABLE_DB: process.env.DISABLE_DB === '1',
  });
});

export default router;
