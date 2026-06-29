// Gemini 2.5 Flash-Lite client (REST via built-in fetch — no SDK).
// Graceful: if no GEMINI_API_KEY, evaluation/analytics fall back instead of crashing.
const fs = require('fs');
const { env, tenant } = require('./config');
const store = require('./store');

function enabled() { return !!env.geminiKey; }

function monthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function tokensUsedThisMonth() { return store.load().counters[`ai:${monthKey()}`] || 0; }
function budgetLeft() { return tenant.aiBudget.monthlyTokenCap - tokensUsedThisMonth(); }
function addTokens(n) { store.update((db) => { const k = `ai:${monthKey()}`; db.counters[k] = (db.counters[k] || 0) + (n || 0); }); }

const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.geminiKey}`;

function fileToInlinePart(filePath) {
  const ext = (filePath.split('.').pop() || 'jpg').toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return { inline_data: { mime_type: mime, data: fs.readFileSync(filePath).toString('base64') } };
}

async function generate(parts, { maxTokens = 1024 } = {}) {
  if (!enabled()) throw new Error('AI disabled (no GEMINI_API_KEY)');
  if (budgetLeft() <= 0) throw new Error('AI monthly token budget exhausted');
  const res = await fetch(ENDPOINT(env.geminiModel), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const used = data?.usageMetadata?.totalTokenCount || 0;
  addTokens(used);
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  return { text, tokens: used };
}

// Grade handwritten answer-sheet images against an answer key.
async function evaluateSheets(imagePaths, { examName, answerKey, total, studentName }) {
  const prompt =
    `You are an exam evaluator. The images are photos of a student's HANDWRITTEN answer sheet for "${examName}".\n` +
    `ANSWER KEY / RUBRIC:\n${answerKey}\n\n` +
    `Total marks = ${total}. Read the handwriting carefully, grade each answer, and respond as STRICT JSON only:\n` +
    `{"marks": <number>, "total": ${total}, "feedback": "<2-4 sentence constructive critique naming weak topics, warm tone, address ${studentName}>"}`;
  const parts = [{ text: prompt }, ...imagePaths.map(fileToInlinePart)];
  const { text, tokens } = await generate(parts, { maxTokens: 800 });
  const json = JSON.parse(text.replace(/```json|```/g, '').trim());
  const marks = Math.max(0, Math.min(total, Number(json.marks) || 0));
  return { marks, total, percent: Math.round((marks / total) * 100), feedback: json.feedback || '', tokens };
}

// Read a photographed/scanned marksheet -> list of {name, marks}.
async function extractMarks(imagePaths, { studentNames = [], total = 100 } = {}) {
  const roster = studentNames.length ? `Known student names (match to these, fix spelling): ${studentNames.join(', ')}.\n` : '';
  const prompt =
    `These images are a teacher's marksheet (a table or list of student names with marks, possibly handwritten).\n` +
    roster +
    `Max marks = ${total}. Extract every row and respond as STRICT JSON only:\n` +
    `{"rows":[{"name":"<student name>","marks":<number>}]}`;
  const parts = [{ text: prompt }, ...imagePaths.map(fileToInlinePart)];
  const { text } = await generate(parts, { maxTokens: 1200 });
  const json = JSON.parse(text.replace(/```json|```/g, '').trim());
  return (json.rows || []).map((r) => ({ name: String(r.name || '').trim(), marks: Math.max(0, Math.min(total, Number(r.marks) || 0)) }));
}

// Natural-language analytics for the teacher bot.
async function analytics(question, contextPayload) {
  const prompt =
    `You are the analytics assistant for a coaching center. Using ONLY the data below, answer the teacher's ` +
    `question in a short, clear WhatsApp message (plain text, no markdown tables).\n\n` +
    `DATA (JSON):\n${JSON.stringify(contextPayload)}\n\nQUESTION: ${question}`;
  const { text } = await generate([{ text: prompt }], { maxTokens: 600 });
  return text.trim();
}

module.exports = { enabled, evaluateSheets, extractMarks, analytics, tokensUsedThisMonth, budgetLeft, monthKey };
