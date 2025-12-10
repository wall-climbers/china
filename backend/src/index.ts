import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import dotenv from 'dotenv';
import path from 'path';
import Database from 'better-sqlite3';
import SqliteStore from 'better-sqlite3-session-store';
import { initDatabase } from './database';
import authRoutes from './routes/auth';
import catalogRoutes from './routes/catalog';
import productsRoutes from './routes/products';
import aiRoutes from './routes/ai';
import socialRoutes from './routes/social';
import checkoutRoutes from './routes/checkout';
import './config/passport';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database
initDatabase();

// Session store
const SessionStore = SqliteStore(session);
const sessionDb = new Database(path.join(__dirname, '../data/sessions.sqlite'));
const sessionStore = new SessionStore({
  client: sessionDb,
  expired: {
    clear: true,
    intervalMs: 900000 // 15 minutes
  }
});

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
app.use('/checkout', checkoutRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

