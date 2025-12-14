import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = express.Router();

// In-memory storage fallback for UGC sessions
const inMemoryUgcSessions = new Map<string, any[]>();

// Demographic options
const DEMOGRAPHIC_OPTIONS = {
  ageGroups: ['18-24', '25-34', '35-44', '45-54', '55+'],
  genders: ['Male', 'Female', 'Non-binary', 'All'],
  interests: ['Fitness', 'Technology', 'Fashion', 'Health', 'Lifestyle', 'Business', 'Gaming', 'Travel'],
  tones: ['Professional', 'Casual', 'Energetic', 'Luxurious', 'Friendly', 'Bold']
};

// Get demographic options
router.get('/demographics', (req, res) => {
  res.json(DEMOGRAPHIC_OPTIONS);
});

// Create a new UGC session
router.post('/sessions', isAuthenticated, async (req, res) => {
  const { productId } = req.body;
  const user = req.user as any;

  if (!productId) {
    return res.status(400).json({ error: 'Product ID is required' });
  }

  try {
    const session = await prisma.$queryRaw`
      INSERT INTO ugc_sessions (id, user_id, product_id, current_step, status, created_at, updated_at)
      VALUES (gen_random_uuid(), ${user.id}, ${productId}, 0, 'draft', NOW(), NOW())
      RETURNING *
    ` as any[];

    res.json({ session: session[0] });
  } catch (error: any) {
    console.log('⚠️  Database unavailable, using in-memory storage');
    
    const session = {
      id: `ugc_${Date.now()}`,
      userId: user.id,
      productId,
      targetDemographic: null,
      productPrompt: null,
      characterPrompt: null,
      scenes: null,
      generatedCharacters: null,
      selectedCharacter: null,
      generatedProductImages: null,
      selectedProductImage: null,
      editedScenes: null,
      videoUrl: null,
      videoProgress: 0,
      currentStep: 0,
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const userSessions = inMemoryUgcSessions.get(user.id) || [];
    userSessions.push(session);
    inMemoryUgcSessions.set(user.id, userSessions);

    res.json({ session });
  }
});

// Get all UGC sessions for user
router.get('/sessions', isAuthenticated, async (req, res) => {
  const user = req.user as any;

  try {
    const sessions = await prisma.$queryRaw`
      SELECT * FROM ugc_sessions WHERE user_id = ${user.id} ORDER BY created_at DESC
    `;
    res.json({ sessions });
  } catch (error) {
    const sessions = inMemoryUgcSessions.get(user.id) || [];
    res.json({ sessions });
  }
});

// Get a specific UGC session
router.get('/sessions/:id', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const user = req.user as any;

  try {
    const sessions = await prisma.$queryRaw`
      SELECT * FROM ugc_sessions WHERE id = ${id} AND user_id = ${user.id}
    ` as any[];

    if (!sessions.length) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ session: sessions[0] });
  } catch (error) {
    const userSessions = inMemoryUgcSessions.get(user.id) || [];
    const session = userSessions.find(s => s.id === id);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({ session });
  }
});

// Update UGC session (Step 0: Set demographics and generate prompts)
router.put('/sessions/:id/demographics', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { targetDemographic } = req.body;
  const user = req.user as any;

  try {
    // Get product info for prompt generation
    const products = await prisma.product.findMany({
      where: { userId: user.id }
    });

    // Find the session to get productId
    let productId: string;
    try {
      const sessions = await prisma.$queryRaw`
        SELECT product_id FROM ugc_sessions WHERE id = ${id}
      ` as any[];
      productId = sessions[0]?.product_id;
    } catch {
      const userSessions = inMemoryUgcSessions.get(user.id) || [];
      const session = userSessions.find(s => s.id === id);
      productId = session?.productId;
    }

    const product = products.find(p => p.id === productId);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Generate prompts based on demographics and product
    const { ageGroup, gender, interests, tone } = targetDemographic;
    
    const productPrompt = `A ${product.title} - ${product.description.substring(0, 200)}...`;
    
    const characterPrompt = `A ${gender !== 'All' ? gender.toLowerCase() : 'person'} aged ${ageGroup}, 
interested in ${interests.join(', ')}, with a ${tone.toLowerCase()} demeanor. 
They are the perfect ambassador for ${product.title}.`;

    // Generate scene prompts
    const scenes = [
      {
        id: 1,
        title: 'Introduction',
        prompt: `Opening shot: ${characterPrompt} discovers the ${product.title} for the first time. Expression of curiosity and interest.`,
        duration: 3
      },
      {
        id: 2,
        title: 'Product Showcase',
        prompt: `Close-up of ${product.title} highlighting its key features. Clean, professional lighting.`,
        duration: 4
      },
      {
        id: 3,
        title: 'Usage Demo',
        prompt: `${characterPrompt} demonstrating how to use ${product.title}. Natural, authentic interaction.`,
        duration: 5
      },
      {
        id: 4,
        title: 'Benefits Highlight',
        prompt: `Split screen showing before/after or key benefits of ${product.title}. ${tone} messaging style.`,
        duration: 4
      },
      {
        id: 5,
        title: 'Call to Action',
        prompt: `${characterPrompt} enthusiastically recommending ${product.title}. End with product logo and purchase prompt.`,
        duration: 3
      }
    ];

    // Update session
    try {
      await prisma.$executeRaw`
        UPDATE ugc_sessions 
        SET target_demographic = ${JSON.stringify(targetDemographic)}::jsonb,
            product_prompt = ${productPrompt},
            character_prompt = ${characterPrompt},
            scenes = ${JSON.stringify(scenes)}::jsonb,
            current_step = 1,
            updated_at = NOW()
        WHERE id = ${id} AND user_id = ${user.id}
      `;
    } catch {
      const userSessions = inMemoryUgcSessions.get(user.id) || [];
      const sessionIndex = userSessions.findIndex(s => s.id === id);
      if (sessionIndex !== -1) {
        userSessions[sessionIndex] = {
          ...userSessions[sessionIndex],
          targetDemographic,
          productPrompt,
          characterPrompt,
          scenes,
          currentStep: 1,
          updatedAt: new Date()
        };
        inMemoryUgcSessions.set(user.id, userSessions);
      }
    }

    res.json({
      success: true,
      productPrompt,
      characterPrompt,
      scenes
    });
  } catch (error) {
    console.error('Error updating demographics:', error);
    res.status(500).json({ error: 'Failed to update demographics' });
  }
});

// Step 1: Generate characters
router.post('/sessions/:id/generate-characters', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const user = req.user as any;

  try {
    // Mock character generation - in production, this would call an AI image generation API
    const generatedCharacters = [
      { id: 1, url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400', selected: false },
      { id: 2, url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400', selected: false },
      { id: 3, url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400', selected: false },
      { id: 4, url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400', selected: false }
    ];

    // Update session
    try {
      await prisma.$executeRaw`
        UPDATE ugc_sessions 
        SET generated_characters = ${JSON.stringify(generatedCharacters)}::jsonb,
            status = 'generating',
            updated_at = NOW()
        WHERE id = ${id} AND user_id = ${user.id}
      `;
    } catch {
      const userSessions = inMemoryUgcSessions.get(user.id) || [];
      const sessionIndex = userSessions.findIndex(s => s.id === id);
      if (sessionIndex !== -1) {
        userSessions[sessionIndex].generatedCharacters = generatedCharacters;
        userSessions[sessionIndex].status = 'generating';
        userSessions[sessionIndex].updatedAt = new Date();
        inMemoryUgcSessions.set(user.id, userSessions);
      }
    }

    res.json({ characters: generatedCharacters });
  } catch (error) {
    console.error('Error generating characters:', error);
    res.status(500).json({ error: 'Failed to generate characters' });
  }
});

// Step 1: Select character
router.put('/sessions/:id/select-character', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { characterUrl } = req.body;
  const user = req.user as any;

  try {
    try {
      await prisma.$executeRaw`
        UPDATE ugc_sessions 
        SET selected_character = ${characterUrl},
            current_step = 2,
            updated_at = NOW()
        WHERE id = ${id} AND user_id = ${user.id}
      `;
    } catch {
      const userSessions = inMemoryUgcSessions.get(user.id) || [];
      const sessionIndex = userSessions.findIndex(s => s.id === id);
      if (sessionIndex !== -1) {
        userSessions[sessionIndex].selectedCharacter = characterUrl;
        userSessions[sessionIndex].currentStep = 2;
        userSessions[sessionIndex].updatedAt = new Date();
        inMemoryUgcSessions.set(user.id, userSessions);
      }
    }

    res.json({ success: true, currentStep: 2 });
  } catch (error) {
    console.error('Error selecting character:', error);
    res.status(500).json({ error: 'Failed to select character' });
  }
});

// Step 2: Generate product images
router.post('/sessions/:id/generate-product-images', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const user = req.user as any;

  try {
    // Mock product image generation
    const generatedProductImages = [
      { id: 1, url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400', selected: false },
      { id: 2, url: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=400', selected: false },
      { id: 3, url: 'https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=400', selected: false },
      { id: 4, url: 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=400', selected: false }
    ];

    try {
      await prisma.$executeRaw`
        UPDATE ugc_sessions 
        SET generated_product_images = ${JSON.stringify(generatedProductImages)}::jsonb,
            updated_at = NOW()
        WHERE id = ${id} AND user_id = ${user.id}
      `;
    } catch {
      const userSessions = inMemoryUgcSessions.get(user.id) || [];
      const sessionIndex = userSessions.findIndex(s => s.id === id);
      if (sessionIndex !== -1) {
        userSessions[sessionIndex].generatedProductImages = generatedProductImages;
        userSessions[sessionIndex].updatedAt = new Date();
        inMemoryUgcSessions.set(user.id, userSessions);
      }
    }

    res.json({ images: generatedProductImages });
  } catch (error) {
    console.error('Error generating product images:', error);
    res.status(500).json({ error: 'Failed to generate product images' });
  }
});

// Step 2: Select product image
router.put('/sessions/:id/select-product-image', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { imageUrl } = req.body;
  const user = req.user as any;

  try {
    try {
      await prisma.$executeRaw`
        UPDATE ugc_sessions 
        SET selected_product_image = ${imageUrl},
            current_step = 3,
            updated_at = NOW()
        WHERE id = ${id} AND user_id = ${user.id}
      `;
    } catch {
      const userSessions = inMemoryUgcSessions.get(user.id) || [];
      const sessionIndex = userSessions.findIndex(s => s.id === id);
      if (sessionIndex !== -1) {
        userSessions[sessionIndex].selectedProductImage = imageUrl;
        userSessions[sessionIndex].currentStep = 3;
        userSessions[sessionIndex].updatedAt = new Date();
        inMemoryUgcSessions.set(user.id, userSessions);
      }
    }

    res.json({ success: true, currentStep: 3 });
  } catch (error) {
    console.error('Error selecting product image:', error);
    res.status(500).json({ error: 'Failed to select product image' });
  }
});

// Step 3: Update scenes
router.put('/sessions/:id/scenes', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { scenes } = req.body;
  const user = req.user as any;

  try {
    try {
      await prisma.$executeRaw`
        UPDATE ugc_sessions 
        SET edited_scenes = ${JSON.stringify(scenes)}::jsonb,
            updated_at = NOW()
        WHERE id = ${id} AND user_id = ${user.id}
      `;
    } catch {
      const userSessions = inMemoryUgcSessions.get(user.id) || [];
      const sessionIndex = userSessions.findIndex(s => s.id === id);
      if (sessionIndex !== -1) {
        userSessions[sessionIndex].editedScenes = scenes;
        userSessions[sessionIndex].updatedAt = new Date();
        inMemoryUgcSessions.set(user.id, userSessions);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating scenes:', error);
    res.status(500).json({ error: 'Failed to update scenes' });
  }
});

// Step 4: Generate video
router.post('/sessions/:id/generate-video', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const user = req.user as any;

  try {
    // Start video generation (mock)
    try {
      await prisma.$executeRaw`
        UPDATE ugc_sessions 
        SET current_step = 4,
            status = 'generating',
            video_progress = 0,
            updated_at = NOW()
        WHERE id = ${id} AND user_id = ${user.id}
      `;
    } catch {
      const userSessions = inMemoryUgcSessions.get(user.id) || [];
      const sessionIndex = userSessions.findIndex(s => s.id === id);
      if (sessionIndex !== -1) {
        userSessions[sessionIndex].currentStep = 4;
        userSessions[sessionIndex].status = 'generating';
        userSessions[sessionIndex].videoProgress = 0;
        userSessions[sessionIndex].updatedAt = new Date();
        inMemoryUgcSessions.set(user.id, userSessions);
      }
    }

    // Simulate video generation progress
    simulateVideoGeneration(id, user.id);

    res.json({ success: true, message: 'Video generation started' });
  } catch (error) {
    console.error('Error starting video generation:', error);
    res.status(500).json({ error: 'Failed to start video generation' });
  }
});

// Get video generation progress
router.get('/sessions/:id/progress', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const user = req.user as any;

  try {
    try {
      const sessions = await prisma.$queryRaw`
        SELECT video_progress, status, video_url FROM ugc_sessions 
        WHERE id = ${id} AND user_id = ${user.id}
      ` as any[];

      if (sessions.length) {
        res.json({
          progress: sessions[0].video_progress,
          status: sessions[0].status,
          videoUrl: sessions[0].video_url
        });
        return;
      }
    } catch {
      const userSessions = inMemoryUgcSessions.get(user.id) || [];
      const session = userSessions.find(s => s.id === id);
      if (session) {
        res.json({
          progress: session.videoProgress,
          status: session.status,
          videoUrl: session.videoUrl
        });
        return;
      }
    }

    res.status(404).json({ error: 'Session not found' });
  } catch (error) {
    console.error('Error getting progress:', error);
    res.status(500).json({ error: 'Failed to get progress' });
  }
});

// Helper function to simulate video generation
async function simulateVideoGeneration(sessionId: string, userId: string) {
  const steps = [10, 25, 40, 55, 70, 85, 100];
  
  for (const progress of steps) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      if (progress === 100) {
        await prisma.$executeRaw`
          UPDATE ugc_sessions 
          SET video_progress = ${progress},
              status = 'completed',
              video_url = 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
              updated_at = NOW()
          WHERE id = ${sessionId}
        `;
      } else {
        await prisma.$executeRaw`
          UPDATE ugc_sessions 
          SET video_progress = ${progress},
              updated_at = NOW()
          WHERE id = ${sessionId}
        `;
      }
    } catch {
      const userSessions = inMemoryUgcSessions.get(userId) || [];
      const sessionIndex = userSessions.findIndex(s => s.id === sessionId);
      if (sessionIndex !== -1) {
        userSessions[sessionIndex].videoProgress = progress;
        if (progress === 100) {
          userSessions[sessionIndex].status = 'completed';
          userSessions[sessionIndex].videoUrl = 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4';
        }
        userSessions[sessionIndex].updatedAt = new Date();
        inMemoryUgcSessions.set(userId, userSessions);
      }
    }
  }
}

export default router;

