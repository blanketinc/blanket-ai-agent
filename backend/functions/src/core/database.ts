/**
 * PostgreSQL connection pool (lazy initialization).
 *
 * The pool is created on first use, NOT at module load time.
 * This is critical because Firebase secrets (like POSTGRES_PASSWORD)
 * are injected as env vars AFTER module initialization.
 *
 * Supports Cloud SQL Unix sockets (host starts with "/")
 * and standard TCP connections.
 */

import { Pool } from 'pg';

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    // Read config at call time so Firebase secrets are available
    const host = process.env.POSTGRES_HOST || '';
    const isUnixSocket = host.startsWith('/');

    _pool = new Pool({
      host,
      ...(isUnixSocket ? {} : { port: parseInt(process.env.POSTGRES_PORT || '5432', 10) }),
      user: process.env.POSTGRES_USER || '',
      password: process.env.POSTGRES_PASSWORD || '',
      database: process.env.POSTGRES_DB || 'postgres',
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return _pool;
}

// Keep backward-compatible export for existing code
// Uses a Proxy so that pool.query() calls getPool().query() lazily
export const pool: Pool = new Proxy({} as Pool, {
  get(_target, prop) {
    return (getPool() as any)[prop];
  },
});
