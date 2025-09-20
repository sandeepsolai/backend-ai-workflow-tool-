// src/api/routes/auth.routes.ts
import { Router } from 'express';
import passport from 'passport';
import { generateToken } from '../../utils/jwt';
import { IUser } from '../models/user.model';

const router = Router();
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
router.get(
  '/google',
  passport.authenticate('google', { 
    scope: [
        'profile', 
        'email', 
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/calendar'
    ],
    accessType: 'offline',
    prompt: 'consent',
  })
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: 'http://localhost:5173/login?error=true',
    session: false,
  }),
  (req, res) => {
    const user = req.user as IUser;
    const token = generateToken(user);
    
    // THE ONLY CHANGE IS HERE: We now send the name and email in the URL
    // We use encodeURIComponent to safely handle special characters
    const name = encodeURIComponent(user.displayName);
    const email = encodeURIComponent(user.email);
    
    res.redirect(`http://localhost:5173/dashboard?token=${token}&name=${name}&email=${email}`);
  }
);

export default router;
