# Setup Instructions

Follow these simple steps to get the application running:

## 1. Install Dependencies

From the root directory:

```bash
npm run install:all
```

This will install dependencies for the root project, backend, and frontend.

## 2. Run the Application

From the root directory:

```bash
npm run dev
```

This will start both the backend (port 3001) and frontend (port 5173).

Alternatively, run them separately:

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

## 3. Access the Application

Open your browser and go to: http://localhost:5173

## 4. Create Your Account

1. Click the "Sign Up" tab
2. Enter your name, email, and password
3. Click "Sign Up"
4. You'll be automatically logged in and redirected to the dashboard

## That's It! 🎉

No configuration needed! The app works out of the box with:
- SQLite database (auto-created)
- Email/password authentication
- Mock catalog providers
- Mock AI content generation
- Mock social media sharing

## Troubleshooting

### Port Already in Use
If port 3001 or 5173 is already in use, you can change them:
- Backend: Edit `PORT` in `backend/.env`
- Frontend: Edit `server.port` in `frontend/vite.config.ts`

### Database Issues
If you encounter database errors:
```bash
rm backend/data/database.sqlite
```
The database will be recreated on next run.

### Module Not Found Errors
Make sure all dependencies are installed:
```bash
cd backend && npm install
cd ../frontend && npm install
```

## Next Steps

Once the app is running and you've created an account:
1. Connect a catalog (mock providers available)
2. Sync products from your catalog
3. Generate AI posts for products  
4. Share to social media (mocked)
5. Generate checkout URLs for products

## Optional Configuration

If you want to customize the application, create a `backend/.env` file:

```env
PORT=3001
NODE_ENV=development
SESSION_SECRET=your_custom_secret_here
FRONTEND_URL=http://localhost:5173
```

## Demo Credentials

Since everything is local, you can create any account you want!
There are no restrictions or external services required.

Enjoy building your social commerce platform! 🚀
