// Local web layer: teacher dashboard + admin actions + student upload terminal + webhooks.
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { paths, env, tenant } = require('./config');
const store = require('./store');
const wa = require('./wa');
const queue = require('./queue');
const onboarding = require('./flows/onboarding');
const examFlow = require('./flows/exam');
const evaluation = require('./flows/evaluation');
const fees = require('./flows/fees');
const results = require('./flows/results');
const batches = require('./batches');
const ai = require('./ai');

const upload = multer({ dest: paths.uploads, limits: { fileSize: 8 * 1024 * 1024 } });

function start() {
  const app = express();

  // Razorpay webhook needs the RAW body for signature verification — mount before json parser.
  app.post('/webhook/razorpay', express.raw({ type: '*/*' }), (req, res) => {
    const sig = req.headers['x-razorpay-signature'];
    const raw = req.body.toString('utf8');
    const payments = require('./payments');
    if (payments.enabled() && !payments.verifyWebhook(raw, sig)) return res.status(400).send('bad signature');
    try {
      const event = JSON.parse(raw);
      if (event.event && event.event.includes('paid')) fees.handlePaymentEvent(event);
      res.json({ ok: true });
    } catch (e) { res.status(400).send(e.message); }
  });

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(paths.public));
  app.use('/reportcards', express.static(paths.reportcards)); // preview generated PDFs
  app.get('/', (req, res) => res.sendFile(path.join(paths.public, 'dashboard.html')));

  // ---- Live state for the dashboard ----
  app.get('/api/state', (req, res) => {
    const db = store.load();
    const month = fees.curMonthKey();
    res.json({
      tenant: { name: tenant.branding.displayName, id: tenant.id },
      wa: wa.status().ready ? 'connected' : (wa.status().hasQr ? 'scan-qr-in-terminal' : 'starting'),
      ai: ai.enabled() ? `on (${ai.tokensUsedThisMonth()} tok used)` : 'off (no key)',
      queue: queue.size(),
      students: Object.values(db.students),
      batches: db.batches,
      batchNames: batches.listBatchNames(),
      fees: Object.values(db.fees).filter((f) => f.month === month),
      exams: Object.values(db.exams),
      results: Object.values(db.results),
      submissions: Object.values(db.submissions),
    });
  });

  // ---- Batch <-> WhatsApp group mapping ----
  app.get('/api/groups', async (req, res) => {
    try { res.json({ ok: true, groups: await wa.listGroups() }); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  app.post('/api/batch/map', (req, res) => {
    const { batch, groupId, groupName } = req.body;
    if (!batch || !groupId) return res.status(400).json({ error: 'batch and groupId required' });
    batches.mapBatch(batch, groupId, groupName);
    res.json({ ok: true });
  });

  // ---- Admin: enroll a student (Pillar 1) ----
  app.post('/api/enroll', (req, res) => {
    const b = req.body;
    if (!b.name || !b.phone) return res.status(400).json({ error: 'name and phone required' });
    const rec = onboarding.enroll({
      name: b.name, parentName: b.parentName, phone: b.phone, parentPhone: b.parentPhone,
      batch: b.batch || 'General', class: b.class || '', feeAmount: Number(b.feeAmount) || 0,
    });
    res.json({ ok: true, student: rec });
  });

  // ---- Admin: create + schedule an exam for a batch (Pillar 3) ----
  app.post('/api/exam', upload.single('paper'), (req, res) => {
    const b = req.body;
    const rec = examFlow.createExam({
      name: b.name || 'Test', batch: b.batch || '', total: Number(b.total) || 100,
      answerKey: b.answerKey || '',
      paperPath: req.file ? req.file.path : undefined,
      scheduledAt: b.scheduledAt ? new Date(b.scheduledAt).toISOString() : new Date().toISOString(),
    });
    res.json({ ok: true, exam: rec });
  });

  // ---- Admin: trigger a daily fee run now (for testing) ----
  app.post('/api/fees/run', async (req, res) => { await fees.runDailyReminders(); res.json({ ok: true }); });

  // ---- Results: type marks ----
  app.post('/api/marks', (req, res) => {
    const { examId, entries } = req.body; // entries: [{studentId, marks, remark}]
    if (!examId || !Array.isArray(entries)) return res.status(400).json({ error: 'examId and entries[] required' });
    res.json(results.enterMarks(examId, entries));
  });

  // ---- Results: read marks from an uploaded marksheet ----
  app.post('/api/marks/upload', upload.array('sheet', 5), async (req, res) => {
    const { examId } = req.body;
    if (!examId || !req.files?.length) return res.status(400).json({ error: 'examId and marksheet image required' });
    try { res.json(await results.importMarksFromSheet(examId, req.files.map((f) => f.path))); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ---- Results: generate branded PDF report cards ----
  app.post('/api/reportcards/generate', async (req, res) => {
    try { res.json(await results.generateCards(req.body.examId)); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ---- Results: send report cards (mode: separate | group) ----
  app.post('/api/reportcards/send', (req, res) => {
    res.json(results.sendCards(req.body.examId, req.body.mode || 'separate'));
  });

  // ---- Student upload terminal (Pillar 4) ----
  app.get('/upload', (req, res) => res.sendFile(path.join(paths.public, 'upload.html')));

  app.post('/api/submit', upload.array('sheets', 10), async (req, res) => {
    const { exam, student } = req.body;
    if (!exam || !student || !req.files?.length) return res.status(400).json({ error: 'exam, student and at least one image required' });
    const id = 'sub_' + Date.now().toString(36);
    const images = req.files.map((f) => f.path);
    store.update((db) => { db.submissions[id] = { id, examId: exam, studentId: student, images, status: 'received', createdAt: new Date().toISOString() }; });
    res.json({ ok: true, submissionId: id, message: 'Received! Your report card will arrive on WhatsApp shortly.' });
    // grade async (don't block the upload response)
    evaluation.evaluateSubmission(id).catch((e) => console.log('[EVAL]', e.message));
  });

  app.listen(env.dashPort, () => {
    console.log(`[WEB] Dashboard:        ${env.publicBaseUrl}/`);
    console.log(`[WEB] Upload terminal:  ${env.publicBaseUrl}/upload`);
    console.log(`[WEB] Razorpay webhook: ${env.publicBaseUrl}/webhook/razorpay`);
  });
}

module.exports = { start };
