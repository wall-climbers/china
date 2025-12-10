import express from 'express';
import db from '../database';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Generate checkout URL for a product
router.post('/create', async (req, res) => {
  const { productId } = req.body;

  if (!productId) {
    return res.status(400).json({ error: 'Product ID is required' });
  }

  const product: any = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  // Create checkout session
  const sessionId = uuidv4();
  const checkoutUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/checkout/${sessionId}`;

  db.prepare(`
    INSERT INTO checkout_sessions (id, product_id, checkout_url)
    VALUES (?, ?, ?)
  `).run(sessionId, productId, checkoutUrl);

  res.json({
    sessionId,
    checkoutUrl
  });
});

// Get checkout session details (public endpoint)
router.get('/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  const session: any = db.prepare(`
    SELECT cs.*, p.title, p.description, p.price, p.image_url, p.sku
    FROM checkout_sessions cs
    JOIN products p ON cs.product_id = p.id
    WHERE cs.id = ?
  `).get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Checkout session not found' });
  }

  res.json({ session });
});

// Complete checkout (mock payment processing)
router.post('/:sessionId/complete', async (req, res) => {
  const { sessionId } = req.params;
  const { customerInfo } = req.body;

  if (!customerInfo || !customerInfo.email || !customerInfo.name) {
    return res.status(400).json({ error: 'Customer information is required' });
  }

  const session = db.prepare('SELECT * FROM checkout_sessions WHERE id = ?').get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Checkout session not found' });
  }

  // Mock payment processing
  db.prepare('UPDATE checkout_sessions SET status = ? WHERE id = ?')
    .run('completed', sessionId);

  res.json({
    message: 'Payment processed successfully',
    orderId: `ORD-${Date.now()}`
  });
});

export default router;

