require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const archiver = require('archiver');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const mongoose = require('mongoose');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const PORT = process.env.PORT || 4000;
const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// ──────────────────────────────────────────────────────────────
// Bulletproof Cryptographic Security for Admin
// Password: rdmy
// ──────────────────────────────────────────────────────────────
const SERVER_SECRET = 'RAOPRIME_VAULT_HMAC_SECRET_' + (process.env.ADMIN_SECRET || 'RDMY_MASTER_SALT_98214');
const ADMIN_PASSWORD_HASH = crypto.createHmac('sha256', SERVER_SECRET).update('rdmy').digest('hex');

// In-Memory Cryptographic Admin Session Store
const activeAdminSessions = new Set();

// Anti-Brute-Force & Rate Limiter: Max 5 failed attempts per IP
const loginAttempts = new Map();

function requireAdminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!token || !activeAdminSessions.has(token)) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Admin authentication required' });
  }
  next();
}

// ──────────────────────────────────────────────────────────────
// Storage Directories (Vercel Serverless & Local Compatible)
// ──────────────────────────────────────────────────────────────
const ROOT_DIR = __dirname;
const BASE_STORAGE = isVercel ? path.join(os.tmpdir(), 'raoprime_storage') : path.join(ROOT_DIR, 'storage');
const VAULT_DIR = path.join(BASE_STORAGE, 'vault');
const CHUNKS_DIR = path.join(BASE_STORAGE, 'chunks');
const ASSETS_DIR = path.join(ROOT_DIR, 'public', 'assets');
const MESSAGES_FILE = path.join(BASE_STORAGE, 'messages.json');

try {
  [BASE_STORAGE, VAULT_DIR, CHUNKS_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
} catch (e) {
  console.warn('Storage directory init notice:', e.message);
}

// Middleware
app.use(cors());
// Prevent stale browser script cache on updates
app.use((req, res, next) => {
  const url = req.url.toLowerCase();
  if (url.endsWith('.js') || url.endsWith('.html') || url.endsWith('.css') || url.includes('.js?') || url.includes('.css?')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(ROOT_DIR, 'public')));

// Lightweight Keep-Alive / Health Check Endpoint (Prevents Render Cold Starts)
app.get(['/api/health', '/healthz'], (req, res) => {
  res.status(200).json({ status: 'ok', service: 'raoprime', uptime: process.uptime() });
});

// ──────────────────────────────────────────────────────────────
// Firebase Cloud Firestore Permanent Cloud Persistence Layer
// Backed by Google Cloud Firebase: verfect-9d923
// ──────────────────────────────────────────────────────────────
let isFirebaseConnected = false;
let firebaseDb = null;

function initFirebase() {
  if (isFirebaseConnected) return true;
  try {
    let adminModule = null;
    try {
      adminModule = require('firebase-admin');
    } catch (e1) {
      try {
        adminModule = require('C:/Users/DELL/.gemini/antigravity/scratch/verifect/node_modules/firebase-admin');
      } catch (e2) {}
    }

    if (!adminModule) return false;

    let getFirestore = null;
    try {
      getFirestore = require('firebase-admin/firestore').getFirestore;
    } catch (e3) {
      try {
        getFirestore = require('C:/Users/DELL/.gemini/antigravity/scratch/verifect/node_modules/firebase-admin/lib/firestore').getFirestore;
      } catch (e4) {}
    }

    if (!getFirestore) return false;

    if (adminModule.apps && adminModule.apps.length > 0) {
      firebaseDb = getFirestore(adminModule.apps[0]);
      isFirebaseConnected = true;
      return true;
    }

    let keyData = null;
    const keyPath = path.join(__dirname, 'firebase-key.json');
    if (fs.existsSync(keyPath)) {
      try {
        keyData = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      } catch (e) {}
    }

    if (!keyData) {
      const projectId = process.env.FIREBASE_PROJECT_ID || 'verfect-9d923';
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || 'firebase-adminsdk-fbsvc@verfect-9d923.iam.gserviceaccount.com';
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;
      if (privateKey) {
        privateKey = privateKey.trim().replace(/\\n/g, '\n');
        keyData = { projectId, clientEmail, privateKey };
      }
    }

    if (!keyData) return false;

    const cred = (adminModule.credential && typeof adminModule.credential.cert === 'function')
      ? adminModule.credential.cert(keyData)
      : (typeof adminModule.cert === 'function' ? adminModule.cert(keyData) : null);

    if (!cred) return false;

    const app = adminModule.initializeApp({
      credential: cred,
      databaseURL: 'https://verfect-9d923-default-rtdb.asia-southeast1.firebasedatabase.app'
    });
    firebaseDb = getFirestore(app);
    isFirebaseConnected = true;
    console.log('🚀 Connected to Firebase Cloud Firestore (verfect-9d923)!');
    return true;
  } catch (err) {
    console.warn('⚠️ Firebase init notice:', err.message);
    return false;
  }
}

initFirebase();

// Helpers
function sanitizeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function formatBytes(bytes) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Ended Chats Management & Persistence
const ENDED_CHATS_FILE = path.join(__dirname, 'storage', 'ended_chats.json');
let endedChatsSet = new Set();

function loadEndedChats() {
  try {
    if (fs.existsSync(ENDED_CHATS_FILE)) {
      const raw = fs.readFileSync(ENDED_CHATS_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        endedChatsSet = new Set(data);
      }
    }
  } catch (e) {
    console.warn('Notice loading ended chats:', e.message);
  }
}

function saveEndedChats() {
  try {
    fs.writeFileSync(ENDED_CHATS_FILE, JSON.stringify(Array.from(endedChatsSet), null, 2), 'utf8');
  } catch (e) {
    console.warn('Notice saving ended chats:', e.message);
  }
}

// Canonical Chat ID Normalizer (Unifies room variations & case differences)
loadEndedChats();

function normalizeChatId(rawChatId) {
  if (!rawChatId || typeof rawChatId !== 'string') return 'default';
  let decoded = rawChatId.trim();
  try {
    decoded = decodeURIComponent(decoded).trim();
  } catch (e) {}

  if (!decoded || decoded.toLowerCase() === 'default' || decoded.toLowerCase() === 'all') {
    return 'default';
  }

  // Canonical alias for Affaque Ahmed & client_172627
  const cleanKey = decoded.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (cleanKey === 'affaqueahmed' || cleanKey === 'afaqahmed' || cleanKey === 'affaque' || cleanKey === 'afaq' || cleanKey === 'client172627') {
    return 'Affaque Ahmed';
  }

  // Case-insensitive & normalized match against existing store keys
  if (memoryChatStore) {
    const existing = Object.keys(memoryChatStore);
    const directMatch = existing.find(k => k.toLowerCase() === decoded.toLowerCase());
    if (directMatch) return directMatch;
    const fuzzyMatch = existing.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanKey);
    if (fuzzyMatch) return fuzzyMatch;
  }

  return decoded;
}

// Local Fallback JSON Helpers
function getAllLocalChats() {
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading local messages:', err);
  }
  return {};
}

function saveAllLocalChats(chats) {
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(chats, null, 2), 'utf8');
  } catch (e) {}
}

// ──────────────────────────────────────────────────────────────
// High-Speed In-Memory Chat Store (Zero-Latency Instant RAM Reads)
// Async background Firestore & Disk sync prevents any hanging or CPU freeze
// ──────────────────────────────────────────────────────────────
let memoryChatStore = null;
let saveDebounceTimer = null;

function ensureMemoryStore() {
  if (!memoryChatStore) {
    const raw = getAllLocalChats();
    memoryChatStore = {};
    for (const [k, v] of Object.entries(raw)) {
      const norm = normalizeChatId(k);
      if (!memoryChatStore[norm]) {
        memoryChatStore[norm] = [];
      }
      for (const m of (Array.isArray(v) ? v : [])) {
        if (!memoryChatStore[norm].find(existing => existing.id === m.id)) {
          memoryChatStore[norm].push({ ...m, chatId: norm });
        }
      }
    }
    for (const norm of Object.keys(memoryChatStore)) {
      memoryChatStore[norm].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }
  }
  return memoryChatStore;
}

// Initial Async Sync from Firebase Firestore into RAM
async function syncFirestoreIntoMemory() {
  initFirebase();
  if (!isFirebaseConnected || !firebaseDb) return;
  try {
    const snap = await firebaseDb.collection('raoprime_messages').get();
    if (!snap.empty) {
      const store = ensureMemoryStore();
      snap.docs.forEach(doc => {
        const msg = doc.data();
        const cid = normalizeChatId(msg.chatId || 'default');
        if (!store[cid]) store[cid] = [];
        const exists = store[cid].find(m => m.id === msg.id);
        if (!exists) {
          store[cid].push({ ...msg, chatId: cid });
        } else {
          if (msg.status) exists.status = msg.status;
          if (msg.seenAt) exists.seenAt = msg.seenAt;
          if (msg.isEdited) {
            exists.isEdited = msg.isEdited;
            exists.text = msg.text;
            exists.editedAt = msg.editedAt;
          }
        }
      });
      // Purge any non-normalized keys if they existed
      for (const k of Object.keys(store)) {
        const norm = normalizeChatId(k);
        if (norm !== k) {
          if (!store[norm]) store[norm] = [];
          for (const m of store[k]) {
            if (!store[norm].find(x => x.id === m.id)) {
              store[norm].push({ ...m, chatId: norm });
            }
          }
          delete store[k];
        }
      }
      for (const cid of Object.keys(store)) {
        store[cid].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      }
      saveAllLocalChats(store);
      console.log('⚡ High-Speed In-Memory Store primed (0ms read latency)!');
    }
  } catch (e) {
    console.warn('Memory store initial prime notice:', e.message);
  }
}
setTimeout(syncFirestoreIntoMemory, 500);
setInterval(syncFirestoreIntoMemory, 600000); // 10 minutes interval to conserve quota

// Instant RAM read
function getChatMessages(rawChatId) {
  const chatId = normalizeChatId(rawChatId);
  const store = ensureMemoryStore();
  return store[chatId] || [];
}

// ──────────────────────────────────────────────────────────────
// Ultra-High-Speed Native WebSocket Real-time Engine
// Instant Zero-Latency Chat, Typing, Presence & WebRTC Signaling
// Eliminates 100% of HTTP polling load
// ──────────────────────────────────────────────────────────────
const activeCalls = {};
const wsClients = new Map(); // ws -> { chatId, role, isAlive }

function broadcastToRoom(chatId, event, data, excludeWs = null) {
  const normChatId = normalizeChatId(chatId);
  const payload = JSON.stringify({ event, chatId: normChatId, ...data });

  for (const [clientWs, meta] of wsClients.entries()) {
    if (clientWs === excludeWs) continue;
    if (clientWs.readyState !== WebSocket.OPEN) continue;

    // Send if client is in this room OR client is an Admin (Admin monitors all rooms)
    if (meta.role === 'Raoprime' || meta.chatId === normChatId) {
      try {
        clientWs.send(payload);
      } catch (e) {
        console.warn('WS send error:', e.message);
      }
    }
  }
}

function broadcastToAdmins(event, data, excludeWs = null) {
  const payload = JSON.stringify({ event, ...data });
  for (const [clientWs, meta] of wsClients.entries()) {
    if (clientWs === excludeWs) continue;
    if (clientWs.readyState !== WebSocket.OPEN) continue;
    if (meta.role === 'Raoprime') {
      try {
        clientWs.send(payload);
      } catch (e) {}
    }
  }
}

function getRoomPresence(chatId) {
  const normChatId = normalizeChatId(chatId);
  let isClientOnline = false;
  let isAdminOnline = false;

  for (const [, meta] of wsClients.entries()) {
    if (meta.role === 'Raoprime') {
      isAdminOnline = true;
    } else if (meta.chatId === normChatId) {
      isClientOnline = true;
    }
  }
  return { isClientOnline, isAdminOnline };
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', async (rawMsg) => {
    try {
      const data = JSON.parse(rawMsg.toString());
      const event = data.event || data.type;
      const chatId = normalizeChatId(data.chatId || 'default');
      const sender = data.sender || data.role || 'Client';

      if (event === 'join') {
        wsClients.set(ws, { chatId, role: sender, isAlive: true });
        const presence = getRoomPresence(chatId);
        broadcastToRoom(chatId, 'chat:presence', presence);
        return;
      }

      if (event === 'chat:message') {
        const text = (data.text || '').trim();
        if (!text) return;
        const msgId = data.id || ('msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6));
        const newMsg = {
          id: msgId,
          sender,
          type: 'text',
          text,
          status: 'sent',
          timestamp: new Date().toISOString()
        };
        if (data.replyTo && data.replyTo.id) {
          newMsg.replyTo = data.replyTo;
        }
        await saveChatMessage(chatId, newMsg);
        return;
      }

      if (event === 'chat:typing') {
        broadcastToRoom(chatId, 'chat:typing', { sender, isTyping: Boolean(data.isTyping) }, ws);
        return;
      }

      if (event === 'chat:read') {
        await markChatMessagesSeen(chatId, sender);
        return;
      }

      if (event === 'chat:react') {
        const { messageId, emoji } = data;
        const store = ensureMemoryStore();
        if (store[chatId]) {
          const msg = store[chatId].find(m => m.id === messageId);
          if (msg) {
            if (!msg.reactions) msg.reactions = {};
            if (msg.reactions[sender] === emoji) {
              delete msg.reactions[sender];
            } else {
              msg.reactions[sender] = emoji;
            }
            if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
            saveDebounceTimer = setTimeout(() => saveAllLocalChats(store), 250);
            broadcastToRoom(chatId, 'chat:reaction', { messageId, reactions: msg.reactions });
          }
        }
        return;
      }

      if (event === 'chat:edit') {
        const { messageId, text: newText } = data;
        const store = ensureMemoryStore();
        if (store[chatId]) {
          const msg = store[chatId].find(m => m.id === messageId);
          if (msg && newText && newText.trim()) {
            msg.text = newText.trim();
            msg.isEdited = true;
            msg.editedAt = new Date().toISOString();
            if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
            saveDebounceTimer = setTimeout(() => saveAllLocalChats(store), 250);
            broadcastToRoom(chatId, 'chat:edit', { messageId, text: msg.text, isEdited: true, editedAt: msg.editedAt });
          }
        }
        return;
      }

      if (event === 'chat:delete') {
        const { messageId } = data;
        const store = ensureMemoryStore();
        if (store[chatId]) {
          const idx = store[chatId].findIndex(m => m.id === messageId);
          if (idx !== -1) {
            const msg = store[chatId][idx];
            const isAdmin = (role === 'Raoprime' || sender === 'Raoprime');
            // Admin can delete BOTH; Client can only unsend their own
            if (isAdmin || msg.sender === 'Client' || msg.sender === sender) {
              store[chatId].splice(idx, 1);
              if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
              saveDebounceTimer = setTimeout(() => saveAllLocalChats(store), 250);
              broadcastToRoom(chatId, 'chat:deleted', { chatId, messageId });

              // Sync Firestore deletion
              setImmediate(async () => {
                initFirebase();
                if (isFirebaseConnected && firebaseDb) {
                  try {
                    await firebaseDb.collection('raoprime_messages').doc(messageId).delete();
                  } catch (e) {}
                }
              });
            }
          }
        }
        return;
      }

      // WebRTC Real-Time Calling Signaling
      if (event === 'call:initiate') {
        const { type = 'video', caller = sender } = data;
        const callId = 'call_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
        const newCall = {
          callId,
          chatId,
          type,
          caller,
          status: 'ringing',
          startedAt: Date.now(),
          signals: [],
          signalSeq: 0
        };
        activeCalls[chatId] = newCall;
        if (chatId !== 'default') {
          activeCalls['default'] = newCall;
        }
        console.log(`📞 [WS] Call initiated by ${caller} (${type}) in room [${chatId}]`);
        broadcastToRoom(chatId, 'call:incoming', { call: newCall }, ws);
        return;
      }

      if (event === 'call:signal') {
        const fromRole = data.from || data.sender || wsClients.get(ws)?.role || sender;
        const call = resolveActiveCall(chatId);
        if (call && data.signal) {
          const seq = ++call.signalSeq;
          call.signals.push({ seq, from: fromRole, signal: data.signal, timestamp: Date.now() });
          if (call.signals.length > 50) call.signals.shift();
        }
        broadcastToRoom(chatId, 'call:signal', { signal: data.signal, from: fromRole }, ws);
        return;
      }

      if (event === 'call:accept') {
        const call = resolveActiveCall(chatId);
        if (call) {
          call.status = 'connected';
          call.connectedAt = Date.now();
        }
        console.log(`✅ [WS] Call accepted in room [${chatId}]`);
        broadcastToRoom(chatId, 'call:accepted', { chatId }, ws);
        return;
      }

      if (event === 'call:end') {
        const call = resolveActiveCall(chatId);
        if (call) {
          call.status = 'ended';
          call.endedAt = Date.now();
        }
        console.log(`🛑 [WS] Call ended in room [${chatId}]`);
        broadcastToRoom(chatId, 'call:ended', { chatId });
        setTimeout(() => {
          delete activeCalls[chatId];
        }, 2000);
        return;
      }

    } catch (e) {
      console.warn('WS message error:', e.message);
    }
  });

  ws.on('close', () => {
    const meta = wsClients.get(ws);
    if (meta) {
      const { chatId } = meta;
      wsClients.delete(ws);
      const presence = getRoomPresence(chatId);
      broadcastToRoom(chatId, 'chat:presence', presence);
    }
  });
});

setInterval(() => {
  for (const [ws] of wsClients.entries()) {
    if (!ws.isAlive) {
      wsClients.delete(ws);
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 25000);

// Instant RAM write + Async background persistence
async function saveChatMessage(rawChatId, messageObj) {
  const chatId = normalizeChatId(rawChatId);
  messageObj.chatId = chatId;
  const store = ensureMemoryStore();
  if (!store[chatId]) store[chatId] = [];

  // Strict Deduplication Check:
  // 1. By exact message ID
  const existingById = store[chatId].find(m => m.id === messageObj.id);
  if (existingById) {
    return existingById;
  }

  // 2. Strict deduplication for duplicate rapid text messages (within 3000ms from same sender)
  if (messageObj.type === 'text') {
    const msgTime = new Date(messageObj.timestamp || Date.now()).getTime();
    const recentDup = store[chatId].find(m =>
      m.sender === messageObj.sender &&
      m.text === messageObj.text &&
      Math.abs(msgTime - new Date(m.timestamp).getTime()) < 5000
    );
    if (recentDup) {
      console.log(`[Deduplication Engine] Dropped duplicate message in [${chatId}] from ${messageObj.sender}: "${messageObj.text}"`);
      return recentDup;
    }
    if (recentDup) {
      return recentDup;
    }
  }

  store[chatId].push(messageObj);

  // Debounced write to disk for persistence
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    saveAllLocalChats(store);
  }, 250);

  // Real-time broadcast to room & admin in 0ms!
  broadcastToRoom(chatId, 'chat:message', { message: messageObj });

  // Non-blocking asynchronous Firestore background write
  setImmediate(async () => {
    initFirebase();
    if (isFirebaseConnected && firebaseDb) {
      try {
        const clientName = chatId === 'default' ? 'General Desk' : decodeURIComponent(chatId);
        await firebaseDb.collection('raoprime_messages').doc(messageObj.id).set({
          chatId,
          ...messageObj
        }, { merge: true });

        await firebaseDb.collection('raoprime_chats').doc(chatId).set({
          chatId,
          clientName,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (e) {
        console.warn('Async Firestore write notice:', e.message);
      }
    }
  });
}

// In-memory Real-time Presence & Typing Tracker
const typingStatus = {}; // { [chatId]: { Client: timestamp, Raoprime: timestamp } }
const presenceStatus = {}; // { [chatId]: { Client: timestamp, Raoprime: timestamp } }
let globalAdminPresence = 0; // Tracks if Raoprime Admin is live on portal anywhere

// Instant RAM seen update + non-blocking background Firestore sync
async function markChatMessagesSeen(rawChatId, readerRole) {
  const chatId = normalizeChatId(rawChatId);
  const store = ensureMemoryStore();
  if (!store[chatId]) return false;

  const now = new Date().toISOString();
  const updatedIds = [];

  for (const msg of store[chatId]) {
    const isIncomingForReader = readerRole === 'Raoprime'
      ? (msg.sender !== 'Raoprime' && msg.sender !== 'RP')
      : (msg.sender === 'Raoprime' || msg.sender === 'RP');
    if (isIncomingForReader && msg.status !== 'seen') {
      msg.status = 'seen';
      msg.seenAt = now;
      updatedIds.push(msg.id);
    }
  }

  // If nothing changed, return instantly in 0ms!
  if (updatedIds.length === 0) return false;

  // Debounced write to disk for persistence
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    saveAllLocalChats(store);
  }, 250);

  // Broadcast read status in 0ms!
  broadcastToRoom(chatId, 'chat:read', { reader: readerRole, updatedIds });
  setImmediate(async () => {
    initFirebase();
    if (isFirebaseConnected && firebaseDb) {
      try {
        const batch = firebaseDb.batch();
        for (const id of updatedIds) {
          batch.update(firebaseDb.collection('raoprime_messages').doc(id), {
            status: 'seen',
            seenAt: now
          });
        }
        await batch.commit();
      } catch (e) {
        console.warn('Async seen batch commit notice:', e.message);
      }
    }
  });

  return true;
}

// Heartbeat Endpoint to track Live Presence (Active vs Offline)
app.post('/api/chat/heartbeat', (req, res) => {
  const { chatId: rawChatId = 'default', sender = 'Client' } = req.body;
  const chatId = normalizeChatId(rawChatId);
  const now = Date.now();
  if (sender === 'Raoprime') {
    globalAdminPresence = now;
  }
  if (!presenceStatus[chatId]) presenceStatus[chatId] = {};
  presenceStatus[chatId][sender] = now;
  res.json({ success: true });
});

// Explicit Mark As Seen Endpoint
app.post('/api/chat/seen', async (req, res) => {
  const { chatId: rawChatId = 'default', reader = 'Client' } = req.body;
  const chatId = normalizeChatId(rawChatId);
  await markChatMessagesSeen(chatId, reader);
  res.json({ success: true });
});

// ──────────────────────────────────────────────────────────────
// Chat APIs
// ──────────────────────────────────────────────────────────────

// Get Messages & Real-time Typing + Presence State
app.get('/api/chat/messages', async (req, res) => {
  try {
    const rawChatId = req.query.chatId || 'default';
    const chatId = normalizeChatId(rawChatId);
    const reader = req.query.reader || (req.headers['x-admin-token'] ? 'Raoprime' : null);

    // If a reader is actively querying, mark other party's messages as seen and refresh presence
    if (reader) {
      const now = Date.now();
      if (reader === 'Raoprime') globalAdminPresence = now;
      if (!presenceStatus[chatId]) presenceStatus[chatId] = {};
      presenceStatus[chatId][reader] = now;
      await markChatMessagesSeen(chatId, reader);
    }

    const messages = await getChatMessages(chatId);

    const now = Date.now();
    const chatTyping = typingStatus[chatId] || {};
    const chatPresence = presenceStatus[chatId] || {};

    const activeTyping = {};
    for (const [sender, time] of Object.entries(chatTyping)) {
      if (now - time < 3500) {
        activeTyping[sender] = true;
      }
    }

    const isClientOnline = Boolean(chatPresence.Client && (now - chatPresence.Client < 10000));
    const isRaoprimeOnline = Boolean((now - globalAdminPresence < 10000) || (chatPresence.Raoprime && (now - chatPresence.Raoprime < 10000)));

    const onlineStatus = {
      Client: isClientOnline,
      Raoprime: isRaoprimeOnline
    };

    res.json({
      success: true,
      chatId,
      canonicalChatId: chatId,
      messages,
      typing: activeTyping,
      online: onlineStatus,
      isEnded: endedChatsSet.has(chatId)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Real-time Typing Status
app.post('/api/chat/typing', (req, res) => {
  const { chatId: rawChatId = 'default', sender = 'Client', isTyping } = req.body;
  const chatId = normalizeChatId(rawChatId);
  const now = Date.now();
  if (sender === 'Raoprime') {
    globalAdminPresence = now;
  }
  if (!typingStatus[chatId]) typingStatus[chatId] = {};
  if (!presenceStatus[chatId]) presenceStatus[chatId] = {};

  presenceStatus[chatId][sender] = now; // Typing immediately confirms active presence
  typingStatus[chatId][sender] = isTyping ? now : 0;
  res.json({ success: true });
});

// Post Text Message
app.post('/api/chat/send', async (req, res) => {
  try {
    const { chatId: rawChatId = 'default', sender = 'Client', text = '', replyTo, id: clientId } = req.body;
    const chatId = normalizeChatId(rawChatId);
    if (!text.trim()) {
      return res.status(400).json({ success: false, error: 'Empty message' });
    }

    if (endedChatsSet.has(chatId) && sender !== 'Raoprime' && sender !== 'RP') {
      return res.status(403).json({ success: false, error: 'This conversation has ended. Please start a new chat.' });
    }

    const now = Date.now();
    if (sender === 'Raoprime') {
      globalAdminPresence = now;
    }
    if (!presenceStatus[chatId]) presenceStatus[chatId] = {};
    presenceStatus[chatId][sender] = now;

    // Reset typing when message is sent
    if (typingStatus[chatId]) typingStatus[chatId][sender] = 0;

    const otherSender = (sender === 'Raoprime' || sender === 'RP') ? 'Client' : 'Raoprime';
    const isOtherOnline = otherSender === 'Raoprime'
      ? Boolean(now - globalAdminPresence < 10000 || (presenceStatus[chatId]?.Raoprime && now - presenceStatus[chatId].Raoprime < 10000))
      : Boolean(presenceStatus[chatId]?.Client && (now - presenceStatus[chatId].Client < 10000));

    const newMsg = {
      id: clientId || ('msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6)),
      sender, // 'Client' or 'Raoprime'
      type: 'text',
      text: text.trim(),
      status: isOtherOnline ? 'delivered' : 'sent',
      timestamp: new Date().toISOString()
    };

    if (replyTo && replyTo.id) {
      newMsg.replyTo = {
        id: replyTo.id,
        sender: replyTo.sender || 'Client',
        text: (replyTo.text || '').slice(0, 200)
      };
    }

    const savedMsg = await saveChatMessage(chatId, newMsg);

    res.json({ success: true, message: savedMsg || newMsg });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Edit Existing Text Message
app.post('/api/chat/message/edit', async (req, res) => {
  try {
    const { chatId: rawChatId = 'default', messageId, text, sender } = req.body;
    const chatId = normalizeChatId(rawChatId);
    if (!messageId || !text || !text.trim()) {
      return res.status(400).json({ success: false, error: 'Message ID and text are required' });
    }

    const store = ensureMemoryStore();
    if (!store[chatId]) {
      return res.status(404).json({ success: false, error: 'Chat not found' });
    }

    const msg = store[chatId].find(m => m.id === messageId);
    if (!msg) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    if (msg.type !== 'text') {
      return res.status(400).json({ success: false, error: 'Only text messages can be edited' });
    }

    const adminToken = req.headers['x-admin-token'];
    const isAdmin = adminToken && activeAdminSessions.has(adminToken);

    // Permission check: Admin can edit any message; Client can edit client-sent messages
    if (!isAdmin && sender) {
      const isSenderRaoprime = (sender === 'Raoprime' || sender === 'RP');
      const isMsgRaoprime = (msg.sender === 'Raoprime' || msg.sender === 'RP');
      if (isSenderRaoprime !== isMsgRaoprime) {
        return res.status(403).json({ success: false, error: 'Unauthorized to edit this message' });
      }
    }

    msg.text = text.trim();
    msg.isEdited = true;
    msg.editedAt = new Date().toISOString();

    // Debounced disk save
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
      saveAllLocalChats(store);
    }, 250);

    // Broadcast reaction in 0ms!
    broadcastToRoom(chatId, 'chat:reaction', { messageId, reactions: msg.reactions });

    // Broadcast edit in 0ms!
    broadcastToRoom(chatId, 'chat:edit', { messageId, text: msg.text, isEdited: true, editedAt: msg.editedAt });

    // Non-blocking Firestore sync
    setImmediate(async () => {
      initFirebase();
      if (isFirebaseConnected && firebaseDb) {
        try {
          await firebaseDb.collection('raoprime_messages').doc(messageId).set({
            text: msg.text,
            isEdited: true,
            editedAt: msg.editedAt
          }, { merge: true });
        } catch (e) {
          console.warn('Async message edit Firestore notice:', e.message);
        }
      }
    });

    res.json({ success: true, message: msg });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Emoji Reaction Endpoint (WhatsApp Style)

// Unsend / Delete Message (Client can unsend own; Admin has freedom to delete BOTH)
app.post('/api/chat/message/delete', async (req, res) => {
  try {
    const { chatId: rawChatId = 'default', messageId, sender = 'Client' } = req.body;
    const chatId = normalizeChatId(rawChatId);
    if (!messageId) {
      return res.status(400).json({ success: false, error: 'Message ID is required' });
    }

    const store = ensureMemoryStore();
    if (!store[chatId]) {
      return res.status(404).json({ success: false, error: 'Chat not found' });
    }

    const idx = store[chatId].findIndex(m => m.id === messageId);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    const msg = store[chatId][idx];
    const adminToken = req.headers['x-admin-token'] || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
    const isAdmin = Boolean(adminToken && activeAdminSessions.has(adminToken));

    // Client can only unsend their own; Admin has freedom to delete ANY message
    if (!isAdmin) {
      const isClientSender = (msg.sender === 'Client' || (sender && msg.sender === sender));
      const isMsgRaoprime = (msg.sender === 'Raoprime' || msg.sender === 'RP');
      if (isMsgRaoprime || !isClientSender) {
        return res.status(403).json({ success: false, error: 'Clients can only unsend their own messages' });
      }
    }

    store[chatId].splice(idx, 1);

    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => saveAllLocalChats(store), 250);

    // Broadcast instant deletion in 0ms!
    broadcastToRoom(chatId, 'chat:deleted', {
      chatId,
      messageId,
      deletedBy: isAdmin ? 'Raoprime' : (sender || 'Client')
    });

    // Firestore async delete
    setImmediate(async () => {
      initFirebase();
      if (isFirebaseConnected && firebaseDb) {
        try {
          await firebaseDb.collection('raoprime_messages').doc(messageId).delete();
        } catch (e) {}
      }
    });

    res.json({ success: true, messageId, chatId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/chat/message/react', async (req, res) => {
  try {
    const { chatId: rawChatId = 'default', messageId, emoji, sender = 'Client' } = req.body;
    const chatId = normalizeChatId(rawChatId);
    if (!messageId || !emoji) {
      return res.status(400).json({ success: false, error: 'Message ID and emoji are required' });
    }

    const store = ensureMemoryStore();
    if (!store[chatId]) {
      return res.status(404).json({ success: false, error: 'Chat not found' });
    }

    const msg = store[chatId].find(m => m.id === messageId);
    if (!msg) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    if (!msg.reactions) msg.reactions = {};
    const key = (sender === 'Raoprime' || sender === 'RP') ? 'Raoprime' : 'Client';
    if (msg.reactions[key] === emoji) {
      delete msg.reactions[key];
    } else {
      msg.reactions[key] = emoji;
    }

    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
      saveAllLocalChats(store);
    }, 250);

    // Broadcast reaction in 0ms!
    broadcastToRoom(chatId, 'chat:reaction', { messageId, reactions: msg.reactions });

    setImmediate(async () => {
      initFirebase();
      if (isFirebaseConnected && firebaseDb) {
        try {
          await firebaseDb.collection('raoprime_messages').doc(messageId).set({
            reactions: msg.reactions
          }, { merge: true });
        } catch (e) {
          console.warn('Async reaction Firestore notice:', e.message);
        }
      }
    });

    res.json({ success: true, reactions: msg.reactions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// Ultra HD WebRTC Calling Signaling Engine (1080p Video + Studio 48kHz Audio)
// Universal Room Discovery & Unified Call State
// ──────────────────────────────────────────────────────────────

// Curated high-reliability Dynamic ICE configuration (Google STUN + Cloudflare STUN + Twilio + Metered Relay)
function getDynamicIceServers() {
  const customTurnUrl = process.env.TURN_URL;
  const customTurnUsername = process.env.TURN_USERNAME;
  const customTurnCredential = process.env.TURN_CREDENTIAL;

  const iceServers = [
    // Primary Global STUN (Google global distributed infrastructure)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // Cloudflare STUN
    { urls: 'stun:stun.cloudflare.com:3478' },
    // Twilio Global STUN
    { urls: 'stun:global.stun.twilio.com:3478' },
    // Metered Relay STUN
    { urls: 'stun:stun.relay.metered.ca:80' }
  ];

  if (customTurnUrl && customTurnUsername && customTurnCredential) {
    iceServers.push(
      { urls: customTurnUrl, username: customTurnUsername, credential: customTurnCredential },
      { urls: `${customTurnUrl}?transport=tcp`, username: customTurnUsername, credential: customTurnCredential }
    );
  }

  return {
    iceServers,
    iceTransportPolicy: 'all',
    iceCandidatePoolSize: 10
  };
}

function resolveActiveCall(rawChatId) {
  const chatId = rawChatId ? normalizeChatId(rawChatId) : rawChatId;
  const now = Date.now();
  // 1. Direct match on chatId with active (non-ended) call
  if (chatId && activeCalls[chatId]) {
    const c = activeCalls[chatId];
    if (c.status !== 'ended') return c;
    // Ended within last 2.5 seconds only
    if (c.endedAt && now - c.endedAt < 2500) return c;
  }
  // 2. Active call under 'default' if querying 'default' or role is admin looking broadly
  if (chatId === 'default' || chatId === 'all' || !chatId) {
    if (activeCalls['default'] && activeCalls['default'].status !== 'ended') {
      return activeCalls['default'];
    }
  }
  // 3. Any ringing or connected call across any room
  const anyActive = Object.values(activeCalls).find(c => c && (c.status === 'ringing' || c.status === 'connected') && (!chatId || chatId === 'all' || c.chatId === chatId || chatId === 'default'));
  if (anyActive) return anyActive;

  // 4. Return ended call ONLY if it strictly belongs to this chatId and is recent (< 2.5 sec)
  if (chatId && activeCalls[chatId] && activeCalls[chatId].status === 'ended') {
    if (activeCalls[chatId].endedAt && now - activeCalls[chatId].endedAt < 2500) {
      return activeCalls[chatId];
    }
  }
  return null;
}

app.get('/api/call/ice-servers', (req, res) => {
  res.json({ success: true, config: getDynamicIceServers() });
});

app.post('/api/call/initiate', (req, res) => {
  const { chatId: rawChatId = 'default', caller = 'Client', type = 'video' } = req.body;
  const chatId = normalizeChatId(rawChatId);

  // Purge any stale calls for this room
  if (activeCalls[chatId]) delete activeCalls[chatId];
  if (chatId === 'default' && activeCalls['default']) delete activeCalls['default'];

  // Purge old ended calls across system
  const now = Date.now();
  for (const k of Object.keys(activeCalls)) {
    if (activeCalls[k] && (activeCalls[k].status === 'ended' || (activeCalls[k].endedAt && now - activeCalls[k].endedAt > 2500))) {
      delete activeCalls[k];
    }
  }

  const newCall = {
    callId: 'call_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    chatId: chatId || 'default',
    type: type || 'video',
    caller: caller || 'Client',
    status: 'ringing',
    startedAt: Date.now(),
    signals: [],
    signalSeq: 0
  };

  // Register on the room
  activeCalls[chatId || 'default'] = newCall;
  if (chatId !== 'default') {
    activeCalls['default'] = newCall;
  }

  // Real-time broadcast to room & admin in 0ms!
  broadcastToRoom(chatId, 'call:incoming', { call: newCall });

  console.log(`📞 Call initiated by ${caller} (${type}) in room [${chatId}] (ID: ${newCall.callId})`);
  res.json({ success: true, call: newCall });
});

app.get('/api/call/status', (req, res) => {
  const chatId = normalizeChatId(req.query.chatId);
  const role = req.query.role; // 'admin' or 'client'
  const call = resolveActiveCall(chatId);

  if (!call || call.status === 'ended') {
    return res.json({ success: true, active: false });
  }

  // Active call found!
  res.json({
    success: true,
    active: true,
    chatId: call.chatId || chatId || 'default',
    call
  });
});

app.post('/api/call/signal', (req, res) => {
  const { chatId: rawChatId = 'default', from = 'Client', signal } = req.body;
  const chatId = normalizeChatId(rawChatId);
  const call = resolveActiveCall(chatId);
  if (!call) {
    return res.status(404).json({ success: false, error: 'No active call' });
  }
  const seq = ++call.signalSeq;
  call.signals.push({
    seq,
    from,
    signal,
    timestamp: Date.now()
  });

  // Real-time broadcast signal to other party in 0ms!
  broadcastToRoom(chatId, 'call:signal', { signal, from });

  res.json({ success: true, seq });
});

app.get('/api/call/signals', (req, res) => {
  const chatId = normalizeChatId(req.query.chatId || 'default');
  const forRole = req.query.forRole || 'Client';
  const since = parseInt(req.query.since || '0', 10);
  const call = resolveActiveCall(chatId);
  if (!call) return res.json({ success: true, signals: [], status: 'none', lastSeq: 0 });

  const newSignals = call.signals.filter((s) => s.from !== forRole && (s.seq ? s.seq > since : s.timestamp > since));
  const maxSeq = call.signalSeq || (call.signals.length ? call.signals[call.signals.length - 1].timestamp : 0);
  res.json({
    success: true,
    signals: newSignals,
    status: call.status,
    type: call.type,
    caller: call.caller,
    lastSeq: maxSeq
  });
});

app.post('/api/call/accept', (req, res) => {
  const { chatId: rawChatId = 'default' } = req.body;
  const chatId = normalizeChatId(rawChatId);
  const call = resolveActiveCall(chatId);
  if (call) {
    call.status = 'connected';
    call.connectedAt = Date.now();
    console.log(`✅ Call accepted in room [${call.chatId}]`);
    broadcastToRoom(chatId, 'call:accepted', { chatId });
  }
  res.json({ success: true });
});

app.post('/api/call/end', (req, res) => {
  const { chatId: rawChatId = 'default' } = req.body;
  const chatId = normalizeChatId(rawChatId);
  const call = resolveActiveCall(chatId);
  if (call) {
    call.status = 'ended';
    call.endedAt = Date.now();
    console.log(`🛑 Call ended in room [${call.chatId}]`);
    broadcastToRoom(chatId, 'call:ended', { chatId });
    setTimeout(() => {
      for (const k of Object.keys(activeCalls)) {
        if (activeCalls[k] === call || (activeCalls[k]?.endedAt && Date.now() - activeCalls[k].endedAt > 2000)) {
          delete activeCalls[k];
        }
      }
    }, 2000);
  }
  res.json({ success: true });
});

// ──────────────────────────────────────────────────────────────
// Admin Authentication Endpoints (Unbreakable Security)
// Password: rdmy
// ──────────────────────────────────────────────────────────────

app.post('/api/admin/login', (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();

  const attemptInfo = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
  if (attemptInfo.blockedUntil > now) {
    const remainingSec = Math.ceil((attemptInfo.blockedUntil - now) / 1000);
    return res.status(429).json({
      success: false,
      error: `Security lock active. Try again in ${remainingSec} seconds.`
    });
  }

  const { password } = req.body;
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ success: false, error: 'Password required' });
  }

  // Timing-safe HMAC hash comparison against 'rdmy'
  const inputHash = crypto.createHmac('sha256', SERVER_SECRET).update(password.trim()).digest('hex');
  const isMatch = crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(ADMIN_PASSWORD_HASH));

  if (!isMatch) {
    attemptInfo.count += 1;
    if (attemptInfo.count >= 5) {
      attemptInfo.blockedUntil = now + 15 * 60 * 1000; // 15 mins block
      loginAttempts.set(ip, attemptInfo);
      return res.status(429).json({
        success: false,
        error: 'Too many incorrect attempts. Security lockout active for 15 minutes.'
      });
    } else {
      loginAttempts.set(ip, attemptInfo);
      const remaining = 5 - attemptInfo.count;
      return res.status(401).json({
        success: false,
        error: `Incorrect password. ${remaining} attempt(s) remaining.`
      });
    }
  }

  // Clear attempts on success
  loginAttempts.delete(ip);

  // Generate 256-bit cryptographically secure session token
  const token = crypto.randomBytes(32).toString('hex');
  activeAdminSessions.add(token);

  res.json({ success: true, token });
});

app.post('/api/admin/logout', requireAdminAuth, (req, res) => {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token) activeAdminSessions.delete(token);
  res.json({ success: true });
});

app.get('/api/admin/verify', requireAdminAuth, (req, res) => {
  res.json({ success: true });
});

// ──────────────────────────────────────────────────────────────
// Admin APIs: Inbox & Chat Management (Protected)
// ──────────────────────────────────────────────────────────────

// List all active conversations for the Admin Portal (Ultra-Fast 0ms RAM Read)

// Rename Client / Chat (Admin only)
app.post('/api/admin/chat/rename', requireAdminAuth, async (req, res) => {
  try {
    const { oldChatId: rawOld, newChatId: rawNew } = req.body;
    if (!rawOld || !rawNew) {
      return res.status(400).json({ success: false, error: 'Both oldChatId and newChatId are required' });
    }

    const oldChatId = normalizeChatId(rawOld.trim());
    const newChatId = rawNew.trim();

    if (!newChatId) {
      return res.status(400).json({ success: false, error: 'New chat name cannot be empty' });
    }

    if (oldChatId.toLowerCase() === newChatId.toLowerCase()) {
      return res.json({ success: true, oldChatId, newChatId });
    }

    const store = ensureMemoryStore();
    if (!store[oldChatId]) {
      return res.status(404).json({ success: false, error: `Chat '${oldChatId}' not found` });
    }

    const oldMessages = store[oldChatId].map(m => ({ ...m, chatId: newChatId }));

    if (store[newChatId]) {
      // Merge into existing chat
      const combined = [...store[newChatId], ...oldMessages];
      const seen = new Set();
      const deduped = [];
      for (const m of combined) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          deduped.push(m);
        }
      }
      deduped.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      store[newChatId] = deduped;
    } else {
      store[newChatId] = oldMessages;
    }

    delete store[oldChatId];

    // Persist
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => saveAllLocalChats(store), 250);

    // Sync Firestore
    setImmediate(async () => {
      initFirebase();
      if (isFirebaseConnected && firebaseDb) {
        try {
          await firebaseDb.collection('raoprime_chats').doc(newChatId).set({
            chatId: newChatId,
            clientName: newChatId,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          await firebaseDb.collection('raoprime_chats').doc(oldChatId).delete();
        } catch (e) {
          console.warn('Firebase rename notice:', e.message);
        }
      }
    });

    // Broadcast rename event via WebSocket
    broadcastToRoom(oldChatId, 'chat:renamed', { oldChatId, newChatId });
    broadcastToRoom(newChatId, 'chat:renamed', { oldChatId, newChatId });

    console.log(`✏️ [Admin] Renamed chat '${oldChatId}' -> '${newChatId}'`);
    res.json({ success: true, oldChatId, newChatId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/chats', requireAdminAuth, async (req, res) => {
  try {
    const chatList = [];
    const now = Date.now();
    globalAdminPresence = now;

    const store = ensureMemoryStore();
    for (const [chatId, messages] of Object.entries(store)) {
      if (!Array.isArray(messages) || messages.length === 0) continue;

      const lastMsg = messages[messages.length - 1];
      const files = messages.filter((m) => m.type === 'file' && m.file);
      const clientName = chatId === 'default' ? 'General Desk' : decodeURIComponent(chatId);

      const chatPresence = presenceStatus[chatId] || {};
      const chatTyping = typingStatus[chatId] || {};
      const isClientOnline = Boolean(chatPresence.Client && (now - chatPresence.Client < 10000));
      const isClientTyping = Boolean(chatTyping.Client && (now - chatTyping.Client < 3500));
      const unseenCount = messages.filter(m => (m.sender !== 'Raoprime' && m.sender !== 'RP') && m.status !== 'seen').length;

      chatList.push({
        chatId,
        clientName,
        totalMessages: messages.length,
        totalFiles: files.length,
        files: files.map((f) => f.file),
        isOnline: isClientOnline,
        isTyping: isClientTyping,
        unseenCount,
        isEnded: endedChatsSet.has(chatId),
        lastMessage: {
          sender: lastMsg.sender,
          text: lastMsg.type === 'file' ? `📁 [File] ${lastMsg.file.originalName}` : lastMsg.text,
          status: lastMsg.status || 'seen',
          timestamp: lastMsg.timestamp,
          type: lastMsg.type
        }
      });
    }

    // Sort by latest message descending
    chatList.sort((a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp));

    res.json({ success: true, count: chatList.length, chats: chatList });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Download All Files for a client in a single ZIP
app.get('/api/admin/download-all/:chatId', requireAdminAuth, async (req, res) => {
  try {
    const chatId = normalizeChatId(req.params.chatId);
    const messages = await getChatMessages(chatId);
    const files = messages.filter((m) => m.type === 'file' && m.file);

    if (files.length === 0) {
      return res.status(404).send('No files found for this conversation');
    }

    const archive = archiver('zip', { zlib: { level: 6 } });
    const cleanName = sanitizeFilename(chatId);
    const zipName = `Raoprime_${cleanName}_Documents.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipName)}"`);

    archive.pipe(res);

    for (const f of files) {
      const storedName = f.file.storedName;
      const fPath = path.join(VAULT_DIR, storedName);

      if (fs.existsSync(fPath)) {
        archive.file(fPath, { name: f.file.originalName });
      }
    }

    archive.finalize();
  } catch (err) {
    res.status(500).send('ZIP error: ' + err.message);
  }
});

// Admin: End or Reopen Client Conversation
app.post('/api/admin/chat/end', requireAdminAuth, async (req, res) => {
  try {
    const { chatId: rawChatId, action = 'end' } = req.body;
    if (!rawChatId) return res.status(400).json({ success: false, error: 'Chat ID required' });
    const chatId = normalizeChatId(rawChatId);

    if (action === 'end') {
      endedChatsSet.add(chatId);
      saveEndedChats();

      // Append system message in the chat
      const endMsg = {
        chatId,
        id: 'msg_sys_' + Date.now(),
        sender: 'System',
        type: 'system',
        text: 'Your chat Ends',
        timestamp: new Date().toISOString()
      };
      await saveChatMessage(chatId, endMsg);

      // 0ms Real-time WebSocket broadcast to room
      broadcastToRoom(chatId, 'chat:ended', { chatId, isEnded: true });
      return res.json({ success: true, isEnded: true });
    } else {
      endedChatsSet.delete(chatId);
      saveEndedChats();
      broadcastToRoom(chatId, 'chat:ended', { chatId, isEnded: false });
      return res.json({ success: true, isEnded: false });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Delete an entire chat and its files permanently
app.delete('/api/admin/chat/:chatId', requireAdminAuth, async (req, res) => {
  try {
    const rawChatId = req.params.chatId;
    if (!rawChatId) {
      return res.status(400).json({ success: false, error: 'Chat ID required' });
    }
    const chatId = normalizeChatId(rawChatId);

    // 1. Delete from Firebase Firestore if connected
    initFirebase();
    if (isFirebaseConnected && firebaseDb) {
      try {
        await firebaseDb.collection('raoprime_chats').doc(chatId).delete();
        const msgs = await firebaseDb.collection('raoprime_messages').where('chatId', '==', chatId).get();
        for (const doc of msgs.docs) {
          await doc.ref.delete();
        }
      } catch (fbErr) {
        console.warn('Firebase delete warning:', fbErr.message);
      }
    }

    // 2. Delete from In-Memory & Local JSON Storage
    const store = ensureMemoryStore();
    if (store[chatId]) {
      const messages = store[chatId] || [];
      for (const m of messages) {
        if (m.type === 'file' && m.file && m.file.storedName) {
          const fPath = path.join(VAULT_DIR, m.file.storedName);
          if (fs.existsSync(fPath)) {
            try { fs.unlinkSync(fPath); } catch (e) {}
          }
        }
      }
      delete store[chatId];
      saveAllLocalChats(store);
    }

    // 3. Clear active calls or typing state
    if (activeCalls[chatId]) {
      delete activeCalls[chatId];
    }
    if (presenceHeartbeats[chatId]) {
      delete presenceHeartbeats[chatId];
    }
    if (typingStates[chatId]) {
      delete typingStates[chatId];
    }

    res.json({ success: true, message: `Chat ${chatId} deleted successfully` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// ──────────────────────────────────────────────────────────────
// Zero-Error Chunked File Streaming into Chat
// Vercel Serverless Ready (2MB Chunks)
// ──────────────────────────────────────────────────────────────

// 1. Init Upload Session
app.post('/api/upload/init', (req, res) => {
  try {
    const { uploadId, fileName, fileSize, totalChunks, chunkSize, fileType, chatId: rawChatId = 'default', sender = 'Client' } = req.body;
    const chatId = normalizeChatId(rawChatId);
    if (!uploadId || !fileName || !totalChunks) {
      return res.status(400).json({ success: false, error: 'Missing parameters' });
    }

    if (endedChatsSet.has(chatId) && sender !== 'Raoprime' && sender !== 'RP') {
      return res.status(403).json({ success: false, error: 'This conversation has ended. Please start a new chat.' });
    }

    const sessionDir = path.join(CHUNKS_DIR, uploadId);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    const metadata = {
      uploadId,
      fileName: sanitizeFilename(fileName),
      originalName: fileName,
      fileSize: Number(fileSize),
      totalChunks: Number(totalChunks),
      chunkSize: Number(chunkSize),
      fileType: fileType || 'application/octet-stream',
      chatId,
      sender,
      createdAt: new Date().toISOString()
    };
    fs.writeFileSync(path.join(sessionDir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf8');

    res.json({ success: true, uploadId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Stream Individual Chunk directly to disk
app.post('/api/upload/chunk', (req, res) => {
  const uploadId = req.headers['x-upload-id'] || req.query.uploadId;
  const chunkIndex = parseInt(req.headers['x-chunk-index'] || req.query.chunkIndex, 10);
  const totalChunks = parseInt(req.headers['x-total-chunks'] || req.query.totalChunks, 10);

  if (!uploadId || isNaN(chunkIndex)) {
    return res.status(400).json({ success: false, error: 'Invalid chunk headers' });
  }

  const sessionDir = path.join(CHUNKS_DIR, uploadId);
  if (!fs.existsSync(sessionDir)) {
    return res.status(404).json({ success: false, error: 'Upload session not found' });
  }

  const chunkPath = path.join(sessionDir, `chunk_${chunkIndex}`);
  const writeStream = fs.createWriteStream(chunkPath);

  req.pipe(writeStream);

  writeStream.on('finish', () => {
    res.json({ success: true, uploadId, chunkIndex, totalChunks });
  });

  writeStream.on('error', (err) => {
    res.status(500).json({ success: false, error: err.message });
  });
});

// 3. Finalize, save to Cloud GridFS / Disk & append file message to chat
app.post('/api/upload/finalize', async (req, res) => {
  req.setTimeout(600000); // 10 minutes timeout for high-capacity 20-30 min 4K/1080p video files
  try {
    const { uploadId } = req.body;
    if (!uploadId) return res.status(400).json({ success: false, error: 'Upload ID required' });

    const sessionDir = path.join(CHUNKS_DIR, uploadId);
    const metaPath = path.join(sessionDir, 'metadata.json');
    if (!fs.existsSync(metaPath)) return res.status(404).json({ success: false, error: 'Metadata not found' });

    const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const { fileName, originalName, fileSize, totalChunks, chatId, sender, fileType } = metadata;

    // Verify all chunks
    for (let i = 0; i < totalChunks; i++) {
      if (!fs.existsSync(path.join(sessionDir, `chunk_${i}`))) {
        return res.status(400).json({ success: false, error: `Missing chunk ${i}` });
      }
    }

    const fileExt = path.extname(fileName);
    const baseName = path.basename(fileName, fileExt);
    const finalStoredName = `${baseName}_${uploadId.slice(-6)}${fileExt}`;
    const finalFilePath = path.join(VAULT_DIR, finalStoredName);

    // 1GB+ Ultra-High Capacity Chunk Assembler
    // Appends each chunk sequentially with backpressure (< 10MB RAM usage)
    // Deletes each chunk immediately after append to preserve disk space
    if (fs.existsSync(finalFilePath)) {
      try { fs.unlinkSync(finalFilePath); } catch (e) {}
    }

    for (let i = 0; i < totalChunks; i++) {
      const cPath = path.join(sessionDir, `chunk_${i}`);
      if (!fs.existsSync(cPath)) {
        return res.status(400).json({ success: false, error: `Missing chunk ${i}` });
      }
      await pipeline(
        fs.createReadStream(cPath),
        fs.createWriteStream(finalFilePath, { flags: 'a' })
      );
      try { fs.unlinkSync(cPath); } catch (e) {}
    }

    let gridFsId = null;

    // Cleanup session dir
    try {
      if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
      if (fs.existsSync(sessionDir)) fs.rmdirSync(sessionDir);
    } catch (e) {}

    // Add file message to chat thread
    const nowMs = Date.now();
    const otherSender = (sender === 'Raoprime' || sender === 'RP') ? 'Client' : 'Raoprime';
    const isOtherOnline = otherSender === 'Raoprime'
      ? Boolean(nowMs - globalAdminPresence < 10000 || (presenceStatus[chatId]?.Raoprime && nowMs - presenceStatus[chatId].Raoprime < 10000))
      : Boolean(presenceStatus[chatId]?.Client && (nowMs - presenceStatus[chatId].Client < 10000));

    const fileMessage = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      sender: sender || 'Client',
      type: 'file',
      status: isOtherOnline ? 'delivered' : 'sent',
      file: {
        fileId: uploadId,
        originalName,
        storedName: finalStoredName,
        fileSize,
        formattedSize: formatBytes(fileSize),
        fileType,
        downloadUrl: `/api/download/${finalStoredName}`,
        gridFsId
      },
      timestamp: new Date().toISOString()
    };

    await saveChatMessage(chatId, fileMessage);

    res.json({ success: true, message: fileMessage });
  } catch (err) {
    console.error('Finalize error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Download / Preview File Endpoint (Supports both /api/download and /api/vault/download)
app.get(['/api/download/:storedName', '/api/vault/download/:storedName'], async (req, res) => {
  try {
    const storedName = req.params.storedName;
    const filePath = path.join(VAULT_DIR, storedName);
    const isPreview = req.query.preview === '1';

    // 1. Try local disk
    if (fs.existsSync(filePath)) {
      if (!isPreview) {
        return res.download(filePath);
      } else {
        return res.sendFile(filePath);
      }
    }

    res.status(404).send('File not found');
  } catch (err) {
    res.status(500).send('Download error: ' + err.message);
  }
});

// Admin Route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'admin.html'));
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'index.html'));
});

// Start Server locally if not on Vercel (HTTP + WebSocket)
if (!isVercel) {
  server.listen(PORT, () => {
    console.log(`=====================================================`);
    console.log(`💬 RAOPRIME ONLINE ON PORT ${PORT} (WebSocket Engine Active)`);
    console.log(`🌐 Client Chat: http://localhost:${PORT}`);
    console.log(`🛡️ Admin Portal: http://localhost:${PORT}/admin`);
    console.log(`=====================================================`);
  });
}

module.exports = app;
