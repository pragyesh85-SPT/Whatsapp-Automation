// The HUMANIZER — anti-flag suite (architecture doc PART 1.4).
// In headless mode this is the ONLY thing protecting the number from a ban.
const { hz, env } = require('./config');
const store = require('./store');

function nowIST() {
  // Server TZ is set to Asia/Kolkata via .env; Date math is local to that.
  return new Date();
}

function todayKey() {
  const d = nowIST();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayIndexSinceStart() {
  // Warm-up ramps by how many days the DB (i.e. this number) has been live.
  const db = store.load();
  const start = new Date(db.meta.createdAt || Date.now());
  return Math.max(0, Math.floor((Date.now() - start.getTime()) / 86400000));
}

function dailyCap() {
  const ramp = hz.warmupRamp || [50];
  const idx = Math.min(dayIndexSinceStart(), ramp.length - 1);
  return ramp[idx];
}

function sentToday() {
  return store.load().counters[`wa:${todayKey()}`] || 0;
}

function capReached() {
  return sentToday() >= dailyCap();
}

function bumpSent() {
  store.update((db) => { const k = `wa:${todayKey()}`; db.counters[k] = (db.counters[k] || 0) + 1; });
}

function isOfficeHours(d = nowIST()) {
  const h = d.getHours();
  return h >= hz.officeStartHour && h < hz.officeEndHour;
}

// ms to wait until the next office-hours window opens (0 if already open).
function msUntilOfficeHours(d = nowIST()) {
  if (isOfficeHours(d)) return 0;
  const next = new Date(d);
  if (d.getHours() >= hz.officeEndHour) next.setDate(next.getDate() + 1);
  next.setHours(hz.officeStartHour, Math.floor(Math.random() * 5), 0, 0); // small jitter at open
  return next.getTime() - d.getTime();
}

function rand(min, max) { return Math.floor(min + Math.random() * (max - min)); }

function pacingDelayMs() {
  return hz.spacingMs + rand(0, hz.jitterMs);
}

function typingDelayMs() {
  return rand(hz.typingMinMs, hz.typingMaxMs);
}

// Message variation — subtle non-identical tails so no two sends are byte-identical.
const TAILS = ['', ' ', ' 🙂', '​', ' .', ' 🙏'];
function vary(text) {
  const tail = TAILS[rand(0, TAILS.length)];
  return text + tail;
}

// Consent gate — never message a number without consent=true.
function hasConsent(student) {
  return !!(student && student.consent);
}

module.exports = {
  todayKey, dailyCap, sentToday, capReached, bumpSent,
  isOfficeHours, msUntilOfficeHours, pacingDelayMs, typingDelayMs,
  vary, hasConsent, rand,
};
