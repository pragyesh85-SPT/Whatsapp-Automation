// Admin-managed brochure. Admin uploads/replaces the brochure PDF from the dashboard;
// it becomes the "current" brochure auto-attached to every new student's welcome.
// A separate action can post it to a batch's WhatsApp group on demand.
const fs = require('fs');
const path = require('path');
const store = require('../store');
const queue = require('../queue');
const batches = require('../batches');
const { paths, tenant } = require('../config');

function ensureDir() { if (!fs.existsSync(paths.data)) fs.mkdirSync(paths.data, { recursive: true }); }

// Save an uploaded file as the current brochure (overwrites previous).
function setBrochure(srcPath) {
  ensureDir();
  const dest = path.join(paths.data, 'brochure.pdf');
  fs.copyFileSync(srcPath, dest);
  store.update((db) => { db.settings.brochurePath = dest; db.settings.brochureUploadedAt = new Date().toISOString(); });
  return dest;
}

function current() {
  const p = store.load().settings?.brochurePath;
  return p && fs.existsSync(p) ? p : null;
}

function info() {
  const db = store.load();
  return { hasBrochure: !!current(), uploadedAt: db.settings?.brochureUploadedAt || null };
}

// Post the current brochure to a batch's WhatsApp group.
function sendToGroup(batch) {
  const gid = batches.groupIdFor(batch);
  if (!gid) return { ok: false, reason: `No WhatsApp group mapped for batch "${batch}"` };
  const b = current();
  if (!b) return { ok: false, reason: 'No brochure uploaded yet' };
  queue.enqueue({ chatId: gid, kind: 'brochure-group', mediaPath: b, text: `📘 ${tenant.branding.displayName} — Brochure attached.` });
  return { ok: true };
}

module.exports = { setBrochure, current, info, sendToGroup };
