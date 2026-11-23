# Hookline: prospect → personalised outreach draft

**ASA Case Study · PS-3 (GTM) · Vaibhav Kumar, IIT Kanpur**

A rep names a prospect. Hookline:

1. researches the person and company
2. finds a real, recent signal
3. picks the angle that best connects that signal to what the seller offers
4. writes a short email and a LinkedIn note
5. checks every factual claim against its source before a human sees it

It also knows when **not** to write. A human approves everything; nothing is sent automatically.

## What makes it different

| | Generic approach | Hookline |
|---|---|---|
| Facts | LLM summarises search results, which can introduce made-up details | Every signal carries a **verbatim quote** that must appear in the source. Every claim in the email is **fact-checked**. Unsupported claims trigger a rewrite and are cut if they persist. If one can't be located to cut, the draft drops to LOW confidence and **can't be approved** until the rep edits it out or confirms it |
| Angle | First thing found | **Hook tournament**: 3 angles (signal → pain → *our* value prop), scored by a separate judge on relevance, specificity, timeliness, credibility and tact |
| Outcome | Always a draft | **Ready · Pause · Pivot · Hold · Degrade**, each with a reason |
| Batch | One at a time | CSV batch, review queue sorted by risk, **same-account collision avoidance** |
| Proof | "Trust me" | Cost, time and sources on every run; test-set pass rate; edit-rate metric |

## Edge cases (each one changes what the process does)

| Case | Trigger | Behaviour |
|---|---|---|
| **⏸ Pause** | Several plausible people share the name at that company | Stops mid-run and shows the rep the candidates with evidence. Resumes from the same point after the pick |
| **↪ Pivot** | Profile/news shows the person moved companies | Re-targets the new company, uses the new role as the hook, suggests a CRM update |
| **✋ Hold** | Layoffs, acquisition, lawsuit or crisis in the last 30 days, or the company is an existing customer or competitor | Writes nothing. Gives the reason, the source and a revisit date |
| **⤓ Degrade** | No public profile, or no person/team-level signal | Falls back person → team → company → role. Writes a short, honest note marked lower confidence and suggests better-documented colleagues |
| Bonus: **⇄ Collision** | Two people from the same account in one batch | The second person gets a different hook |
| Bonus: **✎ Self-correct** | The draft states something no source supports | The verifier catches it; the draft is rewritten before the rep sees it |

## Run it locally

```bash
npm install
cp .env.example .env.local      # add your keys (see below)
npm run dev                     # http://localhost:3000
```

With no keys it starts in **mock mode**: fictional sample prospects that exercise every branch, with a MOCK badge on every screen. `npm test` runs the branch test suite in mock mode.

**Keys you need for live runs:**

- **One LLM key**: Anthropic, OpenAI or Gemini. Defaults are a fast model for extraction and checking, and a stronger one for the tournament and drafting. Override with `LLM_MODEL_FAST` / `LLM_MODEL_SMART`.
- **A search key**: [Exa](https://exa.ai) is recommended (it has people, company and news search). [Tavily](https://tavily.com) is the fallback.

## Deploy (Vercel)

1. `npx vercel link`, or push to GitHub and import the repo in Vercel.
2. Add the env vars from `.env.example`:
   - **`DATABASE_URL` is required.** Without it, run creation returns a clear 503 and a banner explains why. (Serverless instances don't share `/tmp`, so a file store would lose runs silently.) A free Neon Postgres works (`npx vercel integration add neon`), and tables are created automatically.
   - **`APP_PASSWORD`** on any public URL. Otherwise anyone can spend your LLM/search credits and read your prospect research.
3. Deploy. Each run gets up to 300s (`maxDuration`).

**Runs survive the browser.** A run doesn't depend on the tab that started it. The stream route keeps working after the client disconnects (`after()`). If a worker is killed anyway, every stage is checkpointed: a run that is "running" with no checkpoint for 6 minutes is reclaimed by the next viewer and resumes from its last completed stage. Batch ids live in the URL (`/batch?b=…`), so reopening a batch resumes whatever is unfinished.

## Architecture

```
src/lib/pipeline/index.ts     orchestrator: runs stages in order, saves after each one, pause/resume
src/lib/pipeline/research.ts  identity → freshness (job change) → gather (6 lanes in parallel) → extract & score
src/lib/pipeline/write.ts     sensitivity gate → hook tournament → draft → verify (claim check + quality rules)
src/lib/llm.ts                Anthropic / OpenAI / Gemini, JSON validated with zod, retry once
src/lib/search.ts             Exa first, Tavily fallback; a failed source never kills the run
src/lib/store/                Postgres (prod) or JSON file (local)
src/app/runs/[id]             live run view (Server-Sent Events, one event per stage)
src/app/dashboard             history, status, outputs, metrics
src/app/batch                 CSV batch + test-set scoring
```

**Signal score** = 0.45 × recency (60-day half-life) + 0.35 × specificity (person 1 · team 0.8 · company 0.6 · industry 0.35) + 0.2 × verifiability.
**Hook score** = 0.6 × judge score + 0.4 × signal score.

## Design decisions

- **No LinkedIn scraping.** It uses the public web, plus anything the rep pastes, which is cited like any other source. LinkedIn sued Proxycurl, which shut down in July 2025.
- **The Hold gate is explicit rules, not an LLM's judgment**, so a buyer can see exactly why it held.
- **Personal-life details are never hooks.** "Personalised" should not become creepy.
- **Main metric: % of drafts approved with less than 10% edits.** That is what "send-ready" means to a sales team.

## Testing on real prospects

Fill in `evals/live-test-set.template.csv` with real people chosen to trigger each case. Upload it on **/batch**; the dashboard then shows how many behaved as expected.
