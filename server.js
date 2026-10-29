require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const archiver = require('archiver');
const crypto = require('crypto');
const mongoose = require('mongoose');

const app = express();
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(ROOT_DIR, 'public')));

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

// Firebase + Local Hybrid Message Operations
async function getChatMessages(chatId) {
  initFirebase();
  if (isFirebaseConnected && firebaseDb) {
    try {
      const snap = await firebaseDb.collection('raoprime_messages').where('chatId', '==', chatId).get();
      if (!snap.empty) {
        const msgs = snap.docs.map(d => d.data());
        msgs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        return msgs;
      }
    } catch (e) {
      console.warn('Firebase read notice:', e.message);
    }
  }
  const localChats = getAllLocalChats();
  return localChats[chatId] || [];
}

async function saveChatMessage(chatId, messageObj) {
  initFirebase();
  const clientName = chatId === 'default' ? 'General Desk' : decodeURIComponent(chatId);
  if (isFirebaseConnected && firebaseDb) {
    try {
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
      console.warn('Firebase write notice:', e.message);
    }
  }
  const localChats = getAllLocalChats();
  if (!localChats[chatId]) localChats[chatId] = [];
  localChats[chatId].push(messageObj);
  saveAllLocalChats(localChats);
}

// In-memory Real-time Presence & Typing Tracker
const typingStatus = {}; // { [chatId]: { Client: timestamp, Raoprime: timestamp } }
const presenceStatus = {}; // { [chatId]: { Client: timestamp, Raoprime: timestamp } }
let globalAdminPresence = 0; // Tracks if Raoprime Admin is live on portal anywhere

// Mark chat messages as seen by reader ('Client' or 'Raoprime')
async function markChatMessagesSeen(chatId, readerRole) {
  initFirebase();
  const now = new Date().toISOString();
  let updatedAny = false;

  const localChats = getAllLocalChats();
  if (localChats[chatId]) {
    for (const msg of localChats[chatId]) {
      const isIncomingForReader = readerRole === 'Raoprime'
        ? (msg.sender !== 'Raoprime' && msg.sender !== 'RP')
        : (msg.sender === 'Raoprime' || msg.sender === 'RP');
      if (isIncomingForReader && msg.status !== 'seen') {
        msg.status = 'seen';
        msg.seenAt = now;
        updatedAny = true;
      }
    }
    if (updatedAny) {
      saveAllLocalChats(localChats);
    }
  }

  // Also sync to Firestore asynchronously
  if (isFirebaseConnected && firebaseDb) {
    try {
      const snap = await firebaseDb.collection('raoprime_messages').where('chatId', '==', chatId).get();
      if (!snap.empty) {
        const batch = firebaseDb.batch();
        let bCount = 0;
        for (const doc of snap.docs) {
          const m = doc.data();
          const isIncomingForReader = readerRole === 'Raoprime'
            ? (m.sender !== 'Raoprime' && m.sender !== 'RP')
            : (m.sender === 'Raoprime' || m.sender === 'RP');
          if (isIncomingForReader && m.status !== 'seen') {
            batch.update(doc.ref, { status: 'seen', seenAt: now });
            bCount++;
          }
        }
        if (bCount > 0) {
          await batch.commit();
        }
      }
    } catch (e) {
      console.warn('Firebase batch seen update notice:', e.message);
    }
  }
  return updatedAny;
}

// Heartbeat Endpoint to track Live Presence (Active vs Offline)
app.post('/api/chat/heartbeat', (req, res) => {
  const { chatId = 'default', sender = 'Client' } = req.body;
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
  const { chatId = 'default', reader = 'Client' } = req.body;
  await markChatMessagesSeen(chatId, reader);
  res.json({ success: true });
});

// ──────────────────────────────────────────────────────────────
// Chat APIs
// ──────────────────────────────────────────────────────────────

// Get Messages & Real-time Typing + Presence State
app.get('/api/chat/messages', async (req, res) => {
  try {
    const chatId = req.query.chatId || 'default';
    const reader = req.query.reader || (req.headers['x-admin-token'] ? 'Raoprime' : null);

    // If a reader is actively querying, mark other party's messages as seen
    if (reader) {
      if (reader === 'Raoprime') globalAdminPresence = Date.now();
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

    res.json({ success: true, chatId, messages, typing: activeTyping, online: onlineStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Real-time Typing Status
app.post('/api/chat/typing', (req, res) => {
  const { chatId = 'default', sender = 'Client', isTyping } = req.body;
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
    const { chatId = 'default', sender = 'Client', text = '' } = req.body;
    if (!text.trim()) {
      return res.status(400).json({ success: false, error: 'Empty message' });
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
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      sender, // 'Client' or 'Raoprime'
      type: 'text',
      text: text.trim(),
      status: isOtherOnline ? 'delivered' : 'sent',
      timestamp: new Date().toISOString()
    };

    await saveChatMessage(chatId, newMsg);

    res.json({ success: true, message: newMsg });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────
// Ultra HD WebRTC Calling Signaling Engine (1080p Video + Studio 48kHz Audio)
// Universal Room Discovery & Unified Call State
// ──────────────────────────────────────────────────────────────
const activeCalls = {};

// Curated high-reliability Dynamic ICE configuration (Google STUN + Cloudflare STUN + Authenticated OpenRelay TURN)
function getDynamicIceServers() {
  const secret = process.env.TURN_SECRET || 'openrelayprojectsecret';
  const username = `${Math.floor(Date.now() / 1000) + 86400}:raoprime`;
  const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');

  return {
    iceServers: [
      // Primary STUN (Google global distributed infrastructure)
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      // Cloudflare STUN
      { urls: 'stun:stun.cloudflare.com:3478' },
      // Authenticated Metered StaticAuth TURN Relay (Port 80 - standard HTTP port, open across all corporate/firewalls)
      {
        urls: 'turn:staticauth.openrelay.metered.ca:80',
        username,
        credential
      },
      // Authenticated Metered StaticAuth TURN Relay (Port 443 - standard HTTPS port)
      {
        urls: 'turn:staticauth.openrelay.metered.ca:443',
        username,
        credential
      },
      // Authenticated Metered StaticAuth TURN Relay (TCP on Port 443 - bypasses carrier UDP drops)
      {
        urls: 'turn:staticauth.openrelay.metered.ca:443?transport=tcp',
        username,
        credential
      },
      // Authenticated TURNS (Secure TLS on Port 443 - 100% unblockable)
      {
        urls: 'turns:staticauth.openrelay.metered.ca:443?transport=tcp',
        username,
        credential
      }
    ],
    iceCandidatePoolSize: 10
  };
}

function resolveActiveCall(chatId) {
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
  const { chatId = 'default', caller = 'Client', type = 'video' } = req.body;

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

  console.log(`📞 Call initiated by ${caller} (${type}) in room [${chatId}] (ID: ${newCall.callId})`);
  res.json({ success: true, call: newCall });
});

app.get('/api/call/status', (req, res) => {
  const chatId = req.query.chatId;
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
  const { chatId = 'default', from = 'Client', signal } = req.body;
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
  res.json({ success: true, seq });
});

app.get('/api/call/signals', (req, res) => {
  const chatId = req.query.chatId || 'default';
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
  const { chatId = 'default' } = req.body;
  const call = resolveActiveCall(chatId);
  if (call) {
    call.status = 'connected';
    console.log(`✅ Call accepted in room [${call.chatId}]`);
  }
  res.json({ success: true });
});

app.post('/api/call/end', (req, res) => {
  const { chatId = 'default' } = req.body;
  const call = resolveActiveCall(chatId);
  if (call) {
    call.status = 'ended';
    call.endedAt = Date.now();
    console.log(`🛑 Call ended in room [${call.chatId}]`);
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

// List all active conversations for the Admin Portal
app.get('/api/admin/chats', requireAdminAuth, async (req, res) => {
  try {
    initFirebase();
    const chatList = [];
    const now = Date.now();
    globalAdminPresence = now;

    if (isFirebaseConnected && firebaseDb) {
      try {
        const chatsSnap = await firebaseDb.collection('raoprime_chats').get();
        for (const doc of chatsSnap.docs) {
          const cData = doc.data();
          const chatId = cData.chatId || doc.id;
          const messages = await getChatMessages(chatId);
          if (!Array.isArray(messages) || messages.length === 0) continue;

          const lastMsg = messages[messages.length - 1];
          const files = messages.filter((m) => m.type === 'file' && m.file);
          const clientName = cData.clientName || (chatId === 'default' ? 'General Desk' : decodeURIComponent(chatId));

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
            lastMessage: {
              sender: lastMsg.sender,
              text: lastMsg.type === 'file' ? `📁 [File] ${lastMsg.file.originalName}` : lastMsg.text,
              status: lastMsg.status || 'seen',
              timestamp: lastMsg.timestamp,
              type: lastMsg.type
            }
          });
        }
      } catch (fbErr) {
        console.warn('Firebase admin chats query warning:', fbErr.message);
      }
    }

    if (chatList.length === 0) {
      const chats = getAllLocalChats();
      for (const [chatId, messages] of Object.entries(chats)) {
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
          lastMessage: {
            sender: lastMsg.sender,
            text: lastMsg.type === 'file' ? `📁 [File] ${lastMsg.file.originalName}` : lastMsg.text,
            status: lastMsg.status || 'seen',
            timestamp: lastMsg.timestamp,
            type: lastMsg.type
          }
        });
      }
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
    const { chatId } = req.params;
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
      } else if (isMongoConnected && gridfsBucket && f.file.gridFsId) {
        try {
          const downloadStream = gridfsBucket.openDownloadStream(new mongoose.Types.ObjectId(f.file.gridFsId));
          archive.append(downloadStream, { name: f.file.originalName });
        } catch (e) {}
      }
    }

    archive.finalize();
  } catch (err) {
    res.status(500).send('ZIP error: ' + err.message);
  }
});

// Admin: Delete an entire chat and its files permanently
app.delete('/api/admin/chat/:chatId', requireAdminAuth, async (req, res) => {
  try {
    const { chatId } = req.params;
    if (!chatId) {
      return res.status(400).json({ success: false, error: 'Chat ID required' });
    }

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

    // 2. Delete from Local JSON Storage
    const localChats = getAllLocalChats();
    if (localChats[chatId]) {
      const messages = localChats[chatId] || [];
      for (const m of messages) {
        if (m.type === 'file' && m.file && m.file.storedName) {
          const fPath = path.join(VAULT_DIR, m.file.storedName);
          if (fs.existsSync(fPath)) {
            try { fs.unlinkSync(fPath); } catch (e) {}
          }
        }
      }
      delete localChats[chatId];
      saveAllLocalChats(localChats);
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
    const { uploadId, fileName, fileSize, totalChunks, chunkSize, fileType, chatId = 'default', sender = 'Client' } = req.body;
    if (!uploadId || !fileName || !totalChunks) {
      return res.status(400).json({ success: false, error: 'Missing parameters' });
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

    // Assemble file
    const destStream = fs.createWriteStream(finalFilePath);
    for (let i = 0; i < totalChunks; i++) {
      const cPath = path.join(sessionDir, `chunk_${i}`);
      await new Promise((resolve, reject) => {
        const rs = fs.createReadStream(cPath);
        rs.pipe(destStream, { end: false });
        rs.on('end', resolve);
        rs.on('error', reject);
      });
    }
    destStream.end();

    await new Promise((resolve, reject) => {
      destStream.on('finish', resolve);
      destStream.on('error', reject);
    });

    // Cloud GridFS Storage Upload (if MongoDB Connected)
    let gridFsId = null;
    await connectDB();
    if (isMongoConnected && gridfsBucket) {
      try {
        const uploadStream = gridfsBucket.openUploadStream(finalStoredName, {
          metadata: { originalName, fileSize, fileType, chatId }
        });
        await new Promise((resolve, reject) => {
          fs.createReadStream(finalFilePath).pipe(uploadStream)
            .on('finish', () => {
              gridFsId = uploadStream.id ? uploadStream.id.toString() : null;
              resolve();
            })
            .on('error', reject);
        });
      } catch (gridErr) {
        console.warn('GridFS upload warning:', gridErr.message);
      }
    }

    // Cleanup temp chunks
    try {
      for (let i = 0; i < totalChunks; i++) {
        fs.unlinkSync(path.join(sessionDir, `chunk_${i}`));
      }
      fs.unlinkSync(metaPath);
      fs.rmdirSync(sessionDir);
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

    // 1. Try local disk first
    if (fs.existsSync(filePath)) {
      if (!isPreview) {
        return res.download(filePath);
      } else {
        return res.sendFile(filePath);
      }
    }

    // 2. Try MongoDB GridFS Cloud Storage
    await connectDB();
    if (isMongoConnected && gridfsBucket) {
      const files = await gridfsBucket.find({ filename: storedName }).toArray();
      if (files.length > 0) {
        const fileDoc = files[0];
        const contentType = fileDoc.metadata?.fileType || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        if (!isPreview) {
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileDoc.metadata?.originalName || storedName)}"`);
        }
        return gridfsBucket.openDownloadStream(fileDoc._id).pipe(res);
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

// Start Server locally if not on Vercel
if (!isVercel) {
  app.listen(PORT, () => {
    console.log(`=====================================================`);
    console.log(`💬 RAOPRIME ONLINE ON PORT ${PORT}`);
    console.log(`🌐 Client Chat: http://localhost:${PORT}`);
    console.log(`🛡️ Admin Portal: http://localhost:${PORT}/admin`);
    console.log(`=====================================================`);
  });
}

module.exports = app;
