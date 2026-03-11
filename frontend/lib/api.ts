/**
 * Chat API Client
 *
 * Communicates with the Blanket AI Agent backend.
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:5001/v2/ai-assistant';

export interface ChatResponse {
  success: boolean;
  result?: {
    message: string;
    conversationId: string;
    toolCalls?: number;
  };
  error?: string;
}

export interface HistoryResponse {
  success: boolean;
  result?: {
    conversationId: string;
    messages: Array<{
      role: 'user' | 'assistant';
      content: string;
      timestamp: number;
      toolCalls?: Array<{
        tool: string;
        action: string;
        success: boolean;
      }>;
    }>;
  };
  error?: string;
}

export async function sendMessage(
  message: string,
  token: string,
  conversationId?: string
): Promise<ChatResponse> {
  const response = await fetch(`${API_URL}/chat`, {
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
    const data = await response.json().catch(() => ({}));
    return {
      success: false,
      error: data.error || `Request failed (${response.status})`,
    };
  }

  return response.json();
}

export async function getHistory(
  conversationId: string,
  token: string
): Promise<HistoryResponse> {
  const response = await fetch(
    `${API_URL}/history?conversationId=${encodeURIComponent(conversationId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    return {
      success: false,
      error: data.error || `Request failed (${response.status})`,
    };
  }

  return response.json();
}
