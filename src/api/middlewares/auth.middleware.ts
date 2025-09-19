// src/api/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/user.model';
import config from '../../config/index';

// We no longer need to export IAuthRequest as it's causing conflicts

interface JwtPayload {
  id: string;
}

export const protect = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer')) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const token = req.headers.authorization.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret);

    if (typeof decoded !== 'object' || decoded === null || !('id' in decoded)) {
      return res.status(401).json({ message: 'Not authorized, token payload is invalid' });
    }
    
    const typedDecoded = decoded as JwtPayload;
    
    const user = await User.findById(typedDecoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    // This is the forceful override. We are attaching the user using 'any'.
    (req as any).user = user;

    next();
  } catch (error) {
    console.error(error);
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};