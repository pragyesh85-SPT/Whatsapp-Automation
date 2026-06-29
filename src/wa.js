// Headless WhatsApp engine (whatsapp-web.js on the system Chrome).
// This is the swappable "channel". To go official later, replace this file with a
// Meta Cloud API client exposing the same send()/onMessage()/setProfile() surface.
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const { env, paths, tenant } = require('./config');

let client = null;
let ready = false;
let lastQr = null;
const inboundHandlers = [];

function onMessage(fn) { inboundHandlers.push(fn); }

function init() {
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: paths.waAuth }),
    puppeteer: {
      headless: true,
      executablePath: env.chromePath,             // use the installed Chrome (no Chromium download)
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-extensions'],
    },
  });

  client.on('qr', (qr) => {
    lastQr = qr;
    console.log('\n[WA] Scan this QR with the client SIM (WhatsApp > Linked Devices):\n');
    qrcode.generate(qr, { small: true });
  });

  client.on('authenticated', () => console.log('[WA] Authenticated.'));
  client.on('ready', async () => {
    ready = true; lastQr = null;
    console.log('[WA] Engine ready.');
    try { await applyProfile(); } catch (e) { console.log('[WA] profile set skipped:', e.message); }
  });
  client.on('disconnected', (r) => { ready = false; console.log('[WA] Disconnected:', r); });

  client.on('message', async (msg) => {
    try {
      // mark seen (two-way human behavior)
      const chat = await msg.getChat();
      await chat.sendSeen();
      for (const h of inboundHandlers) await h(msg);
    } catch (e) { console.log('[WA] inbound error:', e.message); }
  });

  client.initialize();
  return client;
}

async function applyProfile() {
  if (tenant.branding?.displayName) {
    try { await client.setDisplayName(tenant.branding.displayName); } catch {}
  }
  if (tenant.branding?.about) {
    try { await client.setStatus(tenant.branding.about); } catch {}
  }
  const logo = tenant.branding?.logoPath;
  if (logo && fs.existsSync(logo)) {
    try {
      const media = MessageMedia.fromFilePath(logo);
      const me = client.info?.wid?._serialized;
      if (me) await client.setProfilePicture(me, media);
    } catch {}
  }
}

function jid(phone) {
  const digits = String(phone).replace(/\D/g, '');
  return `${digits}@c.us`;
}

// Low-level send to a raw chat id (phone @c.us OR group @g.us).
async function rawSendChat(chatId, text, mediaPath) {
  if (!ready) throw new Error('WA engine not ready');
  if (mediaPath && fs.existsSync(mediaPath)) {
    const media = MessageMedia.fromFilePath(mediaPath);
    return client.sendMessage(chatId, media, { caption: text || '' });
  }
  return client.sendMessage(chatId, text);
}

// Convenience: send to a phone number.
async function rawSend(phone, text, mediaPath) {
  return rawSendChat(jid(phone), text, mediaPath);
}

// List WhatsApp groups the linked number is a member of (for batch->group mapping).
async function listGroups() {
  if (!ready) return [];
  const chats = await client.getChats();
  return chats.filter((c) => c.isGroup).map((c) => ({ id: c.id._serialized, name: c.name }));
}

async function showTyping(phone, ms) {
  try {
    const chat = await client.getChatById(jid(phone));
    await chat.sendStateTyping();
    await new Promise((r) => setTimeout(r, ms));
    await chat.clearState();
  } catch {}
}

function status() {
  return { ready, hasQr: !!lastQr, qr: lastQr };
}

module.exports = { init, onMessage, rawSend, rawSendChat, listGroups, showTyping, status, jid };
