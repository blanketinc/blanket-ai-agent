import { useState } from 'react';
import styles from '../styles/Chat.module.css';

interface ThinkingBlockProps {
  content: string;
  isActive?: boolean;
}

export default function ThinkingBlock({ content, isActive }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

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
        <div className={styles.thinkingContent}>
          {content}
        </div>
      )}
    </div>
  );
}
