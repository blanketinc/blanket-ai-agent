import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { onAuthChange, getIdToken, signOut, User } from '../lib/firebase';
import { streamApproval, StreamCallbacks } from '../lib/streaming';
import ChatInput from '../components/ChatInput';
import ChatHistory from '../components/ChatHistory';
import ThinkingBlock from '../components/ThinkingBlock';
import ToolCallDisplay from '../components/ToolCallDisplay';
import DiffView from '../components/DiffView';
import ApprovalButtons from '../components/ApprovalButtons';
import ReactMarkdown from 'react-markdown';
import styles from '../styles/Chat.module.css';

interface Conversation {
  id: string;
  preview: string;
  updatedAt: number;
}

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [approvalProcessing, setApprovalProcessing] = useState(false);
  const [tokenRef, setTokenRef] = useState<string>('');
  const tokenValueRef = useRef<string>('');
  const conversationIdRef = useRef<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auth check
  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const t = await getIdToken();
        if (t) setTokenRef(t);
      } else {
        router.replace('/login');
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [router]);

  // Keep refs in sync for closure access
  tokenValueRef.current = tokenRef;
  conversationIdRef.current = conversationId;

  // Stable transport that reads latest values from refs
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        headers: () => ({
          Authorization: `Bearer ${tokenValueRef.current}`,
        }),
        body: () => ({
          conversationId: conversationIdRef.current,
        }),
      }),
    []
  );

  // Vercel AI SDK useChat hook
  const {
    messages,
    sendMessage,
    status,
    setMessages: setChatMessages,
  } = useChat({
    transport,
    onError: (error) => {
      console.error('Chat error:', error);
    },
    onFinish: (message) => {
      // Extract conversationId from data-conversation parts
      const convPart = message.parts?.find(
        (p: any) => p.type === 'data-conversation'
      ) as any;
      if (convPart?.data?.conversationId && !convPart.data.partial) {
        setConversationId(convPart.data.conversationId);
      }
    },
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  // Refresh token periodically
  useEffect(() => {
    const interval = setInterval(async () => {
      const t = await getIdToken();
      if (t) setTokenRef(t);
    }, 5 * 60 * 1000); // every 5 min
    return () => clearInterval(interval);
  }, []);

  const handleSend = useCallback(
    async (message: string) => {
      if (isStreaming) return;

      // Refresh token before sending
      const t = await getIdToken();
      if (!t) {
        router.replace('/login');
        return;
      }
      setTokenRef(t);

      sendMessage({ text: message });
    },
    [isStreaming, router, sendMessage]
  );

  /**
   * Handle approval/rejection — uses our custom streaming
   * since the approval endpoint is separate from the chat flow.
   * Captures response and appends it to the AI SDK messages.
   */
  const handleApproval = useCallback(
    async (approvalId: string, approved: boolean) => {
      const token = await getIdToken();
      if (!token) return;
      setApprovalProcessing(true);

      let responseText = '';
      let thinkingText = '';

      const callbacks: StreamCallbacks = {
        onText: (data) => {
          responseText += data.content || '';
        },
        onThinking: (data) => {
          thinkingText += data.content || '';
        },
        onToolResult: (data) => {
          if (data.error) {
            responseText += `\n⚠️ Error: ${data.error}`;
          }
        },
        onError: (data) => {
          responseText += `\n❌ ${data.message || 'Approval failed'}`;
          setApprovalProcessing(false);
        },
        onDone: (data) => {
          setApprovalProcessing(false);
          // Capture conversationId from approval response
          if (data?.conversationId) {
            setConversationId(data.conversationId);
          }
          // Append the approval result as a new assistant message in the chat
          const parts: any[] = [];
          if (thinkingText) {
            parts.push({ type: 'reasoning', text: thinkingText, state: 'done' });
          }
          if (responseText) {
            parts.push({ type: 'text', text: responseText, state: 'done' });
          } else {
            parts.push({
              type: 'text',
              text: approved
                ? '✅ Action approved and executed.'
                : '❌ Action was rejected.',
              state: 'done',
            });
          }
          setChatMessages((prev: any[]) => [
            ...prev,
            {
              id: `approval-${Date.now()}`,
              role: 'assistant',
              parts,
            },
          ]);
        },
      };

      try {
        await streamApproval(approvalId, approved, token, callbacks);
      } catch {
        setApprovalProcessing(false);
        setChatMessages((prev: any[]) => [
          ...prev,
          {
            id: `approval-err-${Date.now()}`,
            role: 'assistant',
            parts: [{ type: 'text', text: '❌ Failed to process approval. Please try again.', state: 'done' }],
          },
        ]);
      }
    },
    [setChatMessages]
  );

  const handleNewChat = useCallback(() => {
    setChatMessages([]);
    setConversationId(undefined);
    setSidebarOpen(false);
  }, [setChatMessages]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      setConversationId(id);
      setChatMessages([]);
      setSidebarOpen(false);
    },
    [setChatMessages]
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

      {sidebarOpen && (
        <div
          className={styles.overlay}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main chat area */}
      <div className={styles.main}>
        <header className={styles.header}>
          <button
            className={styles.menuButton}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

        <div className={styles.messagesContainer}>
          {messages.length === 0 && (
            <div className={styles.welcome}>
              <h2>Blanket AI Agent</h2>
              <p>
                I autonomously manage your restaurant operations — templates,
                analytics, and food safety. Watch me think, explore, and act.
              </p>
              <div className={styles.suggestions}>
                <button className={styles.suggestion} onClick={() => handleSend('We just added a new seasonal salad to all locations. Which templates need updating?')}>
                  New seasonal salad — update templates
                </button>
                <button className={styles.suggestion} onClick={() => handleSend('Which locations have compliance issues this week?')}>
                  Find compliance issues
                </button>
                <button className={styles.suggestion} onClick={() => handleSend('Set up templates for our new Miami location based on our Phoenix setup')}>
                  Set up new Miami location
                </button>
                <button className={styles.suggestion} onClick={() => handleSend('Add a temperature check task to all opening checklists')}>
                  Add temp checks to opening lists
                </button>
              </div>
            </div>
          )}

          {messages.map((msg, msgIdx) => {
            const isUser = msg.role === 'user';
            const isLastAssistant =
              msg.role === 'assistant' && msgIdx === messages.length - 1;

            if (isUser) {
              return (
                <div key={msg.id} className={`${styles.message} ${styles.userMessage}`}>
                  <div className={styles.messageAvatar}>
                    <div className={styles.userAvatar}>You</div>
                  </div>
                  <div className={styles.messageContent}>
                    <p>{msg.parts?.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('') || ''}</p>
                  </div>
                </div>
              );
            }

            // Assistant message — render parts from AI SDK
            return (
              <div key={msg.id} className={`${styles.message} ${styles.assistantMessage}`}>
                <div className={styles.messageAvatar}>
                  <div className={styles.aiAvatar}>AI</div>
                </div>
                <div className={styles.messageContent}>
                  {msg.parts?.map((part: any, i: number) => {
                    switch (part.type) {
                      case 'reasoning':
                        return (
                          <ThinkingBlock
                            key={i}
                            content={part.text || ''}
                            isActive={isLastAssistant && isStreaming}
                          />
                        );

                      case 'text':
                        return (
                          <div key={i} className={styles.streamedText}>
                            <ReactMarkdown>{part.text || ''}</ReactMarkdown>
                            {isLastAssistant && isStreaming && (
                              <span className={styles.streamCursor} />
                            )}
                          </div>
                        );

                      case 'tool-invocation': {
                        const toolInvocation = part.toolInvocation;
                        const hasResult = toolInvocation.state === 'result';
                        return (
                          <ToolCallDisplay
                            key={i}
                            tool={toolInvocation.toolName}
                            action={toolInvocation.input?.action || ''}
                            params={toolInvocation.input?.params}
                            isActive={!hasResult && isLastAssistant && isStreaming}
                            result={
                              hasResult
                                ? {
                                    success: toolInvocation.output?.success ?? true,
                                    result: toolInvocation.output?.result,
                                    error: toolInvocation.output?.error,
                                  }
                                : undefined
                            }
                          />
                        );
                      }

                      // Custom data parts from our proxy
                      case 'data-approval-request':
                        return (
                          <ApprovalButtons
                            key={i}
                            description={part.data?.description || ''}
                            status={part.data?.status}
                            onApprove={() => handleApproval(part.data?.id, true)}
                            onReject={() => handleApproval(part.data?.id, false)}
                            disabled={approvalProcessing}
                          />
                        );

                      case 'data-diff':
                        return part.data ? (
                          <DiffView
                            key={i}
                            before={part.data.before}
                            after={part.data.after}
                          />
                        ) : null;

                      default:
                        return null;
                    }
                  })}
                </div>
              </div>
            );
          })}

          {/* Typing indicator */}
          {status === 'submitted' && (
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

        <div className={styles.inputContainer}>
          <ChatInput onSend={handleSend} disabled={isStreaming || approvalProcessing} />
        </div>
      </div>
    </div>
  );
}
