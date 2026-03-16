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

// --- SSE Streaming Types ---

export type SSEEventType =
  | 'thinking'
  | 'text'
  | 'tool-call'
  | 'tool-result'
  | 'approval-request'
  | 'diff'
  | 'error'
  | 'done';

export interface SSEEvent {
  type: SSEEventType;
  data: any;
}

export interface ApprovalRequest {
  id: string;
  conversationId: string;
  tool: string;
  action: string;
  description: string;
  params: Record<string, any>;
  diff?: {
    before: any;
    after: any;
  };
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

// Actions that require user approval before execution
export const MUTATING_ACTIONS = [
  'update_template',
  'add_task_to_template',
  'create_template',
];
