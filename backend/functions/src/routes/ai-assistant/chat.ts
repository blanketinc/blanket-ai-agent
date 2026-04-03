/**
 * AI Assistant Chat Endpoint
 *
 * POST /v2/ai-assistant/chat — Original JSON endpoint (preserved for compatibility)
 * POST /v2/ai-assistant/chat/stream — SSE streaming endpoint with agentic UX
 * POST /v2/ai-assistant/approve — Execute or reject a pending approval
 *
 * Handles conversational AI with Gemini function calling + MCP tools.
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as admin from 'firebase-admin';
import { authMiddleware } from '../../middleware/auth.middleware';
import { genAI } from '../../core/ai-core';
import { MCPServer } from '../../libs/mcp-server';
import {
  MCPAuthContext,
  MCPToolCallRecord,
  SSEEvent,
  ApprovalRequest,
  AgentQuestion,
  MUTATING_ACTIONS,
} from '../../libs/mcp-types';
import {
  getConversation,
  appendMessages,
  toGeminiHistory,
  buildMessage,
  listConversations,
  updateConversationTitle,
} from '../../libs/conversation';
import { blanketAPITool } from '../../mcp-tools/blanket-api';
import { analyticsTool } from '../../mcp-tools/analytics';
import { marcoPolloTool } from '../../mcp-tools/marco-pollo';

const router = express.Router();

// Initialize MCP server with all tools
const mcpServer = new MCPServer({
  tools: [blanketAPITool, analyticsTool, marcoPolloTool],
});

// Max tool-call rounds to prevent infinite loops
const MAX_TOOL_ROUNDS = 5;

// Pending approvals stored in Firestore (collection: ai_pending_approvals)
const APPROVALS_COLLECTION = 'ai_pending_approvals';

/**
 * System prompt for the AI assistant.
 * Provides context about the user and available capabilities.
 */
function getSystemPrompt(authContext: MCPAuthContext): string {
  return `You are the Blanket AI Assistant — an autonomous operations manager for restaurants.

You help Blanket power users with:
1. **List Template Management** — Create, update, and manage operational checklists (listTemplates) using the blanket-api tool.
2. **Analytics & Insights** — Query completion rates, failure analysis, performance trends, and location comparisons using the blanket-analytics tool.
3. **Food Safety Expertise** — Answer food safety questions about FDA regulations, temperatures, holding times, HACCP, and more using the marco-pollo tool.

## Current User Context
- User ID: ${authContext.userId}
- Organization: ${authContext.orgId}
- Accessible Locations: ${authContext.locationIds.length > 0 ? authContext.locationIds.join(', ') : 'All'}

## Thinking Out Loud
You MUST think step-by-step before acting. Wrap your reasoning in <think>...</think> tags. This is shown to the user as a "thinking" indicator. Examples:
- <think>The user wants to add a temperature check to all opening checklists. Let me first find all templates that match "opening" to see what we're working with.</think>
- <think>I found 5 templates. Let me check which ones already have temperature checks before suggesting changes.</think>

## Interactive Questions — MANDATORY
You MUST use <question> tags for ALL of these situations. NEVER ask yes/no or multiple-choice questions as plain text:
1. **Confirmations** — "Do you approve?", "Should I proceed?", "Do you want to continue?"
2. **Choosing between options** — "Which template?", "Which location?"
3. **Yes/No decisions** — Any time you need a yes or no answer

The user sees interactive clickable buttons. Plain text questions like "Do you approve this change?" are broken UX — always use <question> instead.

Format:
<question prompt="Which template do you want to update?" multiSelect="false">
  <option value="template-uuid-1" description="Opens daily at 6am">Morning Opening Checklist</option>
  <option value="template-uuid-2" description="Closes nightly at 10pm">Evening Closing Checklist</option>
</question>

For confirmations, use this pattern:
<question prompt="Update all 11 tasks in 'A 1New List Copy' from 2 points to 3 points?" multiSelect="false">
  <option value="yes">Yes, make the change</option>
  <option value="no">No, cancel</option>
</question>

- Use multiSelect="true" when the user can pick multiple options (e.g., "Which locations should this apply to?")
- Use multiSelect="false" (default) for single-choice and yes/no questions
- Always include a description when it helps the user decide
- NEVER write "Do you approve?", "Shall I proceed?", or similar as plain text — always use <question> tags
- NEVER use numbered lists for choices — always use <question> tags

## Important Rules
- You can ONLY access data for the user's organization (${authContext.orgId}).
- NEVER include deleted data in any response. All queries and API calls must filter out records where isDeleted=true. If a tool returns deleted records, exclude them from your response.
- NEVER show internal IDs (UUIDs, database IDs, etc.) to the user. Always display human-readable names instead. Use IDs internally for tool calls, but only show names, titles, and labels in your responses.
- **CRITICAL: Template IDs are UUIDs, not names.** When the user refers to a template by name, you MUST first call list_templates or get_template to resolve the name to its UUID. NEVER pass a template name as the templateId parameter — it will fail. Always look up the ID first.
- For analytics queries, default to the last 7 days if no date range is specified.
- When modifying templates, describe what you plan to change, then use a <question> tag to ask for approval before executing.
- When showing analytics results, format data in clear tables when possible.
- If a tool call fails, explain the error in plain language and suggest alternatives. If a mutating action fails, automatically retry with corrected parameters instead of giving up.
- Be concise but thorough. Restaurant managers are busy.
- When you need more information, ask a clarifying question using <question> tags before proceeding.
- For multi-step operations, explain your plan first, then execute step by step.`;
}

/**
 * Send an SSE event to the client.
 */
function sendSSE(res: express.Response, event: SSEEvent): void {
  res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
}

/**
 * Parse <think>...</think> blocks from text and stream them as thinking events.
 * Returns the remaining text with think blocks removed.
 */
function extractAndStreamThinking(
  text: string,
  res: express.Response
): string {
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  let match;
  while ((match = thinkRegex.exec(text)) !== null) {
    sendSSE(res, {
      type: 'thinking',
      data: { content: match[1].trim() },
    });
  }
  return text.replace(thinkRegex, '').trim();
}

/**
 * Parse <question>...</question> blocks from text and stream them as question events.
 * Format: <question prompt="..." multiSelect="false">
 *   <option value="val1" description="optional desc">Label 1</option>
 *   <option value="val2">Label 2</option>
 * </question>
 * Returns the remaining text with question blocks removed.
 */
function extractAndStreamQuestions(
  text: string,
  res: express.Response
): string {
  const questionRegex = /<question\s+prompt="([^"]*)"(?:\s+multiSelect="(true|false)")?\s*>([\s\S]*?)<\/question>/g;
  const optionRegex = /<option\s+value="([^"]*)"(?:\s+description="([^"]*)")?\s*>([\s\S]*?)<\/option>/g;

  let match;
  while ((match = questionRegex.exec(text)) !== null) {
    const prompt = match[1];
    const multiSelect = match[2] === 'true';
    const optionsBlock = match[3];

    const options: { label: string; value: string; description?: string }[] = [];
    let optMatch;
    while ((optMatch = optionRegex.exec(optionsBlock)) !== null) {
      options.push({
        value: optMatch[1],
        description: optMatch[2] || undefined,
        label: optMatch[3].trim(),
      });
    }

    if (options.length > 0) {
      const question: AgentQuestion = {
        id: `q-${uuidv4().slice(0, 8)}`,
        prompt,
        options,
        multiSelect,
      };
      sendSSE(res, { type: 'question', data: question });
    }
  }

  return text.replace(questionRegex, '').trim();
}

/**
 * Check if a tool call is a mutating action that requires approval.
 */
function isMutatingAction(toolName: string, args: any): boolean {
  if (toolName === 'blanket-api' && args?.action) {
    return MUTATING_ACTIONS.includes(args.action);
  }
  return false;
}

/**
 * Generate a human-readable description for a mutating tool call.
 */
function describeAction(toolName: string, args: any): string {
  if (toolName !== 'blanket-api') return `Execute ${toolName}`;

  const action = args?.action;
  const params = args?.params || {};

  switch (action) {
    case 'update_template':
      return `Update template "${params.templateId || 'unknown'}" — changes: ${JSON.stringify(params.updates || {}).slice(0, 200)}`;
    case 'add_task_to_template':
      return `Add task "${params.task?.name || 'unnamed'}" (${params.task?.type || 'checkMark'}) to template "${params.templateId || 'unknown'}"`;
    case 'create_template':
      return `Create new template "${params.name || 'unnamed'}" with ${(params.tasks || []).length} tasks`;
    default:
      return `Execute ${action}`;
  }
}

/**
 * POST /chat (original endpoint — preserved for backward compatibility)
 */
router.post('/chat', authMiddleware, async (req: any, res) => {
  try {
    const { message, conversationId } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required',
      });
    }

    // Build auth context for MCP tools
    const authContext: MCPAuthContext = {
      userId: req.auth.authId,
      orgId: req.auth.orgId,
      locationIds: req.auth.locationIds,
      token: req.auth.token,
    };

    // Load or create conversation
    const conversation = await getConversation(
      conversationId,
      authContext.userId,
      authContext.orgId
    );

    // Build Gemini content from conversation history
    const history = toGeminiHistory(conversation.messages);

    // Gemini tool definitions
    const tools = [
      {
        functionDeclarations: mcpServer.getToolDefinitions(),
      },
    ];

    // Initial Gemini call
    let response = await genAI.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        ...history,
        { role: 'user', parts: [{ text: message }] },
      ],
      config: {
        systemInstruction: getSystemPrompt(authContext),
        tools,
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    });

    // Tool calling loop — Gemini may request multiple rounds
    const allToolCallRecords: MCPToolCallRecord[] = [];
    let rounds = 0;

    // Build up the full contents array for multi-turn tool calling
    const contents: any[] = [
      ...history,
      { role: 'user', parts: [{ text: message }] },
    ];

    while (rounds < MAX_TOOL_ROUNDS) {
      const candidate = response.candidates?.[0];
      if (!candidate?.content?.parts) break;

      // Check if Gemini is requesting function calls
      const functionCalls = candidate.content.parts.filter(
        (p: any) => p.functionCall
      );

      if (functionCalls.length === 0) break;

      // Add model's response (with function calls) to contents
      contents.push({
        role: 'model',
        parts: candidate.content.parts,
      });

      // Execute all requested tool calls via MCP
      const toolResults = await Promise.all(
        functionCalls.map(async (part: any) => {
          const { name, args } = part.functionCall;
          const result = await mcpServer.execute(
            { name, parameters: args },
            authContext
          );

          // Record for audit trail
          allToolCallRecords.push({
            tool: name,
            action: args?.action || args?.query || 'execute',
            params: args || {},
            success: result.success,
          });

          return {
            functionResponse: {
              name,
              response: result,
            },
          };
        })
      );

      // Send tool results back to Gemini
      contents.push({
        role: 'user',
        parts: toolResults,
      });

      response = await genAI.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents,
        config: {
          systemInstruction: getSystemPrompt(authContext),
          tools,
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      });

      rounds++;
    }

    // Extract final text response and strip <think> blocks
    const rawFinalText =
      response.candidates?.[0]?.content?.parts
        ?.filter((p: any) => p.text)
        .map((p: any) => p.text)
        .join('') ||
      response.text ||
      'I was unable to generate a response. Please try again.';
    const finalText = rawFinalText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    // Persist messages to Firestore
    const userMsg = buildMessage('user', message);
    const assistantMsg = buildMessage(
      'assistant',
      finalText,
      allToolCallRecords.length > 0 ? allToolCallRecords : undefined
    );
    await appendMessages(conversation.id, [userMsg, assistantMsg]);

    return res.json({
      success: true,
      result: {
        message: finalText,
        conversationId: conversation.id,
        ...(allToolCallRecords.length > 0 && {
          toolCalls: allToolCallRecords.length,
        }),
      },
    });
  } catch (error: any) {
    console.error('AI chat error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process message. Please try again.',
    });
  }
});

/**
 * POST /chat/stream
 *
 * SSE streaming endpoint for the agentic chat experience.
 * Streams structured events as the agent thinks, calls tools, and responds.
 *
 * Body: { message: string, conversationId?: string }
 *
 * SSE Events:
 *   thinking       — Agent reasoning step
 *   text           — Response text chunk
 *   tool-call      — Agent is calling a tool
 *   tool-result    — Tool execution result
 *   approval-request — Agent needs approval for a mutating action
 *   diff           — Before/after preview for template changes
 *   error          — Error occurred
 *   done           — Stream complete
 */
router.post('/chat/stream', authMiddleware, async (req: any, res) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send initial keepalive
  res.write(':ok\n\n');

  try {
    const { message, conversationId } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      sendSSE(res, { type: 'error', data: { message: 'Message is required' } });
      sendSSE(res, { type: 'done', data: {} });
      res.end();
      return;
    }

    const authContext: MCPAuthContext = {
      userId: req.auth.authId,
      orgId: req.auth.orgId,
      locationIds: req.auth.locationIds,
      token: req.auth.token,
    };

    const conversation = await getConversation(
      conversationId,
      authContext.userId,
      authContext.orgId
    );

    // Stream the conversation ID immediately
    sendSSE(res, {
      type: 'done',
      data: { conversationId: conversation.id, partial: true },
    });

    const history = toGeminiHistory(conversation.messages);
    const tools = [{ functionDeclarations: mcpServer.getToolDefinitions() }];
    const allToolCallRecords: MCPToolCallRecord[] = [];
    let fullResponseText = '';

    // Build up contents for multi-turn
    const contents: any[] = [
      ...history,
      { role: 'user', parts: [{ text: message }] },
    ];

    // --- Agentic Loop ---
    let rounds = 0;
    let pendingApproval: ApprovalRequest | null = null;

    while (rounds <= MAX_TOOL_ROUNDS) {
      // Use streaming for Gemini calls
      const streamResponse = await genAI.models.generateContentStream({
        model: 'gemini-3.1-pro-preview',
        contents,
        config: {
          systemInstruction: getSystemPrompt(authContext),
          tools,
          temperature: 0.7,
          maxOutputTokens: 4096,
        },
      });

      // Collect the full response while streaming text token-by-token
      let accumulatedText = '';
      let streamedTextLength = 0; // tracks how much text we've already sent
      const responseParts: any[] = [];
      const functionCallParts: any[] = [];

      for await (const chunk of streamResponse) {
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (!parts) continue;

        for (const part of parts) {
          if (part.text) {
            accumulatedText += part.text;
            responseParts.push(part);
          } else if (part.functionCall) {
            functionCallParts.push(part);
            responseParts.push(part);
          }
        }

        // Stream text deltas as they arrive — extract thinking blocks
        if (accumulatedText) {
          const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
          let thinkMatch;
          let lastIndex = 0;
          let cleanText = '';

          // Process complete think blocks
          while ((thinkMatch = thinkRegex.exec(accumulatedText)) !== null) {
            const before = accumulatedText.slice(lastIndex, thinkMatch.index);
            if (before.trim()) cleanText += before;
            sendSSE(res, {
              type: 'thinking',
              data: { content: thinkMatch[1].trim() },
            });
            lastIndex = thinkRegex.lastIndex;
          }

          const remaining = accumulatedText.slice(lastIndex);

          // Only stream text that doesn't contain a partial <think> or <question tag
          if (!remaining.includes('<think') && !remaining.includes('<question')) {
            cleanText += remaining;
            // Extract any complete <question> blocks before sending text
            cleanText = extractAndStreamQuestions(cleanText, res);
            // Only send the NEW text since last SSE (delta)
            const delta = cleanText.slice(streamedTextLength);
            if (delta) {
              sendSSE(res, { type: 'text', data: { content: delta } });
              fullResponseText += delta;
              streamedTextLength = cleanText.length;
            }
            accumulatedText = '';
            streamedTextLength = 0;
          }
        }
      }

      // Handle any remaining text that wasn't streamed
      if (accumulatedText.trim()) {
        let cleaned = extractAndStreamThinking(accumulatedText, res);
        cleaned = extractAndStreamQuestions(cleaned, res);
        if (cleaned) {
          sendSSE(res, { type: 'text', data: { content: cleaned } });
          fullResponseText += cleaned;
        }
      }

      // If no function calls, we're done
      if (functionCallParts.length === 0) break;

      // Add model's response to contents
      contents.push({ role: 'model', parts: responseParts });

      // Process function calls
      const toolResultParts: any[] = [];

      for (const part of functionCallParts) {
        const { name, args } = part.functionCall;
        const toolCallId = `tc-${uuidv4().slice(0, 8)}`;

        // Stream tool-call event
        sendSSE(res, {
          type: 'tool-call',
          data: {
            id: toolCallId,
            tool: name,
            action: args?.action || args?.query || 'execute',
            params: args,
          },
        });

        // Check if this is a mutating action that needs approval
        if (isMutatingAction(name, args)) {
          const approvalId = `apr-${uuidv4().slice(0, 8)}`;
          const description = describeAction(name, args);

          // For template changes, try to fetch current state for diff
          let diff: any = undefined;
          if (args?.action === 'update_template' || args?.action === 'add_task_to_template') {
            try {
              const templateId = args?.params?.templateId;
              if (templateId) {
                const current = await mcpServer.execute(
                  { name: 'blanket-api', parameters: { action: 'get_template', params: { templateId } } },
                  authContext
                );
                if (current.success) {
                  diff = { before: current.result, after: { ...current.result, ...(args?.params?.updates || {}), _pending: args?.params } };
                }
              }
            } catch (e) {
              // Non-critical — continue without diff
            }
          }

          // Store pending approval in Firestore
          const approval: ApprovalRequest = {
            id: approvalId,
            conversationId: conversation.id,
            tool: name,
            action: args?.action || 'execute',
            description,
            params: args,
            diff,
            status: 'pending',
            createdAt: Date.now(),
          };

          const db = admin.firestore();
          const firestoreData: Record<string, any> = {
            ...approval,
            userId: authContext.userId,
            orgId: authContext.orgId,
            authToken: authContext.token,
            locationIds: authContext.locationIds,
            // Store conversation state so we can resume after approval
            pendingContents: JSON.stringify(contents),
            pendingToolCallPart: JSON.stringify(part),
          };
          // Remove undefined values — Firestore rejects them
          Object.keys(firestoreData).forEach((key) => {
            if (firestoreData[key] === undefined) delete firestoreData[key];
          });
          await db.collection(APPROVALS_COLLECTION).doc(approvalId).set(firestoreData);

          sendSSE(res, {
            type: 'approval-request',
            data: {
              id: approvalId,
              tool: name,
              action: args?.action,
              description,
              params: args?.params,
              diff,
            },
          });

          if (diff) {
            sendSSE(res, {
              type: 'diff',
              data: diff,
            });
          }

          pendingApproval = approval;
          break;
        }

        // Execute non-mutating tool call immediately
        const result = await mcpServer.execute(
          { name, parameters: args },
          authContext
        );

        allToolCallRecords.push({
          tool: name,
          action: args?.action || args?.query || 'execute',
          params: args || {},
          success: result.success,
        });

        sendSSE(res, {
          type: 'tool-result',
          data: {
            id: toolCallId,
            tool: name,
            success: result.success,
            result: result.success ? result.result : undefined,
            error: result.error,
          },
        });

        toolResultParts.push({
          functionResponse: { name, response: result },
        });
      }

      // If we hit an approval gate, stop the loop
      if (pendingApproval) break;

      // Send tool results back to Gemini for next round
      if (toolResultParts.length > 0) {
        contents.push({ role: 'user', parts: toolResultParts });
      }

      rounds++;
    }

    // Persist messages to Firestore
    const userMsg = buildMessage('user', message);
    const assistantMsg = buildMessage(
      'assistant',
      fullResponseText || 'Waiting for your approval to proceed.',
      allToolCallRecords.length > 0 ? allToolCallRecords : undefined
    );
    await appendMessages(conversation.id, [userMsg, assistantMsg]);

    // Final done event
    sendSSE(res, {
      type: 'done',
      data: {
        conversationId: conversation.id,
        toolCalls: allToolCallRecords.length,
        pendingApproval: pendingApproval?.id || null,
      },
    });
  } catch (error: any) {
    console.error('AI stream error:', error);
    sendSSE(res, {
      type: 'error',
      data: { message: 'Failed to process message. Please try again.' },
    });
    sendSSE(res, { type: 'done', data: {} });
  }

  res.end();
});

/**
 * POST /approve
 *
 * Execute or reject a pending approval.
 * Body: { approvalId: string, approved: boolean }
 */
router.post('/approve', authMiddleware, async (req: any, res) => {
  // SSE streaming for the approval result
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':ok\n\n');

  try {
    const { approvalId, approved } = req.body;

    if (!approvalId) {
      sendSSE(res, { type: 'error', data: { message: 'approvalId is required' } });
      sendSSE(res, { type: 'done', data: {} });
      res.end();
      return;
    }

    const db = admin.firestore();
    const approvalDoc = await db.collection(APPROVALS_COLLECTION).doc(approvalId).get();

    if (!approvalDoc.exists) {
      sendSSE(res, { type: 'error', data: { message: 'Approval not found' } });
      sendSSE(res, { type: 'done', data: {} });
      res.end();
      return;
    }

    const approvalData = approvalDoc.data()!;

    // Verify ownership
    if (approvalData.userId !== req.auth.authId) {
      sendSSE(res, { type: 'error', data: { message: 'Access denied' } });
      sendSSE(res, { type: 'done', data: {} });
      res.end();
      return;
    }

    if (approvalData.status !== 'pending') {
      sendSSE(res, { type: 'error', data: { message: 'Approval already processed' } });
      sendSSE(res, { type: 'done', data: {} });
      res.end();
      return;
    }

    const authContext: MCPAuthContext = {
      userId: approvalData.userId,
      orgId: approvalData.orgId,
      locationIds: approvalData.locationIds || [],
      token: approvalData.authToken,
    };

    if (!approved) {
      // User rejected — update status and inform
      await db.collection(APPROVALS_COLLECTION).doc(approvalId).update({ status: 'rejected' });

      sendSSE(res, {
        type: 'thinking',
        data: { content: 'The user rejected this change. I\'ll respect their decision.' },
      });
      sendSSE(res, {
        type: 'text',
        data: { content: 'Got it — I won\'t make that change. Let me know if you\'d like to try something different.' },
      });

      // Persist rejection message
      const rejectMsg = buildMessage('assistant', 'Change rejected by user. No modifications were made.');
      await appendMessages(approvalData.conversationId, [rejectMsg]);

      sendSSE(res, {
        type: 'done',
        data: { conversationId: approvalData.conversationId },
      });
      res.end();
      return;
    }

    // User approved — execute the tool call
    await db.collection(APPROVALS_COLLECTION).doc(approvalId).update({ status: 'approved' });

    sendSSE(res, {
      type: 'thinking',
      data: { content: 'User approved. Executing the changes now...' },
    });

    const toolCallPart = JSON.parse(approvalData.pendingToolCallPart);
    const { name, args } = toolCallPart.functionCall;

    sendSSE(res, {
      type: 'tool-call',
      data: {
        id: `tc-${uuidv4().slice(0, 8)}`,
        tool: name,
        action: args?.action || 'execute',
        params: args,
        approved: true,
      },
    });

    const result = await mcpServer.execute(
      { name, parameters: args },
      authContext
    );

    sendSSE(res, {
      type: 'tool-result',
      data: {
        tool: name,
        success: result.success,
        result: result.success ? result.result : undefined,
        error: result.error,
      },
    });

    // Resume Gemini to get a summary of what was done
    const contents = JSON.parse(approvalData.pendingContents);
    contents.push({
      role: 'user',
      parts: [{
        functionResponse: { name, response: result },
      }],
    });

    const tools = [{ functionDeclarations: mcpServer.getToolDefinitions() }];
    const streamResponse = await genAI.models.generateContentStream({
      model: 'gemini-3.1-pro-preview',
      contents,
      config: {
        systemInstruction: getSystemPrompt(authContext),
        tools,
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    });

    let summaryText = '';
    for await (const chunk of streamResponse) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (!parts) continue;
      for (const part of parts) {
        if (part.text) {
          const cleaned = extractAndStreamThinking(part.text, res);
          if (cleaned) {
            sendSSE(res, { type: 'text', data: { content: cleaned } });
            summaryText += cleaned;
          }
        }
      }
    }

    // Persist
    const toolRecord: MCPToolCallRecord = {
      tool: name,
      action: args?.action || 'execute',
      params: args || {},
      success: result.success,
    };
    const assistantMsg = buildMessage('assistant', summaryText || 'Changes applied successfully.', [toolRecord]);
    await appendMessages(approvalData.conversationId, [assistantMsg]);

    sendSSE(res, {
      type: 'done',
      data: { conversationId: approvalData.conversationId },
    });
  } catch (error: any) {
    console.error('Approval error:', error);
    sendSSE(res, { type: 'error', data: { message: 'Failed to process approval.' } });
    sendSSE(res, { type: 'done', data: {} });
  }

  res.end();
});

/**
 * GET /conversations
 *
 * Returns a list of conversations for the authenticated user,
 * ordered by most recently updated. Each entry has id, preview, updatedAt.
 */
router.get('/conversations', authMiddleware, async (req: any, res) => {
  try {
    const conversations = await listConversations(
      req.auth.authId,
      req.auth.orgId
    );

    return res.json({
      success: true,
      result: conversations,
    });
  } catch (error: any) {
    console.error('List conversations error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to list conversations',
    });
  }
});

/**
 * GET /history
 *
 * Query: { conversationId: string }
 * Returns conversation history for the authenticated user.
 */
router.get('/history', authMiddleware, async (req: any, res) => {
  try {
    const { conversationId } = req.query;

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        error: 'conversationId is required',
      });
    }

    const conversation = await getConversation(
      conversationId as string,
      req.auth.authId,
      req.auth.orgId
    );

    return res.json({
      success: true,
      result: {
        conversationId: conversation.id,
        messages: conversation.messages,
      },
    });
  } catch (error: any) {
    console.error('History fetch error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch conversation history',
    });
  }
});

/**
 * PATCH /rename
 *
 * Body: { conversationId: string, title: string }
 * Renames a conversation.
 */
router.patch('/rename', authMiddleware, async (req: any, res) => {
  try {
    const { conversationId: convId, title } = req.body;

    if (!convId || typeof title !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'conversationId and title are required',
      });
    }

    await updateConversationTitle(convId, req.auth.authId, title.slice(0, 100));

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Rename conversation error:', error);
    const status = error.message?.includes('Access denied') ? 403 : 500;
    return res.status(status).json({
      success: false,
      error: error.message || 'Failed to rename conversation',
    });
  }
});

export default router;
