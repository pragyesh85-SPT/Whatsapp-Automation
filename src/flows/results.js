// Results: enter marks (typed OR read from a marksheet) -> branded PDF report cards
// -> owner sends them, either separately to each student (paced 30s, office hours)
// or posted to the batch's WhatsApp group.
const store = require('../store');
const queue = require('../queue');
const ai = require('../ai');
const reportcard = require('../reportcard');
const batches = require('../batches');
const { tenant } = require('../config');
const { fill } = require('./_util');

const RESULT_SPACING_MS = 30000; // 30s between separate result sends (user spec)

function key(examId, studentId) { return `${examId}:${studentId}`; }

function pct(marks, total) { return Math.round((marks / (total || 100)) * 100); }

// Typed marks. entries: [{ studentId, marks, remark? }]
function enterMarks(examId, entries) {
  const db = store.load();
  const exam = db.exams[examId];
  if (!exam) return { ok: false, reason: 'no exam' };
  let n = 0;
  store.update((d) => {
    for (const e of entries) {
      if (!d.students[e.studentId]) continue;
      const marks = Math.max(0, Math.min(exam.total, Number(e.marks) || 0));
      d.results[key(examId, e.studentId)] = {
        examId, studentId: e.studentId, marks, total: exam.total, percent: pct(marks, exam.total),
        remark: e.remark || '', pdfPath: null, status: 'marked', sentAt: null,
      };
      n++;
    }
  });
  return { ok: true, marked: n };
}

// Read marks from an uploaded marksheet image, match names to students, store.
async function importMarksFromSheet(examId, imagePaths) {
  const db = store.load();
  const exam = db.exams[examId];
  if (!exam) return { ok: false, reason: 'no exam' };
  if (!ai.enabled()) return { ok: false, reason: 'AI disabled (no GEMINI_API_KEY) — type marks instead' };

  const pool = exam.batch ? batches.studentsInBatch(exam.batch) : Object.values(db.students);
  const names = pool.map((s) => s.name);
  const rows = await ai.extractMarks(imagePaths, { studentNames: names, total: exam.total });

  const norm = (x) => String(x).toLowerCase().replace(/\s+/g, ' ').trim();
  const matched = [], unmatched = [];
  for (const r of rows) {
    const s = pool.find((p) => norm(p.name) === norm(r.name))
           || pool.find((p) => norm(p.name).startsWith(norm(r.name)) || norm(r.name).startsWith(norm(p.name)));
    if (s) matched.push({ studentId: s.id, marks: r.marks });
    else unmatched.push(r);
  }
  enterMarks(examId, matched);
  return { ok: true, matched: matched.length, unmatched };
}

// Build PDF report cards for all marked results of an exam.
async function generateCards(examId) {
  const db = store.load();
  const exam = db.exams[examId];
  if (!exam) return { ok: false, reason: 'no exam' };
  const items = Object.values(db.results)
    .filter((r) => r.examId === examId && r.status !== 'sent')
    .map((r) => ({ student: db.students[r.studentId], exam, marks: r.marks, total: r.total, percent: r.percent, remark: r.remark }))
    .filter((it) => it.student);
  if (!items.length) return { ok: false, reason: 'no marks entered yet' };

  const made = await reportcard.generateBatch(items);
  store.update((d) => { for (const m of made) { const k = key(examId, m.studentId); if (d.results[k]) { d.results[k].pdfPath = m.pdfPath; d.results[k].status = 'ready'; } } });
  return { ok: true, generated: made.length };
}

// Send report cards. mode: 'separate' (DM each student, paced 30s) | 'group' (post to batch group).
function sendCards(examId, mode = 'separate') {
  const db = store.load();
  const exam = db.exams[examId];
  if (!exam) return { ok: false, reason: 'no exam' };
  const ready = Object.values(db.results).filter((r) => r.examId === examId && r.status === 'ready' && r.pdfPath);
  if (!ready.length) return { ok: false, reason: 'generate report cards first' };

  let queued = 0;
  for (const r of ready) {
    const s = db.students[r.studentId];
    if (!s) continue;
    const caption = fill(tenant.templates.reportCardCaption, {
      studentName: s.name, examName: exam.name, marks: r.marks, total: r.total, percent: r.percent,
    });
    if (mode === 'group') {
      const gid = batches.groupIdFor(s.batch);
      if (!gid) { console.log(`[RESULTS] no group for batch "${s.batch}", skipping ${s.name}`); continue; }
      queue.enqueue({ chatId: gid, kind: 'report-card-group', mediaPath: r.pdfPath, text: caption, spacingMs: RESULT_SPACING_MS });
    } else {
      const target = s.parentPhone || s.phone;
      if (!target) continue;
      queue.enqueue({ phone: target, kind: 'report-card-dm', mediaPath: r.pdfPath, text: caption, spacingMs: RESULT_SPACING_MS });
    }
    store.update((d) => { const k = key(examId, r.studentId); if (d.results[k]) { d.results[k].status = 'sent'; d.results[k].sentAt = new Date().toISOString(); } });
    queued++;
  }
  return { ok: true, queued, mode, note: `Sending ${queued} report cards, ~30s apart, within office hours.` };
}

module.exports = { enterMarks, importMarksFromSheet, generateCards, sendCards };
