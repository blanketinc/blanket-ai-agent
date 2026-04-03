/**
 * MCP Tool: Blanket Analytics
 *
 * Proxies to existing Cloud Functions report endpoints instead of running
 * raw SQL. This gives the AI agent access to all 25+ battle-tested report
 * endpoints across list entries, audits, issues, actions, labels, and courses.
 *
 * Request format: POST { data: { organizationId, startDate, endDate, locationIds, ...params } }
 * Response format varies by endpoint — the generic handler unwraps gracefully.
 */

import axios from 'axios';
import { MCPTool, MCPAuthContext } from '../libs/mcp-types';
import { appConfig } from '../core/config';

// ─── Report Route Map ──────────────────────────────────────────────────────
// Maps each report enum value to its Cloud Functions API path.

const REPORT_ROUTES: Record<string, string> = {
  // List Entry Reports (v2)
  list_entries_detail: '/v2/reports/list-entries/list',
  list_entries_scheduled: '/v2/reports/list-entries/scheduled-list',
  list_entries_completed: '/v2/reports/list-entries/completed-lists',

  // Audit Entry Reports (v1)
  audit_score_by_time: '/v1/auditEntries/reports/getScoreByTime',
  audit_average: '/v1/auditEntries/reports/average',
  audit_compact_entries: '/v1/auditEntries/reports/compactAuditEntries',
  audit_failed_tasks: '/v1/auditEntries/reports/failedTasksSummary',
  audit_details_by_time: '/v1/auditEntries/reports/detailsByTime',
  audit_details_by_location: '/v1/auditEntries/reports/detailsByLocation',
  audit_template_summary: '/v1/auditEntries/reports/taskListTemplateSummary',
  audit_scheduled_by_location: '/v1/auditEntries/reports/scheduledListByLocation',
  audit_location_summaries: '/v1/auditEntries/reports/locationSummariesByAudit',

  // Issues Reports (v1)
  issues_total: '/v1/issues/report/total',
  issues_by_location: '/v1/issues/report/location',
  issues_by_category: '/v1/issues/report/category',
  issues_by_priority: '/v1/issues/report/priority',

  // Actions Reports (v1)
  actions_total: '/v1/actions/report/total',
  actions_by_location: '/v1/actions/report/location',
  actions_by_priority: '/v1/actions/report/priority',

  // Label Reports (v1)
  labels_by_time: '/v1/labelTransactions/report/time',
  labels_by_item: '/v1/labelTransactions/report/labelItem',
  labels_by_location: '/v1/labelTransactions/report/location',

  // Courses Reports (v2)
  courses_summary: '/v2/courses/report/summary',
  courses_performance: '/v2/courses/report/performance',
  courses_user_performance: '/v2/courses/report/user-performance',
};

// ─── HTTP Client ───────────────────────────────────────────────────────────

function getAxiosInstance(token: string) {
  return axios.create({
    baseURL: appConfig.apiBaseUrl,
    timeout: 60000, // 60s — reports can be heavier than CRUD operations
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
}

// ─── Generic Report Executor ───────────────────────────────────────────────

async function executeReport(
  report: string,
  startDate: string,
  endDate: string,
  locationIds: string[] | undefined,
  extraParams: Record<string, any> | undefined,
  context: MCPAuthContext
): Promise<any> {
  const route = REPORT_ROUTES[report];
  if (!route) {
    throw new Error(`Unknown report: ${report}. Available: ${Object.keys(REPORT_ROUTES).join(', ')}`);
  }

  const client = getAxiosInstance(context.token);

  const response = await client.post(route, {
    data: {
      organizationId: context.orgId,
      startDate,
      endDate,
      locationIds: locationIds || context.locationIds,
      ...(extraParams || {}),
    },
  });

  // Unwrap response — v1 and v2 endpoints return slightly different shapes
  return response.data?.data?.result ?? response.data?.data ?? response.data;
}

// ─── MCP Tool Definition ──────────────────────────────────────────────────

export const analyticsTool: MCPTool = {
  name: 'blanket-analytics',
  description: `Pull reports from Blanket modules. Choose a report type and provide a date range.

Report types by category:

LIST ENTRIES: list_entries_detail (full list entry data with tasks), list_entries_scheduled (scheduled list pivot with completion status), list_entries_completed (compact completed summaries).

AUDITS: audit_score_by_time (scores and earned points over time), audit_average (on-time/late/uncompleted averages), audit_compact_entries (minimal entry data for list views), audit_failed_tasks (failed/missed task breakdown with performer and location), audit_details_by_time (completion metrics by date), audit_details_by_location (completion metrics by location), audit_template_summary (summary per template with averages), audit_scheduled_by_location (scheduled vs completed per location), audit_location_summaries (each audit's performance by location).

ISSUES: issues_total (summary counts), issues_by_location (by location), issues_by_category (by type/category), issues_by_priority (by priority level).

ACTIONS: actions_total (action plan summary), actions_by_location (by location), actions_by_priority (by priority).

LABELS: labels_by_time (label prints over time), labels_by_item (prints per label item), labels_by_location (prints per location).

COURSES: courses_summary (enrollment/completion overview), courses_performance (top/bottom performing courses and users), courses_user_performance (per-user course metrics with pagination).

All reports are scoped to the user's organization.`,
  requiresAuth: true,

  parameters: {
    type: 'object',
    properties: {
      report: {
        type: 'string',
        enum: Object.keys(REPORT_ROUTES),
        description: 'The report to pull. See tool description for what each report returns.',
      },
      startDate: {
        type: 'string',
        description:
          'Start date in ISO 8601 format (e.g., 2026-03-27T00:00:00Z). Defaults to 7 days ago if omitted.',
      },
      endDate: {
        type: 'string',
        description:
          'End date in ISO 8601 format (e.g., 2026-04-03T23:59:59Z). Defaults to now if omitted.',
      },
      locationIds: {
        type: 'array',
        description:
          'Optional array of location IDs to filter by. Omit to include all user-accessible locations.',
      },
      extraParams: {
        type: 'object',
        description:
          'Optional endpoint-specific parameters. For audits: { auditIds?, auditNames? }. For labels: { labelTemplateIds?, categoryIds?, timezone?, groupBy? }. For courses: { courseIds?, query?, page?, pageSize? }. For list entries: { listTemplateIds?, listTemplateName? }.',
      },
    },
    required: ['report'],
  },

  execute: async (params: any, context: MCPAuthContext) => {
    const { report, startDate, endDate, locationIds, extraParams } = params;

    // Default date range to last 7 days
    const now = new Date();
    const resolvedEnd = endDate || now.toISOString();
    const resolvedStart =
      startDate || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    return executeReport(
      report,
      resolvedStart,
      resolvedEnd,
      locationIds,
      extraParams,
      context
    );
  },
};
