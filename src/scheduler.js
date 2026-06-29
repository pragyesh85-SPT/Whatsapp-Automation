// Lightweight scheduler (no node-cron dep). Runs inside the single process.
const fees = require('./flows/fees');
const exam = require('./flows/exam');
const { hz } = require('./config');

let lastFeeRunDay = null;

function start() {
  // Exam due-check: every 60s.
  setInterval(() => { try { exam.checkDue(); } catch (e) { console.log('[SCHED] exam:', e.message); } }, 60 * 1000);

  // Fee reminders: once per day, at the first tick inside office hours.
  setInterval(async () => {
    const d = new Date();
    const dayKey = d.toISOString().slice(0, 10);
    if (lastFeeRunDay === dayKey) return;
    if (d.getHours() < hz.officeStartHour || d.getHours() >= hz.officeEndHour) return;
    lastFeeRunDay = dayKey;
    try { console.log('[SCHED] Daily fee reminder run.'); await fees.runDailyReminders(); }
    catch (e) { console.log('[SCHED] fees:', e.message); }
  }, 5 * 60 * 1000); // check every 5 min

  console.log('[SCHED] Scheduler started (exam:60s, fees:daily within office hours).');
}

module.exports = { start };
