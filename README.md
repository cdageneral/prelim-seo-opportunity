# OrbitIQ

**Organic Growth Intelligence for CMO-Level Conversations**

OrbitIQ is a standing agentic web application that analyzes any website's organic opportunity — surfacing the true gaps in market capture, competitive share of voice, and AI search visibility — and presents it as a narrative-first brief a CMO can act on immediately.

---

## What It Does

1. **Add a client** → enter their website URL and industry
2. **Run Analysis** → OrbitIQ fires parallel API calls to Semrush, SerpAPI, and Profound
3. **Claude synthesizes** → personas, opportunity scoring, CMO-level narrative
4. **Review the brief** → market gap, competitor gap, LLM visibility, top 3 opportunities, buyer personas
5. **Export** → styled PDF or generate a Claude PPTX skill prompt for a presentation

---

## Tech Stack

| Layer           | Technology                                     |
|-----------------|------------------------------------------------|
| Framework       | Next.js 14 App Router (TypeScript)             |
| Auth            | Clerk (org-level team access)                  |
| Database        | Neon PostgreSQL via Vercel Integration         |
| ORM             | Drizzle ORM + Drizzle Kit                      |
| Storage         | Vercel Blob (PDF exports)                      |
| AI Synthesis    | Anthropic Claude API (haiku / sonnet / opus)   |
| PDF Rendering   | Puppeteer Core + @sparticuz/chromium           |
| Styling         | Tailwind CSS (dark brand palette)              |
| Data APIs       | Semrush · SerpAPI · Profound                   |
| Hosting         | Vercel Pro                                     |

---

## Local Setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/orbitiq.git
cd orbitiq
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local` with your actual keys:

| Variable                          | Source                                          |
|-----------------------------------|-------------------------------------------------|
| `DATABASE_URL`                    | Neon dashboard → Connection String              |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk dashboard → API Keys                    |
| `CLERK_SECRET_KEY`                | Clerk dashboard → API Keys                      |
| `SEMRUSH_API_KEY`                 | https://developer.semrush.com → API Keys        |
| `SERP_API_KEY`                    | https://serpapi.com → Account → API Key         |
| `PROFOUND_API_KEY`                | https://app.profound.io → Settings → API        |
| `ANTHROPIC_API_KEY`               | https://console.anthropic.com → API Keys        |
| `BLOB_READ_WRITE_TOKEN`           | Vercel dashboard → Storage → Blob               |

#### SERP provider selection (optional)

OrbitIQ reads AI Overviews, People Also Ask, Maps listings and the Local Pack
through ONE provider, chosen by `SERP_PROVIDER`. SerpAPI is the default; leave
these unset to stay on it.

| Variable                | Source / values                                                  |
|-------------------------|------------------------------------------------------------------|
| `SERP_PROVIDER`         | `serpapi` (default) or `dataforseo`. Any other value throws.      |
| `DATAFORSEO_LOGIN`      | https://app.dataforseo.com → API Dashboard → API Access           |
| `DATAFORSEO_PASSWORD`   | https://app.dataforseo.com → API Dashboard → API Access           |

Setting `SERP_PROVIDER=dataforseo` **without both credentials throws** rather
than falling back to SerpAPI. The fallback existed until v7.405 and was
invisible: you believed you had switched, every panel still read "SerpAPI", and
the SerpAPI bill kept running. A provider is a data-provenance fact, so failing
loudly is the honest outcome.

`SERP_PROVIDER` selects the provider for **keyword scans only** — the AI
Overview / People Also Ask path. That is the only path parity-tested against
DataForSEO; run the comparison yourself on real keywords via
`/api/serp-compare`.

**Local search stays on SerpAPI.** Google Maps listings and the local 3-pack are
pinned to SerpAPI in `lib/apis/serp.ts` (`LOCAL_SERP_PROVIDER`) and do NOT follow
`SERP_PROVIDER` (v7.409). Until v7.408 the one flag moved all three paths, so
switching AIO/PAA to DataForSEO silently moved the Local Search panel onto a
source nobody had compared. It is a constant rather than an env var on purpose:
a flag would let local move to an untested provider without the comparison being
run, and the Local panel's copy still names SerpAPI in several places — true
while it stays pinned, false the moment a flag moved it. Moving local is a
deliberate release: extend `/api/serp-compare` to cover Maps + Local Pack, run
it, then change the constant and make the panel's labels dynamic in the same
commit.

### 3. Push the database schema

```bash
npm run db:push
```

This creates all 5 tables in your Neon database via Drizzle Kit.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — sign in with Clerk → you're in.

---

## Deploy to Vercel Pro

### 1. Create GitHub repo and push

```bash
git init
git add .
git commit -m "initial: OrbitIQ scaffold"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/orbitiq.git
git push -u origin main
```

### 2. Connect to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repo
3. Framework preset: **Next.js** (auto-detected)
4. Click **Deploy**

### 3. Add Neon Integration

1. In your Vercel project → **Storage** tab → **Connect Database**
2. Select **Neon** → Create or connect existing database
3. Neon auto-injects `DATABASE_URL` into all environments

### 4. Add Vercel Blob

1. In **Storage** tab → **Connect Store** → **Blob**
2. `BLOB_READ_WRITE_TOKEN` is auto-injected

### 5. Add remaining environment variables

In Vercel project → **Settings** → **Environment Variables**, add:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
SEMRUSH_API_KEY
SERP_API_KEY
PROFOUND_API_KEY
ANTHROPIC_API_KEY
```

Optional, to run SERP calls through DataForSEO instead of SerpAPI:

```
SERP_PROVIDER=dataforseo
DATAFORSEO_LOGIN
DATAFORSEO_PASSWORD
```

### 6. Run database migration on production

```bash
npm run db:push
```
(Drizzle will use the production `DATABASE_URL` from Vercel's injected env)

Or run via Vercel CLI:
```bash
npx vercel env pull .env.production.local
DATABASE_URL=$(grep DATABASE_URL .env.production.local | cut -d= -f2) npm run db:push
```

---

## Clerk Team Access Setup

1. Create a Clerk application at [dashboard.clerk.com](https://dashboard.clerk.com)
2. Enable **Organizations** in the Clerk dashboard
3. Invite team members through Clerk's org management
4. All members of the same org will share access to the same projects

---

## Branch Strategy

| Branch | Purpose                    |
|--------|----------------------------|
| `main` | Production (auto-deploys to Vercel) |
| `dev`  | Development and staging    |

Create feature branches from `dev`, merge to `dev` for testing, then merge to `main` to deploy.

---

## Database Schema

Five tables managed by Drizzle ORM in `db/schema.ts`:

- **`projects`** — client project records (name, URL, industry, org-scoped)
- **`analyses`** — analysis runs with raw API snapshots (JSONB) + hero metrics
- **`personas`** — buyer personas derived per analysis
- **`opportunities`** — top 3 opportunities per analysis with evidence
- **`reports`** — PDF exports + PPT prompts (stored in Vercel Blob / text)

---

## API Architecture

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/projects` | GET | List org's projects |
| `/api/projects` | POST | Create project |
| `/api/projects/[id]` | GET | Project + latest analyses |
| `/api/projects/[id]` | PATCH | Update project |
| `/api/projects/[id]` | DELETE | Archive project |
| `/api/analyze` | POST | Trigger analysis (returns analysisId, polls via GET) |
| `/api/analyze` | GET | Poll analysis status |
| `/api/reports/pdf` | POST | Generate PDF, upload to Blob, return URL |
| `/api/reports/ppt-prompt` | POST | Generate Claude PPTX skill prompt |

---

## API Credit Strategy

| API | Usage | Limit |
|-----|-------|-------|
| Semrush | Domain overview + keywords + competitors + gap | ~10 units/analysis |
| SerpAPI | 50 keyword SERP scans | 50 credits/analysis |
| Profound | 5 parallel endpoints | Per subscription |
| Anthropic | Haiku (personas) + Sonnet (opps) + Opus (narrative) | ~50K tokens/analysis |

Raw API snapshots are stored as JSONB in Neon. Re-generating a brief from existing data costs **zero API credits**.

---

## Data Integrity Note

All data in OrbitIQ is sourced live from verified APIs (Semrush, SerpAPI, Profound) at analysis time. No simulated or modeled data is used in the brief. All displayed metrics include their source API attribution.
