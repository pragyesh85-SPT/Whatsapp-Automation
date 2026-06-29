// Branded PDF report cards, rendered with the system Chrome (puppeteer-core).
// One short-lived browser per batch of cards => light on this laptop.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { env, paths, tenant, ROOT } = require('./config');

function ensureDir() { if (!fs.existsSync(paths.reportcards)) fs.mkdirSync(paths.reportcards, { recursive: true }); }

function logoDataUri() {
  const rc = tenant.reportCard || {};
  const rel = rc.logoPath || tenant.branding?.logoPath;
  if (!rel) return '';
  const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return '';
  const ext = (abs.split('.').pop() || 'png').toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : 'image/png';
  return `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
}

function gradeBand(p) {
  if (p >= 90) return { g: 'A+', m: 'Outstanding' };
  if (p >= 75) return { g: 'A', m: 'Excellent' };
  if (p >= 60) return { g: 'B', m: 'Good' };
  if (p >= 40) return { g: 'C', m: 'Needs improvement' };
  return { g: 'D', m: 'Needs serious attention' };
}

function cardHtml({ student, exam, marks, total, percent, remark }) {
  const rc = tenant.reportCard || {};
  const accent = rc.accent || '#4f8cff';
  const logo = logoDataUri();
  const band = gradeBand(percent);
  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box;font-family:Segoe UI,Arial,sans-serif}
    body{padding:0;color:#1a2230}
    .page{width:760px;margin:0 auto;padding:40px 44px}
    .head{display:flex;align-items:center;gap:18px;border-bottom:4px solid ${accent};padding-bottom:18px}
    .logo{width:74px;height:74px;object-fit:contain;border-radius:10px}
    .logo.ph{display:flex;align-items:center;justify-content:center;background:${accent};color:#fff;font-size:30px;font-weight:800}
    .inst h1{font-size:26px;color:${accent}} .inst p{color:#6b7689;font-size:13px;margin-top:2px}
    .title{text-align:center;margin:26px 0 6px;font-size:19px;letter-spacing:.12em;text-transform:uppercase;color:#6b7689}
    .exam{text-align:center;font-size:22px;font-weight:700;margin-bottom:22px}
    .info{display:flex;justify-content:space-between;background:#f4f6fb;border-radius:12px;padding:16px 20px;margin-bottom:22px}
    .info div span{display:block;color:#9aa3b5;font-size:12px} .info div b{font-size:15px}
    .score{display:flex;gap:18px;margin-bottom:24px}
    .box{flex:1;border:1px solid #e6eaf2;border-radius:14px;padding:20px;text-align:center}
    .box .n{font-size:38px;font-weight:800;color:${accent}} .box .l{color:#9aa3b5;font-size:12px;margin-top:4px;text-transform:uppercase;letter-spacing:.08em}
    .grade .n{color:#1b8f54}
    .remark{border-left:4px solid ${accent};background:#f9fbff;border-radius:0 12px 12px 0;padding:16px 18px;margin-bottom:30px}
    .remark h3{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#9aa3b5;margin-bottom:6px} .remark p{font-size:15px;line-height:1.6}
    .foot{display:flex;justify-content:space-between;border-top:1px solid #e6eaf2;padding-top:16px;color:#6b7689;font-size:12px}
    .sign{text-align:right} .sign b{color:#1a2230}
  </style></head><body><div class="page">
    <div class="head">
      ${logo ? `<img class="logo" src="${logo}">` : `<div class="logo ph">${(rc.instituteName || 'C')[0]}</div>`}
      <div class="inst"><h1>${rc.instituteName || tenant.branding.displayName}</h1><p>${rc.tagline || ''}</p></div>
    </div>
    <div class="title">Report Card</div>
    <div class="exam">${exam.name}</div>
    <div class="info">
      <div><span>Student</span><b>${student.name}</b></div>
      <div><span>Batch / Class</span><b>${student.batch || student.class || '-'}</b></div>
      <div><span>Date</span><b>${date}</b></div>
    </div>
    <div class="score">
      <div class="box"><div class="n">${marks}<span style="font-size:18px;color:#9aa3b5">/${total}</span></div><div class="l">Marks</div></div>
      <div class="box"><div class="n">${percent}%</div><div class="l">Percentage</div></div>
      <div class="box grade"><div class="n">${band.g}</div><div class="l">${band.m}</div></div>
    </div>
    <div class="remark"><h3>Teacher's Remark</h3><p>${remark || band.m + '. Keep working consistently.'}</p></div>
    <div class="foot">
      <div>${rc.contact || ''}${rc.address ? ' · ' + rc.address : ''}</div>
      <div class="sign"><b>${tenant.branding.displayName}</b><br>Authorised Signatory</div>
    </div>
  </div></body></html>`;
}

// Generate PDFs for many results in one browser session. items: [{student, exam, marks, total, percent, remark}]
async function generateBatch(items) {
  ensureDir();
  const browser = await puppeteer.launch({
    headless: true, executablePath: env.chromePath,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const out = [];
  try {
    for (const it of items) {
      const page = await browser.newPage();
      await page.setContent(cardHtml(it), { waitUntil: 'networkidle0' });
      const file = path.join(paths.reportcards, `${it.exam.id}_${it.student.id}.pdf`);
      await page.pdf({ path: file, format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '0', right: '0' } });
      await page.close();
      out.push({ studentId: it.student.id, pdfPath: file });
    }
  } finally {
    await browser.close();
  }
  return out;
}

module.exports = { generateBatch, cardHtml };
