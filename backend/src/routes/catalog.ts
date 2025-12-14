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

    // Update the user object in session
    user.catalogConnected = true;
    user.catalogId = catalogId;

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
        description: `⌚ IUTECH 2025 NEW Smart Watch: Your Ultimate Health & Connectivity Companion

Experience the perfect blend of style, durability, and smart technology with the IUTECH 2025 NEW Smart Watch. Designed for an active lifestyle, this watch keeps you connected, monitors your health, and boasts an exceptional, long-lasting battery.

✨ Key Features at a Glance
• Professional IPX8 Waterproofing: Certified for professional underwater activities, including swimming.
• Extended Battery Life: Up to 10 days of typical usage (20 days standby) with the 270mAh battery.
• HD Bluetooth Calling: Enjoy crystal-clear, hands-free conversations directly from your wrist.
• Advanced Health Monitoring: Track vital signs like blood pressure, blood oxygen (SpO2), and heart rate.
• 100+ Customizable Watch Faces: Personalize your look with a huge selection or upload your own photos.

💖 Unrivaled Health & Fitness Tracking
Take a holistic approach to your wellness with built-in sensors and comprehensive tracking capabilities.
• Vital Sign Monitoring: Easily monitor your blood pressure and blood oxygen levels, along with continuous heart rate tracking and sleep monitoring.
• 24+ Sports Modes: Accurately record your steps, calories, and distance across a wide range of activities.
• Professional Waterproofing: With an IPX8 rating, this watch is ready to join you for swimming and other water sports.

📱 Seamless Connectivity & Communication
Stay in touch without reaching for your phone.
• High-Definition Calls: The HD Bluetooth Call feature allows you to make and receive calls with superior sound clarity, complete with a call history and dialpad.
• Smart Notifications: Receive timely message pushes and notifications directly to your wrist.
• Integrated Assistant: Use the built-in voice assistant for quick commands and hands-free control.
• Remote Control: Easily use the remote camera feature to snap photos.

🎨 Personalization & User Experience
Make the IUTECH 2025 NEW Watch truly your own.
• Customizable Display: Choose from 100+ watch faces via the Zmoofit APP or upload your favorite photo to create a unique display.
• Large, Clear Display: View all your data clearly on the vibrant 1.85-inch TFT Color Display (240x240 pixels).
• Intuitive Settings: Features like cover hand off screen, vibration intensity control, and a customizable menu style ensure a personalized user experience.
• Wide Language Support: The system supports a variety of languages including English, Spanish, French, German, Japanese, Korean, and more.

🔋 Power and Performance
Designed for reliability and long-term use.
• Battery Life (Typical): Up to 10 days
• Battery Life (Standby): Up to 20 days
• Battery Capacity: 270 mAh Li-pol
• Waterproof Grade: Professional IPX8 (Swimming allowed)
• Bluetooth Version: 5.2
• App Compatibility: Android 8.0+ or iOS 9.0+
• App Name: "Zmoofit"

🛒 Ready to Purchase?
Order now: https://www.aliexpress.com/item/1005008925093170.html`,
        price: 199.99,
        imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500',
        purchaseUrl: 'https://www.aliexpress.com/item/1005008925093170.html'
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

    // Try to upsert products into database (update if same title exists, otherwise create)
    let syncedProducts;
    try {
      syncedProducts = await prisma.$transaction(
        mockProducts.map(product =>
          prisma.product.upsert({
            where: {
              userId_title: {
                userId: user.id,
                title: product.title
              }
            } as any,
            update: {
              sku: product.sku,
              description: product.description,
              price: product.price,
              imageUrl: product.imageUrl,
              purchaseUrl: (product as any).purchaseUrl || null,
              catalogId: user.catalogId
            },
            create: {
              userId: user.id,
              sku: product.sku,
              title: product.title,
              description: product.description,
              price: product.price,
              imageUrl: product.imageUrl,
              purchaseUrl: (product as any).purchaseUrl || null,
              catalogId: user.catalogId
            }
          })
        )
      );
    } catch (dbError: any) {
      // If database unavailable, use in-memory storage
      if (dbError.code === 'P1001' || dbError.code === 'P2021') {
        console.log('⚠️  Database unavailable, storing products in memory');
        
        // Get existing products for this user
        const existingProducts = inMemoryProducts.get(user.id) || [];
        
        syncedProducts = mockProducts.map((product, index) => {
          // Check if product with same title already exists
          const existingProduct = existingProducts.find((p: any) => p.title === product.title);
          
          if (existingProduct) {
            // Update existing product
            return {
              ...existingProduct,
              sku: product.sku,
              description: product.description,
              price: product.price,
              imageUrl: product.imageUrl,
              purchaseUrl: (product as any).purchaseUrl || null,
              catalogId: user.catalogId,
              updatedAt: new Date()
            };
          } else {
            // Create new product
            return {
              id: `product_${Date.now()}_${index}`,
              userId: user.id,
              sku: product.sku,
              title: product.title,
              description: product.description,
              price: product.price,
              imageUrl: product.imageUrl,
              purchaseUrl: (product as any).purchaseUrl || null,
              catalogId: user.catalogId,
              createdAt: new Date(),
              updatedAt: new Date()
            };
          }
        });
        
        // Store in memory (replace with updated list)
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

    // Update the user object in session
    user.catalogConnected = false;
    user.catalogId = null;

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
