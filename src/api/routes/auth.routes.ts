// src/api/routes/auth.routes.ts

import { Router } from 'express';
import passport from 'passport';
import { generateToken } from '../../utils/jwt';
import { IUser } from '../models/user.model';
import config from '../../config/index'; // We will ONLY use this for configuration

const router = Router();

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
    // This now correctly uses your main config file
    failureRedirect: `${config.clientURL}/login?error=true`,
    session: false,
  }),
  (req, res) => {
    const user = req.user as IUser;
    const token = generateToken(user);
    
    const name = encodeURIComponent(user.displayName);
    const email = encodeURIComponent(user.email);
    
    // This also correctly uses your main config file
    res.redirect(`${config.clientURL}/dashboard?token=${token}&name=${name}&email=${email}`);
  }
);

export default router;
