import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import prisma from '../lib/prisma';
import { llmService } from '../services/llm';
import { uploadImageToS3, deleteFromS3 } from '../services/s3';
import { videoStitcherService, SceneVideo, StitchProgress } from '../services/video-stitcher';

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
      INSERT INTO ugc_sessions (id, user_id, product_id, title, current_step, status, created_at, updated_at)
      VALUES (gen_random_uuid(), ${user.id}, ${productId}, 'New Session', 0, 'draft', NOW(), NOW())
      RETURNING *
    ` as any[];

    res.json({ session: session[0] });
  } catch (error: any) {
    console.log('⚠️  Database unavailable, using in-memory storage');
    
    const session = {
      id: `ugc_${Date.now()}`,
      userId: user.id,
      productId,
      title: 'New Session',
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

// Update session title
router.patch('/sessions/:id/title', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  const user = req.user as any;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    await prisma.$executeRaw`
      UPDATE ugc_sessions 
      SET title = ${title}, updated_at = NOW()
      WHERE id = ${id} AND user_id = ${user.id}
    `;

    res.json({ success: true });
  } catch (error) {
    console.log('⚠️  Database unavailable, using in-memory storage');
    
    const userSessions = inMemoryUgcSessions.get(user.id) || [];
    const sessionIndex = userSessions.findIndex(s => s.id === id);
    
    if (sessionIndex !== -1) {
      userSessions[sessionIndex].title = title;
      userSessions[sessionIndex].updatedAt = new Date();
      inMemoryUgcSessions.set(user.id, userSessions);
    }

    res.json({ success: true });
  }
});

// Delete UGC session
router.delete('/sessions/:id', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const user = req.user as any;

  try {
    // First, get the session to access video URLs
    let session: any = null;
    
    try {
      const sessions = await prisma.$queryRaw`
        SELECT * FROM ugc_sessions WHERE id = ${id} AND user_id = ${user.id}
      ` as any[];
      session = sessions[0];
    } catch {
      const userSessions = inMemoryUgcSessions.get(user.id) || [];
      session = userSessions.find(s => s.id === id);
    }

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Delete videos from S3
    const videosToDelete: string[] = [];
    
    // Add final video URL if exists
    if (session.video_url || session.videoUrl) {
      videosToDelete.push(session.video_url || session.videoUrl);
    }

    // Add scene videos if they exist
    if (session.edited_scenes || session.editedScenes) {
      const scenes = session.edited_scenes || session.editedScenes;
      if (typeof scenes === 'string') {
        try {
          const parsedScenes = JSON.parse(scenes);
          parsedScenes.forEach((scene: any) => {
            if (scene.videoUrl) videosToDelete.push(scene.videoUrl);
            if (scene.videos) {
              scene.videos.forEach((video: any) => {
                if (video.url) videosToDelete.push(video.url);
              });
            }
          });
        } catch (e) {
          console.error('Error parsing scenes:', e);
        }
      } else if (Array.isArray(scenes)) {
        scenes.forEach((scene: any) => {
          if (scene.videoUrl) videosToDelete.push(scene.videoUrl);
          if (scene.videos) {
            scene.videos.forEach((video: any) => {
              if (video.url) videosToDelete.push(video.url);
            });
          }
        });
      }
    }

    // Delete all videos from S3
    console.log(`🗑️  Deleting ${videosToDelete.length} videos from S3...`);
    await Promise.all(videosToDelete.map(url => deleteFromS3(url)));

    // Delete the session from database
    try {
      await prisma.$executeRaw`
        DELETE FROM ugc_sessions WHERE id = ${id} AND user_id = ${user.id}
      `;
    } catch {
      const userSessions = inMemoryUgcSessions.get(user.id) || [];
      const updatedSessions = userSessions.filter(s => s.id !== id);
      inMemoryUgcSessions.set(user.id, updatedSessions);
    }

    console.log(`✅ Session ${id} deleted successfully`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
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

    // Generate prompts using LLM (Gemini)
    console.log('🤖 Generating creative prompts with Gemini LLM...');
    
    const { productPrompt, productBreakdown, characterPrompt, scenes, videoAdOutput } = await llmService.generateProductPrompt(
      {
        title: product.title,
        description: product.description,
        price: product.price
      },
      targetDemographic
    );
    
    console.log('✅ LLM prompts generated successfully');

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
          productBreakdown,
          characterPrompt,
          scenes,
          videoAdOutput,
          currentStep: 1,
          updatedAt: new Date()
        };
        inMemoryUgcSessions.set(user.id, userSessions);
      }
    }

    res.json({
      success: true,
      productPrompt,
      productBreakdown,
      characterPrompt,
      scenes,
      videoAdOutput
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
    // Get session to retrieve customer avatar/character prompt
    let session: any = null;
    try {
      const sessions = await prisma.$queryRaw`
        SELECT * FROM ugc_sessions WHERE id = ${id} AND user_id = ${user.id}
      ` as any[];
      session = sessions[0];
    } catch {
      const userSessions = inMemoryUgcSessions.get(user.id) || [];
      session = userSessions.find(s => s.id === id);
    }

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get customer avatar from session (either from videoAdOutput or characterPrompt)
    const videoAdOutput = session.videoAdOutput || session.video_ad_output;
    const characterPrompt = session.characterPrompt || session.character_prompt;
    
    // Extract full customer avatar details
    let customerAvatar: {
      name?: string;
      visualDescription: string;
      demographics?: string;
      backstory?: string;
    } | null = null;

    if (videoAdOutput?.customer_avatar) {
      const avatar = videoAdOutput.customer_avatar;
      customerAvatar = {
        name: avatar.name,
        visualDescription: avatar.visual_description || '',
        demographics: avatar.demographics,
        backstory: avatar.backstory
      };
    } else if (characterPrompt) {
      customerAvatar = { visualDescription: characterPrompt };
    }

    if (!customerAvatar || !customerAvatar.visualDescription) {
      return res.status(400).json({ error: 'No character description available. Please complete the demographics step first.' });
    }

    console.log('🎨 Generating character images from customer avatar...');
    console.log(`   Name: ${customerAvatar.name || 'N/A'}`);
    console.log(`   Demographics: ${customerAvatar.demographics || 'N/A'}`);
    console.log(`   Visual description: ${customerAvatar.visualDescription.substring(0, 100)}...`);

    // Generate multiple character variations using AI
    const generatedCharacters: { id: number; url: string; selected: boolean; generating?: boolean }[] = [];
    const numberOfVariations = 4;

    // Generate images in parallel with slight variations
    const imagePromises = [];
    const variations = [
      'confident expression, direct eye contact',
      'friendly smile, approachable pose',
      'thoughtful expression, slight side angle',
      'energetic expression, dynamic pose'
    ];
    
    for (let i = 0; i < numberOfVariations; i++) {
      // Create a variation of the customer avatar with enhanced visual description
      const avatarVariation = {
        ...customerAvatar,
        visualDescription: `${customerAvatar.visualDescription}. ${variations[i]}`
      };
      imagePromises.push(llmService.generateCharacterImage(avatarVariation));
    }

    const results = await Promise.all(imagePromises);

    // Process results and upload to S3
    for (let i = 0; i < results.length; i++) {
      const imageResult = results[i];
      if (imageResult) {
        try {
          // Convert base64 to buffer and upload to S3
          const imageBuffer = Buffer.from(imageResult.base64, 'base64');
          const extension = imageResult.mimeType.split('/')[1] || 'png';
          const fileName = `character-${id}-${i + 1}-${Date.now()}.${extension}`;
          
          const s3Url = await uploadImageToS3(imageBuffer, fileName, imageResult.mimeType);
          
          generatedCharacters.push({
            id: i + 1,
            url: s3Url,
            selected: false
          });
          console.log(`✅ Character ${i + 1} uploaded: ${s3Url}`);
        } catch (uploadError) {
          console.error(`❌ Failed to upload character ${i + 1}:`, uploadError);
        }
      }
    }

    // If no AI images were generated, fallback to placeholder images
    if (generatedCharacters.length === 0) {
      console.log('⚠️ No AI images generated, using fallback placeholders');
      generatedCharacters.push(
        { id: 1, url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400', selected: false },
        { id: 2, url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400', selected: false },
        { id: 3, url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400', selected: false },
        { id: 4, url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400', selected: false }
      );
    }

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

// Helper function to fetch image from URL and convert to base64
async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch image from ${url}: ${response.status}`);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    
    return { base64, mimeType };
  } catch (error) {
    console.error(`Error fetching image from ${url}:`, error);
    return null;
  }
}

// Step 2: Generate product images
router.post('/sessions/:id/generate-product-images', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const user = req.user as any;

  try {
    // Get session data
    let session: any = null;
    try {
      const sessions = await prisma.$queryRaw`
        SELECT * FROM ugc_sessions WHERE id = ${id} AND user_id = ${user.id}
      ` as any[];
      session = sessions[0];
    } catch {
      const userSessions = inMemoryUgcSessions.get(user.id) || [];
      session = userSessions.find(s => s.id === id);
    }

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get selected character URL
    const selectedCharacter = session.selectedCharacter || session.selected_character;
    if (!selectedCharacter) {
      return res.status(400).json({ error: 'No character selected. Please complete the character step first.' });
    }

    // Get product details
    const productId = session.productId || session.product_id;
    let product: any = null;
    try {
      const products = await prisma.$queryRaw`
        SELECT * FROM products WHERE id = ${productId}
      ` as any[];
      product = products[0];
    } catch {
      // Fallback: try to get from session's video ad output
      const videoAdOutput = session.videoAdOutput || session.video_ad_output;
      if (videoAdOutput) {
        product = {
          name: videoAdOutput.product_name || 'Product',
          description: 'A quality product',
          imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400'
        };
      }
    }

    if (!product) {
      return res.status(400).json({ error: 'Product not found' });
    }

    const productImageUrl = product.imageUrl || product.image_url || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400';

    console.log('📸 Generating product shots...');
    console.log(`   Character image: ${selectedCharacter.substring(0, 50)}...`);
    console.log(`   Product image: ${productImageUrl.substring(0, 50)}...`);

    // Fetch character image
    const characterImage = await fetchImageAsBase64(selectedCharacter);
    if (!characterImage) {
      return res.status(400).json({ error: 'Failed to fetch character image' });
    }

    // Fetch product image
    const productImage = await fetchImageAsBase64(productImageUrl);
    if (!productImage) {
      return res.status(400).json({ error: 'Failed to fetch product image' });
    }

    // Get character description from session
    const videoAdOutput = session.videoAdOutput || session.video_ad_output;
    const characterDescription = videoAdOutput?.customer_avatar?.visual_description || '';

    // Generate multiple product shot variations
    const generatedProductImages: { id: number; url: string; selected: boolean }[] = [];
    const numberOfVariations = 4;
    const variations = [
      'Person holding the product up, showcasing it with a smile',
      'Person using or interacting with the product naturally',
      'Close-up of person with product, emphasizing the connection',
      'Dynamic action shot of person with the product'
    ];

    // Generate images in parallel
    const imagePromises = variations.slice(0, numberOfVariations).map((variation, index) => 
      llmService.generateProductShot({
        characterImageBase64: characterImage.base64,
        characterImageMimeType: characterImage.mimeType,
        productImageBase64: productImage.base64,
        productImageMimeType: productImage.mimeType,
        productName: product.name || 'Product',
        productDescription: `${product.description || ''}. Style: ${variation}`,
        characterDescription
      })
    );

    const results = await Promise.all(imagePromises);

    // Process results and upload to S3
    for (let i = 0; i < results.length; i++) {
      const imageResult = results[i];
      if (imageResult) {
        try {
          const imageBuffer = Buffer.from(imageResult.base64, 'base64');
          const extension = imageResult.mimeType.split('/')[1] || 'png';
          const fileName = `product-shot-${id}-${i + 1}-${Date.now()}.${extension}`;
          
          const s3Url = await uploadImageToS3(imageBuffer, fileName, imageResult.mimeType);
          
          generatedProductImages.push({
            id: i + 1,
            url: s3Url,
            selected: false
          });
          console.log(`✅ Product shot ${i + 1} uploaded: ${s3Url}`);
        } catch (uploadError) {
          console.error(`❌ Failed to upload product shot ${i + 1}:`, uploadError);
        }
      }
    }

    // If no AI images were generated, fallback to placeholder images
    if (generatedProductImages.length === 0) {
      console.log('⚠️ No AI product shots generated, using fallback placeholders');
      generatedProductImages.push(
        { id: 1, url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400', selected: false },
        { id: 2, url: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=400', selected: false },
        { id: 3, url: 'https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=400', selected: false },
        { id: 4, url: 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=400', selected: false }
      );
    }

    // Update session
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

// Step 3: Generate scene image
router.post('/sessions/:id/generate-scene-image', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { sceneIndex, visualsPrompt } = req.body;
  const user = req.user as any;

  try {
    // Get session data
    let session: any = null;
    try {
      const sessions = await prisma.$queryRaw`
        SELECT * FROM ugc_sessions WHERE id = ${id} AND user_id = ${user.id}
      ` as any[];
      session = sessions[0];
    } catch {
      const userSessions = inMemoryUgcSessions.get(user.id) || [];
      session = userSessions.find(s => s.id === id);
    }

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get selected product image (reference image)
    const selectedProductImage = session.selectedProductImage || session.selected_product_image;
    if (!selectedProductImage) {
      return res.status(400).json({ error: 'No product image selected. Please complete the Product Shot step first.' });
    }

    console.log(`🎬 Generating scene image for scene ${sceneIndex + 1}...`);
    console.log(`   Reference image: ${selectedProductImage.substring(0, 50)}...`);
    console.log(`   Visuals prompt: ${visualsPrompt.substring(0, 100)}...`);

    // Fetch the product image as base64
    const productImage = await fetchImageAsBase64(selectedProductImage);
    if (!productImage) {
      return res.status(400).json({ error: 'Failed to fetch product image' });
    }

    // Generate scene image using the product image as reference and visuals as prompt
    const scenePrompt = `Generate a hyper-realistic scene for a video advertisement based on this reference image.

SCENE DESCRIPTION:
${visualsPrompt}

Requirements:
- Maintain consistency with the person and product shown in the reference image
- Create a natural, professional video ad scene
- Photorealistic, high-resolution quality suitable for 9:16 vertical video
- Professional lighting that matches the scene description
- The scene should feel authentic and engaging for social media ads`;

    const imageResult = await llmService.generateImage(scenePrompt);
    
    if (!imageResult) {
      return res.status(500).json({ error: 'Failed to generate scene image' });
    }

    // Upload to S3
    const imageBuffer = Buffer.from(imageResult.base64, 'base64');
    const extension = imageResult.mimeType.split('/')[1] || 'png';
    const fileName = `scene-${id}-${sceneIndex + 1}-${Date.now()}.${extension}`;
    
    const s3Url = await uploadImageToS3(imageBuffer, fileName, imageResult.mimeType);
    console.log(`✅ Scene image uploaded: ${s3Url}`);

    res.json({ 
      success: true, 
      sceneIndex,
      imageUrl: s3Url 
    });
  } catch (error) {
    console.error('Error generating scene image:', error);
    res.status(500).json({ error: 'Failed to generate scene image' });
  }
});

// In-memory fallback for scene video jobs
const inMemorySceneVideoJobs = new Map<string, any[]>();

// Step 3: Generate scene video (ASYNC - returns immediately, processes in background)
router.post('/sessions/:id/generate-scene-video', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { sceneIndex, prompt, imageUrl } = req.body;
  const user = req.user as any;

  try {
    if (!imageUrl) {
      return res.status(400).json({ error: 'Scene image is required. Generate the scene image first.' });
    }

    if (sceneIndex === undefined || sceneIndex === null) {
      return res.status(400).json({ error: 'Scene index is required.' });
    }

    console.log(`🎬 Starting async scene video generation for scene ${sceneIndex + 1}...`);

    // Create or update job in database
    let jobId: string;
    try {
      // Try to upsert the job
      const existingJobs = await prisma.$queryRaw<any[]>`
        SELECT id FROM scene_video_jobs 
        WHERE session_id = ${id} AND scene_index = ${sceneIndex}
      `;

      if (existingJobs.length > 0) {
        jobId = existingJobs[0].id;
        await prisma.$executeRaw`
          UPDATE scene_video_jobs 
          SET status = 'queued', 
              progress = 0, 
              video_url = NULL, 
              error_message = NULL,
              prompt = ${prompt},
              image_url = ${imageUrl},
              updated_at = NOW()
          WHERE id = ${jobId}
        `;
      } else {
        const newJobs = await prisma.$queryRaw<any[]>`
          INSERT INTO scene_video_jobs (id, session_id, scene_index, status, progress, prompt, image_url, created_at, updated_at)
          VALUES (gen_random_uuid(), ${id}, ${sceneIndex}, 'queued', 0, ${prompt}, ${imageUrl}, NOW(), NOW())
          RETURNING id
        `;
        jobId = newJobs[0].id;
      }
    } catch (dbError) {
      // Fallback to in-memory
      console.log('⚠️ Database unavailable, using in-memory storage for job');
      jobId = `job_${Date.now()}_${sceneIndex}`;
      const sessionJobs = inMemorySceneVideoJobs.get(id) || [];
      const existingJobIndex = sessionJobs.findIndex(j => j.sceneIndex === sceneIndex);
      const job = {
        id: jobId,
        sessionId: id,
        sceneIndex,
        status: 'queued',
        progress: 0,
        videoUrl: null,
        errorMessage: null,
        prompt,
        imageUrl,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      if (existingJobIndex >= 0) {
        jobId = sessionJobs[existingJobIndex].id;
        sessionJobs[existingJobIndex] = { ...job, id: jobId };
      } else {
        sessionJobs.push(job);
      }
      inMemorySceneVideoJobs.set(id, sessionJobs);
    }

    // Return immediately with job info
    res.json({ 
      success: true, 
      jobId,
      sceneIndex,
      status: 'queued',
      message: 'Video generation started. Poll for status.'
    });

    // Process video generation in background
    processSceneVideoJob(id, sceneIndex, jobId, prompt, imageUrl);

  } catch (error) {
    console.error('Error starting scene video generation:', error);
    res.status(500).json({ error: 'Failed to start scene video generation' });
  }
});

// Background job processor for scene video generation
async function processSceneVideoJob(
  sessionId: string, 
  sceneIndex: number, 
  jobId: string, 
  prompt: string, 
  imageUrl: string
) {
  try {
    // Update status to 'generating'
    await updateJobStatus(sessionId, sceneIndex, 'generating', 10);

    console.log(`🎬 [Job ${jobId}] Generating scene video for scene ${sceneIndex + 1}...`);
    console.log(`   Scene image: ${imageUrl.substring(0, 50)}...`);
    console.log(`   Prompt: ${prompt.substring(0, 100)}...`);

    // Fetch the scene image as base64
    const sceneImage = await fetchImageAsBase64(imageUrl);
    if (!sceneImage) {
      await updateJobStatus(sessionId, sceneIndex, 'failed', 0, null, 'Failed to fetch scene image');
      return;
    }

    await updateJobStatus(sessionId, sceneIndex, 'generating', 30);

    // Generate video using the scene image as starting frame
    // Pass a progress callback to get real-time updates from the LLM service
    const videoResult = await llmService.generateSceneVideo({
      imageBase64: sceneImage.base64,
      imageMimeType: sceneImage.mimeType,
      prompt: prompt,
      onProgress: async (progress: number, message: string) => {
        // Update job status with real progress from Gemini polling
        console.log(`   [Job ${jobId}] Progress: ${progress}% - ${message}`);
        await updateJobStatus(sessionId, sceneIndex, 'generating', progress);
      }
    });

    if (!videoResult) {
      await updateJobStatus(sessionId, sceneIndex, 'failed', 0, null, 'Failed to generate video');
      return;
    }

    console.log(`✅ [Job ${jobId}] Scene video generated: ${videoResult.videoUrl}`);

    // Update job with completed status and video URL
    await updateJobStatus(sessionId, sceneIndex, 'completed', 100, videoResult.videoUrl);

    // Also update the scene in the session's editedScenes
    await updateSessionSceneVideoUrl(sessionId, sceneIndex, videoResult.videoUrl);

  } catch (error) {
    console.error(`❌ [Job ${jobId}] Error generating scene video:`, error);
    await updateJobStatus(
      sessionId, 
      sceneIndex, 
      'failed', 
      0, 
      null, 
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

// Helper to update job status in DB or in-memory
async function updateJobStatus(
  sessionId: string,
  sceneIndex: number,
  status: string,
  progress: number,
  videoUrl?: string | null,
  errorMessage?: string | null
) {
  try {
    await prisma.$executeRaw`
      UPDATE scene_video_jobs 
      SET status = ${status}, 
          progress = ${progress}, 
          video_url = ${videoUrl || null},
          error_message = ${errorMessage || null},
          updated_at = NOW()
      WHERE session_id = ${sessionId} AND scene_index = ${sceneIndex}
    `;
  } catch {
    // Fallback to in-memory
    const sessionJobs = inMemorySceneVideoJobs.get(sessionId) || [];
    const jobIndex = sessionJobs.findIndex(j => j.sceneIndex === sceneIndex);
    if (jobIndex >= 0) {
      sessionJobs[jobIndex] = {
        ...sessionJobs[jobIndex],
        status,
        progress,
        videoUrl: videoUrl || null,
        errorMessage: errorMessage || null,
        updatedAt: new Date()
      };
      inMemorySceneVideoJobs.set(sessionId, sessionJobs);
    }
  }
}

// Helper to update session's editedScenes with video URL
async function updateSessionSceneVideoUrl(sessionId: string, sceneIndex: number, videoUrl: string) {
  try {
    // Get current session
    const sessions = await prisma.$queryRaw<any[]>`
      SELECT edited_scenes, scenes FROM ugc_sessions WHERE id = ${sessionId}
    `;
    
    if (sessions.length > 0) {
      const session = sessions[0];
      const scenes = session.edited_scenes || session.scenes || [];
      
      if (scenes[sceneIndex]) {
        scenes[sceneIndex].videoUrl = videoUrl;
        
        await prisma.$executeRaw`
          UPDATE ugc_sessions 
          SET edited_scenes = ${JSON.stringify(scenes)}::jsonb,
              updated_at = NOW()
          WHERE id = ${sessionId}
        `;
      }
    }
  } catch (error) {
    console.warn('Could not update session with video URL:', error);
    // In-memory fallback handled by the caller
  }
}

// Get scene video jobs status for a session
router.get('/sessions/:id/scene-video-status', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const user = req.user as any;

  try {
    let jobs: any[] = [];

    try {
      jobs = await prisma.$queryRaw<any[]>`
        SELECT 
          id,
          scene_index as "sceneIndex",
          status,
          progress,
          video_url as "videoUrl",
          error_message as "errorMessage",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM scene_video_jobs 
        WHERE session_id = ${id}
        ORDER BY scene_index ASC
      `;
    } catch {
      // Fallback to in-memory
      const sessionJobs = inMemorySceneVideoJobs.get(id) || [];
      jobs = sessionJobs.map(j => ({
        id: j.id,
        sceneIndex: j.sceneIndex,
        status: j.status,
        progress: j.progress,
        videoUrl: j.videoUrl,
        errorMessage: j.errorMessage,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt
      }));
    }

    res.json({ jobs });
  } catch (error) {
    console.error('Error fetching scene video status:', error);
    res.status(500).json({ error: 'Failed to fetch scene video status' });
  }
});

// Generate all scene videos at once
router.post('/sessions/:id/generate-all-scene-videos', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { scenes } = req.body;
  const user = req.user as any;

  try {
    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      return res.status(400).json({ error: 'No scenes provided' });
    }

    const jobsStarted: { sceneIndex: number; jobId: string; status: string }[] = [];

    for (const scene of scenes) {
      if (!scene.imageUrl) {
        console.log(`⚠️ Skipping scene ${scene.id}: No image URL`);
        continue;
      }

      const sceneIndex = scene.id - 1; // scene.id is 1-based
      const prompt = `${scene.prompt}. Motion: ${scene.motion || 'smooth movement'}. The character says: "${scene.dialogue || ''}"`;

      // Create job in database
      let jobId: string;
      try {
        const existingJobs = await prisma.$queryRaw<any[]>`
          SELECT id FROM scene_video_jobs 
          WHERE session_id = ${id} AND scene_index = ${sceneIndex}
        `;

        if (existingJobs.length > 0) {
          jobId = existingJobs[0].id;
          await prisma.$executeRaw`
            UPDATE scene_video_jobs 
            SET status = 'queued', 
                progress = 0, 
                video_url = NULL, 
                error_message = NULL,
                prompt = ${prompt},
                image_url = ${scene.imageUrl},
                updated_at = NOW()
            WHERE id = ${jobId}
          `;
        } else {
          const newJobs = await prisma.$queryRaw<any[]>`
            INSERT INTO scene_video_jobs (id, session_id, scene_index, status, progress, prompt, image_url, created_at, updated_at)
            VALUES (gen_random_uuid(), ${id}, ${sceneIndex}, 'queued', 0, ${prompt}, ${scene.imageUrl}, NOW(), NOW())
            RETURNING id
          `;
          jobId = newJobs[0].id;
        }
      } catch {
        // Fallback to in-memory
        jobId = `job_${Date.now()}_${sceneIndex}`;
        const sessionJobs = inMemorySceneVideoJobs.get(id) || [];
        sessionJobs.push({
          id: jobId,
          sessionId: id,
          sceneIndex,
          status: 'queued',
          progress: 0,
          prompt,
          imageUrl: scene.imageUrl,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        inMemorySceneVideoJobs.set(id, sessionJobs);
      }

      jobsStarted.push({ sceneIndex, jobId, status: 'queued' });

      // Start background processing (don't await - run in parallel)
      processSceneVideoJob(id, sceneIndex, jobId, prompt, scene.imageUrl);
    }

    res.json({
      success: true,
      message: `Started video generation for ${jobsStarted.length} scenes`,
      jobs: jobsStarted
    });

  } catch (error) {
    console.error('Error starting batch video generation:', error);
    res.status(500).json({ error: 'Failed to start batch video generation' });
  }
});

// Store active stitching progress for polling
const stitchingProgress = new Map<string, StitchProgress>();

// Step 4: Generate video (stitch scene videos together)
router.post('/sessions/:id/generate-video', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { scenes: scenesFromRequest } = req.body;
  const user = req.user as any;

  try {
    // Get session to retrieve scene videos
    let session: any = null;
    let scenes: any[] = [];

    try {
      const sessions = await prisma.$queryRaw`
        SELECT * FROM ugc_sessions WHERE id = ${id} AND user_id = ${user.id}
      ` as any[];
      session = sessions[0];
    } catch {
      const userSessions = inMemoryUgcSessions.get(user.id) || [];
      session = userSessions.find(s => s.id === id);
    }

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get scenes from request body or from session
    if (scenesFromRequest && Array.isArray(scenesFromRequest)) {
      scenes = scenesFromRequest;
    } else {
      // Fall back to edited_scenes or original scenes from session
      scenes = session.editedScenes || session.edited_scenes || session.scenes || [];
    }

    // Filter scenes that have video URLs and are included in final
    // NOTE: Don't pass duration - let the stitcher detect it from the actual video file
    // This ensures accurate xfade offsets based on real video length
    const scenesWithVideos: SceneVideo[] = scenes
      .filter((scene: any) => scene.videoUrl && scene.includeInFinal !== false)
      .map((scene: any, index: number) => ({
        videoUrl: scene.videoUrl,
        transition: scene.transition || (index === scenes.length - 1 ? 'none' : 'fade'),
        duration: scene.videoDuration || undefined, // Let stitcher detect from actual file
        includeInFinal: scene.includeInFinal !== false
      }));

    if (scenesWithVideos.length === 0) {
      return res.status(400).json({ 
        error: 'No scene videos found. Please generate videos for at least one scene first.' 
      });
    }

    console.log(`🎬 Starting video stitching for session ${id} with ${scenesWithVideos.length} scenes...`);

    // Update session status to generating
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

    // Send immediate response
    res.json({ success: true, message: 'Video stitching started' });

    // Auto-assign smart transitions if not specified
    const scenesWithTransitions = videoStitcherService.autoAssignTransitions(scenesWithVideos);

    // Run stitching in background with progress tracking
    videoStitcherService.stitchVideos(
      {
        scenes: scenesWithTransitions,
        transitionDuration: 0.5,
        outputQuality: 'high'
      },
      (progress: StitchProgress) => {
        // Store progress for polling
        stitchingProgress.set(id, progress);
        
        // Update session progress in DB
        const dbProgress = progress.progress;
        updateSessionProgress(id, user.id, dbProgress, progress.stage === 'complete', progress.stage === 'error');
      }
    ).then(async (result) => {
      if (result.success && result.videoUrl) {
        console.log(`✅ Video stitching complete: ${result.videoUrl}`);
        
        // Create new video entry for stitched_videos array
        const newVideo = {
          url: result.videoUrl,
          createdAt: new Date().toISOString(),
          sceneCount: scenesWithVideos.length
        };
        
        // Update session with final video URL and append to stitched_videos array
        try {
          // First get existing stitched_videos
          const existingSession = await prisma.$queryRaw<any[]>`
            SELECT stitched_videos FROM ugc_sessions WHERE id = ${id}
          `;
          
          const existingVideos = existingSession?.[0]?.stitched_videos || [];
          const updatedVideos = [newVideo, ...existingVideos];
          
          await prisma.$executeRaw`
            UPDATE ugc_sessions 
            SET video_progress = 100,
                status = 'completed',
                video_url = ${result.videoUrl},
                stitched_videos = ${JSON.stringify(updatedVideos)}::jsonb,
                updated_at = NOW()
            WHERE id = ${id}
          `;
        } catch (dbError) {
          console.log('Using in-memory storage for stitched videos');
          const userSessions = inMemoryUgcSessions.get(user.id) || [];
          const sessionIndex = userSessions.findIndex(s => s.id === id);
          if (sessionIndex !== -1) {
            userSessions[sessionIndex].videoProgress = 100;
            userSessions[sessionIndex].status = 'completed';
            userSessions[sessionIndex].videoUrl = result.videoUrl;
            // Append to stitched videos array
            const existingVideos = userSessions[sessionIndex].stitchedVideos || [];
            userSessions[sessionIndex].stitchedVideos = [newVideo, ...existingVideos];
            userSessions[sessionIndex].updatedAt = new Date();
            inMemoryUgcSessions.set(user.id, userSessions);
          }
        }
      } else {
        console.error(`❌ Video stitching failed: ${result.error}`);
        
        // Update session with error
        try {
          await prisma.$executeRaw`
            UPDATE ugc_sessions 
            SET status = 'failed',
                updated_at = NOW()
            WHERE id = ${id}
          `;
        } catch {
          const userSessions = inMemoryUgcSessions.get(user.id) || [];
          const sessionIndex = userSessions.findIndex(s => s.id === id);
          if (sessionIndex !== -1) {
            userSessions[sessionIndex].status = 'failed';
            userSessions[sessionIndex].updatedAt = new Date();
            inMemoryUgcSessions.set(user.id, userSessions);
          }
        }
      }
      
      // Clean up progress tracker after a delay
      setTimeout(() => stitchingProgress.delete(id), 60000);
    });

  } catch (error) {
    console.error('Error starting video generation:', error);
    res.status(500).json({ error: 'Failed to start video generation' });
  }
});

// Helper function to update session progress
async function updateSessionProgress(
  sessionId: string, 
  userId: string, 
  progress: number, 
  isComplete: boolean,
  isError: boolean
) {
  try {
    if (isComplete) {
      // Don't update here - the final update with URL will happen after
      return;
    }
    
    if (isError) {
      await prisma.$executeRaw`
        UPDATE ugc_sessions 
        SET status = 'failed',
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
      if (isError) {
        userSessions[sessionIndex].status = 'failed';
      }
      userSessions[sessionIndex].updatedAt = new Date();
      inMemoryUgcSessions.set(userId, userSessions);
    }
  }
}

// Get video generation progress
router.get('/sessions/:id/progress', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const user = req.user as any;

  try {
    // First check if we have active stitching progress (real-time updates from stitcher)
    const activeProgress = stitchingProgress.get(id);
    
    // If we have active progress, use it directly for real-time updates
    if (activeProgress) {
      // Still try to get session data for videoUrl/stitchedVideos
      let sessionData: any = null;
      try {
        const sessions = await prisma.$queryRaw`
          SELECT video_url, stitched_videos, status FROM ugc_sessions 
          WHERE id = ${id} AND user_id = ${user.id}
        ` as any[];
        sessionData = sessions[0];
      } catch {
        const userSessions = inMemoryUgcSessions.get(user.id) || [];
        sessionData = userSessions.find(s => s.id === id);
      }
      
      res.json({
        // Use real-time progress from stitching callback
        progress: activeProgress.progress,
        status: activeProgress.stage === 'complete' ? 'completed' : 
                activeProgress.stage === 'error' ? 'failed' : 'generating',
        videoUrl: sessionData?.video_url || sessionData?.videoUrl,
        stitchedVideos: sessionData?.stitched_videos || sessionData?.stitchedVideos,
        stage: activeProgress.stage,
        message: activeProgress.message
      });
      return;
    }
    
    // No active progress - get from DB/in-memory
    try {
      const sessions = await prisma.$queryRaw`
        SELECT video_progress, status, video_url, stitched_videos FROM ugc_sessions 
        WHERE id = ${id} AND user_id = ${user.id}
      ` as any[];

      if (sessions.length) {
        res.json({
          progress: sessions[0].video_progress,
          status: sessions[0].status,
          videoUrl: sessions[0].video_url,
          stitchedVideos: sessions[0].stitched_videos
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
          videoUrl: session.videoUrl,
          stitchedVideos: session.stitchedVideos
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

export default router;


