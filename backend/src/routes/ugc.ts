import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import prisma from '../lib/prisma';
import { llmService } from '../services/llm';
import { uploadImageToS3 } from '../services/s3';
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

// Step 3: Generate scene video
router.post('/sessions/:id/generate-scene-video', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { sceneIndex, prompt, imageUrl } = req.body;
  const user = req.user as any;

  try {
    if (!imageUrl) {
      return res.status(400).json({ error: 'Scene image is required. Generate the scene image first.' });
    }

    console.log(`🎬 Generating scene video for scene ${sceneIndex + 1}...`);
    console.log(`   Scene image: ${imageUrl.substring(0, 50)}...`);
    console.log(`   Prompt: ${prompt.substring(0, 100)}...`);

    // Fetch the scene image as base64
    const sceneImage = await fetchImageAsBase64(imageUrl);
    if (!sceneImage) {
      return res.status(400).json({ error: 'Failed to fetch scene image' });
    }

    // Generate video using the scene image as starting frame
    const videoResult = await llmService.generateSceneVideo({
      imageBase64: sceneImage.base64,
      imageMimeType: sceneImage.mimeType,
      prompt: prompt
    });

    if (!videoResult) {
      return res.status(500).json({ error: 'Failed to generate scene video' });
    }

    console.log(`✅ Scene video generated: ${videoResult.videoUrl}`);

    res.json({ 
      success: true, 
      sceneIndex,
      videoUrl: videoResult.videoUrl
    });
  } catch (error) {
    console.error('Error generating scene video:', error);
    res.status(500).json({ error: 'Failed to generate scene video' });
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
    const scenesWithVideos: SceneVideo[] = scenes
      .filter((scene: any) => scene.videoUrl && scene.includeInFinal !== false)
      .map((scene: any, index: number) => ({
        videoUrl: scene.videoUrl,
        transition: scene.transition || (index === scenes.length - 1 ? 'none' : 'fade'),
        duration: scene.videoDuration || 4,
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
        
        // Update session with final video URL
        try {
          await prisma.$executeRaw`
            UPDATE ugc_sessions 
            SET video_progress = 100,
                status = 'completed',
                video_url = ${result.videoUrl},
                updated_at = NOW()
            WHERE id = ${id}
          `;
        } catch {
          const userSessions = inMemoryUgcSessions.get(user.id) || [];
          const sessionIndex = userSessions.findIndex(s => s.id === id);
          if (sessionIndex !== -1) {
            userSessions[sessionIndex].videoProgress = 100;
            userSessions[sessionIndex].status = 'completed';
            userSessions[sessionIndex].videoUrl = result.videoUrl;
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
    // First check if we have active stitching progress
    const activeProgress = stitchingProgress.get(id);
    
    try {
      const sessions = await prisma.$queryRaw`
        SELECT video_progress, status, video_url FROM ugc_sessions 
        WHERE id = ${id} AND user_id = ${user.id}
      ` as any[];

      if (sessions.length) {
        res.json({
          progress: sessions[0].video_progress,
          status: sessions[0].status,
          videoUrl: sessions[0].video_url,
          // Include detailed stage info if available
          stage: activeProgress?.stage,
          message: activeProgress?.message
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
          stage: activeProgress?.stage,
          message: activeProgress?.message
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


