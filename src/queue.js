// The single paced sender. EVERY outbound message goes through here, so the
// humanizer (office hours, daily cap, typing sim, pacing, variation) always applies.
// DURABLE: pending items are persisted to db.outbox, so a reboot resumes them
// (e.g. report cards held overnight for office hours are not lost).
const wa = require('./wa');
const hz = require('./humanize');
const store = require('./store');

const q = [];          // in-memory working copy (mirror of db.outbox)
let draining = false;

// Strip non-serialisable fields before persisting.
function serialisable(it) {
  const { onSent, ...rest } = it;
  return rest;
}
function persistAdd(item) { store.update((db) => { db.outbox[item.id] = serialisable(item); }); }
function persistRemove(id) { store.update((db) => { delete db.outbox[id]; }); }

// item: { phone | chatId, text, mediaPath?, kind, spacingMs?, urgent?, onSent? }
function enqueue(item) {
  const rec = { id: 'o_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), queuedAt: Date.now(), retries: 0, ...item };
  q.push(rec);
  persistAdd(rec);
  drain();
  return q.length;
}

// On boot: reload anything that was still pending.
function restore() {
  const db = store.load();
  const items = Object.values(db.outbox || {}).sort((a, b) => (a.queuedAt || 0) - (b.queuedAt || 0));
  for (const it of items) q.push(it);
  if (items.length) console.log(`[QUEUE] Restored ${items.length} pending message(s) from outbox.`);
  drain();
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
        if (!isGroup && item.phone) await wa.showTyping(item.phone, hz.typingDelayMs()); // typing sim for DMs
        await wa.rawSendChat(target, hz.vary(item.text || ''), item.mediaPath);
        hz.bumpSent();
        persistRemove(item.id);
        console.log(`[SENT] ${item.kind} -> ${target}  (cap ${hz.sentToday()}/${hz.dailyCap()})`);
        if (typeof item.onSent === 'function') { try { item.onSent(); } catch {} }
      } catch (e) {
        console.log(`[QUEUE] send failed (${item.kind} -> ${target}): ${e.message}.`);
        if ((item.retries || 0) >= 3) { persistRemove(item.id); console.log('[QUEUE] dropped after 3 retries.'); }
        else { item.retries = (item.retries || 0) + 1; q.push(item); persistAdd(item); }
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

module.exports = { enqueue, restore, size, drain };
