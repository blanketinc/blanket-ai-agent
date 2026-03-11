/**
 * Blanket AI Agent - Cloud Functions Entry Point
 */

import * as dotenv from 'dotenv';
dotenv.config();

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import chatRouter from './routes/ai-assistant/chat';

// Initialize Firebase Admin (must happen before any Firebase services are used)
// In Cloud Functions, FIREBASE_CONFIG is set automatically.
// Locally, we use GCLOUD_PROJECT from .env to point at the correct project.
if (!admin.apps.length) {
  const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'blanket-staging';
  admin.initializeApp({ projectId });
  console.log(`Firebase Admin initialized for project: ${projectId}`);
}

const app = express();

// CORS configuration - restrict origins in production
const allowedOrigins = [
  'https://ai.blanket.app',
  'https://blanket-ai-agent.vercel.app',
  ...(process.env.NODE_ENV === 'development'
    ? ['http://localhost:3000', 'http://localhost:5001']
    : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);
app.use(compression());
app.use(express.json());

// Health check
app.get('/v2/ai-assistant/health', (_req, res) => {
  res.json({ status: 'ok', service: 'blanket-ai-agent' });
});

// AI Assistant routes
app.use('/v2/ai-assistant', chatRouter);

// Cloud Function export
export const api = functions.https.onRequest(app);

// Local dev server
if (process.env.NODE_ENV === 'development') {
  const port = process.env.PORT || 5001;
  app.listen(port, () => {
    console.log(`Blanket AI Agent running on port ${port}`);
    console.log(`  Health:  http://localhost:${port}/v2/ai-assistant/health`);
    console.log(`  Chat:    POST http://localhost:${port}/v2/ai-assistant/chat`);
    console.log(`  History: GET  http://localhost:${port}/v2/ai-assistant/history`);
  });
}
