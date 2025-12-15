import { GoogleGenAI } from '@google/genai';
import { llmCounter } from './counter';

/**
 * Video production scene structure
 */
export interface VideoScene {
  scene: number;
  section: string;
  visuals: string;
  dialogue: string;
  motion: string;
  transitions: string;
}

/**
 * Customer avatar structure
 */
export interface CustomerAvatar {
  name: string;
  demographics: string;
  backstory: string;
  visual_description: string;
}

/**
 * Video ad script structure
 */
export interface VideoAdOutput {
  product_name: string;
  ad_format: string;
  target_platform: string;
  customer_avatar: CustomerAvatar;
  video_ad_script: {
    overall_tone: string;
  };
  video_production_breakdown: VideoScene[];
}

/**
 * LLM Service for Gemini API integration
 * Used for generating UGC creative prompts
 */
export class LLMService {
  private ai: GoogleGenAI | null = null;

  /**
   * Lazy initialization of Gemini API client
   */
  private getClient(): GoogleGenAI {
    if (this.ai) {
      return this.ai;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in environment variables');
    }

    this.ai = new GoogleGenAI({ apiKey });
    console.log('✨ Google Gemini AI SDK initialized');
    return this.ai;
  }

  /**
   * Get the text model name from environment
   */
  private getTextModelName(): string {
    const model = process.env.GEMINI_TEXT_MODEL || 'gemini-2.0-flash';
    return model;
  }

  /**
   * Get the image model name from environment
   */
  private getImageModelName(): string {
    const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.0-flash-exp-image-generation';
    return model;
  }

  /**
   * Generate an image from a prompt using Gemini's image generation
   * Returns the image as a base64 string and mime type
   */
  async generateImage(prompt: string): Promise<{ base64: string; mimeType: string } | null> {
    const startTime = Date.now();
    const modelName = this.getImageModelName();
    
    try {
      const ai = this.getClient();
      
      console.log(`🎨 Generating image with Gemini (model: ${modelName})...`);
      console.log(`   Prompt: ${prompt.substring(0, 100)}...`);

      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ text: prompt }],
        config: {
          responseModalities: ['Text', 'Image']
        }
      } as any);

      // Extract image from response
      const candidates = response.candidates;
      if (candidates && candidates.length > 0) {
        const parts = candidates[0].content?.parts;
        if (parts) {
          for (const part of parts) {
            if (part.inlineData) {
              const { mimeType, data } = part.inlineData;
              const durationMs = Date.now() - startTime;
              console.log(`✅ Image generated successfully (${mimeType})`);
              
              // Track successful text-to-image operation
              await llmCounter.incrementTextToImage(modelName, true, durationMs);
              
              return {
                base64: data as string,
                mimeType: mimeType || 'image/png'
              };
            }
          }
        }
      }

      const durationMs = Date.now() - startTime;
      console.log('⚠️ No image data in response');
      
      // Track failed text-to-image operation (no image in response)
      await llmCounter.incrementTextToImage(modelName, false, durationMs, 'No image data in response');
      
      return null;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      console.error('❌ Error generating image:', error);
      
      // Track failed text-to-image operation
      await llmCounter.incrementTextToImage(modelName, false, durationMs, error instanceof Error ? error.message : 'Unknown error');
      
      return null;
    }
  }

  /**
   * Generate a character image based on customer avatar details
   */
  async generateCharacterImage(customerAvatar: {
    name?: string;
    visualDescription: string;
    demographics?: string;
    backstory?: string;
  }): Promise<{ base64: string; mimeType: string } | null> {
    const { name, visualDescription, demographics, backstory } = customerAvatar;
    
    // Build a rich character prompt using all available details
    let characterContext = '';
    if (name) characterContext += `Name: ${name}. `;
    if (demographics) characterContext += `Demographics: ${demographics}. `;
    if (backstory) characterContext += `Background: ${backstory}. `;
    
    const enhancedPrompt = `Generate a hyper-realistic portrait photo of a person for a video advertisement.

Character Profile:
${characterContext}

Visual Description: ${visualDescription}

Style requirements:
- Photorealistic, high-resolution portrait photograph
- Natural lighting with soft shadows
- Professional photography quality suitable for commercial use
- Subject positioned with adequate space around for 9:16 vertical crop
- Authentic, lifelike facial features and natural expressions
- The person should look relatable and approachable
- Modern, clean background suitable for video ads
- Capture the essence of the character's personality and lifestyle`;

    return this.generateImage(enhancedPrompt);
  }

  /**
   * Generate a product shot image with the character holding/using the product
   * Takes reference images (character and product) as input
   */
  async generateProductShot(options: {
    characterImageBase64: string;
    characterImageMimeType: string;
    productImageBase64: string;
    productImageMimeType: string;
    productName: string;
    productDescription: string;
    characterDescription?: string;
  }): Promise<{ base64: string; mimeType: string } | null> {
    const startTime = Date.now();
    const modelName = this.getImageModelName();
    
    try {
      const ai = this.getClient();
      
      const prompt = `Generate a hyper-realistic product advertisement photo combining these two reference images.

TASK: Create a natural, professional photo of the person from the first image using or holding the product from the second image.

Product Details:
- Product Name: ${options.productName}
- Description: ${options.productDescription}
${options.characterDescription ? `\nCharacter Context: ${options.characterDescription}` : ''}

Requirements:
- The person should be naturally interacting with or showcasing the product
- Maintain the exact likeness and features of the person from reference image 1
- Maintain the exact appearance of the product from reference image 2
- Photorealistic, high-resolution commercial photography quality
- Professional lighting that highlights both the person and product
- Clean, modern background suitable for social media ads
- Composition suitable for 9:16 vertical video frame
- The scene should feel authentic and relatable, not overly staged
- Natural pose and expression showing genuine interest in the product`;

      console.log(`🛍️ Generating product shot with Gemini (model: ${modelName})...`);
      console.log(`   Product: ${options.productName}`);

      // Build contents with text prompt and reference images
      const contents: any[] = [
        { text: prompt },
        {
          inlineData: {
            mimeType: options.characterImageMimeType,
            data: options.characterImageBase64
          }
        },
        {
          inlineData: {
            mimeType: options.productImageMimeType,
            data: options.productImageBase64
          }
        }
      ];

      const response = await ai.models.generateContent({
        model: modelName,
        contents: contents,
        config: {
          responseModalities: ['Text', 'Image']
        }
      } as any);

      // Extract image from response
      const candidates = response.candidates;
      if (candidates && candidates.length > 0) {
        const parts = candidates[0].content?.parts;
        if (parts) {
          for (const part of parts) {
            if (part.inlineData) {
              const { mimeType, data } = part.inlineData;
              const durationMs = Date.now() - startTime;
              console.log(`✅ Product shot generated successfully (${mimeType})`);
              
              await llmCounter.incrementTextToImage(modelName, true, durationMs);
              
              return {
                base64: data as string,
                mimeType: mimeType || 'image/png'
              };
            }
          }
        }
      }

      const durationMs = Date.now() - startTime;
      console.log('⚠️ No image data in product shot response');
      await llmCounter.incrementTextToImage(modelName, false, durationMs, 'No image data in response');
      
      return null;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      console.error('❌ Error generating product shot:', error);
      await llmCounter.incrementTextToImage(modelName, false, durationMs, error instanceof Error ? error.message : 'Unknown error');
      
      return null;
    }
  }

  /**
   * Generate a video from an image and text prompt
   * Uses Gemini's video generation with image-to-video capability
   * @param options.onProgress - Optional callback for progress updates (0-100)
   */
  async generateSceneVideo(options: {
    imageBase64: string;
    imageMimeType: string;
    prompt: string;
    onProgress?: (progress: number, message: string) => void;
  }): Promise<{ videoUrl: string } | null> {
    const startTime = Date.now();
    const videoModel = process.env.GEMINI_VIDEO_MODEL;
    const reportProgress = options.onProgress || (() => {});
    
    if (!videoModel) {
      console.error('❌ GEMINI_VIDEO_MODEL is not configured');
      return null;
    }

    try {
      const ai = this.getClient();

      console.log(`🎬 Starting scene video generation (model: ${videoModel})...`);
      console.log(`   Prompt: ${options.prompt.substring(0, 100)}...`);

      reportProgress(35, 'Starting video generation...');

      // Start video generation with image as starting frame
      let operation = await ai.models.generateVideos({
        model: videoModel,
        prompt: options.prompt,
        image: {
          imageBytes: options.imageBase64,
          mimeType: options.imageMimeType
        }
      } as any);

      console.log(`🎬 Video generation started, polling for completion...`);
      reportProgress(40, 'Video generation in progress...');

      // Poll until done (max 10 minutes)
      let pollCount = 0;
      const maxPolls = 60;
      
      // Gemini typically completes within 10 polls (~100 seconds)
      // Progress goes from 40% to 88% over expected 12 polls (with buffer)
      // Then slows down for remaining polls if it takes longer
      const expectedPolls = 12; // Expected completion with buffer
      const progressStart = 40;
      const progressEnd = 88;
      const progressRange = progressEnd - progressStart;
      
      while (!operation.done && pollCount < maxPolls) {
        pollCount++;
        
        // Calculate progress: fast progress up to expectedPolls, then slow down
        let pollProgress: number;
        if (pollCount <= expectedPolls) {
          // Normal progress: 40% -> 88% over 12 polls
          pollProgress = progressStart + Math.round((pollCount / expectedPolls) * progressRange);
        } else {
          // Slower progress for unexpected delays: 88% -> 90% over remaining polls
          const extraProgress = Math.min((pollCount - expectedPolls) / (maxPolls - expectedPolls) * 2, 2);
          pollProgress = Math.round(progressEnd + extraProgress);
        }
        pollProgress = Math.min(pollProgress, 90);
        
        console.log(`   Polling... (attempt ${pollCount}/${maxPolls}) - ${pollProgress}%`);
        reportProgress(pollProgress, `Generating video... (${pollCount}/${expectedPolls})`);
        
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        
        operation = await ai.operations.getVideosOperation({ operation });
      }

      if (!operation.done) {
        throw new Error('Video generation timed out');
      }

      const durationMs = Date.now() - startTime;
      console.log(`✅ Video generation completed in ${durationMs}ms`);
      reportProgress(92, 'Video generated, uploading...');

      // Get the generated video
      const generatedVideos = (operation as any).response?.generatedVideos;
      if (!generatedVideos || generatedVideos.length === 0) {
        throw new Error('No video generated in response');
      }

      const video = generatedVideos[0].video;
      
      // Download the video to a temp file, then upload to S3
      const { uploadImageToS3 } = await import('./s3');
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      
      const tempDir = os.tmpdir();
      const tempFileName = `scene-video-${Date.now()}.mp4`;
      const tempFilePath = path.join(tempDir, tempFileName);
      
      reportProgress(95, 'Downloading video...');
      
      await ai.files.download({
        file: video,
        downloadPath: tempFilePath
      });
      
      reportProgress(97, 'Uploading to storage...');
      
      // Read the downloaded file and upload to S3
      const videoBuffer = fs.readFileSync(tempFilePath);
      const s3Url = await uploadImageToS3(videoBuffer, tempFileName, 'video/mp4');
      
      // Clean up temp file
      fs.unlinkSync(tempFilePath);

      await llmCounter.incrementTextToVideo(videoModel, true, durationMs);
      
      reportProgress(100, 'Complete!');

      return { videoUrl: s3Url };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      console.error('❌ Error generating scene video:', error);
      await llmCounter.incrementTextToVideo(videoModel || 'unknown', false, durationMs, error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  /**
   * Generate text response from Gemini
   */
  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const startTime = Date.now();
    const modelName = this.getTextModelName();
    
    try {
      const ai = this.getClient();
      
      console.log(`📝 Sending text generation request to Gemini (model: ${modelName})...`);

      const contents: any[] = [];
      
      if (systemPrompt) {
        contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
        contents.push({ role: 'model', parts: [{ text: 'Understood. I will follow these instructions.' }] });
      }
      
      contents.push({ role: 'user', parts: [{ text: prompt }] });

      const response = await ai.models.generateContent({
        model: modelName,
        contents: contents
      });

      const text = response.text || '';
      const durationMs = Date.now() - startTime;
      console.log('✅ Received response from Gemini API');
      
      // Track successful text-to-text operation
      await llmCounter.incrementTextToText(modelName, true, durationMs);
      
      return text;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      console.error('❌ Error calling Gemini API:', error);
      
      // Track failed text-to-text operation
      await llmCounter.incrementTextToText(modelName, false, durationMs, error instanceof Error ? error.message : 'Unknown error');
      
      throw new Error(
        error instanceof Error
          ? `Gemini API Error: ${error.message}`
          : 'Failed to get response from Gemini API'
      );
    }
  }

  /**
   * Generate a product breakdown analysis for video ad creation
   * Returns the raw string response from the LLM
   */
  async generateProductBreakdown(
    product: { title: string; description: string; price: number },
    demographic: { ageGroup: string; gender: string; interests: string[]; tone: string }
  ): Promise<string> {
    const systemPrompt = `You are an expert e-commerce product analyst. Take the following product details and break them down into a structured analysis for creating video ads. Focus on extracting key elements that can be used to craft compelling ads.`;

    const userPrompt = `Product Name: ${product.title}

Description: ${product.description}

Price: $${product.price}

Target Audience Hints: ${demographic.ageGroup} ${demographic.gender !== 'All' ? demographic.gender : ''}, interested in ${demographic.interests.join(', ')}

Output in this exact format:
- **Key Features**: Bullet list of 5-7 main features.
- **Benefits**: For each feature, explain the user benefit in 1-2 sentences.
- **Pain Points Solved**: 3-5 problems this product addresses.
- **Unique Selling Points (USPs)**: What makes it stand out from competitors.
- **Ideal Customer Profile**: Demographics (age, gender, lifestyle), needs, and motivations.
- **Emotional Hooks**: 3-5 emotional appeals (e.g., convenience, status, relief).
- **Call to Action Ideas**: 2-3 strong CTAs for ads (e.g., "Buy now and transform your workouts!").

Keep the response concise, factual, and ad-focused.`;

    try {
      const responseText = await this.generateText(userPrompt, systemPrompt);
      return responseText.trim();
    } catch (error) {
      console.error('❌ Failed to generate product breakdown:', error);
      return '';
    }
  }

  /**
   * Generate a complete video ad production plan based on product details and target demographic
   */
  async generateProductPrompt(
    product: { title: string; description: string; price: number },
    demographic: { ageGroup: string; gender: string; interests: string[]; tone: string }
  ): Promise<{
    productPrompt: string;
    productBreakdown: string;
    characterPrompt: string;
    scenes: Array<{ id: number; title: string; prompt: string; dialogue: string; motion: string; transitions: string; duration: number }>;
    videoAdOutput: VideoAdOutput | null;
  }> {
    // First, generate the product breakdown
    console.log('📊 Generating product breakdown analysis...');
    const productBreakdown = await this.generateProductBreakdown(product, demographic);
    console.log('✅ Product breakdown complete');

    // Now generate the complete video ad production plan
    const systemPrompt = `You are a creative video ad automation expert. Using the product breakdown below, automatically generate a customer avatar, a complete 30-60 second video ad script, ready-to-use prompts for generating consistent, hyper-realistic scenes in Google Nano Banana (Gemini image editor), and a detailed breakdown of how these scenes, along with dialogue and motion, should be assembled into a compelling video ad. The scenes should map directly to the script sections for a cohesive ad, the human faces should look as authentic and lifelike as possible, and the primary subject in all generated images should be positioned so they are not too close, allowing for a 9:16 crop later without losing key details.

Always respond in valid JSON format with no markdown formatting or code blocks.`;

    const userPrompt = `Based on this product breakdown, generate a complete video ad production plan:

PRODUCT: ${product.title}
PRICE: $${product.price}

PRODUCT BREAKDOWN:
${productBreakdown}

TARGET AUDIENCE:
- Age Group: ${demographic.ageGroup}
- Gender: ${demographic.gender}
- Interests: ${demographic.interests.join(', ')}
- Content Tone: ${demographic.tone}

Output in this exact JSON format:
{
  "product_name": "${product.title}",
  "ad_format": "Video Ad (30-60 Seconds)",
  "target_platform": "Social Media (9:16 Vertical Crop)",
  "customer_avatar": {
    "name": "[Name matching the target demographic]",
    "demographics": "[Detailed description of demographics]",
    "backstory": "[2-3 sentence summary of daily life, challenge, and product fit]",
    "visual_description": "[Detailed description for AI image generation, focusing on hyper-realism and framing for crop]"
  },
  "video_ad_script": {
    "overall_tone": "[e.g., Energetic, relatable, persuasive - matching ${demographic.tone}]"
  },
  "video_production_breakdown": [
    {
      "scene": 1,
      "section": "Hook",
      "visuals": "[Detailed image generation prompt for the scene, ensuring consistency, product integration, style, background, and pose. Primary subject not too close for 9:16 crop.]",
      "dialogue": "[Corresponding script dialogue - attention-grabbing opening]",
      "motion": "[Camera movement instructions (e.g., slow zoom-in, pan, hold)]",
      "transitions": "[Transition type (e.g., smooth cut, fade, wipe)]"
    },
    {
      "scene": 2,
      "section": "Problem",
      "visuals": "[Detailed image generation prompt showing the problem/pain point]",
      "dialogue": "[Script dialogue highlighting the problem the audience faces]",
      "motion": "[Camera movement instructions]",
      "transitions": "[Transition type]"
    },
    {
      "scene": 3,
      "section": "Solution",
      "visuals": "[Detailed image generation prompt introducing the product as solution]",
      "dialogue": "[Script dialogue presenting the product]",
      "motion": "[Camera movement instructions]",
      "transitions": "[Transition type]"
    },
    {
      "scene": 4,
      "section": "Testimonial/Proof",
      "visuals": "[Detailed image generation prompt showing product benefits/results]",
      "dialogue": "[Script dialogue with testimonial or proof points]",
      "motion": "[Camera movement instructions]",
      "transitions": "[Transition type]"
    },
    {
      "scene": 5,
      "section": "Call to Action",
      "visuals": "[Detailed image generation prompt for the CTA scene]",
      "dialogue": "[Strong call to action dialogue]",
      "motion": "[Camera movement instructions]",
      "transitions": "[Transition type]"
    }
  ]
}

Respond ONLY with the JSON object.`;

    try {
      const responseText = await this.generateText(userPrompt, systemPrompt);
      
      // Parse the JSON response
      let cleanedResponse = responseText.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.slice(7);
      }
      if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.slice(3);
      }
      if (cleanedResponse.endsWith('```')) {
        cleanedResponse = cleanedResponse.slice(0, -3);
      }
      cleanedResponse = cleanedResponse.trim();

      const videoAdOutput: VideoAdOutput = JSON.parse(cleanedResponse);
      
      // Extract simplified data for backward compatibility
      const productPrompt = `${videoAdOutput.product_name} - A ${videoAdOutput.video_ad_script.overall_tone} video ad targeting ${videoAdOutput.customer_avatar.demographics}`;
      const characterPrompt = videoAdOutput.customer_avatar.visual_description;
      
      // Convert video_production_breakdown to scenes format (preserving all fields)
      const scenes = videoAdOutput.video_production_breakdown.map(scene => ({
        id: scene.scene,
        title: scene.section,
        prompt: scene.visuals,
        dialogue: scene.dialogue,
        motion: scene.motion,
        transitions: scene.transitions,
        duration: scene.section === 'Hook' ? 3 : scene.section === 'Call to Action' ? 3 : 4
      }));

      return {
        productPrompt,
        productBreakdown,
        characterPrompt,
        scenes,
        videoAdOutput
      };
    } catch (parseError) {
      console.error('❌ Failed to parse LLM response:', parseError);
      
      // Fallback to template-based generation
      return this.generateFallbackPrompts(product, demographic, productBreakdown);
    }
  }

  /**
   * Fallback prompt generation when LLM fails
   */
  private generateFallbackPrompts(
    product: { title: string; description: string; price: number },
    demographic: { ageGroup: string; gender: string; interests: string[]; tone: string },
    productBreakdown: string
  ): {
    productPrompt: string;
    productBreakdown: string;
    characterPrompt: string;
    scenes: Array<{ id: number; title: string; prompt: string; dialogue: string; motion: string; transitions: string; duration: number }>;
    videoAdOutput: VideoAdOutput | null;
  } {
    const { ageGroup, gender, interests, tone } = demographic;

    const productPrompt = `Introducing ${product.title} - the perfect companion for ${interests[0] || 'lifestyle'} enthusiasts. ${product.description.substring(0, 150)}`;

    const characterPrompt = `A ${gender !== 'All' ? gender.toLowerCase() : 'person'} aged ${ageGroup}, 
passionate about ${interests.join(' and ')}, with a ${tone.toLowerCase()} and authentic personality. 
They have a natural, relatable presence that connects with their audience. 
Hyper-realistic portrait, positioned with space around for 9:16 vertical crop.`;

    const scenes = [
      {
        id: 1,
        title: 'Hook',
        prompt: `Opening shot: ${gender !== 'All' ? gender : 'Person'} in their ${ageGroup}s looking directly at camera with an intrigued expression, about to share something exciting. ${tone} lighting and modern setting. Hyper-realistic, positioned for 9:16 crop with headroom.`,
        dialogue: `"Wait, you NEED to see this..."`,
        motion: 'Slow zoom-in on face',
        transitions: 'Smooth cut',
        duration: 3
      },
      {
        id: 2,
        title: 'Problem',
        prompt: `The creator shows a common frustration that ${ageGroup} year olds face related to ${interests[0] || 'daily life'}. Authentic, relatable moment. Medium shot with room for vertical crop.`,
        dialogue: `"I used to struggle with this all the time..."`,
        motion: 'Slight pan left to right',
        transitions: 'Quick cut',
        duration: 4
      },
      {
        id: 3,
        title: 'Solution',
        prompt: `Reveal of ${product.title}. The creator's face lights up as they hold the product. Clean product shot with ${tone.toLowerCase()} presentation style. Full body or 3/4 shot for 9:16 framing.`,
        dialogue: `"Then I found the ${product.title}!"`,
        motion: 'Dynamic reveal with zoom',
        transitions: 'Fade transition',
        duration: 4
      },
      {
        id: 4,
        title: 'Testimonial/Proof',
        prompt: `The creator demonstrates ${product.title} in action. Close-up shots of key features interspersed with reaction shots. Natural, unscripted feel showing genuine appreciation.`,
        dialogue: `"Look at how easy this is... and the quality is incredible!"`,
        motion: 'Close-up shots with smooth transitions',
        transitions: 'Quick cuts between angles',
        duration: 5
      },
      {
        id: 5,
        title: 'Call to Action',
        prompt: `The creator enthusiastically recommends ${product.title}. Direct eye contact, genuine smile, and clear call to action. Product visible in frame. Centered composition for 9:16.`,
        dialogue: `"Link in bio - trust me, you won't regret it!"`,
        motion: 'Hold on face, slight zoom',
        transitions: 'Fade to end card',
        duration: 3
      }
    ];

    return { 
      productPrompt, 
      productBreakdown, 
      characterPrompt, 
      scenes,
      videoAdOutput: null
    };
  }
}

// Export singleton instance
export const llmService = new LLMService();
