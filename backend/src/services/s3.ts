import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { promisify } from 'util';
import { writeFile, unlink, readFile } from 'fs/promises';
import path from 'path';
import os from 'os';

// Set ffmpeg path
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'mock-access-key',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'mock-secret-key'
  }
});

const S3_BUCKET = process.env.AWS_S3_BUCKET || 'socialcommerce-videos';

export const generateMockVideo = async (product: any): Promise<Buffer> => {
  // Generate a real 5-second video with color and sound
  const tempVideoPath = path.join(os.tmpdir(), `temp-video-${Date.now()}.mp4`);
  
  // Colors to cycle through
  const colors = ['blue', 'green', 'red', 'purple', 'orange'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  
  // Frequencies for different tones (musical notes)
  const frequencies = [440, 523, 587, 659, 698]; // A, C, D, E, F notes
  const frequency = frequencies[Math.floor(Math.random() * frequencies.length)];

  // Sanitize text to prevent FFmpeg filter syntax errors
  const sanitizeText = (text: string) => {
    return text
      .replace(/'/g, "\\'")  // Escape single quotes
      .replace(/:/g, '\\:')  // Escape colons
      .replace(/\\/g, '\\\\') // Escape backslashes
      .replace(/\[/g, '\\[')  // Escape brackets
      .replace(/\]/g, '\\]');
  };

  const safeTitle = sanitizeText(product.title || 'Product');
  const safePrice = sanitizeText(`$${product.price || '0'}`);

  return new Promise((resolve, reject) => {
    // Set timeout to prevent hanging
    const timeout = setTimeout(() => {
      reject(new Error('Video generation timed out after 15 seconds'));
    }, 15000);

    ffmpeg()
      // Generate video: colored background
      .input(`color=${color}:s=1280x720:d=5`)
      .inputFormat('lavfi')
      // Generate audio: sine wave tone
      .input(`sine=frequency=${frequency}:duration=5`)
      .inputFormat('lavfi')
      // Add text overlays using videoFilter
      .videoFilter([
        `drawtext=text='${safeTitle}':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-50:shadowcolor=black:shadowx=2:shadowy=2`,
        `drawtext=text='${safePrice}':fontsize=36:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2+50:shadowcolor=black:shadowx=2:shadowy=2`
      ])
      .outputOptions([
        '-c:v libx264',
        '-preset ultrafast',
        '-pix_fmt yuv420p',
        '-c:a aac',
        '-b:a 128k',
        '-shortest',
        '-map 0:v',  // Map video from first input
        '-map 1:a'   // Map audio from second input
      ])
      .duration(5)
      .output(tempVideoPath)
      .on('end', async () => {
        clearTimeout(timeout);
        try {
          // Read the generated video file
          const videoBuffer = await readFile(tempVideoPath);
          // Clean up temp file
          await unlink(tempVideoPath).catch(() => {});
          console.log(`✅ Video generated successfully: ${videoBuffer.length} bytes`);
          resolve(videoBuffer);
        } catch (error) {
          reject(error);
        }
      })
      .on('error', (err) => {
        clearTimeout(timeout);
        console.error('FFmpeg error:', err.message);
        // Clean up temp file on error
        unlink(tempVideoPath).catch(() => {});
        reject(err);
      })
      .run();
  });
};

export const uploadVideoToS3 = async (
  videoBuffer: Buffer,
  fileName: string
): Promise<string> => {
  try {
    const key = `videos/${Date.now()}-${fileName}`;
    
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: videoBuffer,
      ContentType: 'video/mp4'
      // ACL removed - bucket doesn't support ACLs (use bucket policy instead)
    });

    await s3Client.send(command);

    // Return the S3 URL
    const s3Url = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
    return s3Url;
  } catch (error) {
    console.error('S3 upload error:', error);
    
    // Fallback: Return a mock S3 URL if upload fails (for demo purposes)
    const mockS3Url = `https://${S3_BUCKET}.s3.amazonaws.com/videos/mock-${Date.now()}-${fileName}`;
    console.log(`⚠️  S3 upload failed (using mock URL): ${mockS3Url}`);
    return mockS3Url;
  }
};

export const generateAndUploadVideo = async (product: any): Promise<string> => {
  // Generate mock video
  const videoBuffer = await generateMockVideo(product);
  
  // Upload to S3
  const fileName = `${product.sku}-${product.id}.mp4`;
  const s3Url = await uploadVideoToS3(videoBuffer, fileName);
  
  return s3Url;
};

export const uploadImageToS3 = async (
  imageBuffer: Buffer,
  fileName: string,
  contentType: string = 'image/png'
): Promise<string> => {
  try {
    const key = `images/${Date.now()}-${fileName}`;
    
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: imageBuffer,
      ContentType: contentType
    });

    await s3Client.send(command);

    // Return the S3 URL
    const s3Url = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
    console.log(`✅ Image uploaded to S3: ${s3Url}`);
    return s3Url;
  } catch (error) {
    console.error('S3 image upload error:', error);
    
    // Fallback: Return a mock S3 URL if upload fails (for demo purposes)
    const mockS3Url = `https://${S3_BUCKET}.s3.amazonaws.com/images/mock-${Date.now()}-${fileName}`;
    console.log(`⚠️  S3 upload failed (using mock URL): ${mockS3Url}`);
    return mockS3Url;
  }
};

export const deleteFromS3 = async (s3Url: string): Promise<boolean> => {
  try {
    // Extract the key from the S3 URL
    // URL format: https://{bucket}.s3.{region}.amazonaws.com/{key}
    const url = new URL(s3Url);
    const key = url.pathname.substring(1); // Remove leading slash
    
    if (!key) {
      console.log('⚠️  Invalid S3 URL, no key found');
      return false;
    }

    // Skip deletion if it's a mock URL
    if (key.includes('mock-')) {
      console.log('⚠️  Skipping deletion of mock S3 URL');
      return true;
    }

    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: key
    });

    await s3Client.send(command);
    console.log(`✅ Deleted from S3: ${key}`);
    return true;
  } catch (error) {
    console.error('S3 delete error:', error);
    return false;
  }
};

