import express from 'express';
import prisma from '../lib/prisma';
import { inMemoryProducts } from '../lib/inMemoryStorage';

const router = express.Router();

// In-memory checkout sessions for fallback
const inMemoryCheckoutSessions = new Map<string, any>();

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

    // Create checkout session first to get the ID
    const session = await prisma.checkoutSession.create({
      data: {
        productId,
        checkoutUrl: '' // Will update after we have the ID
      }
    });

    // Update with the correct checkout URL using session ID
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const checkoutUrl = `${frontendUrl}/checkout/${session.id}`;

    await prisma.checkoutSession.update({
      where: { id: session.id },
      data: { checkoutUrl }
    });

    res.json({
      sessionId: session.id,
      checkoutUrl
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Get or create checkout session by product ID (for /buy/:productId route)
router.get('/product/:productId', async (req, res) => {
  const { productId } = req.params;

  try {
    let product = null;
    
    // Try to find product in database
    try {
      product = await prisma.product.findUnique({
        where: { id: productId }
      });
    } catch (dbError: any) {
      console.log('⚠️  Database unavailable, checking in-memory storage');
      // Search in all user products in memory
      for (const [, products] of inMemoryProducts) {
        const found = products.find((p: any) => p.id === productId);
        if (found) {
          product = found;
          break;
        }
      }
    }

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Try to create session in database, fallback to in-memory
    let sessionId: string;
    try {
      const session = await prisma.checkoutSession.create({
        data: {
          productId,
          checkoutUrl: ''
        }
      });
      sessionId = session.id;

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const checkoutUrl = `${frontendUrl}/checkout/${session.id}`;

      await prisma.checkoutSession.update({
        where: { id: session.id },
        data: { checkoutUrl }
      });
    } catch (dbError: any) {
      console.log('⚠️  Database unavailable, using in-memory checkout session');
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      inMemoryCheckoutSessions.set(sessionId, {
        id: sessionId,
        productId,
        product,
        status: 'pending',
        createdAt: new Date()
      });
    }

    // Return the formatted session
    const formattedSession = {
      id: sessionId,
      product_id: productId,
      title: product.title,
      description: product.description,
      price: product.price,
      image_url: product.imageUrl,
      sku: product.sku
    };

    res.json({ session: formattedSession });
  } catch (error) {
    console.error('Error creating checkout session from product:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Get checkout session details (public endpoint)
router.get('/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  try {
    // First check in-memory sessions
    const inMemorySession = inMemoryCheckoutSessions.get(sessionId);
    if (inMemorySession) {
      const formattedSession = {
        id: inMemorySession.id,
        product_id: inMemorySession.productId,
        title: inMemorySession.product.title,
        description: inMemorySession.product.description,
        price: inMemorySession.product.price,
        image_url: inMemorySession.product.imageUrl,
        sku: inMemorySession.product.sku
      };
      return res.json({ session: formattedSession });
    }

    // Try database
    let session = null;
    try {
      session = await prisma.checkoutSession.findUnique({
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
    } catch (dbError: any) {
      console.log('⚠️  Database unavailable for session lookup');
    }

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
