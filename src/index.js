// Single entry point — boots the whole Coaching OS in ONE process (laptop-friendly).
// pm2 keeps this alive. Channel = headless WhatsApp (swappable later for Meta API).
const { TENANT_ID, env } = require('./config');
const store = require('./store');
const wa = require('./wa');
const queue = require('./queue');
const router = require('./router');
const scheduler = require('./scheduler');
const server = require('./server');

process.env.TZ = env.tz; // pin timezone for all date math

console.log('==================================================');
console.log(`  WhatsApp Coaching OS — tenant: ${TENANT_ID}`);
console.log(`  Channel: headless (whatsapp-web.js + system Chrome)`);
console.log('==================================================');

store.load();          // init DB
queue.restore();       // resume any messages still pending from before a restart
server.start();        // web/dashboard/uploads/webhooks
router.register(wa);   // inbound -> analytics bot etc.
wa.init();             // start engine -> prints QR to scan once
scheduler.start();     // fees daily + exam due-check

process.on('unhandledRejection', (e) => console.log('[ERR] unhandledRejection:', e?.message || e));
process.on('uncaughtException', (e) => console.log('[ERR] uncaughtException:', e?.message || e));
