import express from 'express';
import bcrypt from 'bcrypt';
import db from '../database';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // Check if user already exists
    const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const userId = uuidv4();
    const profilePicture = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;

    db.prepare(`
      INSERT INTO users (id, email, password, name, profile_picture)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, email, hashedPassword, name, profilePicture);

    const newUser = db.prepare('SELECT id, email, name, profile_picture, catalog_connected FROM users WHERE id = ?').get(userId);

    // Set session
    req.login(newUser, (err) => {
      if (err) {
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

    // Find user
    const user: any = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
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
