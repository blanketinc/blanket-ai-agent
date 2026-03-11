/**
 * MCP Server - Model Context Protocol Implementation
 *
 * Orchestrates tool registration, validation, and execution
 * for Gemini AI function calling. Provides standardized
 * tool definitions and auth context propagation.
 */

import {
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  MCPAuthContext,
  MCPToolParameter,
} from './mcp-types';
import { Type, FunctionDeclaration } from '@google/genai';

// Map lowercase MCP types to Gemini SDK Type enum
const TYPE_MAP: Record<string, Type> = {
  string: Type.STRING,
  number: Type.NUMBER,
  integer: Type.INTEGER,
  boolean: Type.BOOLEAN,
  array: Type.ARRAY,
  object: Type.OBJECT,
};

export class MCPServer {
  private tools: Map<string, MCPTool>;

  constructor(config: { tools: MCPTool[] }) {
    this.tools = new Map();
    for (const tool of config.tools) {
      if (this.tools.has(tool.name)) {
        throw new Error(`Duplicate tool name: ${tool.name}`);
      }
      this.tools.set(tool.name, tool);
    }
  }

  /**
   * Returns tool definitions formatted for Gemini's function calling API.
   * Converts MCP parameter schemas to Gemini SDK FunctionDeclaration format.
   */
  getToolDefinitions(): FunctionDeclaration[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: this.convertSchema(tool.parameters),
    }));
  }

  /**
   * Convert MCP parameter schema (lowercase types) to Gemini SDK schema (Type enum).
   */
  private convertSchema(param: MCPToolParameter): any {
    const converted: any = {
      type: TYPE_MAP[param.type] || param.type,
    };
    if (param.description) converted.description = param.description;
    if (param.enum) converted.enum = param.enum;
    if (param.required) converted.required = param.required;
    if (param.items) converted.items = this.convertSchema(param.items);
    if (param.properties) {
      converted.properties = {};
      for (const [key, val] of Object.entries(param.properties)) {
        converted.properties[key] = this.convertSchema(val);
      }
    }
    return converted;
  }

  /**
   * Returns the list of registered tool names.
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Execute a tool call with auth context validation.
   */
  async execute(
    toolCall: MCPToolCall,
    authContext: MCPAuthContext
  ): Promise<MCPToolResult> {
    const tool = this.tools.get(toolCall.name);

    if (!tool) {
      return {
        name: toolCall.name,
        success: false,
        error: `Tool not found: ${toolCall.name}`,
      };
    }

    if (tool.requiresAuth && !authContext.token) {
      return {
        name: toolCall.name,
        success: false,
        error: 'Authentication required',
      };
    }

    if (tool.requiresAuth && !authContext.orgId) {
      return {
        name: toolCall.name,
        success: false,
        error: 'Organization context required',
      };
    }

    try {
      this.validateParameters(toolCall.parameters, tool.parameters);
    } catch (err: any) {
      return {
        name: toolCall.name,
        success: false,
        error: `Parameter validation failed: ${err.message}`,
      };
    }

    try {
      const result = await tool.execute(toolCall.parameters, authContext);
      return {
        name: toolCall.name,
        success: true,
        result,
      };
    } catch (err: any) {
      console.error(`MCP tool execution error (${toolCall.name}):`, err);
      return {
        name: toolCall.name,
        success: false,
        error: err.message || 'Tool execution failed',
      };
    }
  }

  /**
   * Execute multiple tool calls in parallel.
   */
  async executeAll(
    toolCalls: MCPToolCall[],
    authContext: MCPAuthContext
  ): Promise<MCPToolResult[]> {
    return Promise.all(
      toolCalls.map((call) => this.execute(call, authContext))
    );
  }

  /**
   * Validate tool call parameters against the tool's JSON schema.
   * Checks required fields and basic type matching.
   */
  private validateParameters(
    params: Record<string, any>,
    schema: MCPTool['parameters']
  ): void {
    if (!params || typeof params !== 'object') {
      throw new Error('Parameters must be an object');
    }

    if (schema.required) {
      for (const field of schema.required) {
        if (params[field] === undefined || params[field] === null) {
          throw new Error(`Missing required parameter: ${field}`);
        }
      }
    }

    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (params[key] !== undefined) {
          this.validateType(key, params[key], propSchema.type);
        }
      }
    }
  }

  private validateType(key: string, value: any, expectedType: string): void {
    const typeMap: Record<string, string> = {
      string: 'string',
      number: 'number',
      boolean: 'boolean',
      object: 'object',
      array: 'object', // arrays are objects in JS
    };

    const jsType = typeMap[expectedType];
    if (jsType && typeof value !== jsType) {
      throw new Error(
        `Parameter "${key}" expected type "${expectedType}", got "${typeof value}"`
      );
    }

    if (expectedType === 'array' && !Array.isArray(value)) {
      throw new Error(`Parameter "${key}" expected an array`);
    }
  }
}
