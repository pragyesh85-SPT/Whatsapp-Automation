// Smoke test: verify the environment is wired correctly WITHOUT logging into WhatsApp.
// Confirms: deps load, system Chrome is found, .env is read.
require('dotenv').config();
const fs = require('fs');

function ok(label, cond, extra = '') {
  console.log(`${cond ? 'OK ' : 'XX '} ${label}${extra ? '  ->  ' + extra : ''}`);
  return cond;
}

console.log('=== Coaching automation — environment smoke test ===');
let pass = true;

// 1. Core deps load
try { require('express'); pass &= ok('express loads', true); }
catch (e) { pass &= ok('express loads', false, e.message); }

try { require('qrcode-terminal'); pass &= ok('qrcode-terminal loads', true); }
catch (e) { pass &= ok('qrcode-terminal loads', false, e.message); }

let WAOK = false;
try { require('whatsapp-web.js'); WAOK = true; pass &= ok('whatsapp-web.js loads', true); }
catch (e) { pass &= ok('whatsapp-web.js loads', false, e.message); }

// 2. System Chrome present (the engine will drive THIS, not a downloaded Chromium)
const chrome = process.env.CHROME_PATH || '';
pass &= ok('system Chrome found', !!chrome && fs.existsSync(chrome), chrome);

// 3. Key env knobs present
pass &= ok('.env loaded (TZ)', !!process.env.TZ, process.env.TZ);
pass &= ok('humanizer ramp set', !!process.env.WARMUP_RAMP, process.env.WARMUP_RAMP);

console.log('====================================================');
console.log(pass ? 'ALL GOOD — environment is ready.' : 'SOME CHECKS FAILED — see above.');
process.exit(pass ? 0 : 1);
