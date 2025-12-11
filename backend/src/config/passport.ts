import passport from 'passport';
import prisma from '../lib/prisma';

// In-memory user cache for session deserialization
const userSessionCache = new Map();

passport.serializeUser((user: any, done) => {
  // Cache the user in memory for deserialization
  userSessionCache.set(user.id, user);
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    // Try to get from cache first
    if (userSessionCache.has(id)) {
      return done(null, userSessionCache.get(id));
    }
    
    // Try database
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        profilePicture: true,
        catalogConnected: true,
        catalogId: true
      }
    });
    
    if (user) {
      userSessionCache.set(id, user);
      done(null, user);
    } else {
      done(null, null);
    }
  } catch (error: any) {
    // If database error, try cache
    if (error.code === 'P1001' || error.code === 'P2021') {
      console.log('⚠️  Database unavailable, using cached session');
      const cachedUser = userSessionCache.get(id);
      done(null, cachedUser || null);
    } else {
      done(error, null);
    }
  }
});

export default passport;
