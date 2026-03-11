import ReactMarkdown from 'react-markdown';
import styles from '../styles/Chat.module.css';

interface ToolCall {
  tool: string;
  action: string;
  success: boolean;
}

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  timestamp?: number;
}

export default function ChatMessage({
  role,
  content,
  toolCalls,
}: ChatMessageProps) {
  const isUser = role === 'user';

  return (
    <div
      className={`${styles.message} ${isUser ? styles.userMessage : styles.assistantMessage}`}
    >
      <div className={styles.messageAvatar}>
        {isUser ? (
          <div className={styles.userAvatar}>You</div>
        ) : (
          <div className={styles.aiAvatar}>AI</div>
        )}
      </div>

      <div className={styles.messageContent}>
        {isUser ? (
          <p>{content}</p>
        ) : (
          <ReactMarkdown>{content}</ReactMarkdown>
        )}

        {toolCalls && toolCalls.length > 0 && (
          <div className={styles.toolCalls}>
            {toolCalls.map((tc, i) => (
              <span
                key={i}
                className={`${styles.toolBadge} ${tc.success ? styles.toolSuccess : styles.toolError}`}
              >
                {tc.tool}: {tc.action}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
