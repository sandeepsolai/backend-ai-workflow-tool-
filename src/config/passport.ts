
import passport from 'passport';
import { Strategy as GoogleStrategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import { User } from '../api/models/user.model';
import config from './index';

export const configurePassport = () => {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientId,
        clientSecret: config.google.clientSecret,
        callbackURL: 'https://backend-ai-workflow-tool.onrender.com/api/auth/google/callback',
      },
      async (accessToken: string, refreshToken: string | undefined, profile: Profile, done: VerifyCallback) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error("No email found in Google profile."), false);
          }

          // The simple, correct logic: Find the user ONLY by their unique Google ID.
          let user = await User.findOne({ googleId: profile.id });

          if (user) {
            // If user exists, just update their tokens and display name
            user.accessToken = accessToken;
            user.displayName = profile.displayName;
            if (refreshToken) user.refreshToken = refreshToken;
            await user.save();
            return done(null, user);
          }

          // If user does not exist, create a brand new one.
          const newUser = await User.create({
            googleId: profile.id,
            displayName: profile.displayName,
            email: email,
            accessToken,
            refreshToken,
          });
          return done(null, newUser);
          
        } catch (error: any) {
          console.error("CRITICAL ERROR in Passport strategy:", error);
          return done(error, false);
        }
      }
    )
  );

  passport.serializeUser((user: any, done) => { done(null, user.id); });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) { 
      done(error, null); 
    }
  });
};
