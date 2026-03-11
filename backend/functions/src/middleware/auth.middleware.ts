/**
 * Auth Middleware for AI Assistant
 *
 * Mirrors cloud-functions authentication/auth.middleware.ts pattern.
 * Verifies Firebase ID token and extracts user context for MCP tools.
 *
 * Sets req.auth with:
 *  - authInfo: Firebase DecodedIdToken (uid, email, phone, custom claims)
 *  - authId: User's database authId or Firebase UID
 *  - orgId: User's organization ID (from custom claims or DB lookup)
 *  - locationIds: User's accessible locations
 *  - token: Raw Bearer token for proxying to Blanket APIs
 */

import * as admin from 'firebase-admin';
import { Request, Response, NextFunction } from 'express';

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

    // Extract org and location context from custom claims
    // Custom claims are set when user is assigned to org/locations in Blanket
    const orgId = (authInfo as any).orgId || '';
    const locationIds: string[] = (authInfo as any).locationIds || [];
    const authId = authInfo.uid;

    req.auth = {
      authInfo,
      authId,
      orgId,
      locationIds,
      token,
    };

    next();
  } catch (error: any) {
    console.error('Auth middleware error:', error?.message || error);
    res.status(401).json({
      success: false,
      error: 'Authentication failed',
    });
  }
}
