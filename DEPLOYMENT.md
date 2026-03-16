# Blanket AI Agent Deployment Guide

**Project:** blanket-ai-agent  
**Backend:** Firebase Cloud Functions (Gen 1)  
**Frontend:** Next.js (deployment TBD)  

---

## Environments

| Environment | Firebase Project | Branch | Auto-Deploy? |
|-------------|------------------|--------|--------------|
| **Staging** | `blanket-staging` | `develop` | ✅ Yes (GitHub Actions) |
| **Production** | `blanket-alpha` | `main` | ✅ Yes (GitHub Actions) |

**GitHub Actions Workflow:** `.github/workflows/deploy.yml`

---

## Deployment Flow

### Automatic (Recommended)

**To Staging:**
1. Merge PR to `develop` branch
2. GitHub Actions auto-deploys to `blanket-staging`
3. Test at: `https://us-central1-blanket-staging.cloudfunctions.net/api/v2/ai-assistant/health`

**To Production:**
1. Merge PR from `develop` → `main`
2. GitHub Actions auto-deploys to `blanket-alpha`
3. Verify at: `https://us-central1-blanket-alpha.cloudfunctions.net/api/v2/ai-assistant/health`

---

### Manual (Emergency Hotfix)

**Prerequisites:**
- Firebase CLI installed: `npm install -g firebase-tools`
- Firebase token: Stored in GitHub Secrets as `FIREBASE_TOKEN`

**Deploy to Staging:**
```bash
cd backend
firebase use blanket-staging
firebase deploy --only functions:api --token "$FIREBASE_TOKEN"
```

**Deploy to Production:**
```bash
cd backend
firebase use blanket-alpha
firebase deploy --only functions:api --token "$FIREBASE_TOKEN"
```

---

## Pre-Deployment Checklist

### Before Merging to `develop` (Staging)

- [ ] TypeScript compiles clean: `cd backend/functions && npm run build`
- [ ] No linting errors: `npm run lint`
- [ ] PR approved by reviewer
- [ ] Related Jira ticket updated
- [ ] Breaking changes documented

### Before Merging to `main` (Production)

- [ ] **All staging tests passed** (critical!)
- [ ] Load testing completed (if applicable)
- [ ] Rate limiting tested (Issue #11)
- [ ] Client disconnect tested (Issue #12)
- [ ] Error messages verified (Issue #14)
- [ ] Monitoring/logging configured
- [ ] Rollback plan documented

---

## Post-Deployment Verification

### Staging

1. **Health Check:**
   ```bash
   curl https://us-central1-blanket-staging.cloudfunctions.net/api/v2/ai-assistant/health
   ```
   Expected: `{"status":"ok"}`

2. **Test Endpoints:**
   - POST `/chat` — Original chat endpoint
   - POST `/chat/stream` — Streaming chat (if deployed)
   - POST `/approve` — Approval endpoint (if deployed)

3. **Check Logs:**
   ```bash
   firebase functions:log --project blanket-staging --only api
   ```

4. **Manual Testing:**
   - Send test chat message via frontend
   - Verify response received
   - Check Firestore for conversation record

### Production

**Same as staging, but use `blanket-alpha` project**

**Additional:**
- [ ] Monitor error rates in Firebase Console
- [ ] Check Gemini API usage/costs
- [ ] Verify Firestore writes (conversations, approvals)
- [ ] Test from production frontend

---

## Rollback Procedure

### If Deployment Breaks Production

**Option 1: Revert via Git**
```bash
# On local machine
git checkout main
git revert <bad-commit-sha>
git push origin main

# GitHub Actions will auto-deploy the revert
```

**Option 2: Manual Rollback**
```bash
# Find last working deployment
firebase functions:log --project blanket-alpha --only api | grep "Function deployment complete"

# Rollback to previous version
firebase rollback functions:api --project blanket-alpha

# Verify
curl https://us-central1-blanket-alpha.cloudfunctions.net/api/v2/ai-assistant/health
```

**Option 3: Emergency Hotfix**
1. Create hotfix branch from `main`
2. Fix the issue
3. Fast-track PR review
4. Merge to `main` (auto-deploys)

---

## Monitoring

### Firebase Console

**Functions Logs:**
- https://console.firebase.google.com/project/blanket-staging/functions/logs
- https://console.firebase.google.com/project/blanket-alpha/functions/logs

**Firestore Usage:**
- https://console.firebase.google.com/project/blanket-staging/firestore
- https://console.firebase.google.com/project/blanket-alpha/firestore

### Key Metrics to Watch

**Backend:**
- Function invocations/minute
- Average execution time
- Error rate
- Gemini API calls/cost
- Firestore reads/writes

**Rate Limiting:**
- 429 errors (rate limit exceeded)
- Circuit breaker triggers
- Per-user/org request patterns

**Errors:**
- 500 errors (server crashes)
- Tool execution failures
- Approval timeouts

---

## Cost Management

### Gemini API Costs

**Monitor:**
- Requests/day per organization
- Average tokens per request
- Multi-turn conversations (can be expensive)

**Alerts:**
- Set budget alert in Google Cloud Console
- Monitor for runaway loops (MAX_TOOL_ROUNDS hit frequently)

**Optimization:**
- Use `gemini-2.5-flash` (cheaper than `gemini-2.5-pro`)
- Implement aggressive rate limiting
- Add org-level spending caps

### Firebase Costs

**Firestore:**
- Reads: ~$0.06 per 100K
- Writes: ~$0.18 per 100K
- Storage: ~$0.18/GB/month

**Cloud Functions:**
- Invocations: $0.40 per million
- Compute time: $0.0000025 per GB-second
- Network egress: $0.12/GB

**Monitoring:**
- Enable billing alerts in Firebase Console
- Review monthly usage reports
- Clean up old conversations (TTL)

---

## Feature Flags (Future)

Consider adding feature flags for production rollout:

```typescript
// Example: Enable streaming only for beta users
const ENABLE_STREAMING = process.env.ENABLE_STREAMING === 'true';

if (ENABLE_STREAMING) {
  router.post('/chat/stream', ...);
}
```

**Benefits:**
- Safe gradual rollout
- Easy rollback without code changes
- A/B testing

---

## Troubleshooting

### "Function deployment failed"

**Causes:**
- TypeScript compilation errors
- Missing dependencies
- Invalid firebase.json config

**Fix:**
```bash
cd backend/functions
npm run build
npm run lint
firebase deploy --only functions:api --debug
```

### "429 Too Many Requests"

**Cause:** Rate limiting triggered

**Fix:**
- Check user/org request patterns
- Adjust limits in `rate-limiter.ts`
- Add whitelist for internal testing

### "Stream cancelled for user X"

**Cause:** Client disconnected (normal behavior)

**No action needed** — this is expected when users close browser

### "Approval not found"

**Causes:**
- Approval expired (24h TTL)
- Approval already processed
- User trying to approve someone else's action

**Fix:**
- Check Firestore `ai_pending_approvals` collection
- Verify approval status field
- Add better error message in frontend

---

## Emergency Contacts

**Backend Issues:**
- Primary: @thuc-debugger
- Escalation: @blanketapp

**Firebase/GCP Issues:**
- Google Cloud Support (if critical)
- Firebase support ticket

**Gemini API Issues:**
- Google AI support ticket
- Check API status: https://status.cloud.google.com

---

## Related Documentation

- **Architecture:** `README.md`
- **Production Fixes:** `PRODUCTION_READINESS_FIXES.md`
- **MCP Tools:** `backend/functions/src/mcp-tools/README.md`
- **API Endpoints:** (TBD - add OpenAPI spec)

---

**Last Updated:** March 16, 2026  
**Version:** 1.0 (BK-855 Streaming AI Agent)
