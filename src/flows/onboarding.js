// Pillar 1: Instant Onboarding. Admin adds a student -> personalized welcome to
// student + parent (with optional welcome PDF), then stage advances.
const path = require('path');
const fs = require('fs');
const store = require('../store');
const queue = require('../queue');
const hz = require('../humanize');
const { tenant, paths } = require('../config');
const { fill } = require('./_util');

function welcomeKitPath() {
  const p = path.join(paths.media, 'welcome-kit.pdf');
  return fs.existsSync(p) ? p : undefined;
}

// student: { name, parentName, phone, parentPhone, batch, class, feeAmount }
function enroll(student) {
  const id = 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const rec = {
    id, ...student,
    consent: true,            // admin-entered => consent implied for service messages
    stage: 'onboarding',
    feeStatus: 'unpaid',
    createdAt: new Date().toISOString(),
  };
  store.update((db) => { db.students[id] = rec; });

  const kit = welcomeKitPath();
  if (hz.hasConsent(rec) && rec.phone) {
    queue.enqueue({
      phone: rec.phone, kind: 'onboarding-student', mediaPath: kit,
      text: fill(tenant.templates.onboardingStudent, { studentName: rec.name, batch: rec.batch }),
    });
  }
  if (rec.parentPhone) {
    queue.enqueue({
      phone: rec.parentPhone, kind: 'onboarding-parent',
      text: fill(tenant.templates.onboardingParent, { studentName: rec.name, batch: rec.batch }),
    });
  }
  store.update((db) => { if (db.students[id]) db.students[id].stage = 'onboarded'; });
  return rec;
}

module.exports = { enroll };
