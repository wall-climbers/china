import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = express.Router();

// Share post to Facebook
router.post('/share/facebook', isAuthenticated, async (req, res) => {
  const { postId } = req.body;
  const user = req.user as any;

  if (!postId) {
    return res.status(400).json({ error: 'Post ID is required' });
  }

  try {
    const post = await prisma.generatedPost.findFirst({
      where: {
        id: postId,
        userId: user.id
      }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Mock Facebook API call - in production, use Facebook Graph API
    const mockFacebookPostId = `fb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await prisma.generatedPost.update({
      where: { id: postId },
      data: {
        sharedToFacebook: true,
        facebookPostId: mockFacebookPostId,
        status: 'published'
      }
    });

    res.json({
      message: 'Successfully shared to Facebook',
      facebookPostId: mockFacebookPostId
    });
  } catch (error) {
    console.error('Facebook share error:', error);
    res.status(500).json({ error: 'Failed to share to Facebook' });
  }
});

// Share post to Instagram
router.post('/share/instagram', isAuthenticated, async (req, res) => {
  const { postId } = req.body;
  const user = req.user as any;

  if (!postId) {
    return res.status(400).json({ error: 'Post ID is required' });
  }

  try {
    const post = await prisma.generatedPost.findFirst({
      where: {
        id: postId,
        userId: user.id
      }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Mock Instagram API call - in production, use Instagram Graph API
    const mockInstagramPostId = `ig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await prisma.generatedPost.update({
      where: { id: postId },
      data: {
        sharedToInstagram: true,
        instagramPostId: mockInstagramPostId,
        status: 'published'
      }
    });

    res.json({
      message: 'Successfully shared to Instagram',
      instagramPostId: mockInstagramPostId
    });
  } catch (error) {
    console.error('Instagram share error:', error);
    res.status(500).json({ error: 'Failed to share to Instagram' });
  }
});

export default router;
