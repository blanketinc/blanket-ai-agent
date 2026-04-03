import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import express from 'express';
import cors from 'cors';
import chatRoutes from './routes/ai-assistant/chat';
import authRoutes from './routes/ai-assistant/auth';

// Initialize Firebase Admin
admin.initializeApp();

const app = express();

// Middleware
app.use(express.json());

// CORS configuration
const allowedOrigins = [
  'https://ai.blanket.app',
  'https://blanket-ai-agent.vercel.app',
  'http://localhost:3000',
  'http://localhost:5001',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      // Allow exact matches
      if (allowedOrigins.includes(origin)) return callback(null, true);

      // Allow all Vercel preview deployments
      if (origin.endsWith('.vercel.app')) return callback(null, true);

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'blanket-ai-agent',
  });
});

// Routes
app.use('/v2/ai-assistant/chat', chatRoutes);
app.use('/v2/ai-assistant/auth', authRoutes);

// Cloud Function export
export const aiAgent = functions
  .runWith({
    secrets: ['GEMINI_API_KEY', 'POSTGRES_PASSWORD', 'SENDGRID_API_KEY'],
    timeoutSeconds: 120,
    memory: '1GB',
  })
  .https.onRequest(app);
