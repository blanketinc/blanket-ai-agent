/**
 * MCP (Model Context Protocol) Type Definitions
 *
 * Standardized types for tool orchestration between
 * Gemini AI and Blanket backend tools.
 */

// --- Auth Context ---

export interface MCPAuthContext {
  userId: string;
  orgId: string;
  locationIds: string[];
  token: string;
}

// --- Tool Definitions ---

export interface MCPToolParameter {
  type: string;
  description?: string;
  enum?: string[];
  properties?: Record<string, MCPToolParameter>;
  required?: string[];
  items?: MCPToolParameter;
}

export interface MCPTool {
  name: string;
  description: string;
  parameters: MCPToolParameter;
  requiresAuth: boolean;
  execute: (params: any, context: MCPAuthContext) => Promise<any>;
}

// --- Tool Calls ---

export interface MCPToolCall {
  name: string;
  parameters: Record<string, any>;
}

export interface MCPToolResult {
  name: string;
  success: boolean;
  result?: any;
  error?: string;
}

// --- Gemini Integration ---
// Gemini function declarations use the SDK's native FunctionDeclaration type.
// See MCPServer.getToolDefinitions() for the conversion from MCP → Gemini format.

// --- Conversation ---

export interface MCPMessage {
  role: 'user' | 'assistant' | 'function';
  content: string;
  timestamp: number;
  toolCalls?: MCPToolCallRecord[];
}

export interface MCPToolCallRecord {
  tool: string;
  action: string;
  params: Record<string, any>;
  success: boolean;
}

export interface MCPConversation {
  id: string;
  userId: string;
  organizationId: string;
  messages: MCPMessage[];
  createdAt: number;
  updatedAt: number;
}
