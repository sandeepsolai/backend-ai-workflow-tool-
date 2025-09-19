
import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  googleId: string;
  email: string;
  displayName: string;
  accessToken: string;
  refreshToken?: string;
}

const UserSchema: Schema = new Schema({
  googleId: { type: String, required: true, unique: true }, // This is the only unique field
  email: { type: String, required: true },
  displayName: { type: String, required: true },
  accessToken: { type: String, required: true },
  refreshToken: { type: String },
}, { timestamps: true });

// We use a named export for maximum stability
export const User = mongoose.model<IUser>('User', UserSchema);
