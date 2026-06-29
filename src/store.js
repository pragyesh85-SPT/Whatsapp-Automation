// Tiny atomic JSON datastore. No native build (works on Node 24, no Python/VS toolchain).
// Single-process design => no cross-process races. Perfect for ~100s of students.
const fs = require('fs');
const path = require('path');
const { paths } = require('./config');

const DB_FILE = path.join(paths.data, 'db.json');

const DEFAULTS = {
  students: {},      // id -> { id, name, parentName, phone, parentPhone, batch, class, consent, stage, feeStatus, feeAmount, createdAt }
  batches: {},       // batchName -> { groupId, groupName, mappedAt }   (WhatsApp group per batch)
  fees: {},          // `${studentId}:${month}` -> { studentId, month, amount, status, payLinkId, payLink, paidAt, receiptNo }
  exams: {},         // id -> { id, name, batch, paperPath, scheduledAt, total, distributed, createdAt }
  results: {},       // `${examId}:${studentId}` -> { examId, studentId, marks, total, percent, remark, pdfPath, status, sentAt }
  submissions: {},   // id -> { id, examId, studentId, images:[paths], marks, total, percent, feedback, status, createdAt }  (optional AI answer-check)
  counters: {},      // `wa:${YYYY-MM-DD}` -> sent count ;  `ai:${YYYY-MM}` -> tokens used
  meta: { createdAt: null },
};

let cache = null;

function ensureDir() {
  if (!fs.existsSync(paths.data)) fs.mkdirSync(paths.data, { recursive: true });
  if (!fs.existsSync(paths.uploads)) fs.mkdirSync(paths.uploads, { recursive: true });
}

function load() {
  if (cache) return cache;
  ensureDir();
  if (fs.existsSync(DB_FILE)) {
    try { cache = { ...structuredClone(DEFAULTS), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; }
    catch { cache = structuredClone(DEFAULTS); }
  } else {
    cache = structuredClone(DEFAULTS);
    cache.meta.createdAt = new Date().toISOString();
  }
  return cache;
}

function save() {
  ensureDir();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DB_FILE); // atomic on same volume
}

// Mutate via a callback, then persist.
function update(fn) {
  const db = load();
  const r = fn(db);
  save();
  return r;
}

module.exports = { load, save, update, DB_FILE };
