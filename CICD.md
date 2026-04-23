# TrackShellMappingPlatform — CI/CD

## Overview

```
Push to feature/* or dev
        ↓
GitHub Actions — test.yml
  - npm install
  - npm run test (must pass to merge)
  - npm run build (TypeScript check)
        ↓
Merge to dev
  → Vercel deploys preview environment automatically
  → GitHub Actions runs prisma migrate deploy on staging DB
        ↓
Merge dev to main
  → GitHub Actions runs prisma migrate deploy on production DB
  → Vercel deploys to production automatically
```

---

## Branch strategy

| Branch | Purpose | Auto-deploys to |
|--------|---------|----------------|
| `main` | Production | Vercel (production) + RDS prod migrations |
| `dev` | Staging | Vercel (preview) + RDS staging migrations |
| `feature/*` | Development | No auto-deploy — tests only |

**Rules:**
- Never push directly to `main` or `dev`
- All feature branches must PR to `dev` first
- PRs blocked from merging if tests or build fail
- Database migrations run before Vercel deployment on every merge

---

## GitHub Actions workflows

### test.yml — runs on every PR
```
Trigger: pull_request to dev or main
Steps:
  1. Checkout code
  2. Set up Node.js 20
  3. npm ci
  4. npm run lint
  5. npm run build     ← catches TypeScript errors
  6. npm run test      ← Jest unit + integration tests
  7. Fail PR if any step fails
```

### deploy.yml — runs on merge to dev or main
```
Trigger: push to dev or main
Steps:
  1. Checkout code
  2. Set up Node.js 20
  3. npm ci
  4. Configure AWS credentials
  5. Run: npx prisma migrate deploy
     (against staging DB if dev branch, prod DB if main)
  6. Vercel deployment triggers automatically via Vercel GitHub integration
  7. Run smoke test: GET /api/health → expect 200
```

Note: Vercel handles the actual build and deployment.
GitHub Actions only handles migrations and smoke tests.

---

## Environment variables

### GitHub Secrets (set in repo Settings → Secrets)

```
# For running migrations in CI
DATABASE_URL_PROD         Production PostgreSQL connection string
DATABASE_URL_STAGING      Staging PostgreSQL connection string

# AWS (if needed for S3 signed URLs)
AWS_ACCESS_KEY_ID         AWS credentials
AWS_SECRET_ACCESS_KEY     AWS credentials
AWS_REGION                ap-northeast-2
```

### Vercel Environment Variables
Set in Vercel dashboard → Project Settings → Environment Variables.
Vercel injects these at build time and runtime.

```
DATABASE_URL              PostgreSQL connection string (per environment)
NEXTAUTH_SECRET           JWT signing secret
NEXTAUTH_URL              Full dashboard URL
REDIS_URL                 AWS ElastiCache connection string
NEXT_PUBLIC_MAPBOX_TOKEN  Mapbox token (public — safe to expose)
PIPELINE_API_URL          golf-segmentation job runner URL
PIPELINE_API_KEY          Shared secret for pipeline API auth
AWS_REGION                ap-northeast-2
AWS_ACCESS_KEY_ID         AWS credentials
AWS_SECRET_ACCESS_KEY     AWS credentials
```

**Important:** Never put secrets in NEXT_PUBLIC_ prefixed variables.
Only NEXT_PUBLIC_MAPBOX_TOKEN is safe to expose to the browser.

---

## Database migrations

Migrations run automatically in CI/CD before each deployment.
Never run migrations manually in production unless emergency.

```bash
# Development — create a new migration
npx prisma migrate dev --name your_migration_name

# Staging/Production — apply pending migrations (CI/CD does this)
npx prisma migrate deploy

# Check migration status
npx prisma migrate status

# Emergency: reset dev database (NEVER in production)
npx prisma migrate reset
```

### Migration safety rules
- Always test migrations on staging before merging to main
- Never delete a migration file from prisma/migrations/
- Migrations are irreversible in production — be careful with DROP statements
- For destructive changes, use a two-step migration:
  Step 1: add new column/table (deploy)
  Step 2: remove old column/table (deploy after verifying step 1)

---

## Vercel configuration

Vercel is connected to this GitHub repo via the Vercel GitHub integration.
It builds and deploys automatically on every push to main and dev.

```json
// vercel.json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "installCommand": "npm ci"
}
```

Build settings in Vercel dashboard:
- Framework: Next.js
- Root directory: ./
- Node version: 20.x

---

## Rollback

### Frontend rollback (Vercel)
1. Go to Vercel dashboard → Project → Deployments
2. Find the last working deployment
3. Click the three dots → Promote to Production
Takes effect in ~30 seconds.

### Database rollback
There is no automatic DB rollback. If a migration causes issues:
1. Roll back the frontend to the previous deployment immediately
2. Write a new corrective migration to fix the data issue
3. Never manually edit production DB rows without a migration

---

## Monitoring

- **Logs**: Vercel dashboard → Project → Functions tab (serverless function logs)
- **Errors**: Sentry (DSN set in Vercel environment variables)
- **DB performance**: AWS RDS Performance Insights
- **Uptime**: external monitor on /api/health endpoint
- **Alerts**: Sentry email alerts on new errors

---

## Smoke test after deployment

```bash
# Check dashboard is up
curl https://dashboard.golfmap.io/api/health

# Expected
{ "status": "ok" }

# Check auth is working (should redirect to login)
curl -I https://dashboard.golfmap.io/dashboard/courses
# Expected: 302 redirect to /login
```

---

## Local development with production database (emergency only)

```bash
# Never do this unless absolutely necessary
# Use staging DATABASE_URL, never production
DATABASE_URL=postgresql://... npx prisma studio
```

---

## Contact

If Vercel deployment fails:
1. Check Vercel deployment logs for build errors
2. Check GitHub Actions logs for migration errors
3. Check Sentry for runtime errors after deployment
4. Roll back via Vercel dashboard if users are affected
