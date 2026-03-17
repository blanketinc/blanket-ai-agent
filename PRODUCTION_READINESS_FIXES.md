# Production Readiness Fixes for BK-855

**PR:** To be applied ON TOP of #10 (BK-855 Streaming AI Agent UX)

## Changes

### 1. Rate Limiting (Issue #11 - CRITICAL)

**File:** `backend/functions/src/middleware/rate-limiter.ts` (NEW)

**Features:**
- 10 requests/minute per user
- 100 requests/hour per organization
- Circuit breaker: 5 min cooldown after 3 consecutive errors
- In-memory store with automatic cleanup

**Usage in chat.ts:**
```typescript
import { rateLimiter } from '../../middleware/rate-limiter';

// Apply to streaming endpoint
router.post('/chat/stream', rateLimiter, authMiddleware, async (req: any, res) => {
  // ...
});
```

---

###  2. Client Disconnect Handler (Issue #12)

**File:** `backend/functions/src/routes/ai-assistant/chat.ts`

**Changes to `/chat/stream` endpoint:**

```typescript
router.post('/chat/stream', rateLimiter, authMiddleware, async (req: any, res) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send initial keepalive
  res.write(':ok\n\n');

  // +++ ADD THIS: Track if client disconnected +++
  let streamCancelled = false;

  req.on('close', () => {
    streamCancelled = true;
    console.log(`Stream cancelled for user ${req.auth.authId}`);
  });
  // +++ END +++

  try {
    const { message, conversationId } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      sendSSE(res, { type: 'error', data: { message: 'Message is required' } });
      sendSSE(res, { type: 'done', data: {} });
      res.end();
      return;
    }

    // ... existing code ...

    // --- Agentic Loop ---
    let rounds = 0;
    let pendingApproval: ApprovalRequest | null = null;

    while (rounds <= MAX_TOOL_ROUNDS) {
      // +++ ADD THIS: Check if stream was cancelled +++
      if (streamCancelled) {
        console.log(`Breaking agentic loop - client disconnected`);
        break;
      }
      // +++ END +++

      // Use streaming for Gemini calls
      const streamResponse = await genAI.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents,
        tools,
        systemInstruction: getSystemPrompt(authContext),
      });

      // +++ ADD THIS: Check before expensive operations +++
      if (streamCancelled) break;
      // +++ END +++

      let responseText = '';
      let toolCalls: any[] = [];

      for await (const chunk of streamResponse.stream) {
        // +++ ADD THIS: Check during streaming +++
        if (streamCancelled) break;
        // +++ END +++

        const content = chunk.candidates?.[0]?.content;
        
        // ... existing streaming logic ...
      }

      // +++ ADD THIS: Check before tool execution +++
      if (streamCancelled) break;
      // +++ END +++

      // Execute tools if requested
      if (toolCalls.length > 0) {
        // ... existing tool call logic ...

        for (const toolCall of toolCalls) {
          // +++ ADD THIS: Check before each tool call +++
          if (streamCancelled) break;
          // +++ END +++

          // ... execute tool ...
        }
      }

      // +++ ADD THIS: Final check before next round +++
      if (streamCancelled) break;
      // +++ END +++

      // ... rest of agentic loop ...
      rounds++;
    }

    // +++ ADD THIS: Don't save if stream was cancelled +++
    if (!streamCancelled) {
      // Save conversation
      await appendMessages(conversation.id, [
        buildMessage('user', message),
        buildMessage('assistant', fullResponseText, allToolCallRecords),
      ]);

      // Send final done event
      sendSSE(res, {
        type: 'done',
        data: {
          conversationId: conversation.id,
          toolCalls: allToolCallRecords.length,
          pendingApproval: pendingApproval?.id || null,
        },
      });
    }
    // +++ END +++

  } catch (error: any) {
    console.error('Stream error:', error);
    // +++ MODIFY THIS: Only send error if stream not cancelled +++
    if (!streamCancelled) {
      sendSSE(res, { type: 'error', data: { message: error.message } });
      sendSSE(res, { type: 'done', data: {} });
    }
    // +++ END +++
  } finally {
    // +++ ADD THIS: Always close response +++
    if (!res.writableEnded) {
      res.end();
    }
    // +++ END +++
  }
});
```

---

### 3. TTL for Pending Approvals (Issue #13)

**File:** `backend/functions/src/routes/ai-assistant/chat.ts`

**Changes to approval creation:**

```typescript
// When creating approval (inside /chat/stream endpoint)
const approvalPayload: ApprovalRequest = {
  id: approvalId,
  conversationId: conversation.id,
  tool: toolCall.name,
  action: args.action || 'execute',
  description: describeAction(toolCall.name, args),
  params: args,
  diff: diff || undefined,
  status: 'pending',
  createdAt: Date.now(),
  // +++ ADD THIS +++
  expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
  // +++ END +++
};

await admin
  .firestore()
  .collection(APPROVALS_COLLECTION)
  .doc(approvalId)
  .set(approvalPayload);
```

**Enable Firestore TTL** (run once via gcloud CLI):

```bash
# Enable TTL on ai_pending_approvals collection
gcloud firestore fields ttls update expiresAt \
  --collection-group=ai_pending_approvals \
  --project=blanket-alpha

# For staging
gcloud firestore fields ttls update expiresAt \
  --collection-group=ai_pending_approvals \
  --project=blanket-staging
```

---

### 4. Improved Error Messages (Issue #14)

**File:** `frontend/lib/streaming.ts`

**Changes to error handling:**

```typescript
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
    // +++ REPLACE THIS +++
    // OLD:
    // const err = await response.text().catch(() => 'Request failed');
    // callbacks.onError?.({ message: err });
    
    // NEW:
    const status = response.status;
    const body = await response.text().catch(() => '');
    
    let message: string;
    switch (status) {
      case 401:
        message = 'Session expired. Please log in again.';
        break;
      case 429:
        const retryAfter = response.headers.get('Retry-After');
        message = retryAfter
          ? `Too many requests. Please wait ${retryAfter} seconds and try again.`
          : 'Too many requests. Please wait a moment and try again.';
        break;
      case 500:
      case 502:
      case 503:
        message = 'Server error. Please try again in a few moments.';
        break;
      default:
        // Try to parse error message from body
        try {
          const json = JSON.parse(body);
          message = json.error || json.message || `Request failed (HTTP ${status})`;
        } catch {
          message = body || `Request failed (HTTP ${status})`;
        }
    }
    
    callbacks.onError?.({ message, status });
    // +++ END +++
    
    callbacks.onDone?.({});
    return;
  }

  // ... rest of function ...
}
```

**Update ErrorData interface:**

```typescript
export interface ErrorData {
  message: string;
  status?: number; // HTTP status code
  retryAfter?: number; // Seconds to wait before retry (for 429)
}
```

---

## Testing Checklist

### Rate Limiting
- [ ] User can make 10 requests in 1 minute
- [ ] 11th request returns 429 with "Rate limit exceeded" message
- [ ] User can make requests again after 1 minute
- [ ] Organization limit kicks in at 100 requests/hour
- [ ] Circuit breaker triggers after 3 errors
- [ ] Circuit breaker resets after 5 minutes

### Client Disconnect
- [ ] Open chat, send message, close browser mid-response
- [ ] Backend logs "Stream cancelled"
- [ ] Backend stops processing (no more tool calls in logs)
- [ ] No conversation saved for cancelled streams
- [ ] No orphaned Gemini API calls

### TTL Approvals
- [ ] Create approval, verify `expiresAt` field exists
- [ ] Wait 24 hours, verify approval auto-deleted
- [ ] Check Firestore console: no old approvals accumulating

### Error Messages
- [ ] 401 error shows "Session expired"
- [ ] 429 error shows "Too many requests. Wait X seconds"
- [ ] 500 error shows "Server error. Try again later"
- [ ] Network error shows "Connection lost"

---

## Deployment

1. **Merge this PR** to `develop` (deploys to staging)
2. **Test on staging** using checklist above
3. **Merge to `main`** (deploys to production)

---

## Issues Resolved

- Closes #11 (Rate limiting)
- Closes #12 (Client disconnect handler)
- Closes #13 (TTL for approvals)
- Closes #14 (Improved error messages)

---

## Estimated Time to Implement

- Rate limiting: 30 minutes (file already created)
- Client disconnect: 1 hour (add checks in agentic loop)
- TTL approvals: 15 minutes (add field + run gcloud command)
- Error messages: 30 minutes (update streaming.ts + interface)

**Total:** ~2.5 hours
