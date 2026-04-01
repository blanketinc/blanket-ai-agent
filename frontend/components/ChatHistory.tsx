import { useState, useRef, useEffect } from 'react';
import styles from '../styles/Chat.module.css';

interface Conversation {
  id: string;
  title?: string;
  preview: string;
  updatedAt: number;
}

interface ChatHistoryProps {
  conversations: Conversation[];
  activeId?: string;
  loading?: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
}

export default function ChatHistory({
  conversations,
  activeId,
  loading,
  onSelect,
  onNew,
  onRename,
}: ChatHistoryProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) inputRef.current?.focus();
  }, [editingId]);

  function startRename(conv: Conversation, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditValue(conv.title || conv.preview);
  }

  function commitRename() {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  }

  function cancelRename() {
    setEditingId(null);
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <h2 className={styles.sidebarTitle}>Conversations</h2>
        <button onClick={onNew} className={styles.newChatButton}>
          + New
        </button>
      </div>

      <div className={styles.conversationList}>
        {loading && conversations.length === 0 && (
          <>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={styles.sidebarSkeleton}>
                <div className={styles.sidebarSkeletonTitle} />
                <div className={styles.sidebarSkeletonDate} />
              </div>
            ))}
          </>
        )}
        {!loading && conversations.length === 0 && (
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
            <div className={styles.conversationItemRow}>
              <div className={styles.conversationContent}>
                {editingId === conv.id ? (
                  <input
                    ref={inputRef}
                    className={styles.renameInput}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') cancelRename();
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className={styles.conversationPreview}>
                    {conv.title || conv.preview}
                  </span>
                )}
                <span className={styles.conversationDate}>
                  {formatDate(conv.updatedAt)}
                </span>
              </div>
              {editingId !== conv.id && (
                <span
                  className={styles.renameButton}
                  onClick={(e) => startRename(conv, e)}
                  role="button"
                  tabIndex={-1}
                  aria-label="Rename conversation"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </span>
              )}
            </div>
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
