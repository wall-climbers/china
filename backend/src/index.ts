import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import dotenv from 'dotenv';
import { initDatabase } from './database';
import authRoutes from './routes/auth';
import catalogRoutes from './routes/catalog';
import productsRoutes from './routes/products';
import aiRoutes from './routes/ai';
import socialRoutes from './routes/social';
import checkoutRoutes from './routes/checkout';
import ugcRoutes from './routes/ugc';
import './config/passport';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database (with error handling)
initDatabase().catch(err => {
  console.warn('⚠️  Database initialization failed (will use fallback mode):', err.message);
});

// Use in-memory session store (PostgreSQL is not available)
console.log('ℹ️  Using in-memory session store (sessions will not persist across restarts)');
const sessionStore = new session.MemoryStore();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  name: 'sessionId',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/auth', authRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/ugc', ugcRoutes);
app.use('/checkout', checkoutRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
