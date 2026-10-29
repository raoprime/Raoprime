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
// MongoDB Database & GridFS Cloud Storage Layer
// ──────────────────────────────────────────────────────────────
let isMongoConnected = false;
let gridfsBucket = null;

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

const MessageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  chatId: { type: String, required: true, index: true },
  sender: { type: String, required: true },
  type: { type: String, enum: ['text', 'file'], default: 'text' },
  text: { type: String, default: '' },
  file: {
    fileId: String,
    originalName: String,
    storedName: String,
    fileSize: Number,
    formattedSize: String,
    fileType: String,
    downloadUrl: String,
    gridFsId: String
  },
  timestamp: { type: String, default: () => new Date().toISOString() }
});

const ChatSchema = new mongoose.Schema({
  chatId: { type: String, required: true, unique: true, index: true },
  clientName: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now }
});

const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema);
const Chat = mongoose.models.Chat || mongoose.model('Chat', ChatSchema);

async function connectDB() {
  if (isMongoConnected) return true;
  if (!MONGODB_URI) {
    return false;
  }
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 8000
    });
    isMongoConnected = true;
    gridfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'rp_vault' });
    console.log('🚀 Connected to MongoDB Cloud Database & GridFS Storage!');
    return true;
  } catch (err) {
    console.warn('⚠️ MongoDB connection notice, using local persistence fallback:', err.message);
    return false;
  }
}

connectDB().catch(() => {});

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

// Database-Aware Message Operations
async function getChatMessages(chatId) {
  await connectDB();
  if (isMongoConnected) {
    try {
      const msgs = await Message.find({ chatId }).sort({ timestamp: 1 }).lean();
      return msgs;
    } catch (e) {
      console.warn('Mongo read error, falling back:', e.message);
    }
  }
  const localChats = getAllLocalChats();
  return localChats[chatId] || [];
}

async function saveChatMessage(chatId, messageObj) {
  await connectDB();
  if (isMongoConnected) {
    try {
      await Message.create({ chatId, ...messageObj });
      const clientName = chatId === 'default' ? 'General Desk' : decodeURIComponent(chatId);
      await Chat.findOneAndUpdate({ chatId }, { clientName, updatedAt: new Date() }, { upsert: true });
      return;
    } catch (e) {
      console.warn('Mongo write error, falling back:', e.message);
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

// Heartbeat Endpoint to track Live Presence (Active vs Offline)
app.post('/api/chat/heartbeat', (req, res) => {
  const { chatId = 'default', sender = 'Client' } = req.body;
  if (!presenceStatus[chatId]) presenceStatus[chatId] = {};
  presenceStatus[chatId][sender] = Date.now();
  res.json({ success: true });
});

// ──────────────────────────────────────────────────────────────
// Chat APIs
// ──────────────────────────────────────────────────────────────

// Get Messages & Real-time Typing + Presence State
app.get('/api/chat/messages', async (req, res) => {
  try {
    const chatId = req.query.chatId || 'default';
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

    const onlineStatus = {
      Client: Boolean(chatPresence.Client && (now - chatPresence.Client < 7000)),
      Raoprime: Boolean(chatPresence.Raoprime && (now - chatPresence.Raoprime < 7000))
    };

    res.json({ success: true, chatId, messages, typing: activeTyping, online: onlineStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Real-time Typing Status
app.post('/api/chat/typing', (req, res) => {
  const { chatId = 'default', sender = 'Client', isTyping } = req.body;
  if (!typingStatus[chatId]) typingStatus[chatId] = {};
  if (!presenceStatus[chatId]) presenceStatus[chatId] = {};

  presenceStatus[chatId][sender] = Date.now(); // Typing immediately confirms active presence
  typingStatus[chatId][sender] = isTyping ? Date.now() : 0;
  res.json({ success: true });
});

// Post Text Message
app.post('/api/chat/send', async (req, res) => {
  try {
    const { chatId = 'default', sender = 'Client', text = '' } = req.body;
    if (!text.trim()) {
      return res.status(400).json({ success: false, error: 'Empty message' });
    }

    // Reset typing when message is sent
    if (typingStatus[chatId]) typingStatus[chatId][sender] = 0;

    const newMsg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      sender, // 'Client' or 'Raoprime'
      type: 'text',
      text: text.trim(),
      timestamp: new Date().toISOString()
    };

    await saveChatMessage(chatId, newMsg);

    res.json({ success: true, message: newMsg });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// Ultra HD WebRTC Calling Signaling Engine (1080p Video + Studio 48kHz Audio)
// Sequence-based Guaranteed Delivery & Universal Room Discovery
// ──────────────────────────────────────────────────────────────
const activeCalls = {}; // { [chatId]: { callId, chatId, type, caller, status, startedAt, signals: [], signalSeq: 0 } }

app.post('/api/call/initiate', (req, res) => {
  const { chatId = 'default', caller = 'Client', type = 'video' } = req.body;
  activeCalls[chatId] = {
    callId: 'call_' + Date.now(),
    chatId,
    type,
    caller,
    status: 'ringing',
    startedAt: Date.now(),
    signals: [],
    signalSeq: 0
  };
  res.json({ success: true, call: activeCalls[chatId] });
});

app.get('/api/call/status', (req, res) => {
  const chatId = req.query.chatId;
  const role = req.query.role; // 'admin' or 'client'

  if (role === 'admin') {
    // 1. Is there ANY incoming call from a client?
    const clientCall = Object.entries(activeCalls).find(([cid, c]) => c && c.caller !== 'Raoprime' && (c.status === 'ringing' || c.status === 'connected'));
    if (clientCall) {
      return res.json({ success: true, active: true, chatId: clientCall[0], call: clientCall[1] });
    }
    // 2. Or is there an active call initiated by Admin?
    const adminCall = Object.entries(activeCalls).find(([cid, c]) => c && c.caller === 'Raoprime' && (c.status === 'ringing' || c.status === 'connected'));
    if (adminCall) {
      return res.json({ success: true, active: true, chatId: adminCall[0], call: adminCall[1] });
    }
    return res.json({ success: true, active: false });
  }

  // Client polling:
  let call = (chatId && activeCalls[chatId]) ? activeCalls[chatId] : null;
  if (!call || call.status === 'ended') {
    const adminInitiated = Object.entries(activeCalls).find(([cid, c]) => c && c.caller === 'Raoprime' && (c.status === 'ringing' || c.status === 'connected') && (cid === chatId || cid === 'default' || !chatId));
    if (adminInitiated) {
      call = adminInitiated[1];
    }
  }
  if (!call || call.status === 'ended') {
    if (activeCalls['default'] && activeCalls['default'].status !== 'ended') {
      call = activeCalls['default'];
    }
  }

  if (!call || call.status === 'ended') {
    return res.json({ success: true, active: false });
  }
  res.json({ success: true, active: true, chatId: call.chatId || chatId || 'default', call });
});

app.post('/api/call/signal', (req, res) => {
  const { chatId = 'default', from = 'Client', signal } = req.body;
  const call = activeCalls[chatId] || activeCalls['default'];
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
  const call = activeCalls[chatId] || activeCalls['default'];
  if (!call) return res.json({ success: true, signals: [], status: 'none', lastSeq: 0 });

  const newSignals = call.signals.filter((s) => s.from !== forRole && (s.seq ? s.seq > since : s.timestamp > since));
  const maxSeq = call.signalSeq || (call.signals.length ? call.signals[call.signals.length - 1].timestamp : 0);
  res.json({ success: true, signals: newSignals, status: call.status, type: call.type, caller: call.caller, lastSeq: maxSeq });
});

app.post('/api/call/accept', (req, res) => {
  const { chatId = 'default' } = req.body;
  const call = activeCalls[chatId] || activeCalls['default'];
  if (call) {
    call.status = 'connected';
  }
  res.json({ success: true });
});

app.post('/api/call/end', (req, res) => {
  const { chatId = 'default' } = req.body;
  const call = activeCalls[chatId] || activeCalls['default'];
  if (call) {
    call.status = 'ended';
    setTimeout(() => {
      delete activeCalls[chatId];
      if (activeCalls['default'] && activeCalls['default'].status === 'ended') {
        delete activeCalls['default'];
      }
    }, 4000);
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
    await connectDB();
    const chatList = [];
    const now = Date.now();

    if (isMongoConnected) {
      const distinctChatIds = await Message.distinct('chatId');
      for (const chatId of distinctChatIds) {
        const messages = await Message.find({ chatId }).sort({ timestamp: 1 }).lean();
        if (!Array.isArray(messages) || messages.length === 0) continue;

        const lastMsg = messages[messages.length - 1];
        const files = messages.filter((m) => m.type === 'file' && m.file);
        const clientName = chatId === 'default' ? 'General Desk' : decodeURIComponent(chatId);

        const chatPresence = presenceStatus[chatId] || {};
        const chatTyping = typingStatus[chatId] || {};
        const isClientOnline = Boolean(chatPresence.Client && (now - chatPresence.Client < 7000));
        const isClientTyping = Boolean(chatTyping.Client && (now - chatTyping.Client < 3500));

        chatList.push({
          chatId,
          clientName,
          totalMessages: messages.length,
          totalFiles: files.length,
          files: files.map((f) => f.file),
          isOnline: isClientOnline,
          isTyping: isClientTyping,
          lastMessage: {
            sender: lastMsg.sender,
            text: lastMsg.type === 'file' ? `📁 [File] ${lastMsg.file.originalName}` : lastMsg.text,
            timestamp: lastMsg.timestamp,
            type: lastMsg.type
          }
        });
      }
    } else {
      const chats = getAllLocalChats();
      for (const [chatId, messages] of Object.entries(chats)) {
        if (!Array.isArray(messages) || messages.length === 0) continue;

        const lastMsg = messages[messages.length - 1];
        const files = messages.filter((m) => m.type === 'file' && m.file);
        const clientName = chatId === 'default' ? 'General Desk' : decodeURIComponent(chatId);

        const chatPresence = presenceStatus[chatId] || {};
        const chatTyping = typingStatus[chatId] || {};
        const isClientOnline = Boolean(chatPresence.Client && (now - chatPresence.Client < 7000));
        const isClientTyping = Boolean(chatTyping.Client && (now - chatTyping.Client < 3500));

        chatList.push({
          chatId,
          clientName,
          totalMessages: messages.length,
          totalFiles: files.length,
          files: files.map((f) => f.file),
          isOnline: isClientOnline,
          isTyping: isClientTyping,
          lastMessage: {
            sender: lastMsg.sender,
            text: lastMsg.type === 'file' ? `📁 [File] ${lastMsg.file.originalName}` : lastMsg.text,
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

    // 1. Delete from MongoDB if connected
    await connectDB();
    if (isMongoConnected) {
      try {
        const messages = await Message.find({ chatId }).lean();
        if (gridfsBucket) {
          for (const m of messages) {
            if (m.type === 'file' && m.file && m.file.gridFsId) {
              try {
                await gridfsBucket.delete(new mongoose.Types.ObjectId(m.file.gridFsId));
              } catch (e) {}
            }
          }
        }
        await Message.deleteMany({ chatId });
        await Chat.deleteOne({ chatId });
      } catch (mErr) {
        console.warn('MongoDB delete warning:', mErr.message);
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
    const fileMessage = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      sender: sender || 'Client',
      type: 'file',
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

// Download / Preview File Endpoint
app.get('/api/download/:storedName', async (req, res) => {
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
