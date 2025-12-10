import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import db from '../database';
import axios from 'axios';

const router = express.Router();

// Share post to Facebook
router.post('/share/facebook', isAuthenticated, async (req, res) => {
  const { postId } = req.body;
  const user = req.user as any;

  if (!postId) {
    return res.status(400).json({ error: 'Post ID is required' });
  }

  const post: any = db.prepare('SELECT * FROM generated_posts WHERE id = ? AND user_id = ?')
    .get(postId, user.id);

  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  try {
    // Mock Facebook API call - in production, use Facebook Graph API
    // const response = await axios.post(
    //   `https://graph.facebook.com/v18.0/me/feed`,
    //   {
    //     message: post.content,
    //     link: post.media_url
    //   },
    //   {
    //     headers: {
    //       Authorization: `Bearer ${user.access_token}`
    //     }
    //   }
    // );

    // Mock successful share
    const mockFacebookPostId = `fb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    db.prepare('UPDATE generated_posts SET shared_to_facebook = 1, facebook_post_id = ?, status = ? WHERE id = ?')
      .run(mockFacebookPostId, 'published', postId);

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

  const post: any = db.prepare('SELECT * FROM generated_posts WHERE id = ? AND user_id = ?')
    .get(postId, user.id);

  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  try {
    // Mock Instagram API call - in production, use Instagram Graph API
    // const response = await axios.post(
    //   `https://graph.facebook.com/v18.0/me/media`,
    //   {
    //     image_url: post.media_url,
    //     caption: post.content
    //   },
    //   {
    //     headers: {
    //       Authorization: `Bearer ${user.access_token}`
    //     }
    //   }
    // );

    // Mock successful share
    const mockInstagramPostId = `ig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    db.prepare('UPDATE generated_posts SET shared_to_instagram = 1, instagram_post_id = ?, status = ? WHERE id = ?')
      .run(mockInstagramPostId, 'published', postId);

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

