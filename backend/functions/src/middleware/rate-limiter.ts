/**
 * Rate Limiter Middleware
 *
 * Simple in-memory rate limiter for chat endpoints.
 * Prevents cost explosion from excessive API calls.
 *
 * Limits:
 * - 10 requests/minute per user
 * - 100 requests/hour per organization
 * - Circuit breaker: 5 min cooldown after 3 consecutive errors
 */

import { Response, NextFunction } from 'express';

interface RateLimit {
  count: number;
  resetAt: number;
}

interface CircuitBreaker {
  errors: number;
  cooldownUntil: number;
}

// In-memory stores (consider Redis for multi-instance deployments)
const userLimits = new Map<string, RateLimit>();
const orgLimits = new Map<string, RateLimit>();
const circuitBreakers = new Map<string, CircuitBreaker>();

// Configuration
const USER_LIMIT = 10; // requests per minute
const USER_WINDOW_MS = 60 * 1000; // 1 minute

const ORG_LIMIT = 100; // requests per hour
const ORG_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const CIRCUIT_BREAKER_THRESHOLD = 3; // errors before cooldown
const CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Rate limit middleware for chat endpoints.
 * Checks both per-user and per-org limits.
 */
export function rateLimiter(req: any, res: Response, next: NextFunction): void {
  const userId = req.auth?.authId;
  const orgId = req.auth?.orgId;
  const now = Date.now();

  if (!userId || !orgId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Check circuit breaker
  const breaker = circuitBreakers.get(userId);
  if (breaker && breaker.cooldownUntil > now) {
    const remainingSec = Math.ceil((breaker.cooldownUntil - now) / 1000);
    res.status(429).json({
      error: 'Too many errors. Please wait before trying again.',
      retryAfter: remainingSec,
      reason: 'circuit_breaker',
    });
    return;
  }

  // Check user rate limit
  const userLimit = userLimits.get(userId);
  if (userLimit && userLimit.resetAt > now) {
    if (userLimit.count >= USER_LIMIT) {
      const remainingSec = Math.ceil((userLimit.resetAt - now) / 1000);
      res.status(429).json({
        error: `Rate limit exceeded. You can make ${USER_LIMIT} requests per minute. Please wait ${remainingSec} seconds.`,
        retryAfter: remainingSec,
        reason: 'user_limit',
      });
      return;
    }
    userLimit.count++;
  } else {
    userLimits.set(userId, { count: 1, resetAt: now + USER_WINDOW_MS });
  }

  // Check org rate limit
  const orgLimit = orgLimits.get(orgId);
  if (orgLimit && orgLimit.resetAt > now) {
    if (orgLimit.count >= ORG_LIMIT) {
      const remainingSec = Math.ceil((orgLimit.resetAt - now) / 1000);
      res.status(429).json({
        error: `Organization rate limit exceeded. Limit: ${ORG_LIMIT} requests per hour. Please wait ${remainingSec} seconds.`,
        retryAfter: remainingSec,
        reason: 'org_limit',
      });
      return;
    }
    orgLimit.count++;
  } else {
    orgLimits.set(orgId, { count: 1, resetAt: now + ORG_WINDOW_MS });
  }

  next();
}

/**
 * Record an error for circuit breaker tracking.
 * Call this when a request fails due to user error (not server error).
 */
export function recordError(userId: string) {
  const now = Date.now();
  const breaker = circuitBreakers.get(userId);

  if (breaker && breaker.cooldownUntil > now) {
    // Already in cooldown
    return;
  }

  if (breaker && breaker.errors >= CIRCUIT_BREAKER_THRESHOLD - 1) {
    // Trigger cooldown
    circuitBreakers.set(userId, {
      errors: 0,
      cooldownUntil: now + CIRCUIT_BREAKER_COOLDOWN_MS,
    });
    console.warn(`Circuit breaker triggered for user ${userId}`);
  } else {
    // Increment error count
    circuitBreakers.set(userId, {
      errors: (breaker?.errors || 0) + 1,
      cooldownUntil: 0,
    });
  }
}

/**
 * Reset error count for a user (call on successful request).
 */
export function resetErrors(userId: string) {
  circuitBreakers.delete(userId);
}

/**
 * Cleanup old entries (run periodically).
 * In production, consider using Redis with TTL instead.
 */
export function cleanupRateLimits() {
  const now = Date.now();

  for (const [key, limit] of userLimits.entries()) {
    if (limit.resetAt <= now) {
      userLimits.delete(key);
    }
  }

  for (const [key, limit] of orgLimits.entries()) {
    if (limit.resetAt <= now) {
      orgLimits.delete(key);
    }
  }

  for (const [key, breaker] of circuitBreakers.entries()) {
    if (breaker.cooldownUntil > 0 && breaker.cooldownUntil <= now) {
      circuitBreakers.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupRateLimits, 5 * 60 * 1000);
