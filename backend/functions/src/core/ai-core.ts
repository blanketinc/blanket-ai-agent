/**
 * Google Generative AI client.
 * Mirrors cloud-functions core/ai-core.ts pattern.
 */

import { GoogleGenAI } from '@google/genai';
import { appConfig } from './config';

export const genAI = new GoogleGenAI({
  apiKey: appConfig.geminiApiKey,
});
