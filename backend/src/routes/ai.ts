import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import db from '../database';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Generate AI post for a product
router.post('/generate', isAuthenticated, async (req, res) => {
  const { productId, type } = req.body; // type: 'post' or 'video'
  const user = req.user as any;

  if (!productId || !type) {
    return res.status(400).json({ error: 'Product ID and type are required' });
  }

  // Get product
  const product: any = db.prepare('SELECT * FROM products WHERE id = ? AND user_id = ?')
    .get(productId, user.id);

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  // Mock AI generation - in production, this would call an external AI service
  const mockAIService = async (product: any, type: string) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (type === 'post') {
      return {
        content: `🌟 Check out our ${product.title}! 🌟\n\n${product.description}\n\n💰 Only $${product.price}!\n\n✨ Limited time offer - Shop now!\n\n#shopping #deals #${product.title.toLowerCase().replace(/\s+/g, '')}`,
        mediaUrl: product.image_url
      };
    } else {
      // For video, we'll mock a video URL
      return {
        content: `Discover the amazing ${product.title}! Watch our video to learn more. Get yours today for only $${product.price}!`,
        mediaUrl: `https://example.com/videos/${product.id}.mp4` // Mock video URL
      };
    }
  };

  try {
    const aiResult = await mockAIService(product, type);

    // Save generated post
    const postId = uuidv4();
    db.prepare(`
      INSERT INTO generated_posts (id, user_id, product_id, type, content, media_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(postId, user.id, productId, type, aiResult.content, aiResult.mediaUrl);

    const generatedPost = db.prepare('SELECT * FROM generated_posts WHERE id = ?').get(postId);

    res.json({
      message: 'AI content generated successfully',
      post: generatedPost
    });
  } catch (error) {
    console.error('AI generation error:', error);
    res.status(500).json({ error: 'Failed to generate AI content' });
  }
});

// Get all generated posts for user
router.get('/posts', isAuthenticated, (req, res) => {
  const user = req.user as any;

  const posts = db.prepare(`
    SELECT gp.*, p.title as product_title, p.image_url as product_image, p.price, p.description
    FROM generated_posts gp
    JOIN products p ON gp.product_id = p.id
    WHERE gp.user_id = ?
    ORDER BY gp.created_at DESC
  `).all(user.id);

  res.json({ posts });
});

// Get a single generated post
router.get('/posts/:id', isAuthenticated, (req, res) => {
  const { id } = req.params;
  const user = req.user as any;

  const post = db.prepare(`
    SELECT gp.*, p.title as product_title, p.image_url as product_image, p.price, p.description
    FROM generated_posts gp
    JOIN products p ON gp.product_id = p.id
    WHERE gp.id = ? AND gp.user_id = ?
  `).get(id, user.id);

  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  res.json({ post });
});

// Update a generated post
router.put('/posts/:id', isAuthenticated, (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  const user = req.user as any;

  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }

  const result = db.prepare('UPDATE generated_posts SET content = ? WHERE id = ? AND user_id = ?')
    .run(content, id, user.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Post not found' });
  }

  const updatedPost = db.prepare('SELECT * FROM generated_posts WHERE id = ?').get(id);

  res.json({ message: 'Post updated successfully', post: updatedPost });
});

// Delete a generated post
router.delete('/posts/:id', isAuthenticated, (req, res) => {
  const { id } = req.params;
  const user = req.user as any;

  const result = db.prepare('DELETE FROM generated_posts WHERE id = ? AND user_id = ?')
    .run(id, user.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Post not found' });
  }

  res.json({ message: 'Post deleted successfully' });
});

export default router;

