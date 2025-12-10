import passport from 'passport';
import db from '../database';

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser((id: string, done) => {
  try {
    const user: any = db.prepare('SELECT id, email, name, profile_picture, catalog_connected, catalog_id FROM users WHERE id = ?').get(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

export default passport;
