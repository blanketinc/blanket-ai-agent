/**
 * PostgreSQL connection pool.
 * Mirrors cloud-functions postgres-db/db.ts pattern.
 */

import { Pool } from 'pg';
import { appConfig } from './config';

export const pool = new Pool({
  host: appConfig.postgres.host,
  port: appConfig.postgres.port,
  user: appConfig.postgres.user,
  password: appConfig.postgres.password,
  database: appConfig.postgres.database,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
