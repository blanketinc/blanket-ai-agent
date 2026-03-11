/**
 * MCP Tool: Analytics
 *
 * Queries PostgreSQL directly for analytics and insights.
 * All queries are filtered by the user's organizationId and locationIds.
 *
 * Tables used:
 *  - listentries: status enum (not started, started, completed, missed,
 *                 pending review, in review, rejected, approved),
 *                 createdDate/submittedAt/startedAt as bigint (ms)
 *  - locations:   joins via listentries.locationId = locations.oldLocationId
 */

import { MCPTool, MCPAuthContext } from '../libs/mcp-types';
import { pool } from '../core/database';

type AnalyticsQuery =
  | 'completion_rates'
  | 'failure_analysis'
  | 'performance_trends'
  | 'location_comparison';

async function queryCompletionRates(params: any, context: MCPAuthContext) {
  const { startDate, endDate, locationIds } = params;
  const filterLocations = locationIds || context.locationIds;

  const sql = `
    SELECT
      l.name AS location,
      l."oldLocationId" AS location_id,
      COUNT(*) AS total,
      COUNT(CASE WHEN le.status IN ('completed', 'approved') THEN 1 END) AS completed,
      ROUND(
        COUNT(CASE WHEN le.status IN ('completed', 'approved') THEN 1 END) * 100.0
        / NULLIF(COUNT(*), 0),
        2
      ) AS completion_rate
    FROM listentries le
    JOIN locations l ON le."locationId" = l."oldLocationId"
    WHERE
      le."organizationId" = $1
      AND le."isDeleted" = false
      AND to_timestamp(le."createdDate" / 1000) BETWEEN $2 AND $3
      ${filterLocations?.length ? 'AND le."locationId" = ANY($4)' : ''}
    GROUP BY l.name, l."oldLocationId"
    ORDER BY completion_rate ASC;
  `;

  const values: any[] = [context.orgId, startDate, endDate];
  if (filterLocations?.length) {
    values.push(filterLocations);
  }

  const result = await pool.query(sql, values);
  return {
    rows: result.rows,
    totalLocations: result.rowCount,
    dateRange: { startDate, endDate },
  };
}

async function queryFailureAnalysis(params: any, context: MCPAuthContext) {
  const { startDate, endDate, locationIds } = params;
  const filterLocations = locationIds || context.locationIds;

  const sql = `
    SELECT
      l.name AS location,
      le.name AS template_name,
      le.status,
      COUNT(*) AS count,
      le."userId" AS user_id
    FROM listentries le
    JOIN locations l ON le."locationId" = l."oldLocationId"
    WHERE
      le."organizationId" = $1
      AND le."isDeleted" = false
      AND le.status IN ('missed', 'not started', 'rejected')
      AND to_timestamp(le."createdDate" / 1000) BETWEEN $2 AND $3
      ${filterLocations?.length ? 'AND le."locationId" = ANY($4)' : ''}
    GROUP BY l.name, le.name, le.status, le."userId"
    ORDER BY count DESC
    LIMIT 50;
  `;

  const values: any[] = [context.orgId, startDate, endDate];
  if (filterLocations?.length) {
    values.push(filterLocations);
  }

  const result = await pool.query(sql, values);
  return {
    rows: result.rows,
    totalFailures: result.rows.reduce(
      (sum: number, r: any) => sum + parseInt(r.count, 10),
      0
    ),
    dateRange: { startDate, endDate },
  };
}

async function queryPerformanceTrends(params: any, context: MCPAuthContext) {
  const { startDate, endDate, locationIds, interval } = params;
  const filterLocations = locationIds || context.locationIds;
  const groupInterval = interval || 'week';

  const sql = `
    SELECT
      date_trunc($5, to_timestamp(le."createdDate" / 1000)) AS period,
      COUNT(*) AS total,
      COUNT(CASE WHEN le.status IN ('completed', 'approved') THEN 1 END) AS completed,
      ROUND(
        COUNT(CASE WHEN le.status IN ('completed', 'approved') THEN 1 END) * 100.0
        / NULLIF(COUNT(*), 0),
        2
      ) AS completion_rate
    FROM listentries le
    WHERE
      le."organizationId" = $1
      AND le."isDeleted" = false
      AND to_timestamp(le."createdDate" / 1000) BETWEEN $2 AND $3
      ${filterLocations?.length ? 'AND le."locationId" = ANY($4)' : ''}
    GROUP BY period
    ORDER BY period ASC;
  `;

  const values: any[] = [context.orgId, startDate, endDate];
  if (filterLocations?.length) {
    values.push(filterLocations);
  } else {
    values.push(null); // placeholder for $4
  }
  values.push(groupInterval);

  const result = await pool.query(sql, values);
  return {
    rows: result.rows,
    interval: groupInterval,
    dateRange: { startDate, endDate },
  };
}

async function queryLocationComparison(params: any, context: MCPAuthContext) {
  const { startDate, endDate, locationIds } = params;
  const filterLocations = locationIds || context.locationIds;

  const sql = `
    SELECT
      l.name AS location,
      l."oldLocationId" AS location_id,
      COUNT(*) AS total,
      COUNT(CASE WHEN le.status IN ('completed', 'approved') THEN 1 END) AS completed,
      COUNT(CASE WHEN le.status = 'missed' THEN 1 END) AS missed,
      COUNT(CASE WHEN le.status IN ('not started') THEN 1 END) AS not_started,
      ROUND(
        COUNT(CASE WHEN le.status IN ('completed', 'approved') THEN 1 END) * 100.0
        / NULLIF(COUNT(*), 0),
        2
      ) AS completion_rate,
      ROUND(
        AVG(
          CASE WHEN le."submittedAt" IS NOT NULL AND le."startedAt" IS NOT NULL
          THEN (le."submittedAt" - le."startedAt") / 60000.0
          END
        ),
        1
      ) AS avg_duration_minutes
    FROM listentries le
    JOIN locations l ON le."locationId" = l."oldLocationId"
    WHERE
      le."organizationId" = $1
      AND le."isDeleted" = false
      AND to_timestamp(le."createdDate" / 1000) BETWEEN $2 AND $3
      ${filterLocations?.length ? 'AND le."locationId" = ANY($4)' : ''}
    GROUP BY l.name, l."oldLocationId"
    ORDER BY completion_rate DESC;
  `;

  const values: any[] = [context.orgId, startDate, endDate];
  if (filterLocations?.length) {
    values.push(filterLocations);
  }

  const result = await pool.query(sql, values);

  // Compute org-wide average
  const totalAll = result.rows.reduce(
    (s: number, r: any) => s + parseInt(r.total, 10),
    0
  );
  const completedAll = result.rows.reduce(
    (s: number, r: any) => s + parseInt(r.completed, 10),
    0
  );
  const orgAverage =
    totalAll > 0 ? Math.round((completedAll / totalAll) * 10000) / 100 : 0;

  return {
    rows: result.rows,
    orgAverage,
    totalLocations: result.rowCount,
    dateRange: { startDate, endDate },
  };
}

const queryHandlers: Record<
  AnalyticsQuery,
  (params: any, context: MCPAuthContext) => Promise<any>
> = {
  completion_rates: queryCompletionRates,
  failure_analysis: queryFailureAnalysis,
  performance_trends: queryPerformanceTrends,
  location_comparison: queryLocationComparison,
};

export const analyticsTool: MCPTool = {
  name: 'blanket-analytics',
  description:
    'Query Blanket data for analytics and insights. Queries: completion_rates (completion % by location), failure_analysis (missed/failed lists breakdown), performance_trends (completion rates over time), location_comparison (side-by-side location metrics). All queries are scoped to the user\'s organization.',
  requiresAuth: true,

  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        enum: [
          'completion_rates',
          'failure_analysis',
          'performance_trends',
          'location_comparison',
        ],
        description: 'The analytics query to run',
      },
      params: {
        type: 'object',
        description:
          'Query parameters. All queries accept: { startDate (ISO string), endDate (ISO string), locationIds? (string[]) }. performance_trends also accepts: { interval?: "day"|"week"|"month" }.',
      },
    },
    required: ['query', 'params'],
  },

  execute: async (params: any, context: MCPAuthContext) => {
    const { query, params: queryParams } = params;

    const handler = queryHandlers[query as AnalyticsQuery];
    if (!handler) {
      throw new Error(`Unknown analytics query: ${query}`);
    }

    return handler(queryParams || {}, context);
  },
};
