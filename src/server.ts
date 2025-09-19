// src/server.ts
import express from 'express';
import cors from 'cors';
import passport from 'passport';

import config from './config/index';
import connectDB from './config/db';
import { configurePassport } from './config/passport';
import authRoutes from './api/routes/auth.routes';
import emailRoutes from './api/routes/email.routes';

connectDB();
configurePassport();

const app = express();
const PORT = config.port;

app.use(cors());
app.use(express.json());

app.use(passport.initialize());

app.use('/api/auth', authRoutes);
app.use('/api/emails', emailRoutes); 

app.get('/', (req, res) => {
  res.status(200).json({ message: 'Welcome to the AI Email Workflow API!' });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});