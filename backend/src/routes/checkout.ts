import express from 'express';
import prisma from '../lib/prisma';

const router = express.Router();

// Generate checkout URL for a product
router.post('/create', async (req, res) => {
  const { productId } = req.body;

  if (!productId) {
    return res.status(400).json({ error: 'Product ID is required' });
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Create checkout session
    const checkoutUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/checkout`;

    const session = await prisma.checkoutSession.create({
      data: {
        productId,
        checkoutUrl: `${checkoutUrl}/${productId}`
      }
    });

    res.json({
      sessionId: session.id,
      checkoutUrl: session.checkoutUrl
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Get checkout session details (public endpoint)
router.get('/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  try {
    const session = await prisma.checkoutSession.findUnique({
      where: { id: sessionId },
      include: {
        product: {
          select: {
            title: true,
            description: true,
            price: true,
            imageUrl: true,
            sku: true
          }
        }
      }
    });

    if (!session) {
      return res.status(404).json({ error: 'Checkout session not found' });
    }

    // Transform the data to match expected format
    const formattedSession = {
      ...session,
      title: session.product.title,
      description: session.product.description,
      price: session.product.price,
      image_url: session.product.imageUrl,
      sku: session.product.sku
    };

    res.json({ session: formattedSession });
  } catch (error) {
    console.error('Error fetching checkout session:', error);
    res.status(500).json({ error: 'Failed to fetch checkout session' });
  }
});

// Complete checkout (mock payment processing)
router.post('/:sessionId/complete', async (req, res) => {
  const { sessionId } = req.params;
  const { customerInfo } = req.body;

  if (!customerInfo || !customerInfo.email || !customerInfo.name) {
    return res.status(400).json({ error: 'Customer information is required' });
  }

  try {
    const session = await prisma.checkoutSession.findUnique({
      where: { id: sessionId }
    });

    if (!session) {
      return res.status(404).json({ error: 'Checkout session not found' });
    }

    // Mock payment processing
    await prisma.checkoutSession.update({
      where: { id: sessionId },
      data: { status: 'completed' }
    });

    res.json({
      message: 'Payment processed successfully',
      orderId: `ORD-${Date.now()}`
    });
  } catch (error) {
    console.error('Error completing checkout:', error);
    res.status(500).json({ error: 'Failed to complete checkout' });
  }
});

export default router;
