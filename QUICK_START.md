# Quick Start Guide 🚀

## Your App is Ready!

Both servers are currently running:
- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3001

## What Changed

✅ **Replaced Facebook OAuth** with email/password authentication
✅ **Added user registration** - anyone can sign up
✅ **Simplified setup** - no external services needed
✅ **Auto-generated avatars** for new users

## Try It Now!

### 1. Create Your Account (30 seconds)

1. Open http://localhost:5173 in your browser
2. Click the **"Sign Up"** tab
3. Fill in:
   - **Name**: Your Name
   - **Email**: test@example.com
   - **Password**: password123
4. Click **"Sign Up"**

You'll be automatically logged in!

### 2. Connect a Catalog (1 click)

1. Choose a catalog provider (Shopify, WooCommerce, or BigCommerce)
2. Click to connect (it's mocked, so instant!)

### 3. Sync Products (1 click)

1. Click **"Sync Products"**
2. Watch 5 sample products appear!

### 4. Generate AI Content (1 click per product)

1. Go to **Products** page
2. Click **"Generate Post"** or **"Generate Video"** on any product
3. AI creates engaging social media content

### 5. Share & Create Checkout (2 clicks)

1. Go to **Posts** page
2. Click **"Share to Facebook"** or **"Share to Instagram"**
3. Click **"Generate Checkout URL"**
4. Copy the URL to share with customers!

## Test the Checkout Flow

1. Copy any checkout URL from the Posts page
2. Open it in a new tab
3. Fill in customer information
4. Complete the "purchase" (it's mocked!)

## Features Included

✅ User registration & login
✅ Catalog management (3 mock providers)
✅ Product sync (5 sample products)
✅ AI post generation (text posts)
✅ AI video generation (video content)
✅ Facebook sharing (mocked)
✅ Instagram sharing (mocked)
✅ Checkout page generation
✅ Beautiful, responsive UI

## Authentication Details

### Database Schema
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,  -- bcrypt hashed
  name TEXT,
  profile_picture TEXT,    -- auto-generated avatar
  catalog_connected INTEGER DEFAULT 0,
  catalog_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### API Endpoints

**Register**: `POST /auth/register`
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword"
}
```

**Login**: `POST /auth/login`
```json
{
  "email": "john@example.com",
  "password": "securepassword"
}
```

**Get Current User**: `GET /auth/me`

**Logout**: `POST /auth/logout`

## Tech Stack

### Backend
- Express.js with TypeScript
- SQLite database
- Passport.js for sessions
- bcrypt for password hashing

### Frontend
- React 18 with TypeScript
- Tailwind CSS
- React Router
- Axios for API calls

## What's Mocked

These features are mocked and ready to be replaced with real services:

1. **Catalog Providers** - Connect to real Shopify, WooCommerce, BigCommerce APIs
2. **AI Generation** - Integrate OpenAI, Claude, or other AI services
3. **Social Sharing** - Use Facebook Graph API
4. **Payment Processing** - Add Stripe, PayPal, etc.

## Need Help?

Check these files:
- `README.md` - Full documentation
- `SETUP.md` - Detailed setup instructions
- `backend/src/routes/auth.ts` - Authentication logic
- `frontend/src/pages/HomePage.tsx` - Login/signup UI

## Stopping the Servers

```bash
# Press Ctrl+C in the terminal where you ran `npm run dev`
# Or kill the processes:
pkill -f "tsx watch"
pkill -f "vite"
```

## Restarting Later

```bash
cd /Users/davideom/Desktop/china
npm run dev
```

Enjoy your social commerce platform! 🎉

