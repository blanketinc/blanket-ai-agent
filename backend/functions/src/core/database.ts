/**
 * PostgreSQL connection pool.
 * Mirrors cloud-functions postgres-db/db.ts pattern.
 *
 * Supports Cloud SQL Unix sockets (host starts with "/")
 * and standard TCP connections.
 */

import { Pool } from 'pg';
import { appConfig } from './config';

const isUnixSocket = appConfig.postgres.host.startsWith('/');

export const pool = new Pool({
  host: appConfig.postgres.host,
  ...(isUnixSocket ? {} : { port: appConfig.postgres.port }),
  user: appConfig.postgres.user,
  password: appConfig.postgres.password,
  database: appConfig.postgres.database,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
