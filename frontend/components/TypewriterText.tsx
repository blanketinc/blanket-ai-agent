import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import styles from '../styles/Chat.module.css';

interface TypewriterTextProps {
  /** The full target text (grows as SSE chunks arrive) */
  fullText: string;
  /** Whether the parent message is still streaming */
  isStreaming?: boolean;
}

/**
 * Renders text with a typewriter effect during streaming.
 * Once streaming ends, shows the full text with markdown.
 *
 * Uses word-by-word reveal (~60ms per word) for a natural feel.
 */
export default function TypewriterText({ fullText, isStreaming }: TypewriterTextProps) {
  const [displayedLen, setDisplayedLen] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fullTextRef = useRef(fullText);
  fullTextRef.current = fullText;

  useEffect(() => {
    if (!isStreaming) {
      // Streaming done — show everything immediately
      setDisplayedLen(fullText.length);
      return;
    }

    // Advance one word at a time
    function tick() {
      setDisplayedLen((prev) => {
        const text = fullTextRef.current;
        if (prev >= text.length) {
          // Caught up — wait and retry
          timerRef.current = setTimeout(tick, 50);
          return prev;
        }

        // Find the next word boundary
        let next = prev + 1;
        while (next < text.length && text[next] !== ' ' && text[next] !== '\n') {
          next++;
        }
        // Include the space/newline
        if (next < text.length) next++;

        timerRef.current = setTimeout(tick, 30);
        return next;
      });
    }

    timerRef.current = setTimeout(tick, 30);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isStreaming]); // only re-run when streaming state changes

  // When not streaming, render full markdown
  if (!isStreaming) {
    return (
      <div className={styles.streamedText}>
        <ReactMarkdown>{fullText}</ReactMarkdown>
      </div>
    );
  }

  // While streaming, render plain text for performance (no markdown parse per tick)
  const visible = fullText.slice(0, displayedLen);
  return (
    <div className={styles.streamedText}>
      <span>{visible}</span>
      <span className={styles.streamCursor} />
    </div>
  );
}
