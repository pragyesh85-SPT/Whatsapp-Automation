# Roadmap / Issues — WhatsApp Coaching OS

Paste each block into GitHub Issues (or keep as the project roadmap). Grouped by priority.
✅ = already done in code · 🔜 = planned · ⚠️ = needs an external input/key.

---

## ✅ Done (shipped)
- **Headless WhatsApp channel** with full humanizer anti-flag suite (pacing, daily cap + warm-up ramp, office hours hold-to-9AM, typing sim, read receipts, message variation, consent-only, profile realism).
- **Single durable send queue** — every message exits through one humanized door; pending items persist to `db.outbox` and **resume after a reboot**.
- **Onboarding + admin-managed brochure** (upload/replace from dashboard, auto-attached to new students, post-to-group button).
- **Batch→WhatsApp-group mapping**; **question paper → posted to the batch group** (instant on upload, or scheduled).
- **Results**: marks by typing or marksheet-read (AI), **branded PDF report cards** tagged per exam, sent paced-separately (30s, office hours) or to group.
- **Fees**: reminders + Razorpay pay-link + webhook receipt (⚠️ needs keys).
- **Auto-start at logon** (Startup-folder launcher; restart-proof via pm2).

---

## 🔜 P1 — core product
### Issue: Admin vs Teacher roles + login
A simple login page. Admin = full control; Teacher = papers + marks + send results only. (Deferred by decision; single open dashboard for now.)
- [ ] Session/password gate, 2 roles, per-action guards on the API.

### Issue: Live activity feed on the dashboard
A scrolling log so the owner watches it work: "✅ sent welcome to Aarav 9:02", "⏳ 4 report cards held until 9 AM", "📢 paper posted to Class 10 group".
- [ ] Ring-buffer of recent send/hold events + `/api/activity` + UI panel.

### Issue: Exam completion / inbound confirmations
Parse inbound "DONE" (or upload-terminal submit) to mark a student as completed per exam; nudge non-submitters.

---

## 🔜 P2 — scale & multi-tenant (the SaaS)
### Issue: Official WhatsApp Cloud API channel
Add `src/wa-official.js` implementing the same `send/onMessage/setProfile` surface via Meta Cloud API. Lets one master WABA serve many numbers/tenants (removes the per-tenant Chrome-session cap of headless). ⚠️ needs Meta business verification + templates.

### Issue: Firestore data layer + tenant bifurcation
Swap `src/store.js` (sync JSON) for Firestore, keyed per `tenantId`. Note: requires async refactor of callers. ⚠️ needs Firestore config.

### Issue: Multi-tenant process model
One config per tenant under `tenants/*.json`; supervisor to run/scale tenant workflows; suspend on subscription failure.

### Issue: OpenRouter AI adapter
`src/ai.js` is wired for Gemini-native REST. Add an OpenRouter (OpenAI-style) path for marksheet-read, answer-check, analytics. ⚠️ needs OpenRouter key.

---

## 🔜 P3 — commercial & polish
- **Razorpay Autopay/subscriptions** + auto-suspend tenant on mandate failure (PDR §6).
- **Provisioning engine** (PDR §4): tenant JSON edits validated + hot-reloaded.
- **Per-tenant report-card themes** (colors/logo/layout).
- **Postgres** option for larger centers; **backups** of `data/`.
- **Tests + CI** (GitHub Actions): humanizer unit tests, queue durability test, flow smoke tests.
- **Windows run-as-service / auto-login** for true power-on start before user login.
- **Brochure broadcast-to-all** option (paced) as an explicit, confirm-gated action.

---

*Generated as the open-source roadmap for the coaching niche. Keep humanizer guarantees intact in every new channel/flow.*
