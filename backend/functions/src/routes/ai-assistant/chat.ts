/**
 * AI Assistant Chat Endpoint
 *
 * POST /v2/ai-assistant/chat
 *
 * Handles conversational AI with Gemini function calling + MCP tools.
 * Flow:
 *   1. Authenticate user (Firebase token)
 *   2. Load/create conversation history (Firestore)
 *   3. Call Gemini with tools and conversation context
 *   4. If Gemini requests tool calls → execute via MCP → return results to Gemini
 *   5. Persist messages and return final response
 */

import express from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { genAI } from '../../core/ai-core';
import { MCPServer } from '../../libs/mcp-server';
import { MCPAuthContext, MCPToolCallRecord } from '../../libs/mcp-types';
import {
  getConversation,
  appendMessages,
  toGeminiHistory,
  buildMessage,
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

/**
 * System prompt for the AI assistant.
 * Provides context about the user and available capabilities.
 */
function getSystemPrompt(authContext: MCPAuthContext): string {
  return `You are the Blanket AI Assistant, a helpful expert for restaurant operations management.

You help Blanket power users with:
1. **List Template Management** — Create, update, and manage operational checklists (listTemplates) using the blanket-api tool.
2. **Analytics & Insights** — Query completion rates, failure analysis, performance trends, and location comparisons using the blanket-analytics tool.
3. **Food Safety Expertise** — Answer food safety questions about FDA regulations, temperatures, holding times, HACCP, and more using the marco-pollo tool.

## Current User Context
- User ID: ${authContext.userId}
- Organization: ${authContext.orgId}
- Accessible Locations: ${authContext.locationIds.length > 0 ? authContext.locationIds.join(', ') : 'All'}

## Important Rules
- You can ONLY access data for the user's organization (${authContext.orgId}).
- NEVER include deleted data in any response. All queries and API calls must filter out records where isDeleted=true. If a tool returns deleted records, exclude them from your response.
- NEVER show internal IDs (UUIDs, database IDs, etc.) to the user. Always display human-readable names instead. Use IDs internally for tool calls, but only show names, titles, and labels in your responses.
- For analytics queries, default to the last 7 days if no date range is specified.
- When modifying templates, ALWAYS confirm with the user before making changes.
- When showing analytics results, format data in clear tables when possible.
- If a tool call fails, explain the error in plain language and suggest alternatives.
- Be concise but thorough. Restaurant managers are busy.
- When suggesting template changes, preview what will change before applying.`;
}

/**
 * POST /chat
 *
 * Body: { message: string, conversationId?: string }
 * Response: { success: true, result: { message, conversationId, toolCalls? } }
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
      model: 'gemini-2.5-flash',
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
        model: 'gemini-2.5-flash',
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

    // Extract final text response
    const finalText =
      response.candidates?.[0]?.content?.parts
        ?.filter((p: any) => p.text)
        .map((p: any) => p.text)
        .join('') ||
      response.text ||
      'I was unable to generate a response. Please try again.';

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

export default router;
