# Blanket AI Agent

**EMERGENCY Priority** - Customer retention project  
**Timeline:** 1 week to MVP  
**Jira Epic:** [BK-849](https://blanketinc.atlassian.net/browse/BK-849)

---

## 🎯 Mission

Build a conversational AI assistant that enables Blanket power users to:
- Manage listTemplates via natural language (30 min → 30 sec)
- Query analytics instantly ("Show completion rates for Phoenix locations last week")
- Get food safety expertise from Marco Pollo AI

**Goal:** Prevent key customer churn by delivering this in 1 week.

---

## 🏗️ Architecture

**Standalone web app** with production-grade backend (no local dependencies):

```
User Browser (ai.blanket.app)
    ↓
Next.js Frontend (Vercel)
    ↓ HTTPS
Firebase Cloud Function (/api/v2/ai-assistant/chat)
    ↓
Google Gemini AI (gemini-2.5-flash)
    ↓
MCP Server (Model Context Protocol)
    ├─→ blanket-api tool (Cloud Functions)
    ├─→ analytics tool (PostgreSQL)
    └─→ marco-pollo tool (food safety expert)
```

**Key Design Decisions:**
- ✅ Standalone app (fast iteration, zero risk to main app)
- ✅ Cloud Functions (99.9% uptime, auto-scaling)
- ✅ MCP protocol (standardized tool orchestration)
- ✅ Firebase Auth (org/location isolation)

---

## 📁 Project Structure

```
blanket-ai-agent/
├── frontend/              # Next.js web app
│   ├── pages/
│   │   ├── index.tsx     # Chat interface
│   │   └── login.tsx     # Firebase Auth
│   ├── components/
│   │   ├── ChatMessage.tsx
│   │   ├── ChatInput.tsx
│   │   └── ChatHistory.tsx
│   └── lib/
│       ├── firebase.ts   # Firebase client
│       └── api.ts        # Chat API client
│
├── backend/               # Cloud Functions
│   ├── functions/
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   └── ai-assistant/
│   │   │   │       └── chat.ts      # Main chat endpoint
│   │   │   ├── libs/
│   │   │   │   ├── mcp-server.ts    # MCP orchestration
│   │   │   │   └── mcp-types.ts     # Type definitions
│   │   │   └── mcp-tools/
│   │   │       ├── blanket-api.ts   # Blanket API wrapper
│   │   │       ├── analytics.ts     # PostgreSQL queries
│   │   │       └── marco-pollo.ts   # Food safety expert
│   │   └── package.json
│   └── firebase.json
│
├── docs/
│   ├── ARCHITECTURE.md        # Detailed architecture (copied from workspace)
│   ├── SECURITY.md            # Auth & isolation model
│   ├── DEPLOYMENT.md          # Deployment guide
│   └── EXAMPLES.md            # Example conversations
│
└── README.md                  # This file
```

---

## 🚀 Quick Start for Claude Code

### Prerequisites

1. **Firebase Project:** `blanket-alpha` (existing)
2. **PostgreSQL:** Production DB credentials (read-only)
3. **Vercel Account:** For frontend deployment
4. **Google Cloud:** Gemini API key

### Step 1: Setup Backend

```bash
cd backend/functions
npm install

# Install dependencies:
# - firebase-functions
# - firebase-admin
# - @google/genai
# - express
# - pg (PostgreSQL)
```

### Step 2: Setup Frontend

```bash
cd frontend
npm install

# Install dependencies:
# - next
# - react
# - firebase
# - socket.io-client (or standard fetch)
```

### Step 3: Environment Variables

**Backend (.env):**
```env
FIREBASE_CONFIG={"projectId":"blanket-alpha",...}
GEMINI_API_KEY=your-key-here
POSTGRES_HOST=34.29.138.25
POSTGRES_USER=blanket-app
POSTGRES_PASSWORD=P0rkbuns
POSTGRES_DB=postgres
```

**Frontend (.env.local):**
```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=blanket-alpha.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=blanket-alpha
NEXT_PUBLIC_API_URL=https://us-central1-blanket-alpha.cloudfunctions.net/api/v2/ai-assistant
```

### Step 4: Build & Test

**Backend:**
```bash
cd backend/functions
npm run build
firebase emulators:start  # Test locally
```

**Frontend:**
```bash
cd frontend
npm run dev  # http://localhost:3000
```

### Step 5: Deploy

**Backend:**
```bash
firebase deploy --only functions:api
```

**Frontend:**
```bash
vercel --prod  # Deploys to ai.blanket.app
```

---

## 🔧 Implementation Guide

### Phase 1: MCP Server (Day 1-2)

**Build:** `backend/functions/src/libs/mcp-server.ts`

```typescript
export class MCPServer {
  private tools: Map<string, MCPTool>;
  
  constructor(config: { tools: MCPTool[] }) {
    // Register tools
  }
  
  getToolDefinitions() {
    // Return schemas for Gemini
  }
  
  async execute(toolCall: MCPToolCall, authContext: MCPAuthContext) {
    // Validate auth
    // Execute tool
    // Return result
  }
}
```

**See:** `docs/ARCHITECTURE.md` for complete implementation details.

---

### Phase 2: MCP Tools (Day 1-2)

**Tool 1: blanket-api** (`backend/functions/src/mcp-tools/blanket-api.ts`)

```typescript
export const blanketAPITools: MCPTool = {
  name: 'blanket-api',
  description: 'Manage Blanket listTemplates',
  
  execute: async (params, context) => {
    // Validate: user can only access their org
    if (params.organizationId !== context.orgId) {
      throw new Error('Access denied');
    }
    
    // Call Cloud Function with user token
    const callable = functions.httpsCallable('api/v2/listTemplates/list');
    return callable(params, {
      headers: { Authorization: `Bearer ${context.token}` }
    });
  }
};
```

**Tool 2: analytics** (`backend/functions/src/mcp-tools/analytics.ts`)

```typescript
export const analyticsTools: MCPTool = {
  name: 'blanket-analytics',
  description: 'Query data for insights',
  
  execute: async (params, context) => {
    // Query PostgreSQL (filtered by orgId)
    const sql = `
      SELECT location, completion_rate
      FROM listentries
      WHERE organizationId = $1
      ...
    `;
    return pool.query(sql, [context.orgId]);
  }
};
```

**Tool 3: marco-pollo** (`backend/functions/src/mcp-tools/marco-pollo.ts`)

```typescript
export const marcoPolloTool: MCPTool = {
  name: 'marco-pollo',
  description: 'Food safety expert',
  
  execute: async (params, context) => {
    // Use Gemini with food safety prompt
    const prompt = `You are a food safety expert. Answer: ${params.question}`;
    const response = await genAI.generateContent(prompt);
    return response.text;
  }
};
```

---

### Phase 3: Chat Endpoint (Day 3-4)

**Build:** `backend/functions/src/routes/ai-assistant/chat.ts`

```typescript
router.post('/chat', authMiddleware, async (req, res) => {
  const { message } = req.body;
  const authContext = {
    userId: req.auth.authId,
    orgId: req.auth.orgId,
    token: req.auth.token
  };
  
  // Initialize MCP
  const mcpServer = new MCPServer({
    tools: [blanketAPITools, analyticsTools, marcoPolloTool]
  });
  
  // Call Gemini with tools
  const response = await genAI.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: message }] }],
    tools: mcpServer.getToolDefinitions()
  });
  
  // Handle tool calls if any
  if (response.functionCalls) {
    const results = await Promise.all(
      response.functionCalls.map(call => 
        mcpServer.execute(call, authContext)
      )
    );
    
    // Send results back to Gemini
    const finalResponse = await genAI.models.generateContent({
      contents: [...history, { role: 'function', parts: results }]
    });
    
    return res.json({ message: finalResponse.text });
  }
  
  return res.json({ message: response.text });
});
```

---

### Phase 4: Frontend (Day 5)

**Build:** `frontend/pages/index.tsx`

```tsx
import { useState, useEffect } from 'react';
import { auth } from '../lib/firebase';
import { sendMessage } from '../lib/api';

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUser(user);
      } else {
        window.location.href = '/login';
      }
    });
    return unsubscribe;
  }, []);
  
  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMessage = { role: 'user', content: input };
    setMessages([...messages, userMessage]);
    setInput('');
    
    const token = await user.getIdToken();
    const response = await sendMessage(input, token);
    
    const aiMessage = { role: 'assistant', content: response.message };
    setMessages([...messages, userMessage, aiMessage]);
  };
  
  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, i) => (
          <ChatMessage key={i} role={msg.role} content={msg.content} />
        ))}
      </div>
      <ChatInput value={input} onChange={setInput} onSend={handleSend} />
    </div>
  );
}
```

---

## 🔒 Security

### Authentication
- Firebase Auth (shared with Blanket main app)
- User must log in before accessing chat
- Token includes Firebase custom claims:
  ```javascript
  {
    uid: "user123",
    orgId: "upwardProjects",
    locationIds: ["loc1", "loc2"],
    role: "manager"
  }
  ```

### Authorization
- **All API calls authenticated as user** (not admin)
- **Org isolation:** Tools validate `params.organizationId === context.orgId`
- **Location scoping:** PostgreSQL queries filter by `context.locationIds`
- **Token expiry:** 1 hour (automatic refresh)

### Audit Trail
- All conversations stored in Firestore (`ai_conversations` collection)
- Tool calls logged with timestamps
- User can review past interactions

---

## 📊 Success Metrics

### Week 1 (MVP)
- ✅ User can log in and chat
- ✅ User can query analytics
- ✅ User can manage templates
- ✅ Marco Pollo answers food safety questions
- ✅ All operations scoped to user's org/locations

### Week 2 (Refinement)
- ✅ User satisfaction: >4/5 rating
- ✅ Time savings: 5+ hours/week
- ✅ Customer confirms: "This solves our problem"
- ✅ Zero security issues

### Month 1 (Retention)
- ✅ Customer stays (does not churn)
- ✅ Expands usage to more power users
- ✅ Becomes reference customer

---

## 📚 Documentation

### Technical Specs
- **ARCHITECTURE.md** - Complete system design (24KB doc)
- **SECURITY.md** - Auth model, isolation, audit trails
- **DEPLOYMENT.md** - Step-by-step deployment guide
- **EXAMPLES.md** - Example conversations and use cases

### External References
- **Jira Epic:** [BK-849](https://blanketinc.atlassian.net/browse/BK-849)
- **Blanket APIs:** `blanketinc/cloud-functions` repo
- **MCP Protocol:** https://modelcontextprotocol.io/

---

## 🐛 Debugging Support

**Contact Thuc** (debugging expert) for:
- Blanket-specific API questions
- Database schema clarifications
- Auth/permissions issues
- Production deployment help

**Telegram:** Available in "Team Connect" group

---

## 📋 Timeline

- **Day 1-2:** MCP server + tools (blanket-api, analytics, marco-pollo)
- **Day 3-4:** AI chat endpoint + Gemini integration
- **Day 5:** Frontend (Next.js + Firebase Auth)
- **Day 6:** Testing + bug fixes
- **Day 7:** Customer beta + go-live

**Total:** 1 week to production MVP

---

## 🚨 Priority

**EMERGENCY** - Key customer at risk of churning. Ship in 1 week to retain $100K+ annual revenue.

---

## ✅ Handoff Checklist for Claude Code

- [ ] Clone this repo
- [ ] Review `docs/ARCHITECTURE.md` (complete technical spec)
- [ ] Set up Firebase project connection
- [ ] Obtain PostgreSQL credentials from Winn3r
- [ ] Build MCP server + 3 tools
- [ ] Build chat endpoint (Cloud Functions)
- [ ] Build Next.js frontend
- [ ] Deploy to Vercel (frontend) + Firebase (backend)
- [ ] Test with sample conversations
- [ ] Enable for customer beta testing

**Start here:** Read `docs/ARCHITECTURE.md` for complete implementation guide.

**Questions?** Ask Thuc in Telegram - he researched Blanket's stack and can answer technical questions.

---

**Let's save this customer! 🚀**
