import express from 'express';
import bcrypt from 'bcrypt';
import prisma from '../lib/prisma';

const router = express.Router();

// In-memory user store (fallback when database is unavailable)
const inMemoryUsers = new Map();

// Helper to handle database errors gracefully
async function safePrismaQuery<T>(query: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await query();
  } catch (error: any) {
    if (error.code === 'P1001') {
      console.warn('⚠️  Database unavailable, using in-memory fallback');
      return fallback;
    }
    throw error;
  }
}

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // Check if user already exists (with fallback)
    let existingUser = null;
    try {
      existingUser = await prisma.user.findUnique({ where: { email } });
    } catch (dbError: any) {
      if (dbError.code === 'P1001' || dbError.code === 'P2021') {
        // Database unavailable or tables don't exist, check in-memory
        console.log(`⚠️  Database issue (${dbError.code}), using in-memory storage`);
        existingUser = inMemoryUsers.get(email);
      } else {
        throw dbError;
      }
    }

    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const profilePicture = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;

    let newUser;
    try {
      newUser = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          profilePicture
        },
        select: {
          id: true,
          email: true,
          name: true,
          profilePicture: true,
          catalogConnected: true
        }
      });
    } catch (dbError: any) {
      if (dbError.code === 'P1001' || dbError.code === 'P2021') {
        // Database unavailable or tables don't exist, use in-memory
        console.log(`⚠️  Database issue (${dbError.code}), creating user in memory`);
        newUser = {
          id: `user_${Date.now()}`,
          email,
          password: hashedPassword,
          name,
          profilePicture,
          catalogConnected: false
        };
        inMemoryUsers.set(email, newUser);
      } else {
        throw dbError;
      }
    }

    // Set session
    req.login(newUser, (err) => {
      if (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Failed to log in after registration' });
      }
      res.json({ message: 'Registration successful', user: newUser });
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user (with fallback)
    let user = null;
    try {
      user = await prisma.user.findUnique({ where: { email } });
    } catch (dbError: any) {
      if (dbError.code === 'P1001' || dbError.code === 'P2021') {
        // Database unavailable or tables don't exist, check in-memory
        console.log(`⚠️  Database issue (${dbError.code}), checking in-memory users`);
        user = inMemoryUsers.get(email);
      } else {
        throw dbError;
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Remove password from user object
    const { password: _, ...userWithoutPassword } = user;

    // Set session
    req.login(userWithoutPassword, (err) => {
      if (err) {
        console.error('Login session error:', err);
        return res.status(500).json({ error: 'Login failed' });
      }
      res.json({ message: 'Login successful', user: userWithoutPassword });
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ user: req.user });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

export default router;
