import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { onAuthChange, getIdToken, signOut, User } from '../lib/firebase';
import { sendMessage, ChatResponse } from '../lib/api';
import {
  streamMessage,
  streamApproval,
  StreamCallbacks,
  ApprovalRequestData,
} from '../lib/streaming';
import ChatMessage, { MessagePart } from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import ChatHistory from '../components/ChatHistory';
import styles from '../styles/Chat.module.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ tool: string; action: string; success: boolean }>;
  timestamp: number;
  /** Structured parts for streaming messages */
  parts?: MessagePart[];
  /** Whether this message is still streaming */
  isStreaming?: boolean;
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
  const [approvalProcessing, setApprovalProcessing] = useState(false);
  /** True until the first SSE event arrives — drives the typing indicator */
  const [waitingForResponse, setWaitingForResponse] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  /** Track the current pending approval ID */
  const pendingApprovalRef = useRef<string | null>(null);

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

  /**
   * Typewriter buffer: queues text and reveals it gradually.
   * targetTextRef holds the full text received so far;
   * a timer drips characters into the displayed message parts.
   */
  const targetTextRef = useRef('');
  const displayedLenRef = useRef(0);
  const typewriterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const CHARS_PER_TICK = 1; // characters to reveal per tick
  const TICK_MS = 20; // ~50 chars/sec, similar to ChatGPT

  const startTypewriter = useCallback(() => {
    if (typewriterTimerRef.current) return; // already running
    typewriterTimerRef.current = setInterval(() => {
      const target = targetTextRef.current;
      const displayed = displayedLenRef.current;
      if (displayed >= target.length) return; // caught up, keep timer alive for future chunks

      const nextLen = Math.min(displayed + CHARS_PER_TICK, target.length);
      const delta = target.slice(displayed, nextLen);
      displayedLenRef.current = nextLen;

      // Update the last text part in the message
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant' && last.isStreaming) {
          const parts = last.parts || [];
          const lastPart = parts[parts.length - 1];
          if (lastPart && lastPart.type === 'text') {
            lastPart.content = target.slice(0, nextLen);
          }
          last.content = target.slice(0, nextLen);
          last.parts = [...parts];
        }
        return [...updated];
      });
    }, TICK_MS);
  }, []);

  const stopTypewriter = useCallback(() => {
    if (typewriterTimerRef.current) {
      clearInterval(typewriterTimerRef.current);
      typewriterTimerRef.current = null;
    }
    // Flush any remaining text
    const target = targetTextRef.current;
    if (target && displayedLenRef.current < target.length) {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant') {
          const parts = last.parts || [];
          const lastPart = parts[parts.length - 1];
          if (lastPart && lastPart.type === 'text') {
            lastPart.content = target;
          }
          last.content = target;
          last.parts = [...parts];
        }
        return [...updated];
      });
      displayedLenRef.current = target.length;
    }
  }, []);

  /**
   * Helper: update the last assistant message's parts.
   */
  const appendPart = useCallback((part: MessagePart) => {
    // For text parts, feed the typewriter buffer instead of rendering immediately
    if (part.type === 'text' && part.content) {
      const isFirstText = targetTextRef.current.length === 0;
      targetTextRef.current += part.content;

      if (isFirstText) {
        // Create the text part placeholder in messages
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant' && last.isStreaming) {
            const parts = last.parts || [];
            parts.push({ type: 'text', content: '' });
            last.parts = [...parts];
          }
          return [...updated];
        });
      }
      startTypewriter();
      return;
    }

    // For non-text parts, flush typewriter first then append normally
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === 'assistant' && last.isStreaming) {
        const parts = last.parts || [];

        // Flush any buffered text before adding non-text part
        if (targetTextRef.current) {
          const lastPart = parts[parts.length - 1];
          if (lastPart && lastPart.type === 'text') {
            lastPart.content = targetTextRef.current;
            last.content = targetTextRef.current;
          }
          displayedLenRef.current = targetTextRef.current.length;
        }

        if (part.type === 'thinking') {
          const lastPart = parts[parts.length - 1];
          if (lastPart && lastPart.type === 'thinking') {
            lastPart.content = (lastPart.content || '') + (part.content || '');
          } else {
            parts.push(part);
          }
        } else {
          parts.push(part);
        }

        last.parts = [...parts];
      }
      return [...updated];
    });
  }, [startTypewriter]);

  /**
   * Helper: mark the last tool-call part as completed with result.
   */
  const resolveToolCall = useCallback((toolResultData: any) => {
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === 'assistant' && last.parts) {
        // Find the matching active tool-call part
        for (let i = last.parts.length - 1; i >= 0; i--) {
          const p = last.parts[i];
          if (p.type === 'tool-call' && p.toolCall?.isActive) {
            p.toolCall.isActive = false;
            p.toolCall.result = {
              success: toolResultData.success,
              result: toolResultData.result,
              error: toolResultData.error,
            };
            break;
          }
        }
      }
      return [...updated];
    });
  }, []);

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

      // Add streaming placeholder for assistant
      const assistantMsg: Message = {
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        parts: [],
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setSending(true);
      setWaitingForResponse(true);
      pendingApprovalRef.current = null;
      // Reset typewriter buffer for new message
      stopTypewriter();
      targetTextRef.current = '';
      displayedLenRef.current = 0;

      /** Hide typing indicator on first real event */
      const clearWaiting = () => setWaitingForResponse(false);

      const callbacks: StreamCallbacks = {
        onThinking: (data) => {
          clearWaiting();
          appendPart({ type: 'thinking', content: data.content });
        },
        onText: (data) => {
          clearWaiting();
          appendPart({ type: 'text', content: data.content });
        },
        onToolCall: (data) => {
          clearWaiting();
          appendPart({
            type: 'tool-call',
            toolCall: {
              id: data.id,
              tool: data.tool,
              action: data.action,
              params: data.params,
              isActive: true,
            },
          });
        },
        onToolResult: (data) => {
          resolveToolCall(data);
        },
        onApprovalRequest: (data: ApprovalRequestData) => {
          clearWaiting();
          pendingApprovalRef.current = data.id;
          appendPart({
            type: 'approval-request',
            approval: {
              id: data.id,
              description: data.description,
              status: 'pending',
            },
          });
        },
        onDiff: (data) => {
          clearWaiting();
          appendPart({
            type: 'diff',
            diff: data,
          });
        },
        onError: (data) => {
          clearWaiting();
          appendPart({ type: 'text', content: `Error: ${data.message}` });
        },
        onDone: (data) => {
          if (data.conversationId && !data.partial) {
            if (!conversationId) {
              setConversationId(data.conversationId);
              setConversations((prev) => [
                {
                  id: data.conversationId!,
                  preview: message.slice(0, 50),
                  updatedAt: Date.now(),
                },
                ...prev,
              ]);
            }
          }

          // Mark streaming as done (only on final done, not partial)
          if (!data.partial) {
            // Flush remaining typewriter text and stop timer
            stopTypewriter();
            targetTextRef.current = '';
            displayedLenRef.current = 0;

            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === 'assistant') {
                last.isStreaming = false;
              }
              return [...updated];
            });
            setSending(false);
          }
        },
      };

      try {
        await streamMessage(message, token, callbacks, conversationId);
      } catch (err) {
        setWaitingForResponse(false);
        appendPart({
          type: 'text',
          content: 'Unable to reach the server. Please check your connection and try again.',
        });
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            last.isStreaming = false;
          }
          return [...updated];
        });
        setSending(false);
      }
    },
    [sending, conversationId, router, appendPart, resolveToolCall, stopTypewriter]
  );

  /**
   * Handle approval/rejection of a pending action.
   */
  const handleApproval = useCallback(
    async (approvalId: string, approved: boolean) => {
      const token = await getIdToken();
      if (!token) return;

      setApprovalProcessing(true);

      // Update the approval status in the message parts
      setMessages((prev) => {
        const updated = [...prev];
        for (const msg of updated) {
          if (msg.parts) {
            for (const part of msg.parts) {
              if (part.type === 'approval-request' && part.approval?.id === approvalId) {
                part.approval.status = approved ? 'approved' : 'rejected';
              }
            }
          }
        }
        return [...updated];
      });

      // Add a new streaming assistant message for the approval result
      const resultMsg: Message = {
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        parts: [],
        isStreaming: true,
      };
      setMessages((prev) => [...prev, resultMsg]);

      const callbacks: StreamCallbacks = {
        onThinking: (data) => appendPart({ type: 'thinking', content: data.content }),
        onText: (data) => appendPart({ type: 'text', content: data.content }),
        onToolCall: (data) => {
          appendPart({
            type: 'tool-call',
            toolCall: {
              id: data.id,
              tool: data.tool,
              action: data.action,
              params: data.params,
              isActive: true,
            },
          });
        },
        onToolResult: (data) => resolveToolCall(data),
        onError: (data) => appendPart({ type: 'text', content: `Error: ${data.message}` }),
        onDone: () => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              last.isStreaming = false;
            }
            return [...updated];
          });
          setApprovalProcessing(false);
        },
      };

      try {
        await streamApproval(approvalId, approved, token, callbacks);
      } catch (err) {
        appendPart({ type: 'text', content: 'Failed to process approval.' });
        setApprovalProcessing(false);
      }
    },
    [appendPart, resolveToolCall]
  );

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setConversationId(undefined);
    setSidebarOpen(false);
    pendingApprovalRef.current = null;
  }, []);

  const handleSelectConversation = useCallback(
    (id: string) => {
      setConversationId(id);
      setMessages([]);
      setSidebarOpen(false);
      pendingApprovalRef.current = null;
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
          <span className={styles.headerBadge}>Agent</span>
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
              <h2>Blanket AI Agent</h2>
              <p>
                I autonomously manage your restaurant operations — templates,
                analytics, and food safety. Watch me think, explore, and act.
              </p>
              <div className={styles.suggestions}>
                <button
                  className={styles.suggestion}
                  onClick={() =>
                    handleSend(
                      'We just added a new seasonal salad to all locations. Which templates need updating?'
                    )
                  }
                >
                  New seasonal salad — update templates
                </button>
                <button
                  className={styles.suggestion}
                  onClick={() =>
                    handleSend('Which locations have compliance issues this week?')
                  }
                >
                  Find compliance issues
                </button>
                <button
                  className={styles.suggestion}
                  onClick={() =>
                    handleSend(
                      'Set up templates for our new Miami location based on our Phoenix setup'
                    )
                  }
                >
                  Set up new Miami location
                </button>
                <button
                  className={styles.suggestion}
                  onClick={() =>
                    handleSend(
                      'Add a temperature check task to all opening checklists'
                    )
                  }
                >
                  Add temp checks to opening lists
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
              parts={msg.parts}
              isStreaming={msg.isStreaming}
              onApprove={(id) => handleApproval(id, true)}
              onReject={(id) => handleApproval(id, false)}
              approvalProcessing={approvalProcessing}
            />
          ))}

          {/* Typing indicator — visible immediately while waiting for first SSE event */}
          {waitingForResponse && (
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
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className={styles.inputContainer}>
          <ChatInput onSend={handleSend} disabled={sending || approvalProcessing} />
        </div>
      </div>
    </div>
  );
}
