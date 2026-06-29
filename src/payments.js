// Razorpay payment links + webhook verification (REST via fetch + built-in crypto).
// Graceful: if no keys, createPayLink returns a manual-UPI placeholder so flows still run.
const crypto = require('crypto');
const { env } = require('./config');

function enabled() { return !!(env.razorpayKeyId && env.razorpayKeySecret); }

function authHeader() {
  return 'Basic ' + Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString('base64');
}

// amount in rupees; Razorpay wants paise.
async function createPayLink({ amount, studentName, month, phone, refId }) {
  if (!enabled()) {
    return { id: `manual_${refId}`, short_url: `(set Razorpay keys to enable auto pay link) UPI: yourupi@bank — ₹${amount}` };
  }
  const res = await fetch('https://api.razorpay.com/v1/payment_links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
    body: JSON.stringify({
      amount: Math.round(amount * 100),
      currency: 'INR',
      accept_partial: false,
      description: `Fee ${month} — ${studentName}`,
      customer: { name: studentName, contact: `+${String(phone).replace(/\D/g, '')}` },
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: { refId },
    }),
  });
  if (!res.ok) throw new Error(`Razorpay ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { id: data.id, short_url: data.short_url };
}

// Verify webhook signature (raw body string + X-Razorpay-Signature header).
function verifyWebhook(rawBody, signature) {
  if (!env.razorpayWebhookSecret) return false;
  const expected = crypto.createHmac('sha256', env.razorpayWebhookSecret).update(rawBody).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || '')); }
  catch { return false; }
}

module.exports = { enabled, createPayLink, verifyWebhook };
