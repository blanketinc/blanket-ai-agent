import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { onAuthChange, getIdToken, signOut, User } from '../lib/firebase';
import { sendMessage, ChatResponse } from '../lib/api';
import ChatMessage from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import ChatHistory from '../components/ChatHistory';
import styles from '../styles/Chat.module.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ tool: string; action: string; success: boolean }>;
  timestamp: number;
}

interface Conversation {
  id: string;
  preview: string;
  updatedAt: number;
}

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auth check
  useEffect(() => {
    const unsubscribe = onAuthChange((firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
      } else {
        router.replace('/login');
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [router]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(
    async (message: string) => {
      if (sending) return;

      const token = await getIdToken();
      if (!token) {
        router.replace('/login');
        return;
      }

      // Add user message immediately
      const userMsg: Message = {
        role: 'user',
        content: message,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setSending(true);

      try {
        const response: ChatResponse = await sendMessage(
          message,
          token,
          conversationId
        );

        if (response.success && response.result) {
          // Set conversation ID from first response
          if (!conversationId) {
            setConversationId(response.result.conversationId);

            // Add to conversation list
            setConversations((prev) => [
              {
                id: response.result!.conversationId,
                preview: message.slice(0, 50),
                updatedAt: Date.now(),
              },
              ...prev,
            ]);
          }

          // Add assistant response
          const assistantMsg: Message = {
            role: 'assistant',
            content: response.result.message,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        } else {
          // Show error as assistant message
          const errorMsg: Message = {
            role: 'assistant',
            content:
              response.error ||
              'Something went wrong. Please try again.',
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, errorMsg]);
        }
      } catch (err) {
        const errorMsg: Message = {
          role: 'assistant',
          content:
            'Unable to reach the server. Please check your connection and try again.',
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setSending(false);
      }
    },
    [sending, conversationId, router]
  );

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setConversationId(undefined);
    setSidebarOpen(false);
  }, []);

  const handleSelectConversation = useCallback(
    (id: string) => {
      // For now just switch — history loading can be added later
      setConversationId(id);
      setMessages([]);
      setSidebarOpen(false);
    },
    []
  );

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.replace('/login');
  }, [router]);

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner}>Loading...</div>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      {/* Sidebar */}
      <div
        className={`${styles.sidebarContainer} ${sidebarOpen ? styles.sidebarContainerOpen : ''}`}
      >
        <ChatHistory
          conversations={conversations}
          activeId={conversationId}
          onSelect={handleSelectConversation}
          onNew={handleNewChat}
        />
      </div>

      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div
          className={styles.overlay}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main chat area */}
      <div className={styles.main}>
        {/* Header */}
        <header className={styles.header}>
          <button
            className={styles.menuButton}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <h1 className={styles.headerTitle}>Blanket AI</h1>
          <div className={styles.headerRight}>
            <span className={styles.userEmail}>{user?.email}</span>
            <button onClick={handleSignOut} className={styles.signOutButton}>
              Sign Out
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className={styles.messagesContainer}>
          {messages.length === 0 && (
            <div className={styles.welcome}>
              <h2>Welcome to Blanket AI</h2>
              <p>
                I can help you manage templates, analyze performance, and
                answer food safety questions.
              </p>
              <div className={styles.suggestions}>
                <button
                  className={styles.suggestion}
                  onClick={() =>
                    handleSend(
                      'Show completion rates for all locations this week'
                    )
                  }
                >
                  Show completion rates this week
                </button>
                <button
                  className={styles.suggestion}
                  onClick={() =>
                    handleSend('List all bar opening checklists')
                  }
                >
                  List bar opening checklists
                </button>
                <button
                  className={styles.suggestion}
                  onClick={() =>
                    handleSend(
                      'What temperature should cooked chicken be held at?'
                    )
                  }
                >
                  Food safety: chicken holding temp
                </button>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <ChatMessage
              key={i}
              role={msg.role}
              content={msg.content}
              toolCalls={msg.toolCalls}
              timestamp={msg.timestamp}
            />
          ))}

          {sending && (
            <div className={styles.typingIndicator}>
              <span />
              <span />
              <span />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className={styles.inputContainer}>
          <ChatInput onSend={handleSend} disabled={sending} />
        </div>
      </div>
    </div>
  );
}
