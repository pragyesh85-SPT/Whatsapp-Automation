// Pillar 2: Auto-Pilot Cash Flow. Daily check of unpaid fees -> paced reminders
// with a Razorpay pay link at preset offsets. Razorpay webhook -> receipt + loop stops.
const store = require('../store');
const queue = require('../queue');
const payments = require('../payments');
const { tenant, env } = require('../config');
const { fill, monthLabel } = require('./_util');

function curMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Ensure a fee record exists for each student for the current month.
function ensureMonthlyFees() {
  const month = curMonthKey();
  store.update((db) => {
    for (const s of Object.values(db.students)) {
      const key = `${s.id}:${month}`;
      if (!db.fees[key] && s.feeAmount) {
        db.fees[key] = { studentId: s.id, month, amount: s.feeAmount, status: 'unpaid', remindersSent: 0, payLink: null, payLinkId: null };
      }
    }
  });
}

// Days since fee due date this month.
function daysOverdue() {
  const due = tenant.feeReminder.dueDayOfMonth;
  const today = new Date().getDate();
  return today - due;
}

// Called daily by the scheduler.
async function runDailyReminders() {
  ensureMonthlyFees();
  const offsets = tenant.feeReminder.reminderOffsets;
  const overdue = daysOverdue();
  if (!offsets.includes(overdue)) {
    console.log(`[FEES] Day offset ${overdue} not a reminder day. Skipping.`);
    return;
  }
  const db = store.load();
  const month = curMonthKey();
  for (const fee of Object.values(db.fees)) {
    if (fee.month !== month || fee.status === 'paid') continue;
    const s = db.students[fee.studentId];
    if (!s || !s.parentPhone) continue;

    // Create pay link once, reuse it.
    if (!fee.payLink) {
      try {
        const link = await payments.createPayLink({
          amount: fee.amount, studentName: s.name, month: monthLabel(),
          phone: s.parentPhone, refId: `${fee.studentId}:${month}`,
        });
        store.update((d) => { d.fees[`${fee.studentId}:${month}`].payLink = link.short_url; d.fees[`${fee.studentId}:${month}`].payLinkId = link.id; });
        fee.payLink = link.short_url;
      } catch (e) { console.log('[FEES] pay link error:', e.message); }
    }

    queue.enqueue({
      phone: s.parentPhone, kind: 'fee-reminder',
      text: fill(tenant.templates.feeReminder, {
        parentName: s.parentName || s.name, studentName: s.name,
        month: monthLabel(), amount: fee.amount, payLink: fee.payLink || '(pay link pending)',
      }),
    });
    store.update((d) => { const k = `${fee.studentId}:${month}`; if (d.fees[k]) d.fees[k].remindersSent = (d.fees[k].remindersSent || 0) + 1; });
  }
}

// Razorpay webhook handler (payment captured / link paid).
function handlePaymentEvent(event) {
  const entity = event?.payload?.payment_link?.entity || event?.payload?.payment?.entity;
  const refId = entity?.notes?.refId || entity?.reference_id;
  if (!refId) return { ok: false, reason: 'no refId' };
  const db = store.load();
  const fee = db.fees[refId];
  if (!fee || fee.status === 'paid') return { ok: true, dup: true };

  const receiptNo = 'R' + Date.now().toString(36).toUpperCase();
  store.update((d) => {
    d.fees[refId].status = 'paid';
    d.fees[refId].paidAt = new Date().toISOString();
    d.fees[refId].receiptNo = receiptNo;
    if (d.students[fee.studentId]) d.students[fee.studentId].feeStatus = 'paid';
  });
  const s = db.students[fee.studentId];
  if (s && s.parentPhone) {
    queue.enqueue({
      phone: s.parentPhone, kind: 'fee-confirmed', urgent: true,
      text: fill(tenant.templates.feeConfirmed, {
        parentName: s.parentName || s.name, studentName: s.name,
        month: monthLabel(new Date(fee.month + '-01')), amount: fee.amount, receiptNo,
      }),
    });
  }
  return { ok: true, receiptNo };
}

module.exports = { runDailyReminders, handlePaymentEvent, ensureMonthlyFees, curMonthKey };
