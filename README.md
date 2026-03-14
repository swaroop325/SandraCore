<div align="center">
  <img src="assets/banner.jpeg" alt="SandraCore" width="100%" style="max-width:900px; border-radius:12px;" />
</div>

<div align="center">
  <img src="assets/icon.png" alt="Sandra icon" width="80" style="border-radius:50%; margin-top:-40px; border:4px solid #0f0f0f;" />

  <h1>SandraCore</h1>
  <p><strong>Production-grade personal AI assistant — AWS Bedrock · multi-channel · semantic memory · multi-agent · TTS/STT</strong></p>

  <p>
    <img src="https://img.shields.io/badge/node-%3E%3D24-brightgreen?logo=node.js&logoColor=white" alt="Node 24+"/>
    <img src="https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript&logoColor=white" alt="TypeScript"/>
    <img src="https://img.shields.io/badge/pnpm-workspaces-orange?logo=pnpm&logoColor=white" alt="pnpm"/>
    <img src="https://img.shields.io/badge/turborepo-build-EF4444?logo=turborepo&logoColor=white" alt="Turborepo"/>
    <img src="https://img.shields.io/badge/AWS-Bedrock-FF9900?logo=amazon-aws&logoColor=white" alt="AWS Bedrock"/>
    <img src="https://img.shields.io/badge/tests-passing-4CAF50?logo=vitest&logoColor=white" alt="Tests"/>
    <img src="https://img.shields.io/badge/version-0.1.0-blueviolet" alt="v0.1.0"/>
  </p>

  <br/>

  <video src="assets/intro.mp4" controls width="100%" style="max-width:900px; border-radius:12px;">
    Your browser does not support the video tag.
  </video>

  <p><sub>▶ Watch the intro — 5 seconds to see Sandra in action</sub></p>
</div>

---

Sandra handles natural conversation, task and reminder management, web research, long-term semantic memory, multi-channel messaging (Telegram · WhatsApp · Discord · MS Teams · Slack · Web · Gmail), browser automation, scheduled cron jobs, multi-provider LLM routing, agentic tool-calling, audio transcription (STT), text-to-speech (TTS with directives), streaming responses, hybrid FTS+vector memory search, inbound webhook triggers, tool loop detection, tool approval policies, auth profile failover, sub-agent spawning, and multi-agent orchestration — all through an intent-driven pipeline that matches model cost to task complexity.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Web Chat UI](#web-chat-ui)
- [Stack](#stack)
- [Repository Layout](#repository-layout)
- [How It Works — Request Pipeline](#how-it-works--request-pipeline)
- [Packages](#packages)
- [Applications](#applications)
- [Extensions](#extensions)
- [Database Schema](#database-schema)
- [Memory System](#memory-system)
- [Intent Classification and Model Routing](#intent-classification-and-model-routing)
- [Security](#security)
- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
- [Production Deployment](#production-deployment)
- [Configuration Reference](#configuration-reference)
- [Testing](#testing)
- [Scripts Reference](#scripts-reference)
- [Adding a New Channel](#adding-a-new-channel)
- [Release Channels](#release-channels)
- [Observability](#observability)
- [SandraCore vs openclaw](#sandracore-vs-openclaw)

---

## Architecture Overview

```mermaid
flowchart TD
    TG[Telegram]:::channel
    WA[WhatsApp]:::channel
    DC[Discord]:::channel
    MS[MS Teams]:::channel
    WB[Web / WS]:::channel
    SL[Slack]:::channel

    TG & WA & DC & MS & WB & SL --> ADPT[Channel Adapter\nupsertUser · status check · routeMessage]

    ADPT --> HM[handleMessage]

    subgraph agent["@sandra/agent"]
        HM --> DBC[debounce\n1500ms window]
        DBC --> MEM["loadHistory\nrecallMemory (MMR+decay)"]
        DBC --> URL[url-context\nauto-inject URL content]
        DBC --> MOV[getUserModelOverride]
        MEM & URL & MOV --> CMP[compactIfNeeded]
        CMP --> CLS[classifyMessage\nHaiku]
        CLS --> SEL[selectModel or override]
    end

    SEL --> RES[research\nPerplexity]:::tool
    SEL --> TSK[createTask\nPostgres + SQS]:::tool
    SEL --> RSN["reason (agentic loop)\ntools × 5 → end_turn"]:::tool
    SEL --> STR[streamReason\nchunked SSE]:::tool

    RES & TSK & RSN & STR --> OUT[AssistantOutput]

    OUT --> WRITE["appendMessage\nwriteMemory"]
    OUT --> OTEL[OTel trace + metrics]
    OUT --> ADPT2[Channel send]

    CRON[cron-consumer\nPM2 process]:::channel --> HM

    classDef channel fill:#1a6cf5,color:#fff,stroke:none
    classDef tool fill:#2a6049,color:#fff,stroke:none
```

---

## Web Chat UI

The built-in web channel (`extensions/web`) ships a zero-dependency dark-mode chat UI served at `/` when the WebSocket server is running. Connect with `?token=<your-token>` for auth.

```
┌─────────────────────────────────────────────────────────┐
│  Sandra                                    ● Connected   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                                                         │
│                    ╭─────────────────────────╮          │
│                    │ Hey! How can I help?     │          │
│                    ╰─────────────────────────╯          │
│                                                         │
│  ╭────────────────────────────╮                         │
│  │ Remind me to call Mom at 6 │                         │
│  ╰────────────────────────────╯                         │
│                                                         │
│                    ╭─────────────────────────╮          │
│                    │ ...                      │  ← typing│
│                    ╰─────────────────────────╯          │
│                                                         │
│                    ╭─────────────────────────╮          │
│                    │ Done! I'll remind you    │          │
│                    │ to call Mom at 6:00 PM.  │          │
│                    ╰─────────────────────────╯          │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────┐  ┌──────────┐  │
│  │ Message Sandra...                   │  │   Send   │  │
│  └─────────────────────────────────────┘  └──────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- Dark-mode UI (`#0f0f0f` background, `#1a6cf5` user bubble, `#2a2a2a` assistant bubble)
- Real-time typing indicator (`...`) while Sandra is thinking
- **Streaming mode** (`WEB_STREAMING=1`): text streams word-by-word as it generates — `{ type: "chunk" }` frames accumulate in a live bubble, finalized on `{ type: "message_done" }`
- Auto-reconnect with 3-second backoff
- Enter to send, Shift+Enter for newline
- Served from `extensions/web/public/index.html` — zero build step, zero dependencies

---

## Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict, NodeNext modules, `exactOptionalPropertyTypes`) |
| Runtime | Node.js 24+ |
| Monorepo | pnpm workspaces + Turborepo |
| LLM (primary) | AWS Bedrock — `claude-sonnet-4-6` |
| LLM (fast) | AWS Bedrock — `claude-haiku-4-5-20251001` |
| LLM (deep) | AWS Bedrock — `claude-opus-4-6` |
| LLM (alt) | Ollama, any OpenAI-compatible API (pluggable) |
| Embeddings | AWS Bedrock Titan (default) · Ollama · OpenAI-compat · Voyage AI · Google Gemini · Mistral (pluggable) |
| Research | Perplexity AI — `sonar` model |
| Messaging | Telegram · WhatsApp · Discord · MS Teams · Slack · Web |
| Short-term memory | Amazon RDS PostgreSQL + Drizzle ORM |
| Long-term memory | LanceDB (embedded, on-disk) |
| Task queue | Amazon SQS (delayed messages) |
| Secrets | AWS Secrets Manager (`sandra/prod`) |
| Auth | AWS IAM instance role — no hardcoded keys anywhere |
| Process manager | PM2 |
| Reverse proxy | Nginx (TLS 1.3, HSTS preload, OCSP stapling) + Let's Encrypt |
| Hosting | Amazon Lightsail (Ubuntu 22.04) |
| Observability | OpenTelemetry (traces + metrics) → OTLP |
| Tests | Vitest — fully mocked, zero infrastructure required |

---

## Repository Layout

```
sandra-core/
│
├── assets/
│   ├── banner.jpeg          Project banner (1024×1024)
│   └── icon.png             Sandra icon (1024×1024)
│
├── apps/
│   ├── api-server/          Express — webhooks · REST API · /chat UI · Gmail Pub/Sub
│   ├── worker/              SQS long-poll consumer — fires reminders
│   ├── onboarding/          Web setup wizard
│   └── voice-gateway/       STT/TTS gateway (stub — needs GPU)
│
├── packages/
│   ├── core/                Shared types + constants (zero runtime deps)
│   ├── utils/               All infrastructure primitives:
│   │                          secrets · db · sqs · logger · pairing · rate-limit
│   │                          regex safety · retry · circuit breaker · dedupe
│   │                          request IDs · dead letter · health · usage tracker
│   │                          crypto (AES-256-GCM) · audit · sanitize
│   │                          process utils · group message routing
│   ├── agent/               Intent classify · model routing · reason · handleMessage
│   │                          token counting · context compaction · subagent spawn
│   │                          multi-provider LLM (Ollama / OpenAI-compat / Bedrock)
│   ├── memory/              Short-term (Postgres) · long-term (LanceDB + Titan embed)
│   │                          Hybrid FTS5+vector · MMR+decay · multilingual query expansion
│   ├── tasks/               Task creation · SQS reminder scheduling
│   ├── research/            Perplexity sonar client
│   ├── tools/               webFetch (SSRF-safe) · webSearch · linkPreview · sessionHistory
│   ├── cron/                Cron expression parser + scheduler · at/every/cron · delivery modes
│   ├── tts/                 ElevenLabs · OpenAI TTS · Edge TTS · [[tts:]] directives · auto-mode
│   ├── markdown/            Channel-aware formatter (Telegram / WhatsApp / Discord)
│   ├── browser/             CDP browser automation (navigate · click · type · screenshot)
│   ├── plugin-sdk/          Plugin utils (temp files · chunking · locks · status)
│   ├── media/               Image analysis · AWS Transcribe Streaming (STT)
│   ├── otel/                OTel traces + metrics + auto-instrumentation
│   ├── i18n/                Translations + locale detection (en, hi)
│   ├── config/              Zod-validated config loader
│   └── voice/               Voice stub (deferred — GPU needed)
│
├── extensions/
│   ├── telegram/            grammY · typing indicators · reactions · DM pairing · polls
│   ├── whatsapp/            Baileys (WhatsApp Web) · QR pairing · auto-reconnect
│   ├── discord/             discord.js · DM + guilds · chunking · polls
│   ├── msteams/             Bot Framework webhook · group mention gating
│   ├── slack/               Bolt.js HTTP mode · DM filter · 3000-char chunking · actions
│   └── web/                 WebSocket (/chat/ws) · DB auth · streaming · dark-mode UI ──┐
│                                                                                        │
├── extensions/web/src/                                                                  │
│   └── chat-ui.html  ◄── self-contained dark-mode chat UI · served at GET /chat ◄──────┘
│
├── workspace/
│   ├── SOUL.md              Personality · tone · security constraints
│   ├── TOOLS.md             Tool descriptions for intent prompt
│   └── AGENTS.md            Sub-agent registry
│
├── infra/
│   ├── migrations/          SQL (0001 initial → 0004 security/audit)
│   ├── nginx/               nginx.conf (TLS 1.3 · HSTS · CSP · OCSP)
│   └── pm2/                 Ecosystem files (stable · beta · dev)
│
└── scripts/
    ├── wizard.ts            Interactive setup wizard → writes .env.local
    ├── dev.sh               Local development runner
    ├── deploy.sh            Server setup + deployment
    ├── approve-user.ts      Approve a Telegram user by ID
    └── migrate.ts           Run SQL migrations
```

---

## How It Works — Request Pipeline

```
  ┌──────────────────────────────────────────────────────────────┐
  │                    Inbound message                           │
  │  (Telegram · WhatsApp · Discord · Teams · Web WS · Slack)   │
  └───────────────────────┬──────────────────────────────────────┘
                          │
                  ┌───────▼───────────────────────────┐
                  │       Channel Adapter              │
                  │  • upsertUser() — create on first  │
                  │  • status check (pending/blocked)  │
                  │  • routeMessage() — @mention gate  │
                  │  • build AssistantInput            │
                  └───────────────┬───────────────────┘
                                  │
                  ┌───────────────▼───────────────────┐
                  │        handleMessage()             │
                  │  debounce() — 1500ms window        │
                  │  ┌──────────────────────────────┐ │
                  │  │  loadHistory  ║  recallMemory │ │  ← parallel
                  │  │  urlContext   ║  modelOverride│ │
                  │  └──────────────────────────────┘ │
                  │         compactIfNeeded()          │
                  │         classifyMessage() → Haiku  │
                  │  selectModel() / model override    │
                  └──┬──────────────┬────────────┬────┘
                     │              │            │
             research│    task_create│     reason │
                     ▼              ▼            ▼
               Perplexity     Postgres+SQS   agentic loop
               sonar model    reminder       tools × ≤5
                                             → end_turn
                     │              │            │
                     └──────────────┴────────────┘
                                    │
                  ┌─────────────────▼─────────────────┐
                  │           Post-processing          │
                  │  appendMessage()  writeMemory()    │  ← parallel
                  │  OTel span close + metrics         │
                  └─────────────────┬─────────────────┘
                                    │
                          Channel send (reply)
```

### Context compaction

When history exceeds ~75% of the model's context window, `compactIfNeeded()` summarises the oldest turns into a single compact block using Haiku, preserving the 5 most recent turns verbatim:

```
[compact summary of turns 1–15]
[turn 16 verbatim]
[turn 17 verbatim]
...
[turn 20 verbatim]
[incoming message]
```

---

## Packages

### `@sandra/core`

Shared types and constants. Zero runtime dependencies — everything else imports from here.

```ts
AssistantInput, AssistantOutput
Channel    // "telegram"|"whatsapp"|"discord"|"slack"|"web"|"msteams"
Intent     // "task_create"|"research"|"code_generate"|"recall"|"conversation"
Complexity // "simple"|"complex"|"deep"

MODELS     // { HAIKU, SONNET, OPUS, TITAN_EMBED }
REGION     // "ap-southeast-1"
```

---

### `@sandra/utils`

Every infrastructure primitive in one place.

```ts
// Secrets & config
loadSecrets()                  // AWS Secrets Manager → process.env

// Database
db.query(), db.execute()       // pg Pool
checkDB(), closeDB()

// Messaging
sqsClient, checkSQS()

// Users & sessions
upsertUserByTelegramId()
getUserById()
getOrCreateSession()
generatePairingCode()
redeemPairingCode()

// Security
createAuthRateLimiter()        // IP rate limit — no loopback exemptions
sanitizeInput()                // 15-pattern prompt injection detection
wrapToolOutput()               // mark tool output untrusted
looksLikeSecret()              // Shannon entropy check
encrypt() / decrypt()          // AES-256-GCM envelope
safeCompare()                  // constant-time string compare
auditLog()                     // → audit_log table (best-effort, fallback stdout)

// Reliability
retry()
createCircuitBreaker()
createDedupeCache()

// Tracing
withRequestId() / getRequestId()
sendToDeadLetter()

// Process
execWithTimeout()
killTree()
isCommandAvailable()

// Routing
routeMessage()                 // group @mention gating
getChannelMessageLimit()       // per-channel char limits

// Per-user model override
getUserModelOverride(userId)   // → Bedrock model ID | null
setUserModelOverride(userId, preference)
parseModelPreference(input)    // "haiku"|"sonnet"|"opus"|"fast"|"deep"|"reset" → canonical
```

---

### `@sandra/agent`

The intelligence layer.

```ts
handleMessage(input)           // full pipeline (hooks → debounce → reason)

// Agentic tool-calling loop
executeTool(name, input, userId)
TOOL_DEFINITIONS               // web_search · web_fetch · link_preview · create_task
                               // analyze_image · run_code · read_pdf · delegate_to_agent
// reason() runs up to 5 tool iterations, forced end_turn after exhaustion

// Hook/lifecycle system
hookRegistry                   // global singleton
createHookRegistry()           // { register, unregister, runBefore, runAfter, runOnError, clear, count }
// before_message → transform input | after_message → transform output | on_error → log/report

// Agent-to-agent (ACP)
callAgent({ agentName, task, userId? })              // → AcpResponse
runAgentsInParallel(tasks, userId?)                  // → AcpResponse[]  (Promise.all)
runAgentsSequentially(tasks, userId?)                // → AcpResponse    (chained context)
// delegate_to_agent tool lets the LLM spawn sub-agents autonomously

// Streaming
streamReason(history, message, memories, modelId)    // → AsyncGenerator<string>

// URL auto-context
buildUrlContext(text)          // extracts first URL, fetches, injects 3000-char context

// Inbound debounce
createDebouncer(debounceMs?)   // 1500ms window — combines burst messages

// Per-user model override
getUserModelOverride(userId)   // reads user_settings.model_override
setUserModelOverride(userId, preference)
parseModelPreference(input)    // "haiku"|"sonnet"|"opus"|"fast"|"deep"|"reset"

// Multi-provider LLM routing
reasonWithProvider(history, text, memories, modelId)
autoRegisterProviders()        // reads OLLAMA_BASE_URL / OPENAI_API_KEY
registerProvider(provider)
createOllamaProvider(baseUrl?)
createOpenAICompatProvider(options?)

// Subagents
spawnSubagent({ task, context, modelId, maxTokens })

// Context management
compactIfNeeded(history, modelId)
countTokens(text)
```

**Multi-provider routing flow:**
```
reasonWithProvider("llama3:8b", ...)
       │
       ├─ getProviderForModel("llama3:8b")
       │       └─ registered Ollama provider → hit localhost:11434
       │
       └─ getProviderForModel("anthropic.claude-sonnet-4-6")
               └─ null → fall back to Bedrock
```

---

### `@sandra/tools`

```ts
webFetch(url)         // SSRF-safe: blocks RFC1918, loopback, 169.254.x.x, metadata endpoints
webSearch(query)      // Perplexity sonar
getLinkPreview(url)   // og:title / og:description / og:image (SSRF-safe)
extractUrls(text)     // pull all URLs from a string
getSessionHistory()
formatHistoryForContext()
runInSandbox({ language, code })  // Docker-isolated execution (python/js/ts/bash)
readPdf(path | buffer)            // extract text + page count from PDF via pdf-parse
```

**`runInSandbox` security flags:** `--rm --network none --memory=128m --cpus=0.5 --pids-limit 64 --read-only --tmpfs /tmp:size=64m`. Code is written to a temp file, mounted read-only as `/code/run.*`, then cleaned up in `finally`. Returns `{ stdout, stderr, exitCode, timedOut }`. Falls back to `{ stderr: "Docker not available" }` when Docker is absent.

---

### `@sandra/cron`

```ts
parseCron("0 9 * * 1-5")      // → CronFields
nextOccurrence(fields, after)  // → Date (UTC-safe)
validateCron(expression)       // → boolean

createScheduler({ store, executor, pollIntervalMs? })
// Returns: { start(), stop(), schedule(job), tick() }
// Duplicate prevention: in-flight Set per job ID
// Missed runs: catches up from nextRunAt, advances 60s past run time
```

---

### `@sandra/markdown`

```ts
formatForChannel(text, { channel: "telegram" })
// Telegram  → *bold*, _italic_, `code`, preserves links
// WhatsApp  → *bold*, _italic_, ~strikethrough~, strips links
// Discord   → **bold**, *italic*, ```blocks```, > blockquotes
// api/web   → pass-through

splitIntoChunks(text, maxLength)
// Prefers: paragraph break → sentence break → hard cut
// Guaranteed: every chunk.length ≤ maxLength
```

---

### `@sandra/browser`

CDP-based browser automation — no Puppeteer, no Playwright dependency.

```ts
createCDPClient(wsUrl)   // raw WebSocket CDP connection

// PageController
.navigate(url)           // waits for Page.loadEventFired (5s timeout)
.click(selector)         // mousePressed + mouseReleased events
.type(selector, text)    // keyDown/keyUp per character
.screenshot()            // → { data: base64, width, height }
.evaluate(expr)          // Runtime.evaluate with exception forwarding
.scroll(x, y)            // mouseWheel event

browserAction({ action: "screenshot" })   // agent-facing tool wrapper
resetBrowserController()                  // for testing
```

---

### `@sandra/plugin-sdk`

```ts
createTempFile(ext?, content?)   // auto-cleanup on process exit
chunkText(text, maxLen)          // word-boundary splitting
statusEmoji("success")           // → "✅"
formatStatus("error", "msg")     // → "❌ msg"
validateManifest(unknown)        // type guard for PluginManifest
acquireLock(name)                // → boolean (false if held)
releaseLock(name)

// Plugin runtime
loadPlugin(specifier)            // dynamic import → validate → activate()
createPluginRegistry()           // load · unload · getTools() · list()
```

A plugin is any ESM module that exports `manifest: PluginManifest`, `tools: PluginToolDef[]`, and optionally `activate(ctx)` / `deactivate()`. The registry's `getTools()` result is automatically picked up by `executePluginTool` in the agent — no restart needed.

---

### `@sandra/memory`

```
┌─────────────────────────────────────────────────────────────┐
│                     Dual-layer memory                       │
│                                                             │
│  Short-term (Postgres)          Long-term (LanceDB)              │
│  ─────────────────────          ───────────────────────────────  │
│  Scoped to sessionId            Scoped to userId                 │
│  Last 20 turns verbatim         Bedrock Titan / Ollama /         │
│  → directly in LLM history        OpenAI-compat / Voyage AI /   │
│                                   Google Gemini / Mistral        │
│                                 → cosine search k×3 candidates   │
│                                 → temporal decay (λ=0.01)        │
│                                 → MMR diversity re-rank           │
│                                 → top-5 injected into            │
│                                   system prompt                  │
│                                                                  │
│  FTS5 (SQLite)                  Hybrid fusion                    │
│  ─────────────                  ─────────────────                │
│  unicode61 tokenizer            0.7 × vector + 0.3 × FTS        │
│  BM25 ranking                   → score fusion → MMR on result  │
│  Multilingual stop words        EN · ES · PT · AR · KO · JA/ZH  │
└──────────────────────────────────────────────────────────────────┘
```

**MMR + Temporal Decay:**
- Fetch `k×3` candidates by cosine similarity
- Apply exponential decay: `score × exp(-λ × days_old)` — recent facts score higher
- MMR greedy re-rank: `α×score - (1-α)×maxSimilarity` — diverse, non-redundant results

**Hybrid FTS+Vector Fusion:**
- FTS5 BM25 query runs in parallel with vector cosine search
- Scores normalized independently, combined: `0.7 × vector + 0.3 × FTS`
- `expandQueryToKeywords(query, locale)` strips stop words per language before FTS query
- Final MMR pass on fused results ensures diversity

---

## Applications

### `apps/api-server`

| Method | Path | Auth |
|---|---|---|
| `POST` | `/webhooks/telegram` | `X-Telegram-Bot-Api-Secret-Token` header |
| `POST` | `/webhooks/inbound/:hookId` | HMAC-SHA256 `X-Sandra-Signature` |
| `POST` | `/webhooks/gmail` | Google Pub/Sub push (no auth — responds 200 immediately) |
| `POST` | `/webhooks/slack` | Bolt.js `signingSecret` verification |
| `POST` | `/assistant/message` | none (internal use) |
| `GET` | `/chat` | none — serves dark-mode chat UI |
| `WS` | `/chat/ws?token=<userId>` | DB-backed user status check |
| `GET` | `/health` | optional `HEALTH_API_KEY` |

Security hardening built in:
- `TRUST_PROXY=1` → read X-Forwarded-For; otherwise use socket IP
- CORS restricted to `ALLOWED_ORIGINS`
- `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`
- X-Request-ID middleware (AsyncLocalStorage propagation)
- WebSocket upgrades rejected HTTP 426 (WS lives in `extensions/web`)
- 60 req/min per IP — no loopback exemptions

---

### `apps/worker`

SQS long-poll consumer. Each cycle: receive → look up reminder → send via channel → mark `sent = true` → delete from SQS. Always deletes even on failure to prevent infinite redelivery.

**Cron consumer** (`src/cron-consumer.ts`): separate PM2 process that polls `cron_jobs` every 30 seconds and fires scheduled agent tasks via `handleMessage`. Supports arbitrary expressions like `0 9 * * 1-5` (weekday 9 AM briefings).

---

## Extensions

### `extensions/telegram` — grammY

Primary channel. Typing indicators, message reactions, DM-only pairing flow. **Voice messages** auto-transcribed via AWS Transcribe Streaming — both `voice` and `audio` message types are handled.

```
New user → status = "pending" → "You need a pairing code."
Admin: tsx scripts/approve-user.ts <telegram_id>
User: status = "approved" → normal chat
```

### `extensions/whatsapp` — Baileys

QR-code WebSocket pairing. DM-only by default. Auto-reconnects on disconnect.

### `extensions/discord` — discord.js

DM-only unless `DISCORD_ALLOW_GUILDS=1`. Splits replies at 1900 chars (Discord limit: 2000, leaving headroom).

### `extensions/msteams` — Bot Framework

Webhook handler. Acquires OAuth2 client-credentials token from Microsoft to send replies. Group mention gating via `routeMessage()`.

### `extensions/web` — WebSocket

```
ws://host/ws?token=<token>

# Normal mode
Client → { text: "hello" }
Server → { type: "typing" }
Server → { type: "message", text: "..." }

# Streaming mode (WEB_STREAMING=1)
Client → { text: "hello" }
Server → { type: "typing" }
Server → { type: "chunk",        text: "Hello" }
Server → { type: "chunk",        text: ", how can" }
Server → { type: "chunk",        text: " I help?" }
Server → { type: "message_done", text: "Hello, how can I help?" }
```

The `public/index.html` web UI is self-contained — no bundler, no npm, no framework. Open it directly.

### `extensions/slack` — Events API

DM and channel message handling. Scoped to workspace via `SLACK_BOT_TOKEN`.

---

## Database Schema

```
┌──────────────┐     ┌────────────────────┐     ┌──────────────────┐
│    users     │────<│  channel_sessions  │     │  user_settings   │
│  id (UUID)   │     │  session_id        │     │  timezone        │
│  telegram_id │     │  channel           │     │  soul_override   │
│  phone       │     │  last_seen         │     └──────────────────┘
│  status      │
│  locale      │     ┌──────────────────────────────────────────────┐
└──────┬───────┘     │          conversation_messages               │
       │             │  session_id · user_id · role · content       │
       │             │  idx: (session_id, created_at)               │
       │             └──────────────────────────────────────────────┘
       │
       ├──────────────────────────────────────────────────────────┐
       │                                                          │
┌──────▼───────┐     ┌──────────────┐     ┌──────────────────────▼──┐
│    tasks     │────<│  reminders   │     │       audit_log          │
│  title       │     │  trigger_time│     │  action · ip · channel   │
│  status      │     │  sent (bool) │     │  details (JSONB)         │
│  due_date    │     └──────────────┘     └─────────────────────────┘
│  priority    │
└──────────────┘     ┌──────────────┐     ┌─────────────────────────┐
                     │   projects   │     │       llm_usage          │
                     └──────┬───────┘     │  model · tokens · cost   │
                            │             └─────────────────────────┘
                     ┌──────▼───────┐
                     │ commitments  │
                     └──────────────┘
```

**Migrations:** `0001_initial` → `0002_sessions` → `0003_llm_usage` → `0004_security` → `0005_model_override` → `0006_cron_jobs` → `0007_cron_schedule` → `0008_users_email`

- `0005` — adds `model_override VARCHAR(100)` to `user_settings`
- `0006` — adds `cron_jobs` table: `id · user_id · session_id · expression · prompt · channel · enabled · last_run_at · next_run_at`
- `0007` — adds `schedule JSONB · delivery JSONB` to `cron_jobs` (at/every/cron kinds + delivery modes)
- `0008` — adds `email TEXT UNIQUE` to `users` (required for Gmail Pub/Sub user lookup)

---

## Memory System

```mermaid
sequenceDiagram
    participant U as User
    participant A as Agent
    participant PG as Postgres (short-term)
    participant LDB as LanceDB (long-term)
    participant BE as Bedrock Titan

    U->>A: "What was that book I mentioned?"
    par
        A->>PG: loadHistory(sessionId, 20)
        A->>BE: embed("What was that book...")
        BE-->>A: [1536-dim vector]
        A->>LDB: cosine search by userId
        LDB-->>A: top 5 matching memories
    end
    PG-->>A: last 20 turns
    A->>A: build prompt with history + memories
    A->>A: reason()
    A-->>U: "You mentioned 'The Left Hand of Darkness'..."
    par
        A->>PG: appendMessage(assistant, reply)
        A->>BE: embed(user turn)
        BE-->>A: vector
        A->>LDB: store vector + text
    end
```

---

## Intent Classification and Model Routing

```
User message
      │
      ▼  (always Haiku — cheap, fast)
┌─────────────────────────────────────────────────┐
│  { intent: "task_create", complexity: "simple" } │
└──────────────────────┬──────────────────────────┘
                       │
         ┌─────────────┼─────────────────┐
         │             │                 │
    task_create     research         reason
         │             │                 │
    Postgres +    Perplexity      complexity?
    SQS delay       sonar          /    │    \
                               simple  complex  deep
                               Haiku   Sonnet   Opus
```

### Multi-provider routing

```ts
// startup
autoRegisterProviders();
// reads env vars:
// OLLAMA_BASE_URL → registers Ollama (handles non-Bedrock model IDs)
// OPENAI_API_KEY  → registers OpenAI-compat (gpt-*, o1*, mistral*, llama*)

// at inference time
reasonWithProvider(history, text, memories, "llama3:8b")
// → hits Ollama, falls back to Bedrock if no provider matches
```

---

## Security

```
┌─────────────────────────────────────────────────────────────────┐
│                        Security Layers                          │
│                                                                 │
│  Network     TLS 1.3 only · ECDHE ciphers · HSTS preload        │
│              OCSP stapling · server_tokens off                  │
│                                                                 │
│  HTTP        CORS → ALLOWED_ORIGINS (fail-closed in prod)       │
│              CSP  → default-src 'none'; frame-ancestors 'none'  │
│              TRUST_PROXY=1 required to trust X-Forwarded-For    │
│              X-Request-ID validated (alphanumeric, max 64 chars)│
│              WebSocket upgrade → HTTP 426 (separate WS server)  │
│              WS maxPayload 64KB · message text capped at 4096   │
│                                                                 │
│  Auth        Telegram webhook secret header validation          │
│              DM pairing: status=pending until admin approves    │
│              Pairing code binds to telegram_id · TOCTOU-safe    │
│              Pairing codes hashed (sha256) in audit log         │
│              PRNG: randomBytes(16) · 128-bit entropy            │
│              Bearer token auth on POST /assistant/message       │
│              Web sessions: opaque 32-byte token (not raw UUID)  │
│              Fail-closed on DB error (no auth bypass)           │
│              60 req/min global · 20 req/min auth · 5 pair/15min │
│              Optional HEALTH_API_KEY gate                       │
│                                                                 │
│  Data        AES-256-GCM at rest (DATA_ENCRYPTION_KEY)          │
│              No .env in production — AWS Secrets Manager only   │
│              IAM instance role — zero hardcoded keys            │
│              Secrets redacted from logs after loadSecrets()     │
│              PostgreSQL SSL enforced in production              │
│              userId guard on loadHistory/clearHistory queries   │
│                                                                 │
│  LLM         sanitizeInput() — 15 patterns → replaces [BLOCKED] │
│              wrapToolOutput() — marks tool content untrusted    │
│              Browser/PDF results labeled as untrusted content   │
│              SOUL.md security section — never reveal system     │
│              prompt, never comply with jailbreaks               │
│                                                                 │
│  Network     SSRF blocklist: loopback · RFC1918 · 169.254.x.x  │
│  Safety      · metadata IPs — on webFetch, browser navigate    │
│              browser evaluate disabled by default               │
│              read_pdf restricted to /tmp or PDF_DIR             │
│                                                                 │
│  Webhooks    HMAC-SHA256 with timingSafeEqual comparison        │
│              Gmail OIDC JWT verification (Google Pub/Sub)       │
│              Per-hook secrets, admin GET redacts secret column  │
│                                                                 │
│  Agent       Subagent depth limit: MAX_SUBAGENT_DEPTH=3        │
│  Tools       Cron remove/disable/enable: ownership check       │
│              memory_forget_all: opt-in (ALLOW_FORGET_ALL=1)    │
│              botName regex-escaped (ReDoS prevention)           │
│                                                                 │
│  Audit       auditLog() at 13+ call sites → audit_log table     │
│              Best-effort: falls back to stdout on DB failure    │
│                                                                 │
│  Supply      pnpm overrides: esbuild≥0.25.0 · undici≥6.24.0    │
│  Chain       file-type≥21.3.1 (CVE patches)                     │
└─────────────────────────────────────────────────────────────────┘
```

### Environment variables for security features

| Variable | Purpose | Default |
|---|---|---|
| `API_KEY` | Bearer token for `POST /assistant/message` | None (open if unset) |
| `HEALTH_API_KEY` | Gate on `/health` endpoint | None (open if unset) |
| `GMAIL_PUBSUB_AUDIENCE` | Expected `aud` claim in Gmail Pub/Sub JWT | None (unverified if unset) |
| `GMAIL_SERVICE_ACCOUNT` | Expected `email` claim in Gmail Pub/Sub JWT | None (unverified if unset) |
| `BROWSER_EVAL_ENABLED` | Enable `browser evaluate` tool (`"1"` to enable) | Disabled |
| `ALLOW_FORGET_ALL` | Enable `memory_forget_all` tool (`"1"` to enable) | Disabled |
| `PDF_DIR` | Allowed directory for `read_pdf` | `/tmp` only |
| `DB_SSL` | Force PostgreSQL SSL (`"1"` to enable) | Auto in production |
| `DB_SSL_REJECT_UNAUTHORIZED` | Set `"false"` for self-signed certs in staging | `true` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | Blocks all in production |
| `SECRETS_DIR` | Base dir for file-based secrets | `/run/secrets` |
| `EMBEDDING_CACHE_PATH` | SQLite path for embedding cache | None (no cache) |

---

## Prerequisites

### Local development

- Node.js 24+ (`.nvmrc` → `24`)
- pnpm 9+
- PostgreSQL 15+ local or remote
- AWS credentials with Bedrock access in `ap-southeast-1`
- Telegram bot token from [@BotFather](https://t.me/BotFather)

### Production (Lightsail)

- Ubuntu 22.04, 2+ GB RAM
- IAM role: `AmazonBedrockFullAccess` · `AmazonSQSFullAccess` · `SecretsManagerReadWrite` (scoped to `sandra/prod`)
- Domain pointed at the instance IP

---

## Local Development

### Quick start with wizard

```bash
pnpm install
pnpm wizard        # interactive setup → writes .env.local
./scripts/dev.sh
```

The wizard walks you through:

```
SandraCore Setup Wizard
──────────────────────────────────────────────────────────
[AWS]
  AWS Region [ap-southeast-1]:
  AWS Profile [default]:

[Database]
  DATABASE_URL [postgres://postgres:postgres@localhost:5432/sandra]:

[Telegram]
  TELEGRAM_BOT_TOKEN:
  TELEGRAM_WEBHOOK_SECRET (leave blank to generate):

[Server]
  DOMAIN (e.g. abc.ngrok.io for dev):
  PORT [3000]:

[Optional: Perplexity]
  Enable research (PERPLEXITY_API_KEY)? [y/N]:

[Optional: Ollama]
  Enable local LLMs via Ollama? [y/N]:

Writing .env.local... done ✓
```

### Telegram local dev (needs public HTTPS)

```bash
npx ngrok http 3000
# → https://abc123.ngrok.io

# add to .env.local:
DOMAIN=abc123.ngrok.io
```

### Skip flags

```bash
./scripts/dev.sh --skip-db       # skip migration
./scripts/dev.sh --skip-install  # skip pnpm install
```

---

## Production Deployment

### First-time setup

```bash
./scripts/deploy.sh --setup --domain=your-domain.com
# Installs: Node 24, pnpm, PM2, nginx, certbot
# Configures: HTTPS, HSTS, OCSP, PM2 boot persistence
```

### Secrets

```bash
aws secretsmanager create-secret \
  --name "sandra/prod" \
  --region ap-southeast-1 \
  --secret-string '{
    "TELEGRAM_BOT_TOKEN":        "...",
    "TELEGRAM_WEBHOOK_SECRET":   "...",
    "DATABASE_URL":              "postgres://user:pass@host:5432/sandra",
    "SQS_QUEUE_URL":             "https://sqs.ap-southeast-1.amazonaws.com/ACCOUNT/queue",
    "LANCEDB_PATH":              "/var/sandra/lancedb",
    "DATA_ENCRYPTION_KEY":       "64-char-hex",
    "PERPLEXITY_API_KEY":        "pplx-...",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://collector:4318"
  }'
```

> Bedrock, SQS, and Secrets Manager itself are authenticated via IAM instance role — no keys needed.

### Deploy

```bash
./scripts/deploy.sh --channel stable
```

Zero-downtime PM2 reload. Subsequent deploys: `git pull && ./scripts/deploy.sh`.

### Verify

```bash
pm2 status
curl https://your-domain.com/health
# → { "db": true, "sqs": true, "uptime": 142, "status": "ok" }
```

---

## Configuration Reference

| Key | Required | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Yes | Validate Telegram webhook calls |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SQS_QUEUE_URL` | Yes | Full SQS queue URL |
| `LANCEDB_PATH` | Yes | Filesystem path for LanceDB data |
| `DATA_ENCRYPTION_KEY` | Yes (prod) | 64-char hex key for AES-256-GCM |
| `PERPLEXITY_API_KEY` | No | Research degrades gracefully if absent |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | OTLP HTTP endpoint — OTel is no-op if absent |
| `DOMAIN` | No | Public hostname for Telegram webhook registration |
| `PORT` | No | HTTP port (default: 3000) |
| `TRUST_PROXY` | No | `1` when behind a reverse proxy |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins |
| `HEALTH_API_KEY` | No | Gate `/health` behind this key |
| `WEB_AUTH_TOKENS` | No | Comma-separated WebSocket auth tokens |
| `WEB_DEFAULT_USER_ID` | No | Default userId for web channel (default: `"web-user"`) |
| `OLLAMA_BASE_URL` | No | Ollama server URL — enables Ollama provider |
| `OLLAMA_ENABLED` | No | `1` to enable Ollama even without a custom URL |
| `OPENAI_API_KEY` | No | Enables OpenAI-compatible provider |
| `OPENAI_BASE_URL` | No | Override OpenAI base URL (for local proxies) |
| `TEAMS_APP_ID` | No | MS Teams Bot Framework app ID |
| `TEAMS_APP_PASSWORD` | No | MS Teams Bot Framework app password |
| `LOG_LEVEL` | No | Winston log level (default: `info`) |
| `WEB_STREAMING` | No | `1` to enable streaming WebSocket responses in the web extension |
| `TRANSCRIBE_LANGUAGE` | No | BCP-47 language code for AWS Transcribe (default: `en-US`) |
| `EMBEDDING_PROVIDER` | No | `bedrock` (default) · `ollama` · `openai` · `voyage` · `gemini` · `mistral` |
| `OLLAMA_EMBED_MODEL` | No | Ollama embedding model (default: `nomic-embed-text`) |
| `OPENAI_EMBED_MODEL` | No | OpenAI embedding model (default: `text-embedding-3-small`) |
| `VOYAGE_API_KEY` | No | Voyage AI API key — required when `EMBEDDING_PROVIDER=voyage` |
| `VOYAGE_EMBED_MODEL` | No | Voyage model (default: `voyage-4-large`) |
| `GEMINI_API_KEY` | No | Google Gemini API key — required when `EMBEDDING_PROVIDER=gemini` |
| `GEMINI_EMBED_MODEL` | No | Gemini model (default: `text-embedding-004`) |
| `MISTRAL_API_KEY` | No | Mistral API key — required when `EMBEDDING_PROVIDER=mistral` |
| `MISTRAL_EMBED_MODEL` | No | Mistral model (default: `mistral-embed`) |
| `SLACK_SIGNING_SECRET` | No | Slack app signing secret — required for Slack adapter |
| `SLACK_BOT_TOKEN` | No | Slack bot token (`xoxb-...`) — required for Slack adapter |
| `SLACK_ALLOW_CHANNELS` | No | `1` to allow Slack channel messages (default: DMs only) |
| `GMAIL_TOPIC` | No | GCP Pub/Sub topic name (e.g. `projects/my-proj/topics/gmail`) |
| `GMAIL_SUBSCRIPTION` | No | GCP Pub/Sub subscription name |
| `GMAIL_ACCOUNT` | No | Gmail account address to watch |
| `ELEVENLABS_API_KEY` | No | ElevenLabs TTS API key |
| `ELEVENLABS_VOICE_ID` | No | ElevenLabs voice ID (default: `EXAVITQu4vr4xnSDxMaL`) |
| `OPENAI_TTS_VOICE` | No | OpenAI TTS voice (default: `nova`) |
| `DISCORD_ALLOW_GUILDS` | No | `1` to allow Discord guild/server messages (default: DMs only) |

---

## Testing

```bash
pnpm test                          # all 21 packages, 617 tests
pnpm test -- --coverage            # with Istanbul v8 coverage
cd packages/agent && pnpm test     # single package
```

### Coverage by package

| Package | Test files | What's covered |
|---|---|---|
| `@sandra/core` | `types.test.ts` | Type guards, constants |
| `@sandra/utils` | 21 test files | Secrets, sessions, rate limit, regex, secret refs, logger, pairing, retry, circuit breaker, dedupe, request IDs, dead letter, health, usage, crypto, audit, sanitize, process utils, routing, **auth-profiles (round-robin + failover)** |
| `@sandra/agent` | 16 test files | Intent, soul, token counter, compaction, spawn, llm-provider, url-context, debounce, stream-reason, hooks (incl. lifecycle events), ACP, multi-agent, plugin-tool-executor, **tool-policy, tool-loop-detection, subagent-depth** |
| `@sandra/memory` | 6 test files | History ordering, MMR + decay, Bedrock/Ollama/OpenAI embed providers, **query expansion, hybrid FTS+vector fusion, FTS5 (node:sqlite)** |
| `@sandra/tools` | 6 test files | Web fetch, web search, session history, link preview, sandbox, PDF |
| `@sandra/plugin-sdk` | 3 test files | Manifest validation, plugin loader, registry (dedup · unload · getTools) |
| `@sandra/cron` | 5 test files | Cron parsing, **at/every/cron schedule kinds, TZ/stagger, delivery modes**, scheduling, in-flight dedup |
| `@sandra/tts` | `index.test.ts` | **ElevenLabs + OpenAI TTS providers, channel-aware output** |
| `@sandra/markdown` | `formatter.test.ts` | All 5 channel formats, chunk splitting |
| `@sandra/browser` | `browser-tool.test.ts` | CDP mocked, all 7 actions, SSRF guard, evaluate opt-in |
| `@sandra/media` | `image-analysis.test.ts`, `transcribe.test.ts` | Bedrock vision call, AWS Transcribe Streaming |
| `@sandra/research` | `index.test.ts` | Perplexity response, error handling |
| `@sandra/tasks` | `index.test.ts`, `reminders.test.ts` | Task insert, SQS enqueue |
| `@sandra/i18n` | `index.test.ts` | Translations, interpolation, fallbacks |
| `@sandra/config` | `schema.test.ts` | Zod validation |
| `@sandra/api-server` | `routes/webhooks.test.ts` | **Webhook inbound HMAC verification, handleMessage dispatch** |
| extensions | `telegram/polls`, `telegram/actions`, `telegram/typing`, `discord/polls`, `discord/actions`, `slack/actions`, `whatsapp/actions`, `msteams/index` | Channel polls, pin/delete/reaction actions |

**All external dependencies mocked.** Zero infrastructure required to run tests.
**617 tests across 21 packages — all passing.**

---

## Scripts Reference

### `pnpm wizard`
Interactive setup. Reads existing `.env.local` as defaults. Generates `DATA_ENCRYPTION_KEY` if absent.

### `./scripts/dev.sh [--skip-db] [--skip-install]`
Full local dev setup: install → build → migrate → start API server + worker.

### `./scripts/deploy.sh [--setup] [--channel stable|beta|dev] [--domain HOST]`
Server provisioning + zero-downtime deployment.

### `tsx scripts/migrate.ts`
Idempotent SQL migrations (`IF NOT EXISTS` on all DDL).

### `tsx scripts/approve-user.ts <telegram_id>`
Flip user status `pending → approved`.

---

## Adding a New Channel

1. Create `extensions/your-channel/` with `package.json`, `tsconfig.json`, `src/index.ts`
2. **Inbound:** `upsertUser*()` → status check → `routeMessage()` (group chats) → `handleMessage()`
3. **Outbound:** `splitIntoChunks(reply, getChannelMessageLimit("your-channel"))` → send
4. **Audit:** `auditLog()` for `auth.success`, `auth.failure`, `message.received`
5. **Wire:** add webhook in `apps/api-server/src/server.ts`

The agent has zero knowledge of channels — only `AssistantInput` / `AssistantOutput` cross the boundary.

---

## Release Channels

| Channel | PM2 file | NODE_ENV |
|---|---|---|
| `stable` | `infra/pm2/stable.config.js` | `production` |
| `beta` | `infra/pm2/beta.config.js` | `production` |
| `dev` | `infra/pm2/dev.config.js` | `development` |

```bash
pnpm build && pm2 startOrRestart infra/pm2/stable.config.js --update-env
```

---

## Observability

### OpenTelemetry

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to send to Jaeger, Grafana Tempo, Honeycomb, Datadog, etc. No-op if unset.

**Trace structure:**
```
handleMessage (span)
  ├── memory.load (span)
  ├── intent.classify (span)
  └── agent.respond (span)
       └── [Bedrock / Perplexity / SQS call]
```

**Metrics:**
| Metric | Type | Labels |
|---|---|---|
| `sandra.messages.total` | Counter | `intent`, `channel` |
| `sandra.message.latency` | Histogram (ms) | `intent` |
| `sandra.errors.total` | Counter | `intent` |
| `sandra.tokens.used` | Histogram | `model`, `type` |
| `sandra.reminders.total` | Counter | `channel` |

Auto-instrumentation: HTTP outbound, pg queries, SQS calls.

### PM2 logs

```bash
pm2 logs sandra-api      # stream API server
pm2 logs sandra-worker   # stream worker
pm2 logs --lines 200
```

### Health endpoint

```bash
curl https://your-domain.com/health
# { "db": true, "sqs": true, "uptime": 3600, "status": "ok" }
```

---

## SandraCore vs openclaw

openclaw is the reference open-source AI assistant framework that inspired Sandra's architecture.

### Why SandraCore is different

openclaw is a capable framework, but it was designed around API keys, single-server deployment, and a developer-first workflow. SandraCore is designed to run as a **hardened production personal assistant** on AWS infrastructure with zero operational secrets exposed. Here's what makes it distinct:

**1. Truly cloud-native from day one**
openclaw uses API keys stored in `.env` files. SandraCore uses AWS IAM instance roles — the server authenticates to Bedrock, SQS, and Secrets Manager with zero credentials anywhere on disk. `sandra/prod` in Secrets Manager is the only source of truth in production.

**2. AWS Bedrock as the LLM backbone**
openclaw supports many LLM providers but requires API keys for each. SandraCore's primary path is AWS Bedrock with three Claude model tiers (Haiku for classification, Sonnet for reasoning, Opus for deep tasks) — all under the same IAM role, no key rotation, no per-request billing surprises.

**3. Production deployment automation**
`deploy.sh --setup` provisions a bare Ubuntu Lightsail instance from scratch: Node 24, pnpm, PM2, Nginx with TLS 1.3, HSTS preload, OCSP stapling, and Let's Encrypt — in a single command. openclaw has no equivalent.

**4. Security-first architecture**
- AES-256-GCM at-rest encryption built into `@sandra/utils`
- 15-pattern prompt injection detection (`sanitizeInput`)
- SOUL.md hard constraints the model cannot override
- Constant-time `safeCompare` for all token comparisons
- `looksLikeSecret()` Shannon-entropy check prevents credential leaks in tool output
- Supply chain: `pnpm overrides` pin `esbuild`, `undici`, `file-type` to CVE-patched versions

**5. Hybrid memory that actually works at scale**
SandraCore's memory layer combines FTS5 full-text search (BM25 ranking) with LanceDB vector search, fuses scores (0.7/0.3), then applies MMR diversity re-ranking and temporal decay. openclaw has vector search; the hybrid fusion, temporal decay, and MMR layer are SandraCore additions.

**6. Six embedding providers, one interface**
Bedrock Titan, Ollama, OpenAI-compatible, Voyage AI, Google Gemini, Mistral — swap with a single env var. openclaw has a subset of these.

**7. Multilingual from the ground up**
Query expansion and stop-word filtering supports EN, ES, PT, AR, KO, JA, ZH. openclaw's FTS support is primarily English-optimised.

**8. Complete test isolation**
616 tests, zero infrastructure required. Every AWS SDK call, database query, and external API is mocked. You can run the full test suite on a laptop with no internet access. openclaw requires running services for integration tests.

---

This table compares every major capability area.

| Capability | openclaw | SandraCore | Notes |
|---|---|---|---|
| **Core pipeline** | ✅ handleMessage · intent · tool loop | ✅ Identical pipeline | Debounce, compaction, MMR recall |
| **Channels — Telegram** | ✅ grammY | ✅ grammY | Voice messages, polls, reactions, DM pairing |
| **Channels — Discord** | ✅ discord.js | ✅ discord.js | DM + guilds, polls, actions |
| **Channels — WhatsApp** | ✅ Baileys | ✅ Baileys | QR pairing, auto-reconnect |
| **Channels — MS Teams** | ✅ Bot Framework | ✅ Bot Framework | Group mention gating |
| **Channels — Slack** | ✅ Bolt.js | ✅ Bolt.js | HTTP mode, DM filter, chunking |
| **Channels — Web** | ✅ WebSocket | ✅ WebSocket `/chat/ws` | Dark-mode UI, streaming, DB auth |
| **Channels — Gmail** | ✅ Pub/Sub watcher | ✅ Pub/Sub watcher | Auto-renew every 12 h, history API |
| **LLM — AWS Bedrock** | ❌ | ✅ Claude Haiku/Sonnet/Opus | IAM instance role, no hardcoded keys |
| **LLM — Ollama** | ✅ | ✅ | Pluggable provider |
| **LLM — OpenAI-compat** | ✅ | ✅ | Custom base URL support |
| **Intent classification** | ✅ | ✅ | Haiku fast-path classifier |
| **Model routing** | ✅ complexity → model | ✅ simple/complex/deep | User model override per-user |
| **Agentic tool loop** | ✅ ≤N turns | ✅ ≤5 turns + forced end_turn | |
| **Tool loop detection** | ✅ | ✅ | generic_repeat, ping_pong, circuit_breaker |
| **Tool approval policy** | ✅ | ✅ | allow/deny/require_confirmation |
| **Subagent depth limit** | ✅ | ✅ | MAX_SUBAGENT_DEPTH=3, AsyncLocalStorage |
| **sessions_spawn** | ✅ | ✅ | Isolated sub-sessions with unique IDs |
| **sessions_yield** | ✅ | ❌ | Deferred — low priority |
| **Multi-agent (ACP)** | ✅ | ✅ | callAgent, parallel, sequential |
| **Short-term memory** | ✅ Postgres | ✅ Postgres + Drizzle | Per-session, last 20 turns |
| **Long-term memory (vector)** | ✅ | ✅ LanceDB | MMR + temporal decay |
| **Memory — Bedrock embed** | ❌ | ✅ Titan Embeddings | Default provider |
| **Memory — Ollama embed** | ✅ | ✅ | nomic-embed-text default |
| **Memory — OpenAI embed** | ✅ | ✅ | text-embedding-3-small default |
| **Memory — Voyage AI** | ✅ voyage-4-large | ✅ voyage-4-large | `EMBEDDING_PROVIDER=voyage` |
| **Memory — Google Gemini** | ✅ text-embedding-004 | ✅ text-embedding-004 | `EMBEDDING_PROVIDER=gemini` |
| **Memory — Mistral** | ✅ mistral-embed | ✅ mistral-embed | `EMBEDDING_PROVIDER=mistral` |
| **Hybrid FTS + vector** | ✅ | ✅ FTS5 + LanceDB | BM25 + cosine, 0.7/0.3 fusion |
| **Multilingual stop words** | ✅ ES/PT/AR/ZH/KO/JA | ✅ ES/PT/AR/KO/JA/ZH | Script-aware tokenization |
| **Web search** | ✅ Perplexity | ✅ Perplexity sonar | Grounded answers + citations |
| **Web fetch** | ✅ SSRF-safe | ✅ SSRF-safe | RFC1918 + metadata blocklist |
| **Browser automation** | ✅ Puppeteer/CDP | ✅ CDP (no Puppeteer) | navigate/click/type/screenshot |
| **Code execution** | ✅ Docker sandbox | ✅ Docker sandbox | --network none, --memory 128m |
| **PDF reading** | ✅ | ✅ pdf-parse | |
| **Image analysis** | ✅ | ✅ Bedrock Titan vision | |
| **Voice STT** | ✅ | ✅ AWS Transcribe Streaming | Live on Telegram |
| **TTS — ElevenLabs** | ✅ | ✅ | Channel-aware MIME |
| **TTS — OpenAI** | ✅ | ✅ | |
| **TTS — Edge TTS** | ✅ (proper) | ✅ edge-tts npm + CLI fallback | Microsoft neural free tier |
| **TTS directives** | ✅ `[[tts:...]]` | ✅ `[[tts:skip\|voice\|rate\|pitch]]` | Inline per-message control |
| **TTS auto-mode** | ✅ off/always/inbound/tagged | ✅ off/always/inbound/tagged | Per-channel, max length guard |
| **Cron jobs** | ✅ | ✅ | at/every/cron kinds, TZ, stagger |
| **Cron delivery modes** | ✅ none/announce/webhook | ✅ none/announce/webhook | |
| **Task + reminders** | ✅ | ✅ | SQS delayed messages |
| **Context compaction** | ✅ | ✅ | Haiku summarises old turns |
| **Inbound webhooks** | ✅ | ✅ HMAC-SHA256 | `/webhooks/inbound/:hookId` |
| **Plugin SDK** | ✅ 13+ files | ✅ | loadPlugin, createPluginRegistry |
| **Auth profiles** | ✅ | ✅ | Round-robin + cooldown + failover |
| **AES-256-GCM encryption** | ❌ | ✅ | encrypt/decrypt in utils |
| **Prompt injection defence** | ✅ | ✅ 15 patterns | sanitizeInput + SOUL.md constraints |
| **Rate limiting** | ✅ | ✅ | 60 req/min per IP, no loopback exemption |
| **Audit log** | ✅ | ✅ | 13+ call sites, DB + stdout fallback |
| **OTel traces + metrics** | ✅ | ✅ | OTLP export, auto-instrumentation |
| **i18n** | ✅ | ✅ en + hi | t(locale, key) with fallbacks |
| **IAM instance role auth** | ❌ (API key) | ✅ | Zero hardcoded credentials |
| **AWS Secrets Manager** | ❌ | ✅ `sandra/prod` | No .env in production |
| **PM2 + Nginx deployment** | ❌ | ✅ | TLS 1.3, HSTS preload, OCSP stapling |
| **Voice gateway (GPU TTS)** | ✅ VibeVoice | Stub | Deferred — needs GPU instance |
| **Canvas / whiteboard tool** | ✅ | ❌ | Not applicable to assistant use case |
| **sessions_yield** | ✅ | ❌ | Planned |

### Where SandraCore goes further than openclaw

| Area | SandraCore advantage |
|---|---|
| **Cloud-native auth** | IAM instance role + AWS Secrets Manager — zero secrets on disk or in environment on production |
| **Deployment automation** | `deploy.sh` provisions Nginx TLS 1.3 + HSTS + OCSP + PM2 from scratch on a bare Lightsail instance |
| **Bedrock model routing** | Three-tier: Haiku (classify/simple) → Sonnet (complex) → Opus (deep), all on same IAM role |
| **AES-256-GCM encryption** | At-rest encryption for sensitive fields, built into `@sandra/utils` |
| **Monorepo test isolation** | 616 tests, zero infrastructure required — everything mocked with vitest |
| **Schema migrations** | Versioned SQL files (`0001`→`0008`), idempotent `IF NOT EXISTS` DDL |

---

## Version History

| Version | Date | Highlights |
|---|---|---|
| **0.1.1** | 2026-03-14 | Security hardening — comprehensive audit across all layers |
| | | CRITICAL: opaque web session tokens · Gmail OIDC JWT verification |
| | | CRITICAL: DB-down fail-closed · onboarding redeem gate |
| | | HIGH: timingSafeEqual HMAC · API_KEY auth on REST endpoint |
| | | HIGH: SSRF on browser navigate · evaluate opt-in · PDF path guard |
| | | HIGH: cron ownership checks · subagent depth 3 · pairing telegram_id bind |
| | | MEDIUM: CORS fail-closed · X-Request-ID validation · pairing TOCTOU fix |
| | | MEDIUM: secrets log redaction · ReDoS fix · PostgreSQL SSL · sanitize blocks |
| | | 617 tests · all 41 turbo tasks passing |
| **0.1.0** | 2026-03-14 | Initial release — full production-ready baseline |
| | | Telegram · WhatsApp · Discord · MS Teams · Slack · Web · Gmail |
| | | AWS Bedrock (Haiku/Sonnet/Opus) · LanceDB hybrid memory |
| | | Hybrid FTS5+vector · 6 embedding providers · multilingual stop words |
| | | TTS (ElevenLabs/OpenAI/Edge) + `[[tts:]]` directives · STT (Transcribe) |
| | | Tool loop detection · tool policy · subagent depth · sessions_spawn |
| | | Gmail Pub/Sub watcher · inbound webhooks · auth profile failover |
| | | 616 tests · OTel traces/metrics · PM2 + Nginx deployment |

---

<div align="center">
  <img src="assets/icon.png" alt="Sandra" width="48" style="border-radius:50%; opacity:0.7;" />
  <br/>
  <sub>SandraCore v0.1.0 · Built with AWS Bedrock · pnpm workspaces · Turborepo · Vitest</sub>
</div>
