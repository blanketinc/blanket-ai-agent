import { useState, useEffect, useRef } from 'react';
import styles from '../styles/Chat.module.css';

export default function ThinkingIndicator() {
  const [elapsed, setElapsed] = useState(0);
  const mountTime = useRef(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - mountTime.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (s: number) => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  return (
    <div className={styles.typingIndicator}>
      <div className={styles.messageAvatar}>
        <div className={styles.aiAvatar}>AI</div>
      </div>
      <div className={styles.typingBubble}>
        <div className={styles.typingDots}>
          <span />
          <span />
          <span />
        </div>
        <span className={styles.typingLabel}>Thinking</span>
        <span className={styles.thinkingTimer}>{formatTime(elapsed)}</span>
      </div>
    </div>
  );
}
