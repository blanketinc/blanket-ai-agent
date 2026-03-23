/**
 * ChartRenderer — Renders analytics data from blanket-analytics tool results
 * as interactive Recharts visualizations.
 *
 * Detects the query type from the data shape and renders the appropriate chart.
 */

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import styles from '../styles/Chart.module.css';

interface ChartRendererProps {
  queryType: string;
  data: any;
}

// Color palette aligned with the app theme
const COLORS = {
  primary: '#2563eb',
  primaryLight: '#60a5fa',
  success: '#16a34a',
  successLight: '#4ade80',
  warning: '#f59e0b',
  warningLight: '#fbbf24',
  error: '#dc2626',
  errorLight: '#f87171',
  muted: '#94a3b8',
  surface: '#f1f5f9',
};

const LOCATION_COLORS = [
  '#2563eb', '#8b5cf6', '#06b6d4', '#f59e0b',
  '#ec4899', '#10b981', '#f97316', '#6366f1',
];

function getCompletionColor(rate: number): string {
  if (rate >= 90) return COLORS.success;
  if (rate >= 70) return COLORS.warning;
  return COLORS.error;
}

function formatPercent(value: number): string {
  return `${Number(value).toFixed(1)}%`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Completion Rates — Horizontal bar chart showing completion % per location
 */
function CompletionRatesChart({ data }: { data: any }) {
  const rows = data.rows || [];

  if (rows.length === 0) {
    return <div className={styles.empty}>No completion data available for this period.</div>;
  }

  const chartData = rows.map((r: any) => ({
    location: r.location || 'Unknown',
    rate: parseFloat(r.completion_rate) || 0,
    completed: parseInt(r.completed, 10) || 0,
    total: parseInt(r.total, 10) || 0,
  }));

  return (
    <div className={styles.chartWrapper}>
      <div className={styles.chartHeader}>
        <h4 className={styles.chartTitle}>Completion Rates by Location</h4>
        <span className={styles.chartSubtitle}>
          {data.dateRange?.startDate} — {data.dateRange?.endDate}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 45)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 30, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={12} />
          <YAxis type="category" dataKey="location" width={120} fontSize={12} tick={{ fill: '#64748b' }} />
          <Tooltip
            formatter={(value: any) => [formatPercent(Number(value)), 'Completion Rate']}
            labelFormatter={(label) => label}
            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
          />
          <Bar dataKey="rate" radius={[0, 4, 4, 0]} maxBarSize={28}>
            {chartData.map((entry: any, index: number) => (
              <Cell key={index} fill={getCompletionColor(entry.rate)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className={styles.chartSummary}>
        {chartData.map((r: any, i: number) => (
          <span key={i} className={styles.summaryItem}>
            <span className={styles.summaryDot} style={{ background: getCompletionColor(r.rate) }} />
            {r.location}: {formatPercent(r.rate)} ({r.completed}/{r.total})
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Failure Analysis — Stacked bar chart showing failure types by location/template
 */
function FailureAnalysisChart({ data }: { data: any }) {
  const rows = data.rows || [];

  if (rows.length === 0) {
    return <div className={styles.empty}>No failures found for this period.</div>;
  }

  // Group by location, aggregate failure types
  const byLocation: Record<string, any> = {};
  for (const r of rows) {
    const loc = r.location || 'Unknown';
    if (!byLocation[loc]) {
      byLocation[loc] = { location: loc, missed: 0, not_started: 0, rejected: 0 };
    }
    const count = parseInt(r.count, 10) || 0;
    if (r.status === 'missed') byLocation[loc].missed += count;
    else if (r.status === 'not started') byLocation[loc].not_started += count;
    else if (r.status === 'rejected') byLocation[loc].rejected += count;
  }

  const chartData = Object.values(byLocation);

  return (
    <div className={styles.chartWrapper}>
      <div className={styles.chartHeader}>
        <h4 className={styles.chartTitle}>Failure Analysis</h4>
        <span className={styles.chartBadge}>{data.totalFailures} total failures</span>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 50)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 30, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" fontSize={12} />
          <YAxis type="category" dataKey="location" width={120} fontSize={12} tick={{ fill: '#64748b' }} />
          <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="missed" stackId="a" fill={COLORS.error} name="Missed" radius={[0, 0, 0, 0]} />
          <Bar dataKey="not_started" stackId="a" fill={COLORS.warning} name="Not Started" />
          <Bar dataKey="rejected" stackId="a" fill={COLORS.errorLight} name="Rejected" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Performance Trends — Area chart showing completion rate over time
 */
function PerformanceTrendsChart({ data }: { data: any }) {
  const rows = data.rows || [];

  if (rows.length === 0) {
    return <div className={styles.empty}>No trend data available for this period.</div>;
  }

  const chartData = rows.map((r: any) => ({
    period: formatDate(r.period),
    completion_rate: parseFloat(r.completion_rate) || 0,
    total: parseInt(r.total, 10) || 0,
    completed: parseInt(r.completed, 10) || 0,
  }));

  return (
    <div className={styles.chartWrapper}>
      <div className={styles.chartHeader}>
        <h4 className={styles.chartTitle}>Performance Trends</h4>
        <span className={styles.chartSubtitle}>
          {data.interval || 'weekly'} · {data.dateRange?.startDate} — {data.dateRange?.endDate}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={chartData} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="completionGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="period" fontSize={12} tick={{ fill: '#64748b' }} />
          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={12} tick={{ fill: '#64748b' }} />
          <Tooltip
            formatter={(value: any, name: any) => {
              if (name === 'completion_rate') return [formatPercent(Number(value)), 'Completion Rate'];
              return [value, name];
            }}
            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
          />
          <Area
            type="monotone"
            dataKey="completion_rate"
            stroke={COLORS.primary}
            strokeWidth={2}
            fill="url(#completionGradient)"
            dot={{ fill: COLORS.primary, r: 4 }}
            activeDot={{ r: 6 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Location Comparison — Grouped bar chart with multiple metrics
 */
function LocationComparisonChart({ data }: { data: any }) {
  const rows = data.rows || [];

  if (rows.length === 0) {
    return <div className={styles.empty}>No location data available for this period.</div>;
  }

  const chartData = rows.map((r: any) => ({
    location: r.location || 'Unknown',
    completed: parseInt(r.completed, 10) || 0,
    missed: parseInt(r.missed, 10) || 0,
    not_started: parseInt(r.not_started, 10) || 0,
    completion_rate: parseFloat(r.completion_rate) || 0,
    avg_duration: parseFloat(r.avg_duration_minutes) || 0,
  }));

  return (
    <div className={styles.chartWrapper}>
      <div className={styles.chartHeader}>
        <h4 className={styles.chartTitle}>Location Comparison</h4>
        <div className={styles.chartMeta}>
          <span className={styles.chartBadge}>{data.totalLocations} locations</span>
          <span className={styles.chartBadge}>Org avg: {formatPercent(data.orgAverage || 0)}</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className={styles.kpiRow}>
        {chartData.slice(0, 4).map((loc: any, i: number) => (
          <div key={i} className={styles.kpiCard}>
            <div className={styles.kpiLabel}>{loc.location}</div>
            <div className={styles.kpiValue} style={{ color: getCompletionColor(loc.completion_rate) }}>
              {formatPercent(loc.completion_rate)}
            </div>
            <div className={styles.kpiDetail}>
              {loc.completed} completed · {loc.missed} missed
            </div>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="location" fontSize={11} tick={{ fill: '#64748b' }} angle={-20} textAnchor="end" height={60} />
          <YAxis fontSize={12} tick={{ fill: '#64748b' }} />
          <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="completed" fill={COLORS.success} name="Completed" radius={[4, 4, 0, 0]} />
          <Bar dataKey="missed" fill={COLORS.error} name="Missed" radius={[4, 4, 0, 0]} />
          <Bar dataKey="not_started" fill={COLORS.warning} name="Not Started" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Main ChartRenderer — dispatches to the appropriate chart based on query type
 */
export default function ChartRenderer({ queryType, data }: ChartRendererProps) {
  if (!data) return null;

  switch (queryType) {
    case 'completion_rates':
      return <CompletionRatesChart data={data} />;
    case 'failure_analysis':
      return <FailureAnalysisChart data={data} />;
    case 'performance_trends':
      return <PerformanceTrendsChart data={data} />;
    case 'location_comparison':
      return <LocationComparisonChart data={data} />;
    default:
      return null;
  }
}
