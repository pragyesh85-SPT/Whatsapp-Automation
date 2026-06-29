// The single paced sender. EVERY outbound message goes through here so the
// humanizer (office hours, daily cap, typing sim, pacing, variation) always applies.
const wa = require('./wa');
const hz = require('./humanize');

// item: { phone, text, mediaPath?, kind, meta?, urgent? }
const q = [];
let draining = false;

function enqueue(item) {
  q.push({ ...item, queuedAt: Date.now() });
  drain();
  return q.length;
}

function size() { return q.length; }

async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (q.length) {
      // Office hours gate — outside 9–20 IST, hold the whole queue till morning.
      const wait = hz.msUntilOfficeHours();
      if (wait > 0) {
        console.log(`[QUEUE] Outside office hours. Holding ${q.length} msg(s) for ${Math.round(wait / 60000)} min.`);
        await sleep(Math.min(wait, 60 * 60 * 1000)); // re-check at most hourly
        continue;
      }
      // Daily cap gate — over cap, hold to next day.
      if (hz.capReached()) {
        console.log(`[QUEUE] Daily cap reached (${hz.dailyCap()}). Holding ${q.length} msg(s) to tomorrow.`);
        await sleep(30 * 60 * 1000);
        continue;
      }

      const item = q.shift();
      const target = item.chatId || wa.jid(item.phone);
      const isGroup = String(target).endsWith('@g.us');
      try {
        // typing sim only for 1:1 chats (keeps DMs human; groups just post)
        if (!isGroup && item.phone) await wa.showTyping(item.phone, hz.typingDelayMs());
        await wa.rawSendChat(target, hz.vary(item.text || ''), item.mediaPath);
        hz.bumpSent();
        console.log(`[SENT] ${item.kind} -> ${target}  (cap ${hz.sentToday()}/${hz.dailyCap()})`);
        if (typeof item.onSent === 'function') { try { item.onSent(); } catch {} }
      } catch (e) {
        console.log(`[QUEUE] send failed (${item.kind} -> ${target}): ${e.message}. Re-queueing.`);
        if ((item.retries || 0) >= 3) { console.log('[QUEUE] dropped after 3 retries.'); }
        else { q.push({ ...item, retries: (item.retries || 0) + 1 }); }
        await sleep(30000);
      }

      // pace between sends — item.spacingMs lets a flow set its own gap (e.g. results = 30s)
      if (q.length) {
        const gap = item.spacingMs ? item.spacingMs + hz.rand(0, 5000) : hz.pacingDelayMs();
        await sleep(gap);
      }
    }
  } finally {
    draining = false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { enqueue, size, drain };
