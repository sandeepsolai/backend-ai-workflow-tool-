
import mongoose, { Document, Schema } from 'mongoose';

export interface IEmail extends Document {
  userId: mongoose.Schema.Types.ObjectId;
  gmailMessageId: string;
  from: string;
  subject: string;
  snippet: string;
  body: string;
  receivedAt: Date;
  aiPriority: string;
  aiSummary: string;
  aiSuggestion: string;
  isMeetingRequest: boolean;
  aiProposedDate: { type: String, default: null },
  aiProposedTime: { type: String, default: null },

  threadId: string; 
  messageIdHeader: string; 
  referencesHeader?: string; 
}

const EmailSchema: Schema = new Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  gmailMessageId: { type: String, required: true },
  from: { type: String, required: true },
  subject: { type: String, required: true },
  snippet: { type: String },
  body: { type: String },
  receivedAt: { type: Date, required: true },
  aiPriority: { type: String, enum: ['urgent', 'neutral', 'spam', 'error'], default: 'neutral' },
  aiSummary: { type: String },
  aiSuggestion: { type: String },
  isMeetingRequest: { type: Boolean, default: false },
  threadId: { type: String, required: true }, 
  messageIdHeader: { type: String, required: true }, 
  referencesHeader: { type: String },
}, { timestamps: true });

EmailSchema.index({ userId: 1, gmailMessageId: 1 }, { unique: true });

export default mongoose.model<IEmail>('Email', EmailSchema);