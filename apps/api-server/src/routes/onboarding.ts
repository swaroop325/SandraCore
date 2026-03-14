import { Router, type Request, type Response } from "express";
import { db, auditLog, createSubsystemLogger } from "@sandra/utils";
import { createWebSession } from "@sandra/extensions-web";

const log = createSubsystemLogger("onboarding");
const router: Router = Router();

// ── Brute-force rate limiter for pairing code attempts ────────────────────
const PAIR_MAX_ATTEMPTS = 5;
const PAIR_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface PairAttemptState {
  count: number;
  resetAt: number;
}

const pairAttempts = new Map<string, PairAttemptState>();

function getPairClientIp(req: Request): string {
  const trustProxy = process.env["TRUST_PROXY"] === "1" || process.env["TRUST_PROXY"] === "true";
  if (trustProxy) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
      const ip = forwarded.split(",")[0]?.trim();
      if (ip) return ip;
    }
  }
  return req.socket?.remoteAddress ?? "unknown";
}

// ── GET /onboarding — serve the wizard HTML ───────────────────────────────
router.get("/", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(ONBOARDING_HTML);
});

// ── POST /onboarding/redeem — validate pairing code ───────────────────────
router.post("/redeem", async (req: Request, res: Response) => {
  const ip = getPairClientIp(req);
  const now = Date.now();

  // Check / clean up rate limit state
  let state = pairAttempts.get(ip);
  if (state && now > state.resetAt) {
    pairAttempts.delete(ip);
    state = undefined;
  }
  if (state && state.count >= PAIR_MAX_ATTEMPTS) {
    const retryAfterSec = Math.ceil((state.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(retryAfterSec));
    res.status(429).json({ error: "Too many pairing attempts. Try again later." });
    return;
  }

  const { code } = req.body as { code?: string };
  if (!code) {
    res.status(400).json({ error: "code required" });
    return;
  }

  try {
    const dbNow = new Date();
    const result = await db.query<{
      id: string;
      code: string;
      telegram_id: string;
      channel: string;
      expires_at: Date;
    }>(
      "SELECT * FROM pairing_requests WHERE code = $1 AND used_at IS NULL AND expires_at > $2",
      [code.toUpperCase(), dbNow]
    );

    if (result.rows.length === 0) {
      // Record failed attempt
      const existing = pairAttempts.get(ip);
      if (existing) {
        existing.count += 1;
      } else {
        pairAttempts.set(ip, { count: 1, resetAt: Date.now() + PAIR_WINDOW_MS });
      }
      void auditLog({ action: "auth.failure", ip, channel: "onboarding", details: { reason: "invalid_pairing_code" } });
      res.status(404).json({ error: "Invalid or expired code" });
      return;
    }

    // Success — reset rate limit counter for this IP
    pairAttempts.delete(ip);

    const pr = result.rows[0]!;
    void auditLog({ action: "pairing.redeemed", channel: "onboarding", details: { code: code.toUpperCase() } });

    res.json({ ok: true, channel: pr.channel, codeId: pr.id });
  } catch (err) {
    log.error("handleRedeemCode error", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /onboarding/setup — save user profile after pairing ─────────────
router.post("/setup", async (req: Request, res: Response) => {
  const { codeId, name, timezone, locale } = req.body as {
    codeId?: string;
    name?: string;
    timezone?: string;
    locale?: string;
  };

  if (!codeId || !name) {
    res.status(400).json({ error: "codeId and name required" });
    return;
  }

  try {
    // Verify the code was already redeemed via /redeem (used_at IS NOT NULL)
    const codeCheck = await db.query<{ id: string }>(
      "SELECT id FROM pairing_requests WHERE id = $1 AND used_at IS NOT NULL",
      [codeId]
    );
    if (codeCheck.rows.length === 0) {
      res.status(400).json({ error: "Invalid or unredeemed code" });
      return;
    }

    // Mark pairing code as used
    await db.execute(
      "UPDATE pairing_requests SET used_at = now() WHERE id = $1",
      [codeId]
    );

    // Create user (web channel user — no telegramId at this point)
    const userResult = await db.query<{ id: string }>(
      `INSERT INTO users (name, locale, status)
       VALUES ($1, $2, 'approved')
       RETURNING id`,
      [name.trim(), locale ?? "en"]
    );

    const userId = userResult.rows[0]!.id;

    // Set user settings
    await db.execute(
      `INSERT INTO user_settings (user_id, timezone)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET timezone = EXCLUDED.timezone`,
      [userId, timezone ?? "UTC"]
    );

    void auditLog({
      action: "user.onboarded",
      userId,
      channel: "onboarding",
      details: { name: name.trim(), timezone: timezone ?? "UTC" },
    });

    const token = createWebSession(userId);
    res.json({ ok: true, token });
  } catch (err) {
    log.error("handleSetupProfile error", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;

// ── Onboarding wizard HTML (inlined) ─────────────────────────────────────
const ONBOARDING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sandra — Setup</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0f0f0f;
    color: #e8e8e8;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }

  .wizard {
    width: 100%;
    max-width: 460px;
  }

  /* ── Step indicator ── */
  .step-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    margin-bottom: 2.5rem;
  }

  .step-dot {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #1e1e1e;
    border: 2px solid #2e2e2e;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 600;
    color: #555;
    transition: all 0.3s ease;
    flex-shrink: 0;
  }

  .step-dot.active {
    background: #1a6cf5;
    border-color: #1a6cf5;
    color: #fff;
    box-shadow: 0 0 0 4px rgba(26, 108, 245, 0.2);
  }

  .step-dot.done {
    background: #1a6cf5;
    border-color: #1a6cf5;
    color: #fff;
  }

  .step-dot.done::after {
    content: '';
    display: block;
    width: 8px;
    height: 5px;
    border-left: 2px solid #fff;
    border-bottom: 2px solid #fff;
    transform: rotate(-45deg) translateY(-1px);
  }

  .step-dot.done span { display: none; }

  .step-line {
    flex: 1;
    height: 2px;
    background: #2e2e2e;
    transition: background 0.3s ease;
    max-width: 60px;
  }

  .step-line.done { background: #1a6cf5; }

  /* ── Card ── */
  .card {
    background: #161616;
    border: 1px solid #242424;
    border-radius: 16px;
    padding: 2.5rem 2rem;
  }

  /* ── Step panels ── */
  .step-panel {
    display: none;
    animation: fadeSlideIn 0.35s ease;
  }

  .step-panel.active { display: block; }

  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateX(24px); }
    to   { opacity: 1; transform: translateX(0); }
  }

  @keyframes fadeSlideBack {
    from { opacity: 0; transform: translateX(-24px); }
    to   { opacity: 1; transform: translateX(0); }
  }

  .step-panel.back { animation: fadeSlideBack 0.35s ease; }

  /* ── Typography ── */
  .step-eyebrow {
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #1a6cf5;
    margin-bottom: 0.5rem;
  }

  h1 {
    font-size: 1.65rem;
    font-weight: 700;
    color: #f0f0f0;
    line-height: 1.2;
    margin-bottom: 0.75rem;
  }

  .subtitle {
    font-size: 0.9375rem;
    color: #888;
    line-height: 1.6;
    margin-bottom: 2rem;
  }

  /* ── Form elements ── */
  label {
    display: block;
    font-size: 0.8125rem;
    font-weight: 500;
    color: #aaa;
    margin-bottom: 0.4rem;
  }

  input[type="text"],
  input[type="email"],
  select {
    width: 100%;
    background: #1e1e1e;
    border: 1px solid #2e2e2e;
    border-radius: 10px;
    color: #f0f0f0;
    font-size: 0.9375rem;
    font-family: inherit;
    padding: 0.75rem 1rem;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
    appearance: none;
    -webkit-appearance: none;
  }

  input[type="text"]:focus,
  select:focus {
    border-color: #1a6cf5;
    box-shadow: 0 0 0 3px rgba(26, 108, 245, 0.15);
  }

  select {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 1rem center;
    padding-right: 2.5rem;
    cursor: pointer;
  }

  select option { background: #1e1e1e; }

  .form-group { margin-bottom: 1.25rem; }

  /* ── Code input ── */
  .code-input-wrap {
    display: flex;
    justify-content: center;
    margin-bottom: 1.75rem;
  }

  #code-input {
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: 0.25em;
    text-align: center;
    text-transform: uppercase;
    width: 100%;
    max-width: 300px;
    padding: 0.875rem 1rem;
    background: #1e1e1e;
    border: 2px solid #2e2e2e;
    border-radius: 12px;
    color: #f0f0f0;
    font-family: 'Courier New', monospace;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  #code-input:focus {
    border-color: #1a6cf5;
    box-shadow: 0 0 0 4px rgba(26, 108, 245, 0.15);
  }

  #code-input.error {
    border-color: #e53e3e;
    box-shadow: 0 0 0 3px rgba(229, 62, 62, 0.15);
  }

  /* ── Buttons ── */
  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.875rem 1.5rem;
    border: none;
    border-radius: 10px;
    font-size: 0.9375rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
    text-decoration: none;
  }

  .btn:active { transform: scale(0.98); }

  .btn-primary {
    background: #1a6cf5;
    color: #fff;
  }

  .btn-primary:hover { opacity: 0.9; }

  .btn-primary:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
  }

  .btn-secondary {
    background: #1e1e1e;
    color: #aaa;
    border: 1px solid #2e2e2e;
    margin-top: 0.75rem;
  }

  .btn-secondary:hover { color: #e8e8e8; border-color: #444; }

  .btn-outline {
    background: transparent;
    color: #1a6cf5;
    border: 1.5px solid #1a6cf5;
    margin-top: 0.75rem;
  }

  .btn-outline:hover { background: rgba(26, 108, 245, 0.08); }

  /* ── Error message ── */
  .error-msg {
    display: none;
    font-size: 0.8125rem;
    color: #e53e3e;
    margin-top: 0.5rem;
    padding: 0.625rem 0.875rem;
    background: rgba(229, 62, 62, 0.08);
    border: 1px solid rgba(229, 62, 62, 0.2);
    border-radius: 8px;
  }

  .error-msg.visible { display: block; }

  /* ── Loading spinner ── */
  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Done screen ── */
  .done-icon {
    width: 64px;
    height: 64px;
    background: rgba(26, 108, 245, 0.12);
    border: 2px solid rgba(26, 108, 245, 0.3);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1.5rem;
  }

  .done-icon svg {
    width: 28px;
    height: 28px;
    stroke: #1a6cf5;
  }

  .tg-box {
    background: #1e1e1e;
    border: 1px solid #2e2e2e;
    border-radius: 12px;
    padding: 1.25rem;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: flex-start;
    gap: 0.875rem;
  }

  .tg-icon {
    width: 36px;
    height: 36px;
    background: #229ED9;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .tg-icon svg { width: 18px; height: 18px; fill: #fff; }

  .tg-box p { font-size: 0.875rem; color: #aaa; line-height: 1.5; }
  .tg-box p strong { color: #e8e8e8; display: block; margin-bottom: 0.25rem; }

  /* ── Welcome screen ── */
  .feature-list {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    margin-bottom: 2rem;
  }

  .feature-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.875rem;
    color: #999;
  }

  .feature-bullet {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #1a6cf5;
    flex-shrink: 0;
  }

  /* ── Divider ── */
  .divider {
    height: 1px;
    background: #242424;
    margin: 1.5rem 0;
  }

  /* ── Mobile ── */
  @media (max-width: 480px) {
    .card { padding: 2rem 1.25rem; border-radius: 12px; }
    h1 { font-size: 1.4rem; }
    #code-input { font-size: 1.4rem; }
  }
</style>
</head>
<body>

<div class="wizard">
  <!-- Step indicator -->
  <div class="step-indicator" aria-label="Setup progress">
    <div class="step-dot active" id="dot-1"><span>1</span></div>
    <div class="step-line" id="line-1"></div>
    <div class="step-dot" id="dot-2"><span>2</span></div>
    <div class="step-line" id="line-2"></div>
    <div class="step-dot" id="dot-3"><span>3</span></div>
    <div class="step-line" id="line-3"></div>
    <div class="step-dot" id="dot-4"><span>4</span></div>
  </div>

  <div class="card">

    <!-- Step 1: Welcome -->
    <div class="step-panel active" id="step-1">
      <p class="step-eyebrow">Getting started</p>
      <h1>Welcome to Sandra</h1>
      <p class="subtitle">Your personal AI — tasks, reminders, research, and memory across all your devices.</p>
      <div class="feature-list">
        <div class="feature-item"><div class="feature-bullet"></div>Remembers what matters to you</div>
        <div class="feature-item"><div class="feature-bullet"></div>Handles reminders and task tracking</div>
        <div class="feature-item"><div class="feature-bullet"></div>Research with live web access</div>
        <div class="feature-item"><div class="feature-bullet"></div>Works via Telegram and web chat</div>
      </div>
      <button class="btn btn-primary" id="btn-start">Get Started</button>
    </div>

    <!-- Step 2: Pairing code -->
    <div class="step-panel" id="step-2">
      <p class="step-eyebrow">Step 1 of 3</p>
      <h1>Enter your pairing code</h1>
      <p class="subtitle">Enter the 8-character code provided by your administrator to activate your account.</p>
      <div class="code-input-wrap">
        <input
          type="text"
          id="code-input"
          maxlength="8"
          placeholder="XXXXXXXX"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="characters"
          spellcheck="false"
          aria-label="Pairing code"
        >
      </div>
      <div class="error-msg" id="code-error"></div>
      <button class="btn btn-primary" id="btn-verify">
        <span id="verify-label">Verify Code</span>
      </button>
    </div>

    <!-- Step 3: Profile -->
    <div class="step-panel" id="step-3">
      <p class="step-eyebrow">Step 2 of 3</p>
      <h1>Set up your profile</h1>
      <p class="subtitle">This helps Sandra personalise responses for you.</p>
      <div class="form-group">
        <label for="name-input">Your name</label>
        <input type="text" id="name-input" placeholder="e.g. Alex" maxlength="80" autocomplete="given-name">
      </div>
      <div class="form-group">
        <label for="tz-select">Timezone</label>
        <select id="tz-select" aria-label="Timezone">
          <option value="UTC">UTC</option>
          <option value="America/New_York">America/New_York (EST/EDT)</option>
          <option value="America/Chicago">America/Chicago (CST/CDT)</option>
          <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
          <option value="America/Toronto">America/Toronto</option>
          <option value="America/Sao_Paulo">America/Sao_Paulo</option>
          <option value="Europe/London">Europe/London (GMT/BST)</option>
          <option value="Europe/Paris">Europe/Paris (CET/CEST)</option>
          <option value="Europe/Berlin">Europe/Berlin</option>
          <option value="Europe/Madrid">Europe/Madrid</option>
          <option value="Europe/Rome">Europe/Rome</option>
          <option value="Asia/Dubai">Asia/Dubai (GST)</option>
          <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
          <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
          <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
          <option value="Asia/Seoul">Asia/Seoul (KST)</option>
          <option value="Asia/Shanghai">Asia/Shanghai (CST)</option>
          <option value="Australia/Sydney">Australia/Sydney (AEST/AEDT)</option>
          <option value="Africa/Cairo">Africa/Cairo (EET)</option>
          <option value="Pacific/Auckland">Pacific/Auckland (NZST/NZDT)</option>
        </select>
      </div>
      <div class="form-group">
        <label for="lang-select">Language</label>
        <select id="lang-select" aria-label="Language">
          <option value="en">English</option>
          <option value="hi">Hindi</option>
        </select>
      </div>
      <div class="error-msg" id="profile-error"></div>
      <button class="btn btn-primary" id="btn-save">
        <span id="save-label">Save Profile</span>
      </button>
    </div>

    <!-- Step 4: Done -->
    <div class="step-panel" id="step-4">
      <div class="done-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
      </div>
      <p class="step-eyebrow" style="text-align:center">Setup complete</p>
      <h1 style="text-align:center">You're all set!</h1>
      <p class="subtitle" style="text-align:center">Your account is ready. Here's how to start using Sandra.</p>

      <div class="tg-box" id="tg-box">
        <div class="tg-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.19 13.645l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.46c.537-.194 1.006.131.958.913z"/>
          </svg>
        </div>
        <p>
          <strong>Connect via Telegram</strong>
          Open Telegram and message <span id="bot-link-text" style="color:#1a6cf5;font-weight:600"></span> to start chatting with Sandra.
        </p>
      </div>

      <a class="btn btn-primary" id="btn-chat" href="/chat">Open Web Chat</a>
      <a class="btn btn-outline" id="btn-telegram" href="#" target="_blank" rel="noopener noreferrer">Open Telegram Bot</a>
    </div>

  </div>
</div>

<script>
(function () {
  'use strict';

  var currentStep = 1;
  var codeId = null;
  var userId = null;
  var channel = null;

  var TELEGRAM_BOT = window.__SANDRA_BOT_USERNAME__ || '@SandraBot';

  // Detect timezone
  try {
    var detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) {
      var tzSel = document.getElementById('tz-select');
      var opt = tzSel.querySelector('option[value="' + detected + '"]');
      if (opt) tzSel.value = detected;
    }
  } catch (_) {}

  // ── Step navigation ──────────────────────────────────────────────────
  function goTo(n, back) {
    var prev = document.getElementById('step-' + currentStep);
    var next = document.getElementById('step-' + n);
    if (!next) return;

    prev.classList.remove('active');
    next.classList.remove('back');
    if (back) next.classList.add('back');
    next.classList.add('active');

    // Dots and lines
    for (var i = 1; i <= 4; i++) {
      var dot = document.getElementById('dot-' + i);
      dot.classList.remove('active', 'done');
      if (i < n) dot.classList.add('done');
      if (i === n) dot.classList.add('active');

      if (i < 4) {
        var line = document.getElementById('line-' + i);
        line.classList.toggle('done', i < n);
      }
    }

    currentStep = n;
  }

  // ── Helpers ──────────────────────────────────────────────────────────
  function showError(id, msg) {
    var el = document.getElementById(id);
    el.textContent = msg;
    el.classList.add('visible');
  }

  function clearError(id) {
    var el = document.getElementById(id);
    el.textContent = '';
    el.classList.remove('visible');
  }

  function setLoading(btnId, labelId, loading) {
    var btn = document.getElementById(btnId);
    var label = document.getElementById(labelId);
    btn.disabled = loading;
    if (loading) {
      label.style.display = 'none';
      var sp = document.createElement('span');
      sp.className = 'spinner';
      sp.id = labelId + '-spinner';
      btn.insertBefore(sp, btn.firstChild);
    } else {
      var spinner = document.getElementById(labelId + '-spinner');
      if (spinner) spinner.remove();
      label.style.display = '';
    }
  }

  // ── Step 1: Welcome ───────────────────────────────────────────────────
  document.getElementById('btn-start').addEventListener('click', function () {
    goTo(2);
    setTimeout(function () {
      document.getElementById('code-input').focus();
    }, 50);
  });

  // ── Step 2: Code entry ───────────────────────────────────────────────
  var codeInput = document.getElementById('code-input');

  codeInput.addEventListener('input', function () {
    codeInput.classList.remove('error');
    clearError('code-error');
    // Strip non-alphabet characters and uppercase
    codeInput.value = codeInput.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  });

  codeInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('btn-verify').click();
  });

  document.getElementById('btn-verify').addEventListener('click', function () {
    var code = codeInput.value.trim().toUpperCase();
    if (code.length !== 8) {
      codeInput.classList.add('error');
      showError('code-error', 'Please enter a valid 8-character code.');
      return;
    }

    clearError('code-error');
    setLoading('btn-verify', 'verify-label', true);

    fetch('/onboarding/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        setLoading('btn-verify', 'verify-label', false);
        if (data.ok) {
          codeId = data.codeId;
          channel = data.channel;
          goTo(3);
          setTimeout(function () {
            document.getElementById('name-input').focus();
          }, 50);
        } else {
          codeInput.classList.add('error');
          showError('code-error', data.error || 'Invalid or expired code. Please try again.');
        }
      })
      .catch(function () {
        setLoading('btn-verify', 'verify-label', false);
        codeInput.classList.add('error');
        showError('code-error', 'Network error. Please check your connection and try again.');
      });
  });

  // ── Step 3: Profile ───────────────────────────────────────────────────
  document.getElementById('btn-save').addEventListener('click', function () {
    var name = document.getElementById('name-input').value.trim();
    var timezone = document.getElementById('tz-select').value;
    var locale = document.getElementById('lang-select').value;

    if (!name) {
      showError('profile-error', 'Please enter your name.');
      document.getElementById('name-input').focus();
      return;
    }

    clearError('profile-error');
    setLoading('btn-save', 'save-label', true);

    fetch('/onboarding/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId: codeId, name: name, timezone: timezone, locale: locale }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        setLoading('btn-save', 'save-label', false);
        if (data.ok) {
          userId = data.token;

          // Wire up done screen
          var chatBtn = document.getElementById('btn-chat');
          chatBtn.href = '/chat?token=' + encodeURIComponent(userId);

          var tgBtn = document.getElementById('btn-telegram');
          var tgBox = document.getElementById('tg-box');
          var botLinkText = document.getElementById('bot-link-text');

          if (channel === 'telegram') {
            tgBox.style.display = 'flex';
            botLinkText.textContent = TELEGRAM_BOT;
            tgBtn.href = 'https://t.me/' + TELEGRAM_BOT.replace(/^@/, '');
            tgBtn.textContent = 'Open in Telegram';
          } else {
            tgBox.style.display = 'none';
            tgBtn.style.display = 'none';
          }

          goTo(4);
        } else {
          showError('profile-error', data.error || 'Something went wrong. Please try again.');
        }
      })
      .catch(function () {
        setLoading('btn-save', 'save-label', false);
        showError('profile-error', 'Network error. Please check your connection and try again.');
      });
  });

  document.getElementById('name-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('btn-save').click();
  });

})();
</script>
</body>
</html>`;
