# AWS S3 Setup for Video Uploads

## What's Been Implemented

✅ Mock video generation (creates valid MP4 files)
✅ AWS S3 upload integration
✅ Automatic S3 URL generation
✅ Fallback to mock URLs if AWS not configured

## How It Works

When you click "Generate Video":
1. Creates a mock MP4 video file (100KB)
2. Uploads to AWS S3 bucket
3. Returns public S3 URL
4. Saves URL in database with the post

## AWS S3 Setup (Optional)

The app will work without AWS credentials (uses mock URLs), but to actually upload videos:

### Step 1: Create AWS Account

1. Go to https://aws.amazon.com/
2. Click "Create an AWS Account"
3. Follow the signup process (free tier available)

### Step 2: Create S3 Bucket

1. Go to AWS Console → S3
2. Click "Create bucket"
3. Bucket name: `socialcommerce-videos` (must be globally unique)
4. Region: `us-east-1` (or your preferred region)
5. **Uncheck** "Block all public access" (for public video URLs)
6. Click "Create bucket"

### Step 3: Get AWS Credentials

1. Go to AWS Console → IAM
2. Click "Users" → "Create user"
3. Username: `socialcommerce-app`
4. Click "Next"
5. Attach policies: `AmazonS3FullAccess`
6. Click "Create user"
7. Click on the user → "Security credentials"
8. Click "Create access key"
9. Choose "Application running outside AWS"
10. Copy the **Access Key ID** and **Secret Access Key**

### Step 4: Configure Backend

Update `backend/.env`:

```env
# AWS S3 Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...your_actual_key
AWS_SECRET_ACCESS_KEY=your_actual_secret_key
AWS_S3_BUCKET=socialcommerce-videos
```

### Step 5: Restart Backend

```bash
cd backend
npm run dev
```

## Testing

1. Go to Products page
2. Click "Generate Video" on any product
3. Wait ~3 seconds
4. Video will be uploaded to S3
5. URL will be saved in database
6. Go to Posts page to see the video URL

## Mock Mode (Default)

If AWS credentials are not configured:
- ✅ Still works!
- ✅ Generates mock video files
- ✅ Returns mock S3 URLs
- ⚠️  Videos not actually uploaded (but URLs look real)

Perfect for development without AWS account!

## Production Setup

### Security Best Practices

1. **Use IAM roles** instead of access keys (if deploying to AWS)
2. **Limit bucket permissions** to specific IPs/services
3. **Enable CloudFront** for CDN delivery
4. **Set CORS policy** on bucket

### Example Bucket Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::socialcommerce-videos/*"
    }
  ]
}
```

### CORS Configuration

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": []
  }
]
```

## Video Generation

### Current Implementation (Mock)

- Creates 100KB MP4 file with valid header
- Simulates video processing delay (3 seconds)
- Generates unique filename: `{SKU}-{productId}.mp4`

### Future Enhancement

Replace `generateMockVideo()` with:
- OpenAI Sora API
- Runway ML API
- Custom video generation service
- FFmpeg video editing

## Cost Estimates

### AWS S3 Free Tier
- 5 GB storage
- 20,000 GET requests
- 2,000 PUT requests

### After Free Tier
- Storage: ~$0.023/GB/month
- PUT: ~$0.005 per 1,000 requests
- GET: ~$0.0004 per 1,000 requests

**Example:** 1000 videos (100KB each) = ~$0.12/month

## Troubleshooting

### "Access Denied"
- Check AWS credentials in .env
- Verify IAM user has S3 permissions
- Check bucket policy allows public read

### "Bucket does not exist"
- Create bucket in AWS Console
- Update AWS_S3_BUCKET in .env
- Ensure region matches

### Videos not accessible
- Check bucket public access settings
- Verify bucket policy
- Test URL in browser

## Alternative Storage

Instead of S3, you can use:
- **Cloudflare R2** (S3-compatible, cheaper)
- **DigitalOcean Spaces** (S3-compatible)
- **Google Cloud Storage**
- **Azure Blob Storage**

Just update the S3 client configuration!

## File Structure

```
backend/
└── src/
    └── services/
        └── s3.ts          # S3 upload logic
```

## Code Flow

1. User clicks "Generate Video"
2. Backend calls `mockAIService()` with type='video'
3. `generateAndUploadVideo()` is called:
   - Creates mock MP4 file
   - Uploads to S3
   - Returns S3 URL
4. URL saved to database
5. Frontend displays video URL

## Testing Without AWS

The app works perfectly without AWS credentials!
- Mock URLs are generated
- Everything functions normally
- Ready to plug in real AWS when needed

---

**Your video generation is now ready!** 🎥✨

