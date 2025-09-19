// src/types/express/index.d.ts
import { IUser } from '../../api/models/user.model';

declare global {
  namespace Express {
    export interface User extends IUser {}
    export interface Request {
      user?: User;
    }
  }
}