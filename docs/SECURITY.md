# Security Model

## Authentication

### Firebase Auth
- Same Firebase project as Blanket main app (`blanket-alpha`)
- Users log in with existing Blanket credentials
- Auth state shared across tabs (single sign-on)

### Token Structure
```javascript
// Firebase ID token includes custom claims:
{
  uid: "user-auth-id",
  email: "user@example.com",
  orgId: "upwardProjects",           // User's organization
  locationIds: ["loc1", "loc2"],      // User's accessible locations
  role: "manager"                      // User's role
}
```

### Token Lifecycle
- **Expiry:** 1 hour
- **Refresh:** Automatic (Firebase SDK handles)
- **Validation:** Every API call validates token server-side

---

## Authorization

### Org/Location Isolation

**Rule:** User can ONLY access data from their org/locations

**Implementation:**

#### Cloud Function Tools
```typescript
// Every tool validates org access
export const blanketAPITools: MCPTool = {
  execute: async (params, context) => {
    // Validate org
    if (params.organizationId !== context.orgId) {
      throw new Error('Access denied: Cannot access other organizations');
    }
    
    // Validate location (if applicable)
    if (params.locationId && !context.locationIds.includes(params.locationId)) {
      throw new Error('Access denied: Cannot access this location');
    }
    
    // Proceed with authorized call
    // ...
  }
};
```

#### PostgreSQL Queries
```sql
-- Always filter by user's org
SELECT * FROM listentries
WHERE "organizationId" = $1  -- context.orgId

-- Always filter by user's locations (when applicable)
AND "locationId" = ANY($2)   -- context.locationIds
```

---

## Data Access Levels

### What Users CAN Access
- ✅ Their organization's listTemplates
- ✅ Their organization's list entries (completion data)
- ✅ Their assigned locations only
- ✅ General food safety information (public knowledge)

### What Users CANNOT Access
- ❌ Other organizations' data
- ❌ Locations not assigned to them
- ❌ Admin-only endpoints
- ❌ Direct database writes (all writes via validated APIs)

---

## Audit Trail

### Conversation Logging

**Collection:** `ai_conversations` (Firestore)

**Document Structure:**
```javascript
{
  id: 'conv-uuid',
  userId: 'user-auth-id',
  organizationId: 'upwardProjects',
  messages: [
    {
      role: 'user',
      content: 'Add temp check to all bar templates',
      timestamp: 1234567890
    },
    {
      role: 'assistant',
      content: 'I found 8 bar templates...',
      timestamp: 1234567891,
      toolCalls: [
        {
          tool: 'blanket-api',
          action: 'update_template',
          params: { templateId: '...' },
          success: true
        }
      ]
    }
  ],
  createdAt: 1234567890,
  updatedAt: 1234567891
}
```

### What Gets Logged
- ✅ Every user message
- ✅ Every AI response
- ✅ Every tool call (with parameters)
- ✅ Success/failure status
- ✅ Timestamps

### Log Retention
- Keep indefinitely (for audit purposes)
- User can request deletion (GDPR compliance)

---

## Rate Limiting

### Per User
- **Max:** 60 messages per hour
- **Why:** Prevent abuse, control costs
- **Enforcement:** Cloud Function middleware

### Implementation
```typescript
// backend/functions/src/middleware/rate-limit.ts
const rateLimitMap = new Map<string, number[]>();

export const rateLimitMiddleware = (req, res, next) => {
  const userId = req.auth.authId;
  const now = Date.now();
  const oneHourAgo = now - 3600000;
  
  // Get user's recent messages
  const userMessages = rateLimitMap.get(userId) || [];
  const recentMessages = userMessages.filter(ts => ts > oneHourAgo);
  
  if (recentMessages.length >= 60) {
    return res.status(429).json({
      error: 'Rate limit exceeded. Max 60 messages per hour.'
    });
  }
  
  // Add this message to history
  recentMessages.push(now);
  rateLimitMap.set(userId, recentMessages);
  
  next();
};
```

---

## Error Handling

### Never Expose Internal Errors
```typescript
// ❌ BAD
return res.status(500).json({
  error: error.message,  // Might leak sensitive info
  stack: error.stack     // Definitely leaks internals
});

// ✅ GOOD
console.error('Internal error:', error);  // Log for debugging
sentry.captureException(error);           // Send to Sentry
return res.status(500).json({
  error: 'An error occurred. Please try again.'
});
```

### Sanitize SQL Queries
```typescript
// ❌ BAD (SQL injection risk)
const sql = `SELECT * FROM users WHERE id = '${userId}'`;

// ✅ GOOD (parameterized query)
const sql = `SELECT * FROM users WHERE id = $1`;
const result = await pool.query(sql, [userId]);
```

---

## Production Checklist

### Before Launch
- [ ] All endpoints require authentication (`authMiddleware`)
- [ ] All tools validate org/location access
- [ ] All SQL queries parameterized (no injection risk)
- [ ] Rate limiting enabled
- [ ] Error messages sanitized
- [ ] Sentry configured for error tracking
- [ ] Audit logging enabled
- [ ] HTTPS enforced (Vercel + Cloud Functions handle this)
- [ ] Firebase custom claims configured
- [ ] Token expiry tested

### Ongoing Monitoring
- [ ] Monitor rate limit hits (users hitting 60/hour?)
- [ ] Monitor failed auth attempts
- [ ] Monitor unauthorized access attempts
- [ ] Review audit logs periodically
- [ ] Track Gemini API costs

---

## Incident Response

### If Unauthorized Access Detected

1. **Immediate:** Disable affected user's token
2. **Investigate:** Review audit logs for scope of access
3. **Notify:** Inform customer and internal team
4. **Fix:** Patch vulnerability
5. **Review:** Conduct security review of all auth code

### Contact
- **Security Lead:** Winn3r
- **Technical Support:** Thuc (debugging)

---

## Compliance

### GDPR (if applicable)
- Users can request conversation history
- Users can request deletion of conversation history
- No training on user data (Gemini configured with no training policy)

### Data Residency
- **US Region:** Cloud Functions (us-central1), Firestore (US)
- **If EU customers:** May need separate deployment

---

## FAQ

**Q: Can AI access data from other organizations?**  
A: No. Every tool validates `params.organizationId === context.orgId` before executing.

**Q: Can AI write directly to the database?**  
A: No. All writes go through validated Cloud Functions that enforce permissions.

**Q: What if a user's token is compromised?**  
A: Token expires after 1 hour. Revoke token via Firebase Auth console if needed.

**Q: Can AI delete data?**  
A: Only if the user has permission to delete (via existing Blanket APIs). AI doesn't bypass permissions.

**Q: How do we track what AI did on behalf of a user?**  
A: All tool calls are logged in Firestore (`ai_conversations` collection) with full parameters.

---

**Security is critical for customer trust. Follow this model strictly.**
