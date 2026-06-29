// Pillar 3: Digital Exam Hall (batch-group model).
// At the scheduled time the question-paper PDF is posted to the batch's WhatsApp group.
// Fallback: if that batch has no group mapped, send to each student individually (paced).
const fs = require('fs');
const store = require('../store');
const queue = require('../queue');
const hz = require('../humanize');
const batches = require('../batches');
const { tenant } = require('../config');
const { fill } = require('./_util');

// exam: { name, batch, paperPath, scheduledAt(ISO), total }
function createExam(exam) {
  const id = 'e_' + Date.now().toString(36);
  const rec = { id, distributed: false, createdAt: new Date().toISOString(), total: 100, ...exam };
  store.update((db) => { db.exams[id] = rec; });
  return rec;
}

function distribute(examId) {
  const db = store.load();
  const exam = db.exams[examId];
  if (!exam || exam.distributed) return { ok: false, reason: 'missing or already sent' };
  const paper = exam.paperPath && fs.existsSync(exam.paperPath) ? exam.paperPath : undefined;
  const groupId = exam.batch ? batches.groupIdFor(exam.batch) : null;

  let mode, count = 0;
  if (groupId) {
    // One post to the batch group — fast + ban-proof.
    queue.enqueue({
      chatId: groupId, kind: 'exam-paper-group', mediaPath: paper, urgent: true,
      text: fill(tenant.templates.examGroupNotice, { batch: exam.batch, examName: exam.name }),
    });
    mode = 'group'; count = 1;
  } else {
    // Fallback: individual paced sends to each student in the batch.
    const list = exam.batch ? batches.studentsInBatch(exam.batch) : Object.values(db.students);
    for (const s of list) {
      if (!hz.hasConsent(s) || !s.phone) continue;
      queue.enqueue({
        phone: s.phone, kind: 'exam-paper-dm', mediaPath: paper,
        text: fill(tenant.templates.examGroupNotice, { batch: exam.batch || '', examName: exam.name }),
      });
      count++;
    }
    mode = 'individual';
  }
  store.update((d) => { d.exams[examId].distributed = true; d.exams[examId].distributedAt = new Date().toISOString(); d.exams[examId].distributedVia = mode; });
  return { ok: true, mode, count };
}

// Scheduler tick: fire any exam whose time has arrived.
function checkDue() {
  const db = store.load();
  const now = Date.now();
  for (const exam of Object.values(db.exams)) {
    if (!exam.distributed && exam.scheduledAt && new Date(exam.scheduledAt).getTime() <= now) {
      console.log(`[EXAM] Distributing "${exam.name}" (${exam.batch || 'all'})`);
      distribute(exam.id);
    }
  }
}

module.exports = { createExam, distribute, checkDue };
