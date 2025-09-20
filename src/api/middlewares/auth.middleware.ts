import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model';
import config from '../../config/index';

interface JwtPayload {
  id: string;
}

export const protect = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer')) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const token = req.headers.authorization.split(' ')[1];
    
    // 2. Use the 'tokenSecret' constant. TypeScript now knows for a fact
    //    that this is a string because of the check above. This resolves the error.
    
    if (!config.jwtSecret) {
      throw new Error('JWT Secret is not defined.');
    }
    const decoded = jwt.verify(token, config.jwtSecret as string);

    if (typeof decoded !== 'object' || decoded === null || !('id' in decoded)) {
      return res.status(401).json({ message: 'Not authorized, token payload is invalid' });
    }
    
    const typedDecoded = decoded as JwtPayload;
    
    const user = await User.findById(typedDecoded.id); 

    if (!user) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    (req as any).user = user;
    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};
