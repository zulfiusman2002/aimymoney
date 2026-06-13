# AI My Money

An AI-powered personal wealth operating system. Multi-user SaaS evolution of the original Zulfi & Aiman dashboard — same premium beige/dark identity, now with real authentication, a real database, and Claude running securely behind serverless functions.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite, Recharts, Cormorant Garamond / JetBrains Mono theme |
| Hosting | Netlify (static build + functions) |
| Backend | Netlify Functions (`netlify/functions/`) |
| Database + Auth + Storage | Supabase (Postgres with Row Level Security) |
| AI | Claude via `ANTHROPIC_API_KEY` — **backend only, never in browser code** |

## How the Claude integration works

1. The browser never holds an API key. `src/lib/api.js` calls `/api/*` with the user's **Supabase session JWT**.
2. Every function (`netlify/functions/*.mjs`) verifies that JWT with the Supabase service role, so an unauthenticated caller gets 401 and a user can only ever trigger analysis of **their own** rows.
3. `_lib/core.mjs` builds the user's full financial context server-side (income, expenses, snapshots, goals, liabilities) and sends it to Claude with strict guardrails: no invented numbers, no buy/sell directives, mandatory disclaimer, "not enough data" responses when data is missing.
4. Functions:
   - `analyze` — all 8 one-click reviews (full-review, budget, portfolio, goals, networth, risk, savings, changes) returning structured JSON (headline, health score, insights, actions, confidence, data gaps)
   - `ai-chat` — advisor chat with full financial context
   - `analyze-screenshot` — vision extraction of portfolio screenshots into the structured holdings JSON
   - `learning-card` — picks the most relevant unfinished lesson based on the user's real data

## Setup

### 1. Supabase (≈5 minutes)

1. Create a project at supabase.com.
2. SQL Editor → run **`supabase/schema.sql`**, then **`phase-1-5.sql`**, **`phase-1-6.sql`**, **`phase-2-1.sql`**, **`phase-2-1-1.sql`** in order (tables, RLS, screenshots bucket, Learn seed, intelligence layer, assets history, month-aware income).
3. Authentication → Providers → enable **Email**. For instant signups during development, turn **off** "Confirm email" (turn back on for production).
4. Project Settings → API: copy the **URL**, **anon key**, and **service_role key**.

### 2. Demo account

1. Authentication → Users → Add user: `demo@aimymoney.app`, choose a password, auto-confirm.
2. Copy the new user's UUID.
3. Open `supabase/seed-demo.sql`, find/replace `DEMO_USER_ID` with that UUID, run it.

The demo user gets a realistic family budget, two dated UK-stocks snapshots (so "What Changed?" has something to compare), MF/crypto/property/cash positions, three goals, a liability, and a learning streak.

### 3. Local development

```bash
npm install
cp .env.example .env        # fill in VITE_ values + backend values
npx netlify dev             # runs Vite + functions together on :8888
```

### 4. Netlify deployment

1. Push this repo to GitHub, then Netlify → "Add new site" → import the repo. Build settings are read from `netlify.toml` automatically.
2. Site settings → **Environment variables** → add:

| Variable | Scope | Value |
|---|---|---|
| `VITE_SUPABASE_URL` | Builds | your Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | Builds | anon key (safe in frontend — RLS protects data) |
| `SUPABASE_URL` | Functions | same Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Functions | service role key — **secret** |
| `ANTHROPIC_API_KEY` | Functions | your Anthropic key — **secret** |
| `ANTHROPIC_MODEL` | Functions | optional, defaults to `claude-sonnet-4-6` |

3. Deploy. `/api/*` redirects to functions; all other routes fall back to the SPA.

## Build status

**Done (Phases 1 → 2):**
- **Auth & onboarding** — email/password, protected routes, 8-step guided setup, demo account seed.
- **Dashboard** — live stats, spending chart, goal progress, total wealth + net worth, connected cross-module insights, one-click AI briefing.
- **Budget** — month selector with MoM comparison, income / fixed-variable-one-time expense / savings-allocation CRUD, Sankey money flow (Income → Fixed/Variable/One-time → Savings → destinations), category chart, savings-rate gauge, top movers vs last month, AI budget insights.
- **Investments** — end-to-end screenshot workflow (client-side compression → private storage → Claude extraction → editable review table with per-holding confidence → FX confirmation → dated snapshot → comparison vs previous), plus "Other Wealth" (property, land, gold, pension, cash, vehicle) with valuation history and Total Wealth Composition.
- **Goals** — CRUD, on-track/behind trajectory math, ETA timeline, scenario slider ("what if I add £X/mo" with one-tap commit), budget headroom strip, asset linkage, AI goal check.
- **Net Worth** — composition card, allocation treemap across investments + assets, liquid/semi/illiquid split, Liabilities CRUD (mortgage, personal, credit card, car, education, other) with payoff estimates, net-worth trend from monthly snapshots, AI review.
- **Projector** — projections from actual net worth: sliders (monthly savings, return, property growth, inflation, lump sum), conservative/base/aggressive scenarios, 3/5/10/20-year milestones, contribution-vs-growth split, year-by-year table, nominal vs today's-money toggle. Liabilities amortise at current payments.
- **AI Advisor** — 8 one-click structured analyses + context-aware chat over the whole-life financial context.
- **Learn** — daily personalised card driven by deterministic behaviour triggers, quiz, XP, streaks, module path.
- **Intelligence layer** — monthly snapshots, cross-module insights engine, FX-aware assets model with valuation history.

**Phase 2.1 — Stabilisation (done):** onboarding routes broker assets to investment placeholders and non-broker wealth (with optional estimated values) into the assets table; month-aware income via `income_records` (standard income is a labelled fallback with one-tap "Confirm for <month>", so editing income never rewrites history); "Import fixed expenses" suggestion on new months + copy-previous button; goals link to assets by ID with coverage display for liquid assets; Projector amortises each debt with interest where rate+payment exist and flags approximations; mobile bottom navigation, PWA manifest/icons/service worker — the app is **installable** to the home screen, but **not offline-capable yet** (the service worker is a network passthrough; offline caching is future work); validation: no negative values, over-allocation warning in Budget, overcommitted-goals warning, stale/missing FX badges on assets.

**Phase 2.1.1 — Hardening (done):** duplicate income-record prevention (idempotent materialisation + partial unique index on user/month/source + dedupe migration + double-click guard); explicit "Use linked asset value as progress" button on goals (opt-in, never silent); per-page code-splitting via React.lazy (initial bundle no longer ships Recharts or the wizards); Settings page (name, country, base-currency label with a re-conversion warning, tracker type, sign out, delete-account placeholder), reachable from the header.

**Next:**
- Budget PDF export · expense heatmap
- Investments: risk heatmap, geography view, gain/loss waterfall, screenshot timeline
- Advisor: analysis history, richer response cards
- Learn: more lessons per module, habit challenges, streak calendar
- Settings: currency re-conversion, account deletion flow
- E2e tests · offline caching for the PWA

## Limitations / notes

- Email confirmation flow depends on your Supabase auth settings; configure SMTP for production.
- Screenshot extraction confidence is reported per holding — always show the review table before saving (the function never writes holdings itself).
- The AI provides educational analysis only; the disclaimer is enforced in the system prompt, not just the UI.
- Recharts bundle is large; code-split per-tab when more tabs land.
