import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import prisma from '../lib/prisma';
import { generateAndUploadVideo } from '../services/s3';

const router = express.Router();

// Generate AI post for a product
router.post('/generate', isAuthenticated, async (req, res) => {
  const { productId, type } = req.body; // type: 'post' or 'video'
  const user = req.user as any;

  if (!productId || !type) {
    return res.status(400).json({ error: 'Product ID and type are required' });
  }

  try {
    // Get product
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        userId: user.id
      }
    });

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
          mediaUrl: product.imageUrl
        };
      } else {
        // Generate mock video and upload to S3
        console.log('🎥 Generating mock video for:', product.title);
        const videoUrl = await generateAndUploadVideo(product);
        
        return {
          content: `🎬 Watch this amazing video about our ${product.title}! 🎬\n\n${product.description}\n\n💰 Only $${product.price}!\n\n✨ Get yours today!\n\n#video #product #${product.title.toLowerCase().replace(/\s+/g, '')}`,
          mediaUrl: videoUrl
        };
      }
    };

    const aiResult = await mockAIService(product, type);

    // Save generated post
    const generatedPost = await prisma.generatedPost.create({
      data: {
        userId: user.id,
        productId,
        type,
        content: aiResult.content,
        mediaUrl: aiResult.mediaUrl
      }
    });

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
router.get('/posts', isAuthenticated, async (req, res) => {
  const user = req.user as any;

  try {
    const posts = await prisma.generatedPost.findMany({
      where: { userId: user.id },
      include: {
        product: {
          select: {
            title: true,
            imageUrl: true,
            price: true,
            description: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Transform the data to match the expected format
    const formattedPosts = posts.map(post => ({
      ...post,
      product_title: post.product.title,
      product_image: post.product.imageUrl,
      price: post.product.price,
      description: post.product.description
    }));

    res.json({ posts: formattedPosts });
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Get a single generated post
router.get('/posts/:id', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const user = req.user as any;

  try {
    const post = await prisma.generatedPost.findFirst({
      where: {
        id,
        userId: user.id
      },
      include: {
        product: {
          select: {
            title: true,
            imageUrl: true,
            price: true,
            description: true
          }
        }
      }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Transform the data to match the expected format
    const formattedPost = {
      ...post,
      product_title: post.product.title,
      product_image: post.product.imageUrl,
      price: post.product.price,
      description: post.product.description
    };

    res.json({ post: formattedPost });
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// Update a generated post
router.put('/posts/:id', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  const user = req.user as any;

  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }

  try {
    const updatedPost = await prisma.generatedPost.updateMany({
      where: {
        id,
        userId: user.id
      },
      data: { content }
    });

    if (updatedPost.count === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const post = await prisma.generatedPost.findUnique({
      where: { id }
    });

    res.json({ message: 'Post updated successfully', post });
  } catch (error) {
    console.error('Error updating post:', error);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// Delete a generated post
router.delete('/posts/:id', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const user = req.user as any;

  try {
    await prisma.generatedPost.deleteMany({
      where: {
        id,
        userId: user.id
      }
    });

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(404).json({ error: 'Post not found' });
  }
});

export default router;
