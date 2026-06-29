// Pillar 4: Multimodal AI Sheet Evaluation. Student uploads handwritten answer
// images -> Gemini grades vs the answer key -> Report Card to the parent's WhatsApp.
const store = require('../store');
const queue = require('../queue');
const ai = require('../ai');
const { tenant } = require('../config');
const { fill } = require('./_util');

// Called after the web upload terminal saves images for a submission.
async function evaluateSubmission(submissionId) {
  const db = store.load();
  const sub = db.submissions[submissionId];
  if (!sub) return { ok: false, reason: 'no submission' };
  const exam = db.exams[sub.examId];
  const student = db.students[sub.studentId];
  if (!exam || !student) return { ok: false, reason: 'missing exam/student' };

  store.update((d) => { d.submissions[submissionId].status = 'grading'; });

  let result;
  if (ai.enabled()) {
    try {
      result = await ai.evaluateSheets(sub.images, {
        examName: exam.name, answerKey: exam.answerKey || '(no key provided)',
        total: exam.total || 100, studentName: student.name,
      });
    } catch (e) {
      console.log('[EVAL] AI error:', e.message);
      store.update((d) => { d.submissions[submissionId].status = 'error'; d.submissions[submissionId].error = e.message; });
      return { ok: false, reason: e.message };
    }
  } else {
    // Fallback: mark for manual grading, notify nobody automatically.
    store.update((d) => { d.submissions[submissionId].status = 'manual-needed'; });
    return { ok: false, reason: 'AI disabled — flagged for manual grading' };
  }

  store.update((d) => {
    Object.assign(d.submissions[submissionId], {
      marks: result.marks, total: result.total, percent: result.percent,
      feedback: result.feedback, status: 'graded', gradedAt: new Date().toISOString(),
    });
    if (d.students[sub.studentId]) d.students[sub.studentId].stage = 'evaluated';
  });

  const target = student.parentPhone || student.phone;
  if (target) {
    queue.enqueue({
      phone: target, kind: 'report-card',
      text: fill(tenant.templates.reportCard, {
        examName: exam.name, studentName: student.name,
        marks: result.marks, total: result.total, percent: result.percent, feedback: result.feedback,
      }),
    });
  }
  return { ok: true, ...result };
}

module.exports = { evaluateSubmission };
