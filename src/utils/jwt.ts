// src/utils/jwt.ts
import jwt from 'jsonwebtoken';
import { IUser } from '../api/models/user.model';
import config from '../config/index';

export const generateToken = (user: IUser): string => {
  return jwt.sign({ id: user._id }, config.jwtSecret, {
    expiresIn: '30d',
  });
};