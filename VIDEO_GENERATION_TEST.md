# Video Generation Testing Guide

## ✅ What's Been Implemented

When you click **"Generate Video"** in the Products tab:

1. 🎬 **Mock Video Creation** - Generates a valid 100KB MP4 file
2. ☁️  **S3 Upload** - Uploads video to AWS S3 bucket
3. 🔗 **URL Generation** - Returns public S3 URL
4. 💾 **Database Save** - Stores video URL with the post

## 🧪 How to Test

### Step 1: Open the App

```
http://localhost:5173
```

### Step 2: Login/Register

- Email: `test@example.com`
- Password: `password123`
- Name: `Test User`

### Step 3: Connect to Catalog

1. Click "Connect to Shopify"
2. Enter any Catalog ID (e.g., `shop_12345`)
3. Products will be synced (mocked data)

### Step 4: Go to Products Tab

You'll see all your synced products with images

### Step 5: Generate Video

1. Find any product
2. Click **"Generate Video"** button
3. Wait ~3 seconds (simulated processing)
4. Video will be generated!

### Step 6: View Generated Videos

1. Go to **"Posts"** tab
2. You'll see the generated video post
3. The media URL will be an S3 URL: 
   ```
   https://socialcommerce-videos.s3.us-east-1.amazonaws.com/videos/...
   ```

## 🔄 What Happens Behind the Scenes

```
User clicks "Generate Video"
        ↓
Backend generates mock MP4 file (100KB)
        ↓
Uploads to AWS S3 bucket
        ↓
Returns S3 URL: https://bucket.s3.region.amazonaws.com/videos/file.mp4
        ↓
Saves to database with post content
        ↓
Frontend displays in Posts tab
```

## 🧪 Current Mode: MOCK

Right now, the app is in **mock mode** because AWS credentials aren't configured:

- ✅ **Generates** mock video files
- ✅ **Returns** realistic S3 URLs
- ⚠️  **Doesn't actually upload** to S3 (mock URLs)

The URLs look real but won't work if you try to access them directly.

## 🔧 AWS Configuration (Optional)

To actually upload videos to S3, configure AWS credentials in `backend/.env`:

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_actual_key
AWS_SECRET_ACCESS_KEY=your_actual_secret
AWS_S3_BUCKET=socialcommerce-videos
```

See `AWS_S3_SETUP.md` for detailed instructions.

## 📸 Generate Post vs Generate Video

### Generate Post
- Creates text content + uses product image
- Media URL = product image URL
- Instant generation

### Generate Video 🆕
- Creates text content + mock video
- Media URL = S3 video URL
- ~3 second generation time
- Uploads to S3

## 🎯 Expected Results

After clicking "Generate Video":

1. **Status Message**: "Video generated successfully!"
2. **Posts Tab**: New video post appears
3. **Media URL**: S3-style URL
4. **Content**: Custom video description with product details
5. **Type**: "Video Post" badge

## 🐛 Troubleshooting

### "Failed to generate content"

Check backend console:
```bash
tail -f /tmp/backend.log
```

Look for:
- `🎥 Generating mock video for: [product name]`
- S3 upload logs

### Backend not running

```bash
cd ~/Desktop/china/backend
npm run dev
```

### Frontend not running

```bash
cd ~/Desktop/china/frontend  
npm run dev
```

### Products not showing

1. Make sure you connected to catalog
2. Check backend console for sync logs
3. Refresh the page

## 📋 Testing Checklist

- [ ] Backend running on port 3001
- [ ] Frontend running on port 5173
- [ ] Can login/register
- [ ] Can connect to catalog
- [ ] Can see products
- [ ] Can click "Generate Video"
- [ ] See loading state (~3 seconds)
- [ ] Video post appears in Posts tab
- [ ] S3 URL is displayed
- [ ] Can generate multiple videos

## 🎬 Video Format

The generated mock videos are valid MP4 files with:
- Valid MP4 header (ftyp box)
- Size: ~100KB
- Format: video/mp4
- Filename: `{sku}-{productId}.mp4`

In production, replace `generateMockVideo()` with a real AI video service like:
- OpenAI Sora
- Runway ML
- Custom video editor

## 🚀 Next Steps

1. ✅ Test video generation in mock mode
2. 📝 Set up AWS account (optional)
3. 🔑 Add AWS credentials to `.env`
4. ☁️  Videos will upload to real S3
5. 🎥 Replace mock generation with real AI service

---

**Everything is ready to test!** 🎉

Just click "Generate Video" and watch the magic happen! ✨

