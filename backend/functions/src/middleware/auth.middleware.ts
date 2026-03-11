/**
 * Auth Middleware for AI Assistant
 *
 * Mirrors cloud-functions authentication/auth.middleware.ts pattern.
 * Verifies Firebase ID token, then looks up user context from PostgreSQL
 * (organizationId from `users` table, locationIds from `user_locations` table).
 *
 * Sets req.auth with:
 *  - authInfo: Firebase DecodedIdToken (uid, email, phone, custom claims)
 *  - authId: User's database authId or Firebase UID
 *  - orgId: User's organization ID (from PostgreSQL users table)
 *  - locationIds: User's accessible locations (from PostgreSQL user_locations table)
 *  - token: Raw Bearer token for proxying to Blanket APIs
 */

import * as admin from 'firebase-admin';
import { Request, Response, NextFunction } from 'express';
import { pool } from '../core/database';

// Extend Express Request to include auth context
declare global {
  namespace Express {
    interface Request {
      auth?: {
        authInfo: admin.auth.DecodedIdToken;
        authId: string;
        orgId: string;
        locationIds: string[];
        token: string;
      };
    }
  }
}

/**
 * Look up the user's organizationId and locationIds from PostgreSQL.
 * Mirrors how cloud-functions resolves user context via UserFactory.getRepo().
 *
 * Returns { orgId, locationIds } or defaults if DB is unavailable.
 */
async function getUserContext(
  authId: string
): Promise<{ orgId: string; locationIds: string[] }> {
  try {
    // Look up user's organizationId from the users table
    const userResult = await pool.query(
      'SELECT "organizationId" FROM users WHERE "authId" = $1 LIMIT 1',
      [authId]
    );

    const orgId = userResult.rows[0]?.organizationId || '';

    if (!orgId) {
      console.warn(`No organization found for authId: ${authId}`);
      return { orgId: '', locationIds: [] };
    }

    // Look up user's locationIds from the user_locations junction table
    const locResult = await pool.query(
      'SELECT "locationId" FROM user_locations WHERE "userId" = $1',
      [authId]
    );

    const locationIds = locResult.rows.map((r: any) => r.locationId);

    return { orgId, locationIds };
  } catch (err: any) {
    // If PostgreSQL is not configured/available, log and continue with empty context
    console.warn('DB lookup for user context failed:', err?.message || err);
    return { orgId: '', locationIds: [] };
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Missing or invalid Authorization header',
      });
      return;
    }

    const token = authorization.split(' ')[1];

    // Verify Firebase ID token
    const authInfo = await admin.auth().verifyIdToken(token);

    if (!authInfo.uid) {
      res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
      return;
    }

    const authId = authInfo.uid;

    // Resolve user's org + locations from PostgreSQL (mirrors cloud-functions pattern)
    let { orgId, locationIds } = await getUserContext(authId);

    // In development, allow env-based fallback when DB is unavailable
    if (!orgId && process.env.NODE_ENV === 'development') {
      orgId = process.env.DEV_ORG_ID || '';
      const devLocs = process.env.DEV_LOCATION_IDS || '';
      locationIds = devLocs ? devLocs.split(',').map((s) => s.trim()) : [];
      if (orgId) {
        console.log(`Using dev fallback org context: orgId=${orgId}`);
      }
    }

    req.auth = {
      authInfo,
      authId,
      orgId,
      locationIds,
      token,
    };

    next();
  } catch (error: any) {
    console.error('Auth middleware error:', error?.code || error?.message || error);
    res.status(401).json({
      success: false,
      error: 'Authentication failed',
      detail: process.env.NODE_ENV === 'development' ? (error?.code || error?.message) : undefined,
    });
  }
}
