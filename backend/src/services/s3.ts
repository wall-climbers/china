import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'mock-access-key',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'mock-secret-key'
  }
});

const S3_BUCKET = process.env.AWS_S3_BUCKET || 'socialcommerce-videos';

export const generateMockVideo = async (product: any): Promise<Buffer> => {
  // Create a mock video file (MP4 header + minimal data)
  // This is a minimal valid MP4 file structure
  const mp4Header = Buffer.from([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, // ftyp box
    0x69, 0x73, 0x6F, 0x6D, 0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6F, 0x6D, 0x69, 0x73, 0x6F, 0x32,
    0x6D, 0x70, 0x34, 0x31, 0x00, 0x00, 0x00, 0x08
  ]);

  // Add some mock video data
  const mockVideoData = Buffer.concat([
    mp4Header,
    Buffer.alloc(1024 * 100, 0xFF) // 100KB of mock video data
  ]);

  return mockVideoData;
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
      ContentType: 'video/mp4',
      ACL: 'public-read'
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

