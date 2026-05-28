# WatchFilter — Beta Launch Checklist

## 1. Environment Variables (Vercel Dashboard)

Set all variables from `.env.example` in **Vercel → Project → Settings → Environment Variables**.

| Variable | Required | Notes |
|---|---|---|
| `NEXTAUTH_SECRET` | ✅ | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | ✅ | Your production domain, e.g. `https://watchfilter.app` |
| `GOOGLE_CLIENT_ID` | ✅ | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google Cloud Console |
| `OPENAI_API_KEY` | ✅ | Only `gpt-4o-mini` is used |
| `TURSO_DATABASE_URL` | ✅ | Turso project URL |
| `TURSO_AUTH_TOKEN` | ✅ | Turso auth token |
| `BLOB_READ_WRITE_TOKEN` | ✅ | Vercel Blob token |
| `RESEND_API_KEY` | ✅ | For email briefings + feedback |
| `FEEDBACK_EMAIL` | ✅ | Where feedback emails land |
| `CRON_SECRET` | ✅ | `openssl rand -hex 32` |
| `ADMIN_USER_EMAIL` | ✅ | Admin user for intelligence pipeline |

---

## 2. Google OAuth Setup

- [ ] Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
- [ ] Add **Authorized redirect URI**: `https://yourdomain.com/api/auth/callback/google`
- [ ] Remove any `localhost` redirect URIs for production (or keep for staging)
- [ ] Enable **YouTube Data API v3** in APIs & Services → Library

---

## 3. Database

- [ ] Confirm Turso database is provisioned and `TURSO_DATABASE_URL` points to production
- [ ] Schema is auto-created on first cold start via `ensureSchema()` — no manual migration needed
- [ ] (Optional) Verify schema initialized: run a test analysis end-to-end

---

## 4. Vercel Cron Job

- [ ] In Vercel → Project → Settings → Cron Jobs, add:
  - Path: `/api/cron/sync-intelligence`
  - Schedule: `0 */2 * * *` (every 2 hours)
  - Authorization header: `Bearer <your CRON_SECRET value>`

---

## 5. Pre-Deploy Build Check

- [ ] Run `npm run build` locally — must pass with zero errors
- [ ] Run `npm run lint` — must pass with zero warnings
- [ ] All pages render (check Vercel build output for static routes)
- [ ] No `.env.local` or `.env` files committed to git (verify with `git status`)

---

## 6. Smoke Tests (post-deploy)

Run these manually after deploying to production:

- [ ] **Sign in** — Google OAuth flow completes, session set
- [ ] **Analyze a video** — Paste a YouTube URL, analysis returns in <60s
- [ ] **Subscription Feed** — Feed loads with videos from subscriptions
- [ ] **Audio Briefing** — Click "Generate Audio", audio plays in player
- [ ] **Email Briefing** — Send a briefing email, confirm receipt
- [ ] **Quick Feedback** — Click 👍 Helpful on an analysis, confirm no error
- [ ] **Intelligence Terminal** — Navigate to `/intelligence`, data loads
- [ ] **Library** — Open library, select two analyses, run Compare
- [ ] **Sign out** — Session clears correctly

---

## 7. Security

- [ ] Confirm `NEXTAUTH_URL` matches the exact production domain (no trailing slash)
- [ ] Confirm no API keys are in any committed file (`git grep -i "sk-" --` to check)
- [ ] Security headers are active — verify with [securityheaders.com](https://securityheaders.com)
- [ ] `GET /api/analyses/[id]` now requires auth — test unauthenticated returns 401
- [ ] Rate limit on `/api/analyze`: 5 requests/minute per IP

---

## 8. Monitoring

- [ ] Check Vercel Functions logs after first 10 real analyses
- [ ] Watch for 5xx errors in Vercel Analytics → Functions tab
- [ ] Confirm transcript fetches succeed (check for `TRANSCRIPT_UNAVAILABLE` errors in logs)
- [ ] OpenAI usage dashboard: confirm `gpt-4o-mini` only (no accidental gpt-4o calls)

---

## 9. Analytics

Analytics events fire to `sessionStorage` by default and forward to `window.gtag` / `window.plausible` if configured.

To enable Google Analytics:
- Add your GA4 measurement ID to `src/app/layout.tsx`
- Events tracked: `video_analyzed`, `audio_played`, `consensus_opened`, `opportunity_clicked`, `dashboard_viewed`, `feedback_submitted`

---

## 10. Known Limitations (Non-Blocking for Beta)

- In-memory rate limiting resets on cold start (acceptable for beta scale)
- In-memory feed cache is per-process (DB cache tier handles this on Vercel)
- No automatic audio blob cleanup — manually remove old files if needed
- Trends and Upgrade views show "Coming in Phase 2" placeholders

---

## 11. Rollback Plan

If a critical bug appears post-launch:

```bash
# Revert to the last known-good deployment in Vercel Dashboard
# OR force-push a fixed commit:
git revert HEAD
git push origin main
```

Vercel auto-deploys within ~2 minutes of a push to `main`.

---

## Sign-Off

- [ ] All items above checked
- [ ] Smoke tests passed
- [ ] Monitoring confirmed active
- [ ] **Ready to share the URL**
