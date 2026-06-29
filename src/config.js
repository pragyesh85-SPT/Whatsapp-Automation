// Central config: merges .env with the active tenant's JSON.
// Single-tenant on this laptop, but tenant-shaped so the same code runs multi-tenant later.
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TENANT_ID = process.env.TENANT_ID || 'infinity-classes';

function loadTenant(id) {
  const p = path.join(ROOT, 'tenants', `${id}.json`);
  if (!fs.existsSync(p)) throw new Error(`Tenant config not found: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const tenant = loadTenant(TENANT_ID);

module.exports = {
  ROOT,
  TENANT_ID,
  tenant,
  paths: {
    data: path.join(ROOT, 'data'),
    uploads: path.join(ROOT, 'data', 'uploads'),
    reportcards: path.join(ROOT, 'data', 'reportcards'),
    media: path.join(ROOT, 'tenants', 'assets'),
    waAuth: path.join(ROOT, '.wwebjs_auth'),
    logs: path.join(ROOT, 'logs'),
    public: path.join(ROOT, 'public'),
  },
  env: {
    chromePath: process.env.CHROME_PATH,
    tz: process.env.TZ || 'Asia/Kolkata',
    dashPort: parseInt(process.env.DASH_PORT || '3000', 10),
    publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.DASH_PORT || '3000'}`,
    geminiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
    razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  // convenience
  hz: tenant.humanizer,
};
