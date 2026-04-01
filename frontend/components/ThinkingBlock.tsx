import { useState, useEffect, useRef } from 'react';
import styles from '../styles/Chat.module.css';

interface ThinkingBlockProps {
  content: string;
  isActive?: boolean;
}

export default function ThinkingBlock({ content, isActive }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const mountTimeRef = useRef<number>(Date.now());

  // Always tick the timer — show how long ago this block appeared
  useEffect(() => {
    const interval = setInterval(() => {
      const secs = Math.floor((Date.now() - mountTimeRef.current) / 1000);
      setElapsed(secs);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-expand when actively thinking so user sees live text
  useEffect(() => {
    if (isActive) {
      setExpanded(true);
    }
  }, [isActive]);

  // Auto-scroll the live thinking content as it streams in
  useEffect(() => {
    if (isActive && expanded && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content, isActive, expanded]);

  const formatTime = (s: number) => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  return (
    <div className={`${styles.thinkingBlock} ${isActive ? styles.thinkingActive : ''}`}>
      <button
        className={styles.thinkingToggle}
        onClick={() => setExpanded(!expanded)}
      >
        <span className={styles.thinkingIcon}>
          {isActive ? (
            <span className={styles.thinkingSpinner} />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          )}
        </span>
        <span className={styles.thinkingLabel}>
          {isActive ? 'Thinking...' : 'Thought process'}
        </span>
        <span className={styles.thinkingTimer}>{formatTime(elapsed)}</span>
        <svg
          className={`${styles.thinkingChevron} ${expanded ? styles.thinkingChevronOpen : ''}`}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded && (
        <div
          ref={contentRef}
          className={isActive ? styles.thinkingContentLive : styles.thinkingContent}
        >
          {content}
          {isActive && <span className={styles.streamCursor} />}
        </div>
      )}
    </div>
  );
}
