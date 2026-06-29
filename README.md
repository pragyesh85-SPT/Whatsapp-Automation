# WhatsApp Coaching OS — headless single-tenant (laptop build)

A coaching-center automation built on the **TIP pattern**: a headless WhatsApp engine
(`whatsapp-web.js` driving your installed Chrome) + the **humanizer** anti-flag suite
+ a local dashboard. One Node process, kept alive by pm2. Tuned for this laptop
(weak CPU, tight C: drive) — **no Docker, no Meta API, no cloud**.

> ⚠️ **Headless vs official Meta API.** This build sends from a *real* WhatsApp number
> with no Meta billing (free) but with **ban risk** — the humanizer is your protection.
> It runs **one number / one tenant** here. The PDR's ₹500-server-for-20-tenants and the
> "Start your coaching day?" template loophole only exist on the **official WhatsApp Cloud API**.
> The code is structured so the *send/receive layer* (`src/wa.js`) can later be swapped for
> the official API without touching any flow.

## The 4 pillars (all built)
1. **Onboarding** — admin enrolls a student on the dashboard → paced welcome to student + parent (+ welcome PDF).
2. **Fee recovery** — daily check of unpaid fees → paced reminders with a Razorpay pay-link → webhook → auto receipt + loop stops.
3. **Exam hall** — schedule an exam → paper PDF auto-distributed to the cohort at the set time, each with an upload link.
4. **AI sheet evaluation** — student uploads handwritten answer photos → Gemini 2.5 Flash-Lite grades vs the answer key → Report Card to the parent's WhatsApp.
+ **Teacher analytics bot** — admin texts the number a question → verified by phone → Gemini answers from live data (token-capped/month).

## Run it
```powershell
# from this folder
$env:Path += ";C:\Users\Pragyesh Jain\AppData\Roaming\npm"   # so 'pm2' is found
pm2 start ecosystem.config.js
pm2 logs coaching-os        # <-- the WhatsApp QR prints here; scan with the client SIM
```
Open **http://localhost:3000** = teacher dashboard. Upload terminal = `/upload`.

Stop / restart:
```powershell
pm2 restart coaching-os
pm2 stop coaching-os
pm2 delete coaching-os
```

## First-time setup (do these before going live)
1. **Scan the QR** (`pm2 logs coaching-os`) with the client's dedicated WhatsApp SIM. Linked once, the session persists in `.wwebjs_auth/`.
2. **Edit `tenants/infinity-classes.json`**: set the real `admins[].phone` (enables the analytics bot), display name, about, and `feeReminder` settings. Drop a logo at `tenants/assets/infinity-logo.jpg` and a `tenants/assets/welcome-kit.pdf` if you want them auto-attached.
3. **Paste keys into `.env`** to switch features on (system runs without them):
   - `GEMINI_API_KEY` → turns on AI evaluation + analytics bot.
   - `RAZORPAY_KEY_ID` / `_SECRET` / `_WEBHOOK_SECRET` → turns on auto pay-links + receipts.
   - `PUBLIC_BASE_URL` → for real use, a public https tunnel (cloudflared/ngrok) so phones can open upload links and Razorpay can reach the webhook. For same-Wi-Fi testing, use `http://<laptop-LAN-ip>:3000`.

## Humanizer knobs
Per-tenant in `tenants/<id>.json → humanizer` (pacing, jitter, warm-up ramp 20→50/day,
office hours 9–20 IST, typing simulation). **Warm up a new number slowly** — don't blast 100
students day one; the ramp handles this automatically and over-cap messages hold to next day.

## Keep alive across reboot (Windows)
pm2's `startup` isn't native on Windows. Easiest: install **pm2-installer** (runs pm2 as a
Windows service) or add a Task Scheduler "At log on" task running `pm2 resurrect`. After first
setup run `pm2 save` so the process list is remembered.

## Layout
```
src/index.js        boot (one process)
src/wa.js           headless WhatsApp channel  (swap this for official API later)
src/queue.js        single paced sender (humanizer applied to every send)
src/humanize.js     anti-flag suite
src/store.js        atomic JSON DB (data/db.json)
src/flows/          onboarding · fees · exam · evaluation · analyticsBot
src/server.js       dashboard + admin actions + upload terminal + Razorpay webhook
public/             dashboard.html · upload.html
tenants/*.json      per-tenant config (multi-tenant-shaped)
```
