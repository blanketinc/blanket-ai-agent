/**
 * Blanket AI Agent - Cloud Functions Entry Point
 */

import * as functions from 'firebase-functions';
import express from 'express';
import cors from 'cors';
import compression from 'compression';

const app = express();

app.use(cors({ origin: true }));
app.use(compression());
app.use(express.json());

// Health check
app.get('/v2/ai-assistant/health', (_req, res) => {
  res.json({ status: 'ok', service: 'blanket-ai-agent' });
});

// Cloud Function export
export const api = functions.https.onRequest(app);

// Local dev server
if (process.env.NODE_ENV === 'development') {
  const port = process.env.PORT || 5001;
  app.listen(port, () => {
    console.log(`Blanket AI Agent running on port ${port}`);
  });
}
