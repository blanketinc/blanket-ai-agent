# Blanket AI Assistant - Production Architecture (No OpenClaw Dependency)

**Jira Epic:** [BK-849](https://blanketinc.atlassian.net/browse/BK-849)  
**Date:** 2026-03-10  
**Priority:** EMERGENCY  
**Critical Change:** Remove OpenClaw dependency for production reliability  
**New Approach:** Cloud Functions + Gemini AI + MCP for tool orchestration  
**Timeline:** 1 week to production MVP

---

## Problem with Original Architecture

**Original Plan:**
```
User → Standalone App → OpenClaw (on Thuc's machine) → Blanket APIs
```

**Issue:** OpenClaw is:
- ❌ Running on local machine (single point of failure)
- ❌ Not production-grade for customer-facing features
- ❌ Can go down (network issues, laptop off, etc.)
- ❌ Not scalable (one machine can't handle multiple customers)

**Customer Impact:** If OpenClaw goes down, customer loses access to critical feature → Bad experience

---

## NEW Production Architecture (MCP-Based)

```
┌─────────────────────────────────────────────────────────┐
│  User's Browser                                         │
│  https://ai.blanket.app                                 │
│  (Next.js on Vercel)                                    │
└─────────────────────────────────────────────────────────┘
                    │ HTTP/WebSocket
                    ↓
┌─────────────────────────────────────────────────────────┐
│  Blanket AI Backend                                     │
│  Firebase Cloud Function: /api/v2/ai-assistant/chat    │
│                                                         │
│  ┌──────────────────────────────────────────┐         │
│  │  Gemini AI (gemini-2.5-flash)            │         │
│  │  - Conversation management                │         │
│  │  - Function calling                       │         │
│  │  - MCP tool orchestration                 │         │
│  └──────────────────────────────────────────┘         │
│                    │                                    │
│                    ↓                                    │
│  ┌──────────────────────────────────────────┐         │
│  │  MCP Server (Model Context Protocol)     │         │
│  │  - Tool registry                          │         │
│  │  - Tool execution                         │         │
│  │  - Auth context management                │         │
│  └──────────────────────────────────────────┘         │
│         │              │              │                 │
│         ↓              ↓              ↓                 │
│    ┌────────┐   ┌──────────┐   ┌──────────┐          │
│    │Blanket │   │Analytics │   │  Marco   │          │
│    │ APIs   │   │  (SQL)   │   │  Pollo   │          │
│    └────────┘   └──────────┘   └──────────┘          │
└─────────────────────────────────────────────────────────┘
                    │
                    ↓
        ┌───────────────────────┐
        │  Firestore/PostgreSQL │
        └───────────────────────┘
```

**Key Change:** Everything runs in Google Cloud (Firebase Cloud Functions) - no local dependencies

---

## Why MCP Now Makes Sense

### Without MCP (Custom Tool Calling):
```javascript
// Cloud Function: manual tool orchestration
if (userIntent === 'list_templates') {
  const result = await callBlanketAPI('listTemplates', params);
} else if (userIntent === 'add_task') {
  const result = await callBlanketAPI('addTask', params);
}
// ... 50 more if/else statements
```

**Problems:**
- ❌ Manual routing (error-prone)
- ❌ Hard to add new tools
- ❌ No standardization
- ❌ Tight coupling

### With MCP (Standardized Protocol):
```javascript
// Cloud Function: MCP orchestration
const mcpServer = new MCPServer({
  tools: [blanketAPITools, analyticsTools, marcoPolloTool]
});

const result = await gemini.chat({
  message: userMessage,
  tools: mcpServer.getToolDefinitions(),
  onToolCall: (toolCall) => mcpServer.execute(toolCall, authContext)
});
```

**Benefits:**
- ✅ **Standardized protocol** (well-defined schemas)
- ✅ **Easy to add tools** (register and go)
- ✅ **Better error handling** (MCP spec includes error types)
- ✅ **Auth context propagation** (MCP handles securely)
- ✅ **Future-proof** (can swap AI models, tools, etc.)

---

## MCP Architecture Details

### What is MCP (Model Context Protocol)?

**MCP** is an open standard for connecting AI models to external tools/APIs:
- **Tool Definitions:** JSON schemas describing what each tool does
- **Authentication:** How to pass user context to tools
- **Error Handling:** Standardized error responses
- **Streaming:** Support for long-running operations
- **Discovery:** Tools can be added/removed dynamically

**Analogy:** MCP is like REST API for AI agents - standardized way to call functions

**Spec:** https://modelcontextprotocol.io/

---

## Component Breakdown

### 1. Frontend (Unchanged)

**Tech:** Next.js on Vercel  
**URL:** `https://ai.blanket.app`

**Features:**
- Chat interface
- Firebase Auth
- WebSocket or HTTP to backend

*No changes needed from previous design*

---

### 2. Backend: AI Chat Endpoint (NEW)

**Implementation:** Firebase Cloud Function

**File:** `Functions/functions/src/routes/api/v2/ai-assistant/chat.ts`

**Purpose:** Handle conversational AI with tool calling via MCP

**Code Structure:**
```typescript
// Functions/functions/src/routes/api/v2/ai-assistant/chat.ts
import express from 'express';
import { authMiddleware } from '../../../../authentication/auth.middleware';
import { genAI } from '../../../../core/ai-core'; // Gemini client
import { MCPServer } from '../../../../libs/mcp-server';
import { blanketAPITools } from '../../../../mcp/tools/blanket-api';
import { analyticsTools } from '../../../../mcp/tools/analytics';
import { marcoPolloTool } from '../../../../mcp/tools/marco-pollo';

const router = express.Router();

// Initialize MCP server with available tools
const mcpServer = new MCPServer({
  tools: [
    blanketAPITools,
    analyticsTools,
    marcoPolloTool
  ]
});

router.post('/chat', authMiddleware, async (req: any, res) => {
  try {
    const { message, conversationId } = req.body;
    const authContext = {
      userId: req.auth.authId,
      orgId: req.auth.orgId,
      locationIds: req.auth.locationIds,
      token: req.auth.token
    };
    
    // Get conversation history (from Firestore)
    const history = await getConversationHistory(conversationId);
    
    // Build Gemini request with MCP tools
    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        ...history,
        { role: 'user', parts: [{ text: message }] }
      ],
      tools: mcpServer.getToolDefinitions(), // MCP tool schemas
      systemInstruction: getSystemPrompt(authContext)
    });
    
    // Handle tool calls (if any)
    if (response.functionCalls) {
      const toolResults = await Promise.all(
        response.functionCalls.map(async (call) => {
          return mcpServer.execute(call, authContext);
        })
      );
      
      // Send tool results back to Gemini for final response
      const finalResponse = await genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          ...history,
          { role: 'user', parts: [{ text: message }] },
          { role: 'model', parts: response.functionCalls },
          { role: 'function', parts: toolResults }
        ]
      });
      
      return res.json({
        success: true,
        result: {
          message: finalResponse.text,
          conversationId,
          toolCalls: response.functionCalls.length
        }
      });
    }
    
    // No tool calls - direct response
    return res.json({
      success: true,
      result: {
        message: response.text,
        conversationId
      }
    });
    
  } catch (error) {
    console.error('AI chat error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process message'
    });
  }
});

export default router;
```

---

### 3. MCP Server Implementation (NEW)

**File:** `Functions/functions/src/libs/mcp-server.ts`

**Purpose:** MCP protocol implementation for tool orchestration

**Code:**
```typescript
// Functions/functions/src/libs/mcp-server.ts
import { MCPTool, MCPToolCall, MCPAuthContext } from './mcp-types';

export class MCPServer {
  private tools: Map<string, MCPTool>;
  
  constructor(config: { tools: MCPTool[] }) {
    this.tools = new Map();
    config.tools.forEach(tool => {
      this.tools.set(tool.name, tool);
    });
  }
  
  // Get tool definitions for Gemini
  getToolDefinitions() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }));
  }
  
  // Execute a tool call
  async execute(
    toolCall: MCPToolCall,
    authContext: MCPAuthContext
  ): Promise<any> {
    const tool = this.tools.get(toolCall.name);
    
    if (!tool) {
      throw new Error(`Tool not found: ${toolCall.name}`);
    }
    
    // Validate auth context matches tool requirements
    if (tool.requiresAuth && !authContext.token) {
      throw new Error('Authentication required');
    }
    
    // Validate parameters against schema
    this.validateParameters(toolCall.parameters, tool.parameters);
    
    // Execute tool with auth context
    try {
      const result = await tool.execute(toolCall.parameters, authContext);
      return {
        name: toolCall.name,
        success: true,
        result
      };
    } catch (error) {
      console.error(`Tool execution error (${toolCall.name}):`, error);
      return {
        name: toolCall.name,
        success: false,
        error: error.message
      };
    }
  }
  
  private validateParameters(params: any, schema: any) {
    // JSON schema validation
    // ... implementation
  }
}
```

**Types:**
```typescript
// Functions/functions/src/libs/mcp-types.ts
export interface MCPTool {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON schema
  requiresAuth: boolean;
  execute: (params: any, context: MCPAuthContext) => Promise<any>;
}

export interface MCPToolCall {
  name: string;
  parameters: Record<string, any>;
}

export interface MCPAuthContext {
  userId: string;
  orgId: string;
  locationIds: string[];
  token: string;
}
```

---

### 4. MCP Tools (NEW)

**Directory:** `Functions/functions/src/mcp/tools/`

#### Tool 1: Blanket API

**File:** `Functions/functions/src/mcp/tools/blanket-api.ts`

```typescript
import { MCPTool } from '../../libs/mcp-types';
import { functions } from '../../core/firebase-core';

export const blanketAPITools: MCPTool = {
  name: 'blanket-api',
  description: 'Manage Blanket listTemplates and query data',
  requiresAuth: true,
  
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'list_templates',
          'get_template',
          'update_template',
          'add_task_to_template',
          'create_template'
        ],
        description: 'Action to perform'
      },
      params: {
        type: 'object',
        description: 'Action-specific parameters'
      }
    },
    required: ['action', 'params']
  },
  
  execute: async (params, context) => {
    const { action, params: actionParams } = params;
    
    // Validate user has access to this org
    if (actionParams.organizationId && 
        actionParams.organizationId !== context.orgId) {
      throw new Error('Access denied: Cannot access other organizations');
    }
    
    // Route to appropriate Cloud Function
    switch (action) {
      case 'list_templates':
        return listTemplates(actionParams, context);
      case 'get_template':
        return getTemplate(actionParams, context);
      case 'update_template':
        return updateTemplate(actionParams, context);
      case 'add_task_to_template':
        return addTaskToTemplate(actionParams, context);
      case 'create_template':
        return createTemplate(actionParams, context);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
};

// Helper functions
async function listTemplates(params: any, context: any) {
  const callable = functions.httpsCallable('api/v2/listTemplates/list');
  const result = await callable(params, {
    headers: { Authorization: `Bearer ${context.token}` }
  });
  return result.data.result;
}

async function getTemplate(params: any, context: any) {
  const callable = functions.httpsCallable('api/v2/listTemplates/get');
  const result = await callable(params, {
    headers: { Authorization: `Bearer ${context.token}` }
  });
  return result.data.result;
}

// ... other helper functions
```

#### Tool 2: Analytics

**File:** `Functions/functions/src/mcp/tools/analytics.ts`

```typescript
import { MCPTool } from '../../libs/mcp-types';
import { pool } from '../../core/database'; // PostgreSQL connection

export const analyticsTools: MCPTool = {
  name: 'blanket-analytics',
  description: 'Query Blanket data for analytics and insights',
  requiresAuth: true,
  
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        enum: [
          'completion_rates',
          'failure_analysis',
          'performance_trends',
          'location_comparison'
        ]
      },
      params: {
        type: 'object',
        description: 'Query-specific parameters (date range, filters, etc.)'
      }
    },
    required: ['query', 'params']
  },
  
  execute: async (params, context) => {
    const { query, params: queryParams } = params;
    
    // Validate org access
    if (queryParams.organizationId !== context.orgId) {
      throw new Error('Access denied');
    }
    
    switch (query) {
      case 'completion_rates':
        return queryCompletionRates(queryParams, context);
      case 'failure_analysis':
        return queryFailureAnalysis(queryParams, context);
      // ... other queries
      default:
        throw new Error(`Unknown query: ${query}`);
    }
  }
};

async function queryCompletionRates(params: any, context: any) {
  const { organizationId, startDate, endDate, locationIds } = params;
  
  const sql = `
    SELECT 
      l.name AS location,
      COUNT(*) AS total,
      COUNT(CASE WHEN le.status = 'completed' THEN 1 END) AS completed,
      ROUND(
        COUNT(CASE WHEN le.status = 'completed' THEN 1 END) * 100.0 / COUNT(*),
        2
      ) AS completion_rate
    FROM listentries le
    JOIN locations l ON le."locationId" = l."oldLocationId"
    WHERE 
      le."organizationId" = $1
      AND to_timestamp(le."createdDate" / 1000) BETWEEN $2 AND $3
      ${locationIds ? 'AND le."locationId" = ANY($4)' : ''}
    GROUP BY l.name
    ORDER BY completion_rate ASC;
  `;
  
  const values = [organizationId, startDate, endDate];
  if (locationIds) values.push(locationIds);
  
  const result = await pool.query(sql, values);
  return result.rows;
}
```

#### Tool 3: Marco Pollo Integration

**File:** `Functions/functions/src/mcp/tools/marco-pollo.ts`

```typescript
import { MCPTool } from '../../libs/mcp-types';
import axios from 'axios';

export const marcoPolloTool: MCPTool = {
  name: 'marco-pollo',
  description: 'Food safety expert - answers questions about FDA regulations, temperatures, best practices',
  requiresAuth: false, // Food safety info is general knowledge
  
  parameters: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'Food safety question to ask Marco Pollo'
      }
    },
    required: ['question']
  },
  
  execute: async (params, context) => {
    const { question } = params;
    
    // Call Marco Pollo API (or OpenClaw sessions_send if available)
    try {
      // Option 1: If Marco Pollo has a REST API
      const response = await axios.post('https://marco-pollo-api.example.com/ask', {
        question,
        context: {
          source: 'blanket-ai',
          userId: context.userId
        }
      });
      
      return {
        answer: response.data.answer,
        citations: response.data.citations,
        confidence: response.data.confidence
      };
      
    } catch (error) {
      // Fallback: Built-in food safety knowledge
      console.warn('Marco Pollo unavailable, using fallback');
      return {
        answer: 'Marco Pollo is currently unavailable. For food safety questions, please refer to FDA guidelines at https://www.fda.gov/food/guidance-regulation-food-and-dietary-supplements',
        citations: [],
        confidence: 0
      };
    }
  }
};
```

---

## Marco Pollo Integration Options

### Option 1: Marco Pollo REST API (If Available)

**Pro:** Clean separation, stateless  
**Con:** Need to build/deploy Marco Pollo API

### Option 2: Direct LLM with Food Safety Prompt

**Pro:** No external dependency  
**Con:** Less specialized than Marco Pollo

```typescript
// Fallback implementation
async function askFoodSafetyQuestion(question: string) {
  const prompt = `You are Marco Pollo, a food safety expert.
  Answer this question with FDA guidelines and citations:
  
  ${question}
  
  Provide specific temperatures, times, and regulatory references.`;
  
  const response = await genAI.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  });
  
  return response.text;
}
```

### Option 3: Hybrid (Recommended)

- Try Marco Pollo API first
- Fallback to direct LLM if unavailable
- Best of both worlds

---

## Conversation Management

**Storage:** Firestore

**Collection:** `ai_conversations`

**Document Structure:**
```typescript
{
  id: 'conv-uuid',
  userId: 'user-auth-id',
  organizationId: 'org-id',
  messages: [
    {
      role: 'user',
      content: 'Add temp check to bar templates',
      timestamp: 1234567890
    },
    {
      role: 'assistant',
      content: 'I found 8 bar templates...',
      timestamp: 1234567891,
      toolCalls: ['blanket-api.add_task_to_template']
    }
  ],
  createdAt: 1234567890,
  updatedAt: 1234567891
}
```

**Benefits:**
- ✅ Persistent conversation history
- ✅ Context across sessions
- ✅ Can review past interactions
- ✅ Audit trail

---

## Deployment

### Cloud Functions

**New Functions to Deploy:**
```
/api/v2/ai-assistant/chat          # Main chat endpoint
/api/v2/ai-assistant/history       # Get conversation history
/api/v2/ai-assistant/conversations # List user's conversations
```

**Deploy:**
```bash
firebase deploy --only functions:api
```

### Frontend (Unchanged)

**Deploy to Vercel:**
```bash
cd blanket-ai-app/
vercel --prod
```

---

## Development Timeline (Revised)

### Week 1: MVP

**Day 1-2: MCP Server + Tools**
- [ ] Build `MCPServer` class
- [ ] Build `blanket-api` MCP tool
- [ ] Build `analytics` MCP tool
- [ ] Build `marco-pollo` MCP tool
- [ ] Unit tests for each tool

**Day 3-4: AI Chat Endpoint**
- [ ] Build `/api/v2/ai-assistant/chat` endpoint
- [ ] Integrate Gemini with MCP tools
- [ ] Conversation history (Firestore)
- [ ] Auth context propagation

**Day 5: Frontend**
- [ ] Next.js chat UI
- [ ] Firebase Auth integration
- [ ] HTTP/WebSocket client to backend
- [ ] Deploy to Vercel

**Day 6: Testing**
- [ ] Alpha test with team (10 test cases)
- [ ] Fix bugs and edge cases
- [ ] Optimize slow queries

**Day 7: Customer Beta**
- [ ] Enable for customer (feature flag)
- [ ] Onboarding walkthrough
- [ ] Gather feedback

**Deliverable:** Production-ready AI Assistant (all in Google Cloud)

---

## Cost Estimate

### Development
- **Week 1 build:** ~$7K-$10K (more complex than OpenClaw)

### Infrastructure (Monthly)
- **Vercel hosting:** Free or $20/month
- **Cloud Functions:** ~$20/month (based on usage)
- **Gemini API:** ~$50/month
- **Firestore:** Included in existing plan
- **PostgreSQL:** Existing (no additional cost)
- **Total:** ~$70-$100/month

**No OpenClaw server cost** ✅

---

## Advantages of This Architecture

### vs OpenClaw-Based:

| Aspect | OpenClaw | MCP (New) |
|--------|----------|-----------|
| **Reliability** | Single point of failure ❌ | Cloud-hosted ✅ |
| **Scalability** | One machine ❌ | Auto-scales ✅ |
| **Availability** | 90% uptime ❌ | 99.9% uptime ✅ |
| **Latency** | Variable (network) ❌ | Consistent (cloud) ✅ |
| **Cost** | $20/month server | $70/month usage-based |
| **Maintenance** | Must monitor ❌ | Managed ✅ |

**Winner:** MCP architecture (production-ready)

---

## Security

### Authentication
- ✅ Firebase Auth (same as Blanket)
- ✅ Token validation on every request
- ✅ Custom claims for org/location scope

### Authorization
- ✅ All tool calls include auth context
- ✅ Tools validate org/location access
- ✅ PostgreSQL queries filtered by orgId

### Audit Logging
- ✅ All conversations stored in Firestore
- ✅ Tool calls tracked with timestamps
- ✅ Can review what AI did on behalf of user

---

## Marco Pollo Strategy

### Short-term (Week 1):
- Use direct Gemini with food safety prompt
- No external dependency
- Good enough for MVP

### Medium-term (Month 1):
- Build Marco Pollo REST API
- Deploy as separate Cloud Function
- MCP tool calls Marco Pollo API

### Long-term (Month 2+):
- Specialized food safety model fine-tuned on FDA docs
- Vector database for regulation lookup
- Citation tracking and version control

---

## Comparison: MCP vs No MCP

### Without MCP:
```typescript
// Manual tool routing (brittle)
if (intent === 'list_templates') {
  // call Blanket API
} else if (intent === 'query_analytics') {
  // call PostgreSQL
} else if (intent === 'food_safety') {
  // call Marco Pollo
}
// 50 more if/else statements
```

**Problems:**
- ❌ Hard to maintain
- ❌ Error-prone
- ❌ Tight coupling
- ❌ No standardization

### With MCP:
```typescript
// Declarative tool registry (clean)
const mcpServer = new MCPServer({
  tools: [blanketAPI, analytics, marcoPollo]
});

// Gemini automatically routes to tools
const response = await gemini.chat({
  message,
  tools: mcpServer.getToolDefinitions()
});
```

**Benefits:**
- ✅ Easy to add tools (just register)
- ✅ Standardized error handling
- ✅ Auth context automatic
- ✅ Well-tested protocol

---

## Migration Path (If Needed)

**If we ever want to move back to OpenClaw or other agent:**

1. MCP tools are portable (standard protocol)
2. Swap `MCPServer` for OpenClaw client
3. Frontend unchanged (HTTP API contract same)
4. Minimal code changes

**MCP = Future-proof** ✅

---

## Next Steps

### This Week (Pre-Build)
1. ☐ Confirm with customer: Does this solve the reliability concern?
2. ☐ Set up Firebase project (if not using existing)
3. ☐ Obtain PostgreSQL credentials (read-only user)
4. ☐ Design MCP tool schemas (JSON schemas for each tool)

### Day 1-2: Start Building
1. ☐ Build `MCPServer` class
2. ☐ Build first tool (`blanket-api`)
3. ☐ Test tool execution

### Day 3-7: Complete MVP
- See timeline above

---

## Recommendation

**Build production MCP-based architecture (no OpenClaw dependency)**

**Why:**
- ✅ **Production-ready** (99.9% uptime)
- ✅ **Scalable** (auto-scales with Cloud Functions)
- ✅ **Reliable** (no single point of failure)
- ✅ **Maintainable** (MCP standardizes tool calling)
- ✅ **Future-proof** (can swap AI models or tools)

**Trade-off:**
- More code to write (build MCP server)
- Slightly longer timeline (1 week vs 5 days)
- But: **Production-grade result** worth the extra effort

**Go/No-Go:** Customer confirms reliability is critical → **BUILD MCP ARCHITECTURE**

---

**Full architecture saved to:** `blanket-ai-production-architecture.md`

**Timeline:** 1 week to production-ready  
**Risk:** Low (all in Google Cloud)  
**Reliability:** 99.9% uptime ✅
