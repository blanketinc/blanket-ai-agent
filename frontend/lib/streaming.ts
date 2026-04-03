/**
 * SSE Streaming Client
 *
 * Handles Server-Sent Events from the streaming chat endpoint.
 * Parses structured events and dispatches to callbacks.
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:5001/v2/ai-assistant';

export type SSEEventType =
  | 'thinking'
  | 'text'
  | 'tool-call'
  | 'tool-result'
  | 'approval-request'
  | 'question'
  | 'diff'
  | 'error'
  | 'done';

export interface StreamEvent {
  type: SSEEventType;
  data: any;
}

export interface ThinkingData {
  content: string;
}

export interface TextData {
  content: string;
}

export interface ToolCallData {
  id: string;
  tool: string;
  action: string;
  params: any;
  approved?: boolean;
}

export interface ToolResultData {
  id?: string;
  tool: string;
  success: boolean;
  result?: any;
  error?: string;
}

export interface ApprovalRequestData {
  id: string;
  tool: string;
  action: string;
  description: string;
  params: any;
  diff?: {
    before: any;
    after: any;
  };
}

export interface QuestionData {
  id: string;
  prompt: string;
  options: { label: string; value: string; description?: string }[];
  multiSelect: boolean;
}

export interface DiffData {
  before: any;
  after: any;
}

export interface DoneData {
  conversationId?: string;
  toolCalls?: number;
  pendingApproval?: string | null;
  partial?: boolean;
}

export interface StreamCallbacks {
  onThinking?: (data: ThinkingData) => void;
  onText?: (data: TextData) => void;
  onToolCall?: (data: ToolCallData) => void;
  onToolResult?: (data: ToolResultData) => void;
  onApprovalRequest?: (data: ApprovalRequestData) => void;
  onQuestion?: (data: QuestionData) => void;
  onDiff?: (data: DiffData) => void;
  onError?: (data: { message: string }) => void;
  onDone?: (data: DoneData) => void;
}

/**
 * Send a message via the streaming endpoint and process SSE events.
 */
export async function streamMessage(
  message: string,
  token: string,
  callbacks: StreamCallbacks,
  conversationId?: string
): Promise<void> {
  const response = await fetch(`${API_URL}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      message,
      ...(conversationId ? { conversationId } : {}),
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'Request failed');
    callbacks.onError?.({ message: err });
    callbacks.onDone?.({});
    return;
  }

  if (!response.body) {
    callbacks.onError?.({ message: 'No response body' });
    callbacks.onDone?.({});
    return;
  }

  await processSSEStream(response.body, callbacks);
}

/**
 * Send an approval decision and process the streaming result.
 */
export async function streamApproval(
  approvalId: string,
  approved: boolean,
  token: string,
  callbacks: StreamCallbacks
): Promise<void> {
  const response = await fetch(`${API_URL}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ approvalId, approved }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'Request failed');
    callbacks.onError?.({ message: err });
    callbacks.onDone?.({});
    return;
  }

  if (!response.body) {
    callbacks.onError?.({ message: 'No response body' });
    callbacks.onDone?.({});
    return;
  }

  await processSSEStream(response.body, callbacks);
}

/**
 * Process a ReadableStream of SSE events.
 */
async function processSSEStream(
  body: ReadableStream<Uint8Array>,
  callbacks: StreamCallbacks
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE messages (double newline separated)
      const messages = buffer.split('\n\n');
      buffer = messages.pop() || '';

      for (const msg of messages) {
        if (!msg.trim() || msg.startsWith(':')) continue;

        let eventType = '';
        let eventData = '';

        for (const line of msg.split('\n')) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6);
          }
        }

        if (!eventType || !eventData) continue;

        try {
          const parsed = JSON.parse(eventData);
          dispatchEvent(eventType as SSEEventType, parsed, callbacks);
        } catch (e) {
          // Skip malformed events
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function dispatchEvent(
  type: SSEEventType,
  data: any,
  callbacks: StreamCallbacks
): void {
  switch (type) {
    case 'thinking':
      callbacks.onThinking?.(data);
      break;
    case 'text':
      callbacks.onText?.(data);
      break;
    case 'tool-call':
      callbacks.onToolCall?.(data);
      break;
    case 'tool-result':
      callbacks.onToolResult?.(data);
      break;
    case 'approval-request':
      callbacks.onApprovalRequest?.(data);
      break;
    case 'question':
      callbacks.onQuestion?.(data);
      break;
    case 'diff':
      callbacks.onDiff?.(data);
      break;
    case 'error':
      callbacks.onError?.(data);
      break;
    case 'done':
      callbacks.onDone?.(data);
      break;
  }
}
