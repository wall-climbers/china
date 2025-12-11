import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import prisma from '../lib/prisma';
import { inMemoryUserCatalogs, inMemoryProducts } from '../lib/inMemoryStorage';

const router = express.Router();

// Mock third-party catalog managers
const MOCK_CATALOGS = [
  { id: 'shopify-123', name: 'Shopify Store', type: 'shopify' },
  { id: 'woocommerce-456', name: 'WooCommerce Store', type: 'woocommerce' },
  { id: 'bigcommerce-789', name: 'BigCommerce Store', type: 'bigcommerce' }
];

// Get available catalog providers (public - no auth required)
router.get('/providers', (req, res) => {
  res.json({ providers: MOCK_CATALOGS });
});

// Connect to a catalog (mock connection)
router.post('/connect', isAuthenticated, async (req, res) => {
  const { catalogId } = req.body;
  const user = req.user as any;

  if (!catalogId) {
    return res.status(400).json({ error: 'Catalog ID is required' });
  }

  try {
    // Try to update in database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        catalogConnected: true,
        catalogId
      }
    });

    res.json({ message: 'Catalog connected successfully', catalogId });
  } catch (error: any) {
    // If database unavailable, use in-memory storage
    if (error.code === 'P1001' || error.code === 'P2021') {
      console.log('⚠️  Database unavailable, storing catalog connection in memory');
      inMemoryUserCatalogs.set(user.id, {
        catalogConnected: true,
        catalogId
      });
      
      // Update the user object in session
      user.catalogConnected = true;
      user.catalogId = catalogId;
      
      res.json({ message: 'Catalog connected successfully', catalogId });
    } else {
      console.error('Error connecting catalog:', error);
      res.status(500).json({ error: 'Failed to connect catalog' });
    }
  }
});

// Sync products from catalog (mock sync)
router.post('/sync', isAuthenticated, async (req, res) => {
  const user = req.user as any;

  if (!user.catalogConnected) {
    return res.status(400).json({ error: 'No catalog connected' });
  }

  try {
    // Mock product data from catalog
    const mockProducts = [
      {
        sku: 'PROD-001',
        title: 'Wireless Bluetooth Headphones',
        description: 'High-quality wireless headphones with noise cancellation and 30-hour battery life.',
        price: 89.99,
        imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500'
      },
      {
        sku: 'PROD-002',
        title: 'Smart Fitness Watch',
        description: 'Track your fitness goals with this advanced smartwatch featuring heart rate monitoring and GPS.',
        price: 199.99,
        imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500'
      },
      {
        sku: 'PROD-003',
        title: 'Portable Phone Charger',
        description: '20,000mAh power bank with fast charging for all your devices on the go.',
        price: 34.99,
        imageUrl: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=500'
      },
      {
        sku: 'PROD-004',
        title: 'Leather Laptop Bag',
        description: 'Premium leather laptop bag with multiple compartments for professionals.',
        price: 129.99,
        imageUrl: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=500'
      },
      {
        sku: 'PROD-005',
        title: 'Wireless Gaming Mouse',
        description: 'Professional gaming mouse with RGB lighting and programmable buttons.',
        price: 59.99,
        imageUrl: 'https://images.unsplash.com/photo-1527814050087-3793815479db?w=500'
      }
    ];

    // Try to insert products into database
    let syncedProducts;
    try {
      syncedProducts = await prisma.$transaction(
        mockProducts.map(product =>
          prisma.product.create({
            data: {
              userId: user.id,
              sku: product.sku,
              title: product.title,
              description: product.description,
              price: product.price,
              imageUrl: product.imageUrl,
              catalogId: user.catalogId
            }
          })
        )
      );
    } catch (dbError: any) {
      // If database unavailable, use in-memory storage
      if (dbError.code === 'P1001' || dbError.code === 'P2021') {
        console.log('⚠️  Database unavailable, storing products in memory');
        
        syncedProducts = mockProducts.map((product, index) => ({
          id: `product_${Date.now()}_${index}`,
          userId: user.id,
          sku: product.sku,
          title: product.title,
          description: product.description,
          price: product.price,
          imageUrl: product.imageUrl,
          catalogId: user.catalogId,
          createdAt: new Date(),
          updatedAt: new Date()
        }));
        
        // Store in memory
        if (!inMemoryProducts.has(user.id)) {
          inMemoryProducts.set(user.id, []);
        }
        inMemoryProducts.set(user.id, syncedProducts);
      } else {
        throw dbError;
      }
    }

    res.json({
      message: 'Products synced successfully',
      count: syncedProducts.length,
      products: syncedProducts
    });
  } catch (error) {
    console.error('Error syncing products:', error);
    res.status(500).json({ error: 'Failed to sync products' });
  }
});

// Get catalog connection status
router.get('/status', isAuthenticated, async (req, res) => {
  const user = req.user as any;
  const catalog = MOCK_CATALOGS.find(c => c.id === user.catalogId);

  res.json({
    connected: !!user.catalogConnected,
    catalog: catalog || null
  });
});

// Disconnect from catalog
router.post('/disconnect', isAuthenticated, async (req, res) => {
  const user = req.user as any;

  if (!user.catalogConnected) {
    return res.status(400).json({ error: 'No catalog connected' });
  }

  try {
    // Try to update in database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        catalogConnected: false,
        catalogId: null
      }
    });

    res.json({ message: 'Catalog disconnected successfully' });
  } catch (error: any) {
    // If database unavailable, use in-memory storage
    if (error.code === 'P1001' || error.code === 'P2021') {
      console.log('⚠️  Database unavailable, removing catalog connection from memory');
      inMemoryUserCatalogs.delete(user.id);
      
      // Update the user object in session
      user.catalogConnected = false;
      user.catalogId = null;
      
      res.json({ message: 'Catalog disconnected successfully' });
    } else {
      console.error('Error disconnecting catalog:', error);
      res.status(500).json({ error: 'Failed to disconnect catalog' });
    }
  }
});

export default router;
