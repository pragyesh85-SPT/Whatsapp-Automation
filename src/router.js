// Inbound message router. Admin analytics first; everything else is logged.
const analyticsBot = require('./flows/analyticsBot');

function register(wa) {
  wa.onMessage(async (msg) => {
    if (msg.fromMe) return;
    // 1) Admin analytics bot (verified by phone)
    const handled = await analyticsBot.handle(msg);
    if (handled) return;
    // 2) (room for: "DONE" exam confirmations, parent replies, etc.)
    console.log(`[INBOX] ${msg.from}: ${(msg.body || '').slice(0, 80)}`);
  });
}

module.exports = { register };
