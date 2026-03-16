import ReactMarkdown from 'react-markdown';
import styles from '../styles/Chat.module.css';
import ThinkingBlock from './ThinkingBlock';
import ToolCallDisplay from './ToolCallDisplay';
import DiffView from './DiffView';
import ApprovalButtons from './ApprovalButtons';

interface ToolCall {
  tool: string;
  action: string;
  success: boolean;
}

/** A part of a streaming message — rendered in order */
export interface MessagePart {
  type: 'thinking' | 'text' | 'tool-call' | 'tool-result' | 'approval-request' | 'diff';
  content?: string;
  toolCall?: {
    id: string;
    tool: string;
    action: string;
    params?: any;
    isActive?: boolean;
    result?: { success: boolean; result?: any; error?: string };
  };
  approval?: {
    id: string;
    description: string;
    status?: 'pending' | 'approved' | 'rejected';
  };
  diff?: { before: any; after: any };
}

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  timestamp?: number;
  parts?: MessagePart[];
  isStreaming?: boolean;
  onApprove?: (approvalId: string) => void;
  onReject?: (approvalId: string) => void;
  approvalProcessing?: boolean;
}

export default function ChatMessage({
  role,
  content,
  toolCalls,
  parts,
  isStreaming,
  onApprove,
  onReject,
  approvalProcessing,
}: ChatMessageProps) {
  const isUser = role === 'user';

  // If we have structured parts (streaming message), render them
  if (!isUser && parts && parts.length > 0) {
    return (
      <div className={`${styles.message} ${styles.assistantMessage}`}>
        <div className={styles.messageAvatar}>
          <div className={styles.aiAvatar}>AI</div>
        </div>
        <div className={styles.messageContent}>
          {parts.map((part, i) => {
            switch (part.type) {
              case 'thinking':
                return (
                  <ThinkingBlock
                    key={i}
                    content={part.content || ''}
                    isActive={isStreaming && i === parts.length - 1 && part.type === 'thinking'}
                  />
                );
              case 'text':
                return (
                  <div key={i} className={styles.streamedText}>
                    <ReactMarkdown>{part.content || ''}</ReactMarkdown>
                  </div>
                );
              case 'tool-call':
                return part.toolCall ? (
                  <ToolCallDisplay
                    key={i}
                    tool={part.toolCall.tool}
                    action={part.toolCall.action}
                    params={part.toolCall.params}
                    isActive={part.toolCall.isActive}
                    result={part.toolCall.result}
                  />
                ) : null;
              case 'diff':
                return part.diff ? (
                  <DiffView key={i} before={part.diff.before} after={part.diff.after} />
                ) : null;
              case 'approval-request':
                return part.approval ? (
                  <ApprovalButtons
                    key={i}
                    description={part.approval.description}
                    status={part.approval.status}
                    onApprove={() => onApprove?.(part.approval!.id)}
                    onReject={() => onReject?.(part.approval!.id)}
                    disabled={approvalProcessing}
                  />
                ) : null;
              default:
                return null;
            }
          })}
          {isStreaming && parts.length > 0 && parts[parts.length - 1].type === 'text' && (
            <span className={styles.streamCursor} />
          )}
        </div>
      </div>
    );
  }

  // Legacy rendering for non-streaming messages
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
