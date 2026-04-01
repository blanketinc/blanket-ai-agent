/**
 * Next.js API route that proxies to the Firebase Cloud Function
 * and translates our custom SSE events into the Vercel AI SDK
 * UI Message Stream protocol.
 *
 * This gives us token-by-token streaming on the frontend via useChat.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
} from 'ai';

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:5001/v2/ai-assistant';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  const { messages, conversationId } = req.body;
  const authHeader = req.headers.authorization || '';

  // Extract the last user message — AI SDK v6 uses parts[], not content
  const lastMessage = messages?.[messages.length - 1];
  let userMessage = '';
  if (lastMessage?.parts) {
    // v6 UIMessage format: parts array with { type: 'text', text: '...' }
    userMessage = lastMessage.parts
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.text)
      .join('');
  } else if (lastMessage?.content) {
    // Fallback for older format
    userMessage = lastMessage.content;
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      let textId = 'text_0';
      let textStarted = false;
      let reasoningId = 'reasoning_0';
      let reasoningStarted = false;
      let textCounter = 0;
      let reasoningCounter = 0;
      // Track analytics tool calls so we can emit chart data parts
      const analyticsToolCalls = new Map<string, string>(); // toolCallId -> queryType

      try {
        const upstream = await fetch(`${BACKEND_URL}/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
          },
          body: JSON.stringify({
            message: userMessage,
            ...(conversationId ? { conversationId } : {}),
          }),
        });

        if (!upstream.ok || !upstream.body) {
          writer.write({
            type: 'error',
            errorText: `Backend returned ${upstream.status}`,
          });
          return;
        }

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() || '';

          for (const chunk of chunks) {
            if (!chunk.trim() || chunk.startsWith(':')) continue;

            let eventType = '';
            let eventData = '';
            for (const line of chunk.split('\n')) {
              if (line.startsWith('event: '))
                eventType = line.slice(7).trim();
              if (line.startsWith('data: ')) eventData = line.slice(6);
            }
            if (!eventType || !eventData) continue;

            let parsed: any;
            try {
              parsed = JSON.parse(eventData);
            } catch {
              continue;
            }

            console.log('[proxy]', eventType, eventType === 'tool-call' ? parsed.id : '', eventType === 'tool-result' ? parsed.id : '');

            switch (eventType) {
              case 'thinking': {
                // Close text block if open
                if (textStarted) {
                  writer.write({ type: 'text-end', id: textId });
                  textStarted = false;
                }
                if (!reasoningStarted) {
                  writer.write({
                    type: 'reasoning-start',
                    id: reasoningId,
                  });
                  reasoningStarted = true;
                }
                writer.write({
                  type: 'reasoning-delta',
                  id: reasoningId,
                  delta: parsed.content || '',
                });
                break;
              }

              case 'text': {
                // Close reasoning block if open
                if (reasoningStarted) {
                  writer.write({
                    type: 'reasoning-end',
                    id: reasoningId,
                  });
                  reasoningStarted = false;
                  reasoningCounter++;
                  reasoningId = `reasoning_${reasoningCounter}`;
                }
                if (!textStarted) {
                  textCounter++;
                  textId = `text_${textCounter}`;
                  writer.write({ type: 'text-start', id: textId });
                  textStarted = true;
                }
                writer.write({
                  type: 'text-delta',
                  id: textId,
                  delta: parsed.content || '',
                });
                break;
              }

              case 'tool-call': {
                // Close open blocks
                if (textStarted) {
                  writer.write({ type: 'text-end', id: textId });
                  textStarted = false;
                }
                if (reasoningStarted) {
                  writer.write({
                    type: 'reasoning-end',
                    id: reasoningId,
                  });
                  reasoningStarted = false;
                  reasoningCounter++;
                  reasoningId = `reasoning_${reasoningCounter}`;
                }
                // Track analytics tool calls for chart rendering
                if (parsed.tool === 'blanket-analytics') {
                  analyticsToolCalls.set(parsed.id, parsed.params?.query || parsed.action || '');
                }
                writer.write({
                  type: 'tool-input-start',
                  toolCallId: parsed.id,
                  toolName: parsed.tool,
                });
                writer.write({
                  type: 'tool-input-available',
                  toolCallId: parsed.id,
                  toolName: parsed.tool,
                  input: {
                    action: parsed.action,
                    params: parsed.params,
                  },
                });
                break;
              }

              case 'tool-result': {
                const resultId = parsed.id || `tool_${Date.now()}`;
                writer.write({
                  type: 'tool-output-available',
                  toolCallId: resultId,
                  output: {
                    success: parsed.success,
                    result: parsed.result,
                    error: parsed.error,
                  },
                });
                // Emit analytics chart data as a custom part
                const queryType = analyticsToolCalls.get(resultId);
                if (queryType && parsed.success && parsed.result) {
                  writer.write({
                    type: 'data-analytics' as any,
                    id: `chart_${resultId}`,
                    data: {
                      queryType,
                      result: parsed.result,
                    },
                  });
                }
                break;
              }

              case 'approval-request': {
                if (textStarted) {
                  writer.write({ type: 'text-end', id: textId });
                  textStarted = false;
                }
                writer.write({
                  type: 'data-approval-request' as any,
                  id: parsed.id,
                  data: {
                    id: parsed.id,
                    tool: parsed.tool,
                    action: parsed.action,
                    description: parsed.description,
                    params: parsed.params,
                    status: 'pending',
                  },
                });
                break;
              }

              case 'question': {
                if (textStarted) {
                  writer.write({ type: 'text-end', id: textId });
                  textStarted = false;
                }
                writer.write({
                  type: 'data-question' as any,
                  id: parsed.id,
                  data: {
                    id: parsed.id,
                    prompt: parsed.prompt,
                    options: parsed.options,
                    multiSelect: parsed.multiSelect,
                  },
                });
                break;
              }

              case 'diff': {
                writer.write({
                  type: 'data-diff' as any,
                  id: `diff_${Date.now()}`,
                  data: parsed,
                });
                break;
              }

              case 'error': {
                writer.write({
                  type: 'error',
                  errorText: parsed.message || 'Unknown error',
                });
                break;
              }

              case 'done': {
                // Close any open blocks
                if (textStarted) {
                  writer.write({ type: 'text-end', id: textId });
                  textStarted = false;
                }
                if (reasoningStarted) {
                  writer.write({
                    type: 'reasoning-end',
                    id: reasoningId,
                  });
                  reasoningStarted = false;
                }
                // Store conversationId as custom data
                if (parsed.conversationId) {
                  writer.write({
                    type: 'data-conversation' as any,
                    id: 'conv',
                    data: {
                      conversationId: parsed.conversationId,
                      partial: parsed.partial || false,
                    },
                  });
                }
                break;
              }
            }
          }
        }

        // Close any remaining open blocks
        if (textStarted) writer.write({ type: 'text-end', id: textId });
        if (reasoningStarted)
          writer.write({ type: 'reasoning-end', id: reasoningId });
      } catch (err: any) {
        writer.write({
          type: 'error',
          errorText: err?.message || 'Failed to connect to backend',
        });
      }
    },
  });

  pipeUIMessageStreamToResponse({ stream, response: res });
}
