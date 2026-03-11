import styles from '../styles/Chat.module.css';

interface Conversation {
  id: string;
  preview: string;
  updatedAt: number;
}

interface ChatHistoryProps {
  conversations: Conversation[];
  activeId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export default function ChatHistory({
  conversations,
  activeId,
  onSelect,
  onNew,
}: ChatHistoryProps) {
  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <h2 className={styles.sidebarTitle}>Conversations</h2>
        <button onClick={onNew} className={styles.newChatButton}>
          + New
        </button>
      </div>

      <div className={styles.conversationList}>
        {conversations.length === 0 && (
          <p className={styles.emptyState}>No conversations yet</p>
        )}
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`${styles.conversationItem} ${
              conv.id === activeId ? styles.conversationActive : ''
            }`}
          >
            <span className={styles.conversationPreview}>
              {conv.preview}
            </span>
            <span className={styles.conversationDate}>
              {formatDate(conv.updatedAt)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
  if (diffHours < 48) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
