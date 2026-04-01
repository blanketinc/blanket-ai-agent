import { useState, useEffect, useRef } from 'react';
import styles from '../styles/Chat.module.css';

interface ToolCallDisplayProps {
  tool: string;
  action: string;
  params?: any;
  isActive?: boolean;
  result?: {
    success: boolean;
    result?: any;
    error?: string;
  };
}

const TOOL_LABELS: Record<string, string> = {
  'blanket-api': 'Blanket API',
  'blanket-analytics': 'Analytics',
  'marco-pollo': 'Food Safety AI',
};

const ACTION_LABELS: Record<string, string> = {
  list_templates: 'Listing templates',
  get_template: 'Fetching template',
  update_template: 'Updating template',
  add_task_to_template: 'Adding task',
  create_template: 'Creating template',
  completion_rates: 'Querying completion rates',
  failure_analysis: 'Analyzing failures',
  performance_trends: 'Checking performance trends',
  location_comparison: 'Comparing locations',
};

export default function ToolCallDisplay({
  tool,
  action,
  isActive,
  result,
}: ToolCallDisplayProps) {
  const [elapsed, setElapsed] = useState(0);
  const mountTimeRef = useRef<number>(Date.now());
  const finalTimeRef = useRef<number | null>(null);

  // Tick while active, freeze when result arrives
  useEffect(() => {
    if (result && !finalTimeRef.current) {
      finalTimeRef.current = Math.floor((Date.now() - mountTimeRef.current) / 1000);
      setElapsed(finalTimeRef.current);
      return;
    }
    const interval = setInterval(() => {
      if (!finalTimeRef.current) {
        setElapsed(Math.floor((Date.now() - mountTimeRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [result]);

  const toolLabel = TOOL_LABELS[tool] || tool;
  const actionLabel = ACTION_LABELS[action] || action;

  const formatTime = (s: number) => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  return (
    <div className={`${styles.toolCallDisplay} ${isActive ? styles.toolCallActive : ''}`}>
      <div className={styles.toolCallHeader}>
        {isActive ? (
          <span className={styles.toolCallSpinner} />
        ) : result ? (
          result.success ? (
            <svg className={styles.toolCallIconSuccess} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg className={styles.toolCallIconError} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )
        ) : null}
        <span className={styles.toolCallLabel}>{toolLabel}</span>
        <span className={styles.toolCallAction}>{actionLabel}</span>
        <span className={styles.toolCallTimer}>{formatTime(elapsed)}</span>
      </div>
      {result && !result.success && result.error && (
        <div className={styles.toolCallError}>{result.error}</div>
      )}
    </div>
  );
}
