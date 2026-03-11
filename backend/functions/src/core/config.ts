/**
 * Environment-aware configuration loader.
 * Mirrors cloud-functions/Functions/functions/src/core/app-config.js pattern.
 */

export interface AppConfig {
  projectId: string;
  apiBaseUrl: string;
  postgres: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  geminiApiKey: string;
}

function getProjectId(): string {
  const firebaseConfig = process.env.FIREBASE_CONFIG;
  if (firebaseConfig) {
    try {
      return JSON.parse(firebaseConfig).projectId;
    } catch {
      // fall through
    }
  }
  return process.env.GCLOUD_PROJECT || 'blanket-alpha';
}

function getApiBaseUrl(projectId: string): string {
  return (
    process.env.API_BASE_URL ||
    `https://us-central1-${projectId}.cloudfunctions.net/api`
  );
}

export function loadConfig(): AppConfig {
  const projectId = getProjectId();

  return {
    projectId,
    apiBaseUrl: getApiBaseUrl(projectId),
    postgres: {
      host: process.env.POSTGRES_HOST || '',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      user: process.env.POSTGRES_USER || '',
      password: process.env.POSTGRES_PASSWORD || '',
      database: process.env.POSTGRES_DB || 'postgres',
    },
    geminiApiKey: process.env.GEMINI_API_KEY || '',
  };
}

export const appConfig = loadConfig();
