# Deployment Guide

## Prerequisites

### Accounts & Access
- [ ] Firebase project: `blanket-alpha` (existing)
- [ ] Vercel account (for frontend hosting)
- [ ] Google Cloud project (for Gemini AI)
- [ ] PostgreSQL credentials (read-only user)
- [ ] GitHub repo: `blanketinc/blanket-ai-agent`

### Credentials Needed
- Firebase service account JSON (for backend)
- Gemini API key
- PostgreSQL connection details
- Vercel deployment token (optional, for CI/CD)

---

## Backend Deployment (Cloud Functions)

### Step 1: Install Firebase CLI
```bash
npm install -g firebase-tools
firebase login
```

### Step 2: Initialize Firebase Project
```bash
cd backend
firebase use blanket-alpha
```

### Step 3: Configure Environment Variables

Create `backend/functions/.env`:
```env
GEMINI_API_KEY=your-gemini-api-key-here
POSTGRES_HOST=34.29.138.25
POSTGRES_PORT=5432
POSTGRES_USER=blanket-app
POSTGRES_PASSWORD=P0rkbuns
POSTGRES_DB=postgres
```

### Step 4: Install Dependencies
```bash
cd backend/functions
npm install
```

### Step 5: Build TypeScript
```bash
npm run build
```

### Step 6: Test Locally
```bash
firebase emulators:start --only functions

# Test endpoint:
curl -X POST http://localhost:5001/blanket-alpha/us-central1/api/v2/ai-assistant/chat \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'
```

### Step 7: Deploy to Production
```bash
firebase deploy --only functions:api

# Expected output:
# ✔  functions[api(us-central1)] Successful update operation.
# Function URL: https://us-central1-blanket-alpha.cloudfunctions.net/api
```

### Step 8: Verify Deployment
```bash
# Check function logs
firebase functions:log --only api

# Test production endpoint
curl https://us-central1-blanket-alpha.cloudfunctions.net/api/v2/ai-assistant/chat
```

---

## Frontend Deployment (Vercel)

### Step 1: Install Vercel CLI
```bash
npm install -g vercel
vercel login
```

### Step 2: Configure Environment Variables

Create `frontend/.env.local`:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=blanket-alpha.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=blanket-alpha
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=blanket-alpha.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id

NEXT_PUBLIC_API_URL=https://us-central1-blanket-alpha.cloudfunctions.net/api/v2/ai-assistant
```

### Step 3: Install Dependencies
```bash
cd frontend
npm install
```

### Step 4: Test Locally
```bash
npm run dev
# Open http://localhost:3000
```

### Step 5: Deploy to Vercel
```bash
vercel --prod

# Follow prompts:
# - Link to existing project? No
# - Project name: blanket-ai-agent
# - Directory: frontend
```

### Step 6: Configure Custom Domain
```bash
# In Vercel dashboard:
# Settings → Domains → Add Domain
# Add: ai.blanket.app

# In your DNS provider (Cloudflare/etc):
# Add CNAME record:
# ai.blanket.app → cname.vercel-dns.com
```

### Step 7: Verify Deployment
```bash
# Visit: https://blanket-ai-agent.vercel.app
# Or: https://ai.blanket.app (after DNS propagates)
```

---

## Database Setup

### Create Read-Only User (if not exists)
```sql
-- Connect to PostgreSQL as admin
psql -h 34.29.138.25 -U postgres -d postgres

-- Create read-only user for AI agent
CREATE USER ai_agent_reader WITH PASSWORD 'secure-password-here';

-- Grant read access to all tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ai_agent_reader;

-- Grant access to future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT SELECT ON TABLES TO ai_agent_reader;
```

### Test Connection
```bash
psql -h 34.29.138.25 -U ai_agent_reader -d postgres -c "SELECT COUNT(*) FROM listtemplates;"
```

---

## Firestore Collections

### Create Collections (if not exists)

**Collection:** `ai_conversations`
- Document ID: `conv-{uuid}`
- Fields:
  - `userId` (string)
  - `organizationId` (string)
  - `messages` (array)
  - `createdAt` (timestamp)
  - `updatedAt` (timestamp)

**Firestore Rules:**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /ai_conversations/{conversationId} {
      // Users can only access their own conversations
      allow read, write: if request.auth != null 
        && request.auth.uid == resource.data.userId;
    }
  }
}
```

---

## CI/CD (Optional)

### GitHub Actions

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - name: Install Firebase CLI
        run: npm install -g firebase-tools
      - name: Deploy Functions
        run: |
          cd backend/functions
          npm install
          npm run build
          firebase deploy --only functions --token ${{ secrets.FIREBASE_TOKEN }}
  
  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - name: Deploy to Vercel
        run: |
          cd frontend
          npm install
          npx vercel --prod --token ${{ secrets.VERCEL_TOKEN }}
```

---

## Monitoring

### Cloud Functions Logs
```bash
# Real-time logs
firebase functions:log --only api

# Filter by severity
firebase functions:log --only api --level ERROR

# Export to file
firebase functions:log --only api > logs.txt
```

### Sentry (Error Tracking)

**Install:**
```bash
npm install @sentry/node
```

**Configure:** `backend/functions/src/core/sentry.ts`
```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'your-sentry-dsn',
  environment: 'production',
  tracesSampleRate: 0.1,
});

export { Sentry };
```

**Use:**
```typescript
try {
  // ... code
} catch (error) {
  Sentry.captureException(error);
  console.error('Error:', error);
}
```

### Vercel Analytics

Enable in Vercel dashboard:
- Settings → Analytics → Enable
- Tracks page views, Core Web Vitals, etc.

---

## Rollback Procedures

### Backend (Cloud Functions)
```bash
# List recent deployments
firebase functions:log --only api | head -100

# Rollback to previous version
firebase rollback functions:api

# Or redeploy previous Git commit
git checkout <previous-commit>
firebase deploy --only functions:api
git checkout main
```

### Frontend (Vercel)
```bash
# In Vercel dashboard:
# Deployments → Select previous deployment → Promote to Production

# Or via CLI:
vercel rollback <deployment-url>
```

---

## Troubleshooting

### Backend Issues

**Problem:** Function not deploying
```bash
# Check build errors
cd backend/functions
npm run build

# Check Firebase config
firebase functions:config:get

# Check IAM permissions
gcloud projects get-iam-policy blanket-alpha
```

**Problem:** Function timing out
```bash
# Increase timeout in firebase.json:
{
  "functions": {
    "timeoutSeconds": 60,  // Default: 60, Max: 540
    "memory": "1GB"
  }
}
```

**Problem:** Database connection failing
```bash
# Test PostgreSQL connectivity
psql -h 34.29.138.25 -U blanket-app -d postgres -c "SELECT 1;"

# Check Cloud SQL IP whitelist
# In GCP Console → SQL → blanket-alpha-db → Connections → Authorized networks
```

### Frontend Issues

**Problem:** Build failing
```bash
cd frontend
npm run build  # Check for errors

# Common fixes:
# - Update Node version (use Node 18+)
# - Clear cache: rm -rf .next node_modules && npm install
```

**Problem:** Firebase Auth not working
```bash
# Check Firebase config in .env.local
# Verify Firebase Auth is enabled in Firebase Console
# Check browser console for errors
```

---

## Security Checklist

Before going live:
- [ ] Firebase Auth enabled with email/password
- [ ] Firestore rules deployed (users can only access own conversations)
- [ ] PostgreSQL read-only user configured
- [ ] Rate limiting enabled (60 messages/hour)
- [ ] HTTPS enforced (automatic with Vercel + Cloud Functions)
- [ ] Error messages sanitized (no internal errors exposed)
- [ ] Sentry configured for error tracking
- [ ] API keys stored in environment variables (not hardcoded)

---

## Post-Deployment

### Day 1
- [ ] Monitor Cloud Function logs for errors
- [ ] Check Sentry for exceptions
- [ ] Verify authentication flow works
- [ ] Test sample conversations

### Week 1
- [ ] Review usage metrics (Vercel Analytics)
- [ ] Check Gemini API costs
- [ ] Monitor rate limit hits
- [ ] Gather user feedback

### Ongoing
- [ ] Weekly log review
- [ ] Monthly cost review
- [ ] Quarterly security audit

---

## Support

**Issues during deployment?**
- Contact: Thuc (debugging expert)
- Telegram: "Team Connect" group
- Jira: [BK-849](https://blanketinc.atlassian.net/browse/BK-849)

---

**Deploy carefully, monitor closely, iterate quickly!**
