/**
 * Auth Middleware for AI Assistant
 *
 * Mirrors cloud-functions authentication/auth.middleware.ts pattern.
 * Verifies Firebase ID token, then resolves user context via fallback chain:
 *   1. PostgreSQL users table (primary — matches cloud-functions pattern)
 *   2. Firebase custom claims
 *   3. Firestore user profile
 *   4. x-org-id header (demo/integration fallback)
 *
 * Sets req.auth with:
 *  - authInfo: Firebase DecodedIdToken (uid, email, phone, custom claims)
 *  - authId: User's database authId or Firebase UID
 *  - orgId: User's organization ID
 *  - locationIds: User's accessible locations
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
 */
async function getUserContextFromDB(
  authId: string
): Promise<{ orgId: string; locationIds: string[] }> {
  try {
    const userResult = await pool.query(
      'SELECT "organizationId" FROM users WHERE "authId" = $1 LIMIT 1',
      [authId]
    );

    const orgId = userResult.rows[0]?.organizationId || '';

    if (!orgId) {
      console.warn(`No organization found in DB for authId: ${authId}`);
      return { orgId: '', locationIds: [] };
    }

    const locResult = await pool.query(
      'SELECT "locationId" FROM user_locations WHERE "userId" = $1',
      [authId]
    );

    const locationIds = locResult.rows.map((r: any) => r.locationId);
    return { orgId, locationIds };
  } catch (err: any) {
    console.warn('DB lookup for user context failed:', err?.message || err);
    return { orgId: '', locationIds: [] };
  }
}

/**
 * Resolve orgId from Firebase custom claims (multiple possible structures).
 */
function getOrgFromClaims(
  authInfo: admin.auth.DecodedIdToken
): { orgId: string; locationIds: string[] } {
  const claims = authInfo as any;

  // Direct custom claim
  if (claims.orgId) {
    return { orgId: claims.orgId, locationIds: claims.locationIds || [] };
  }

  // Nested custom claims (blanket.orgId, app.orgId, etc.)
  const nested = claims.blanket || claims.app || claims.organization || null;
  if (nested?.orgId || nested?.organizationId) {
    return {
      orgId: nested.orgId || nested.organizationId,
      locationIds: nested.locationIds || claims.locationIds || [],
    };
  }

  return { orgId: '', locationIds: [] };
}

/**
 * Resolve orgId from Firestore user profile.
 */
async function getOrgFromFirestore(
  uid: string
): Promise<{ orgId: string; locationIds: string[] }> {
  try {
    const db = admin.firestore();
    for (const collection of ['users', 'userProfiles']) {
      const doc = await db.collection(collection).doc(uid).get();
      if (doc.exists) {
        const data = doc.data();
        const orgId = data?.orgId || data?.organizationId || '';
        if (orgId) {
          return { orgId, locationIds: data?.locationIds || [] };
        }
      }
    }
  } catch (err: any) {
    console.warn('Firestore org lookup failed:', err?.message || err);
  }
  return { orgId: '', locationIds: [] };
}

/**
 * Full fallback chain for resolving org context.
 */
async function resolveOrgContext(
  authInfo: admin.auth.DecodedIdToken,
  authId: string,
  req: Request
): Promise<{ orgId: string; locationIds: string[] }> {
  // 1. PostgreSQL (primary — mirrors cloud-functions)
  const dbResult = await getUserContextFromDB(authId);
  if (dbResult.orgId) return dbResult;

  // 2. Firebase custom claims
  const claimsResult = getOrgFromClaims(authInfo);
  if (claimsResult.orgId) return claimsResult;

  // 3. Firestore user profile
  const firestoreResult = await getOrgFromFirestore(authInfo.uid);
  if (firestoreResult.orgId) return firestoreResult;

  // 4. Request header / query param fallback (demo/integration)
  const headerOrgId =
    (req.headers['x-org-id'] as string) ||
    (req.query.orgId as string) ||
    '';
  if (headerOrgId) {
    return { orgId: headerOrgId, locationIds: [] };
  }

  // 5. Dev environment fallback
  if (process.env.NODE_ENV === 'development') {
    const devOrgId = process.env.DEV_ORG_ID || '';
    const devLocs = process.env.DEV_LOCATION_IDS || '';
    if (devOrgId) {
      console.log(`Using dev fallback org context: orgId=${devOrgId}`);
      return {
        orgId: devOrgId,
        locationIds: devLocs ? devLocs.split(',').map((s) => s.trim()) : [],
      };
    }
  }

  return { orgId: '', locationIds: [] };
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

    // Resolve org context via fallback chain
    const { orgId, locationIds } = await resolveOrgContext(authInfo, authId, req);

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
