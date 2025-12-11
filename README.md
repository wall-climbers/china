# Social Commerce Platform

A comprehensive web application that enables businesses to sell products on social media platforms with AI-generated content.

## Features

### 1. Email/Password Authentication
- Users can register and login with email and password
- Secure password hashing with bcrypt
- Session management with passport.js
- User profile with auto-generated avatars

### 2. Catalog Manager Integration
- Connect to third-party catalog management platforms (mocked)
- Supports multiple providers: Shopify, WooCommerce, BigCommerce
- One-click catalog connection

### 3. Product Synchronization
- Automatic product sync from catalog manager
- Includes: product images, prices, SKUs, titles, descriptions
- Real-time inventory updates

### 4. AI-Generated Content
- Generate engaging social media posts with AI
- Create video content for products
- Customized content based on product details
- Mock AI service integration (easily replaceable with real AI APIs)

### 5. Social Media Sharing
- Share posts directly to Facebook
- Share posts directly to Instagram
- Track post engagement and status
- Integration with Facebook Graph API

### 6. Checkout Pages
- Generate unique checkout URLs for each product
- Beautiful, responsive checkout interface
- Customer information collection
- Mock payment processing (ready for real payment gateway integration)

## Tech Stack

### Backend
- **Node.js** with Express
- **TypeScript** for type safety
- **PostgreSQL** for database
- **Prisma ORM** for type-safe database access
- **Passport.js** for authentication
- **Axios** for HTTP requests

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development
- **Tailwind CSS** for styling
- **React Router** for navigation
- **Lucide React** for icons

## Project Structure

```
china/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Main server file
│   │   ├── database.ts           # Database setup
│   │   ├── config/
│   │   │   └── passport.ts       # Passport configuration
│   │   ├── middleware/
│   │   │   └── auth.ts           # Authentication middleware
│   │   └── routes/
│   │       ├── auth.ts           # Authentication routes
│   │       ├── catalog.ts        # Catalog management
│   │       ├── products.ts       # Product management
│   │       ├── ai.ts             # AI content generation
│   │       ├── social.ts         # Social media sharing
│   │       └── checkout.ts       # Checkout functionality
│   ├── data/                     # SQLite database
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # Main app component
│   │   ├── main.tsx              # Entry point
│   │   ├── context/
│   │   │   └── AuthContext.tsx   # Authentication context
│   │   ├── components/
│   │   │   ├── Navbar.tsx        # Navigation bar
│   │   │   └── PrivateRoute.tsx  # Protected route wrapper
│   │   └── pages/
│   │       ├── HomePage.tsx      # Landing page
│   │       ├── DashboardPage.tsx # Main dashboard
│   │       ├── ProductsPage.tsx  # Products management
│   │       ├── GeneratedPostsPage.tsx  # AI posts
│   │       └── CheckoutPage.tsx  # Checkout interface
│   ├── package.json
│   └── vite.config.ts
└── package.json
```

## Installation

### Prerequisites
- Node.js 18+ and npm
- Facebook Developer Account (for OAuth)

### Step 1: Clone and Install Dependencies

```bash
# Install all dependencies (root, backend, and frontend)
npm run install:all
```

### Step 3: Configure Environment Variables

Backend `.env` is already configured with default PostgreSQL settings.

If you need custom database credentials, edit `backend/.env`:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/socialcommerce"
```

### Step 4: Run the Application

From the root directory:

## Running the Application

### Development Mode

From the root directory:

```bash
# Run both frontend and backend concurrently
npm run dev
```

Or run them separately:

```bash
# Backend (Terminal 1)
cd backend
npm run dev

# Frontend (Terminal 2)
cd frontend
npm run dev
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## Usage Guide

### 1. Create an Account
- Visit http://localhost:5173
- Click "Sign Up" tab
- Enter your name, email, and password
- Click "Sign Up" button

### 1b. Login
- Visit http://localhost:5173
- Enter your email and password
- Click "Login" button

### 2. Connect Catalog
- After login, you'll be redirected to the dashboard
- Choose a catalog provider (Shopify, WooCommerce, or BigCommerce)
- Click to connect (mocked connection)

### 3. Sync Products
- Once connected, click "Sync Products"
- Mock products will be imported into your catalog
- View all products in the "Products" page

### 4. Generate AI Content
- Go to "Products" page
- Click "Generate Post" or "Generate Video" for any product
- AI will create engaging content (2-second mock delay)
- View generated content in the "Posts" page

### 5. Share to Social Media
- Go to "Posts" page
- Click "Share to Facebook" or "Share to Instagram"
- Posts will be marked as shared (mocked sharing)

### 6. Create Checkout Links
- In the "Posts" page, click "Generate Checkout URL"
- Copy the checkout URL
- Share this URL in your social posts
- Customers can purchase directly through this link

### 7. Checkout Flow
- Customers visit the checkout URL
- Fill in their information
- Complete mock payment
- Receive confirmation

## API Endpoints

### Authentication
- `POST /auth/register` - Register new user (email, password, name)
- `POST /auth/login` - Login user (email, password)
- `GET /auth/me` - Get current user
- `POST /auth/logout` - Logout

### Catalog
- `GET /api/catalog/providers` - Get available catalog providers
- `POST /api/catalog/connect` - Connect to a catalog
- `POST /api/catalog/sync` - Sync products from catalog
- `GET /api/catalog/status` - Get catalog connection status

### Products
- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get single product
- `DELETE /api/products/:id` - Delete product

### AI Content
- `POST /api/ai/generate` - Generate AI content
- `GET /api/ai/posts` - Get all generated posts
- `GET /api/ai/posts/:id` - Get single post
- `DELETE /api/ai/posts/:id` - Delete post

### Social Sharing
- `POST /api/social/share/facebook` - Share to Facebook
- `POST /api/social/share/instagram` - Share to Instagram

### Checkout
- `POST /checkout/create` - Create checkout session
- `GET /checkout/:sessionId` - Get checkout session
- `POST /checkout/:sessionId/complete` - Complete checkout

## Production Deployment

### Environment Variables
Set these environment variables in production:

```env
NODE_ENV=production
SESSION_SECRET=<secure_random_string>
FRONTEND_URL=<your_production_frontend_url>
PORT=3001
```

### Build

```bash
# Build backend
cd backend
npm run build

# Build frontend
cd ../frontend
npm run build
```

### Database
- For production, consider migrating from SQLite to PostgreSQL or MySQL
- Update database.ts to use production database

### AI Service Integration
Replace the mock AI service in `backend/src/routes/ai.ts` with:
- OpenAI API
- Anthropic Claude
- Custom AI model
- Any other AI content generation service

### Social Media Integration
Update the social sharing routes to use real Facebook Graph API:
- Replace mock API calls with actual Facebook Graph API calls
- Handle OAuth tokens properly
- Implement error handling and retry logic

### Payment Gateway
Replace the mock payment processing in `backend/src/routes/checkout.ts` with:
- Stripe
- PayPal
- Square
- Any other payment processor

## Security Considerations

1. **Environment Variables**: Never commit `.env` files
2. **Session Secret**: Use a strong, random session secret in production
3. **HTTPS**: Always use HTTPS in production
4. **CORS**: Configure CORS properly for production domains
5. **Rate Limiting**: Add rate limiting to API endpoints
6. **Input Validation**: Validate all user inputs
7. **SQL Injection**: Use parameterized queries (already implemented)

## Customization

### Styling
- Edit `frontend/src/index.css` for global styles
- Modify Tailwind configuration in `frontend/tailwind.config.js`
- Customize component styles in individual page files

### Database Schema
- Modify `backend/src/database.ts` to add/change tables
- Remember to handle migrations for existing data

### Add New Features
- Create new routes in `backend/src/routes/`
- Add corresponding pages in `frontend/src/pages/`
- Update navigation in `frontend/src/components/Navbar.tsx`

## Troubleshooting

### "Not authenticated" errors
- Ensure backend is running
- Check that cookies are enabled
- Verify CORS configuration

### Products not syncing
- Check catalog connection status
- Verify backend logs for errors
- Ensure database is writable

### Facebook login fails
- Verify Facebook App ID and Secret
- Check callback URL matches Facebook app settings
- Ensure app is not in development mode restrictions

### Checkout pages not loading
- Verify checkout session ID is correct
- Check backend logs
- Ensure database has checkout_sessions table

## License

MIT

## Support

For issues and questions, please open an issue on GitHub or contact the development team.

---

**Note**: This application uses mocked services for catalog management, AI generation, and social media posting. Replace these with real service integrations for production use.

