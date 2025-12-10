import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import db from '../database';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Mock third-party catalog managers
const MOCK_CATALOGS = [
  { id: 'shopify-123', name: 'Shopify Store', type: 'shopify' },
  { id: 'woocommerce-456', name: 'WooCommerce Store', type: 'woocommerce' },
  { id: 'bigcommerce-789', name: 'BigCommerce Store', type: 'bigcommerce' }
];

// Get available catalog providers
router.get('/providers', isAuthenticated, (req, res) => {
  res.json({ providers: MOCK_CATALOGS });
});

// Connect to a catalog (mock connection)
router.post('/connect', isAuthenticated, (req, res) => {
  const { catalogId } = req.body;
  const user = req.user as any;

  if (!catalogId) {
    return res.status(400).json({ error: 'Catalog ID is required' });
  }

  // Update user with catalog connection
  db.prepare('UPDATE users SET catalog_connected = 1, catalog_id = ? WHERE id = ?')
    .run(catalogId, user.id);

  res.json({ message: 'Catalog connected successfully', catalogId });
});

// Sync products from catalog (mock sync)
router.post('/sync', isAuthenticated, (req, res) => {
  const user = req.user as any;

  if (!user.catalog_connected) {
    return res.status(400).json({ error: 'No catalog connected' });
  }

  // Mock product data from catalog
  const mockProducts = [
    {
      sku: 'PROD-001',
      title: 'Wireless Bluetooth Headphones',
      description: 'High-quality wireless headphones with noise cancellation and 30-hour battery life.',
      price: 89.99,
      image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500'
    },
    {
      sku: 'PROD-002',
      title: 'Smart Fitness Watch',
      description: 'Track your fitness goals with this advanced smartwatch featuring heart rate monitoring and GPS.',
      price: 199.99,
      image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500'
    },
    {
      sku: 'PROD-003',
      title: 'Portable Phone Charger',
      description: '20,000mAh power bank with fast charging for all your devices on the go.',
      price: 34.99,
      image_url: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=500'
    },
    {
      sku: 'PROD-004',
      title: 'Leather Laptop Bag',
      description: 'Premium leather laptop bag with multiple compartments for professionals.',
      price: 129.99,
      image_url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=500'
    },
    {
      sku: 'PROD-005',
      title: 'Wireless Gaming Mouse',
      description: 'Professional gaming mouse with RGB lighting and programmable buttons.',
      price: 59.99,
      image_url: 'https://images.unsplash.com/photo-1527814050087-3793815479db?w=500'
    }
  ];

  // Insert products into database
  const insertProduct = db.prepare(`
    INSERT INTO products (id, user_id, sku, title, description, price, image_url, catalog_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const syncedProducts = [];
  for (const product of mockProducts) {
    const productId = uuidv4();
    insertProduct.run(
      productId,
      user.id,
      product.sku,
      product.title,
      product.description,
      product.price,
      product.image_url,
      user.catalog_id
    );
    syncedProducts.push({ id: productId, ...product });
  }

  res.json({
    message: 'Products synced successfully',
    count: syncedProducts.length,
    products: syncedProducts
  });
});

// Get catalog connection status
router.get('/status', isAuthenticated, (req, res) => {
  const user = req.user as any;
  const catalog = MOCK_CATALOGS.find(c => c.id === user.catalog_id);

  res.json({
    connected: !!user.catalog_connected,
    catalog: catalog || null
  });
});

// Disconnect from catalog
router.post('/disconnect', isAuthenticated, (req, res) => {
  const user = req.user as any;

  if (!user.catalog_connected) {
    return res.status(400).json({ error: 'No catalog connected' });
  }

  // Update user to disconnect catalog
  db.prepare('UPDATE users SET catalog_connected = 0, catalog_id = NULL WHERE id = ?')
    .run(user.id);

  res.json({ message: 'Catalog disconnected successfully' });
});

export default router;

