import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import db from '../database';

const router = express.Router();

// Get all products for the authenticated user
router.get('/', isAuthenticated, (req, res) => {
  const user = req.user as any;

  const products = db.prepare('SELECT * FROM products WHERE user_id = ? ORDER BY created_at DESC')
    .all(user.id);

  res.json({ products });
});

// Get a single product
router.get('/:id', isAuthenticated, (req, res) => {
  const { id } = req.params;
  const user = req.user as any;

  const product = db.prepare('SELECT * FROM products WHERE id = ? AND user_id = ?')
    .get(id, user.id);

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  res.json({ product });
});

// Delete a product
router.delete('/:id', isAuthenticated, (req, res) => {
  const { id } = req.params;
  const user = req.user as any;

  const result = db.prepare('DELETE FROM products WHERE id = ? AND user_id = ?')
    .run(id, user.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }

  res.json({ message: 'Product deleted successfully' });
});

export default router;

