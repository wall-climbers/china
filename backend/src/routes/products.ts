import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = express.Router();

// Get all products for the authenticated user
router.get('/', isAuthenticated, async (req, res) => {
  const user = req.user as any;

  try {
    const products = await prisma.product.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ products });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get a single product
router.get('/:id', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const user = req.user as any;

  try {
    const product = await prisma.product.findFirst({
      where: {
        id,
        userId: user.id
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Delete a product
router.delete('/:id', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const user = req.user as any;

  try {
    await prisma.product.delete({
      where: {
        id,
        userId: user.id
      }
    });

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(404).json({ error: 'Product not found' });
  }
});

export default router;
