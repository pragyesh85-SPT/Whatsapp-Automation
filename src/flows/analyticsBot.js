// Subsystem C: Teacher Analytics Bot. Admin texts the number a question ->
// number is verified against the tenant admin list -> Gemini answers from live data.
// Token-capped per month (tenant.aiBudget.monthlyTokenCap).
const store = require('../store');
const queue = require('../queue');
const ai = require('../ai');
const { tenant } = require('../config');
const { curMonthKey } = require('./fees');

function normalize(phone) { return String(phone).replace(/\D/g, ''); }

function isAdmin(phone) {
  const p = normalize(phone);
  return (tenant.admins || []).some((a) => normalize(a.phone) === p);
}

// Compact, lightweight context payload from current tables.
function buildContext() {
  const db = store.load();
  const month = curMonthKey();
  const students = Object.values(db.students).map((s) => ({
    name: s.name, batch: s.batch, class: s.class, feeStatus: s.feeStatus, stage: s.stage,
  }));
  const fees = Object.values(db.fees).filter((f) => f.month === month)
    .map((f) => ({ student: db.students[f.studentId]?.name, amount: f.amount, status: f.status, reminders: f.remindersSent }));
  const subs = Object.values(db.submissions).filter((s) => s.status === 'graded')
    .map((s) => ({ student: db.students[s.studentId]?.name, exam: db.exams[s.examId]?.name, percent: s.percent }));
  return {
    month, totalStudents: students.length,
    paid: fees.filter((f) => f.status === 'paid').length,
    unpaid: fees.filter((f) => f.status !== 'paid').length,
    students, fees, results: subs,
  };
}

// Inbound message hook (registered with wa.onMessage via router).
async function handle(msg) {
  const from = msg.from || '';
  if (!isAdmin(from)) return false;          // not an admin -> let other handlers try
  const q = (msg.body || '').trim();
  if (!q) return true;

  if (!ai.enabled()) {
    queue.enqueue({ phone: from, kind: 'admin-reply', urgent: true, text: 'Analytics AI is not configured yet (missing GEMINI_API_KEY).' });
    return true;
  }
  if (ai.budgetLeft() <= 0) {
    queue.enqueue({ phone: from, kind: 'admin-reply', urgent: true, text: 'Monthly analytics budget reached. Resets next month.' });
    return true;
  }
  try {
    const answer = await ai.analytics(q, buildContext());
    queue.enqueue({ phone: from, kind: 'admin-reply', urgent: true, text: answer });
  } catch (e) {
    queue.enqueue({ phone: from, kind: 'admin-reply', urgent: true, text: 'Could not generate analytics: ' + e.message });
  }
  return true;
}

module.exports = { handle, isAdmin, buildContext };
