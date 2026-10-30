/**
 * Raoprime Admin Portal Logic (Secured with Cryptographic HMAC Authentication)
 * Mobile-First High-Performance Architecture
 */

const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks (Optimized for Vercel Serverless & Mobile)

let allChats = [];
let activeChatId = null;
let activeChatIsEnded = false;

// End Chat & Session Conclusion Control
async function toggleAdminEndChat() {
  if (!activeChatId) {
    showToast('Please select a client chat first.');
    return;
  }
  const isCurrentlyEnded = Boolean(window.activeChatIsEnded);
  const action = isCurrentlyEnded ? 'reopen' : 'end';
  
  const clientName = document.getElementById('activeClientName')?.textContent || activeChatId;
  const confirmMsg = isCurrentlyEnded
    ? `Reopen consultation with ${clientName}? The client will be able to send messages and documents again.`
    : `Conclude consultation with ${clientName}? The client will see 'Your chat Ends' and their typing & document attachments will be disabled.`;
    
  if (!confirm(confirmMsg)) return;

  try {
    const res = await fetch('/api/admin/chat/end', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminToken
      },
      body: JSON.stringify({ chatId: activeChatId, action })
    });
    const data = await res.json();
    if (data.success) {
      window.activeChatIsEnded = data.isEnded;
      updateAdminEndChatButton(data.isEnded);
      showToast(data.isEnded ? '🔒 Consultation ended for client' : '🔓 Consultation reopened for client');
      loadActiveMessages();
      loadAdminChats();
    } else {
      showToast('Error: ' + (data.error || 'Failed to update'));
    }
  } catch (err) {
    showToast('Failed to update session: ' + err.message);
  }
}

function updateAdminEndChatButton(isEnded) {
  window.activeChatIsEnded = Boolean(isEnded);
  const btn = document.getElementById('endChatBtn');
  const txt = document.getElementById('endChatBtnText');
  const icon = document.getElementById('endChatBtnIcon');
  if (!btn || !txt) return;

  if (isEnded) {
    txt.textContent = 'Reopen Chat';
    btn.className = 'h-8 sm:h-9 px-2.5 sm:px-3 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 text-emerald-300 hover:text-emerald-200 border border-emerald-500/20 backdrop-blur-md text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 shrink-0 cursor-pointer';
    btn.title = 'Reopen chat for this client';
    if (icon) {
      icon.className = 'w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400';
      icon.innerHTML = '<path d="M7 11V7a5 5 0 0 1 9.9-1"/><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>';
    }
  } else {
    txt.textContent = 'End Chat';
    btn.className = 'h-8 sm:h-9 px-2.5 sm:px-3 rounded-full bg-rose-500/10 hover:bg-rose-500/20 active:bg-rose-500/30 text-rose-300 hover:text-red-200 border border-rose-500/20 backdrop-blur-md text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 shrink-0 cursor-pointer';
    btn.title = 'End conversation with this client';
    if (icon) {
      icon.className = 'w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-400';
      icon.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>';
    }
  }
}

// Native OS Notification Alerts for Admin Desk
function initAdminNotifications() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js?v=2.3').catch(() => {});
  }
  if ('Notification' in window && Notification.permission === 'default') {
    // Quietly request notification permission when admin interacts
    document.addEventListener('click', function reqOnce() {
      Notification.requestPermission();
      document.removeEventListener('click', reqOnce);
    }, { once: true });
  }
}

function showAdminDeviceNotification(msg, roomName) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!document.hidden && document.hasFocus()) return;

  const clientTitle = roomName ? decodeURIComponent(roomName) : (msg.sender || 'Client');
  let bodyText = '';
  if (msg.type === 'file' && msg.file) {
    bodyText = '📎 Sent file: ' + (msg.file.originalName || 'Document') + ' (' + (msg.file.formattedSize || '') + ')';
  } else {
    bodyText = msg.text || 'New confidential message';
    if (bodyText.length > 120) bodyText = bodyText.slice(0, 117) + '...';
  }

  const notifOptions = {
    body: bodyText,
    icon: '/assets/rp-logo.jpg',
    badge: '/assets/rp-logo.jpg',
    tag: 'raoprime-admin-' + (roomName || 'default'),
    renotify: true,
    vibrate: [250, 100, 250],
    data: {
      url: window.location.href,
      chatId: roomName,
      messageId: msg.id
    }
  };

  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(clientTitle, notifOptions);
    }).catch(() => {
      try {
        const n = new Notification(clientTitle, notifOptions);
        n.onclick = () => { window.focus(); n.close(); };
      } catch (e) {}
    });
  } else {
    try {
      const n = new Notification(clientTitle, notifOptions);
      n.onclick = () => { window.focus(); n.close(); };
    } catch (e) {}
  }
}

let lastMsgCount = 0;
let isUploading = false;
let typingTimeout = null;
let isCurrentlyTyping = false;
let adminToken = localStorage.getItem('raoprime_admin_token') || '';
let pollIntervals = [];

// ⚡ Ultra-Low-Latency WebSocket Real-Time Engine for Admin
let adminWs = null;
let isAdminWsConnected = false;
let adminWsReconnectTimer = null;
let pendingSdpOffer = null;

function initAdminWebSocket() {
  if (!adminToken) return;
  if (adminWs && (adminWs.readyState === WebSocket.OPEN || adminWs.readyState === WebSocket.CONNECTING)) {
    return;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  try {
    adminWs = new WebSocket(wsUrl);

    adminWs.onopen = () => {
      isAdminWsConnected = true;
      console.log('⚡ Raoprime Admin Ultra-fast WebSocket connected');
      sendAdminWsEvent('join', { chatId: activeChatId || 'all', role: 'Raoprime', sender: 'Raoprime' });
      loadAdminChats();
      if (activeChatId) loadActiveMessages();
    };

    adminWs.onmessage = async (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        handleAdminWsEvent(payload);
      } catch (err) {
        console.warn('Admin WS parse warning:', err);
      }
    };

    adminWs.onerror = () => {};

    adminWs.onclose = () => {
      isAdminWsConnected = false;
      if (adminToken) {
        if (adminWsReconnectTimer) clearTimeout(adminWsReconnectTimer);
        adminWsReconnectTimer = setTimeout(initAdminWebSocket, 3000);
      }
    };
  } catch (err) {
    if (adminWsReconnectTimer) clearTimeout(adminWsReconnectTimer);
    adminWsReconnectTimer = setTimeout(initAdminWebSocket, 5000);
  }
}

function sendAdminWsEvent(event, data = {}) {
  if (adminWs && adminWs.readyState === WebSocket.OPEN) {
    try {
      const targetChat = data.chatId || activeChatId || 'all';
      adminWs.send(JSON.stringify({ event, chatId: targetChat, role: 'Raoprime', sender: 'Raoprime', ...data }));
      return true;
    } catch (e) {
      console.warn('Admin WS send error:', e);
    }
  }
  return false;
}

async function handleAdminWsEvent(payload) {
  const { event, chatId } = payload;
  const normChatId = (chatId || '').toLowerCase().trim();
  const normActiveChatId = (activeChatId || '').toLowerCase().trim();

  switch (event) {
    case 'chat:ended': {
      if (normChatId === normActiveChatId) {
        updateAdminEndChatButton(payload.isEnded);
        loadActiveMessages();
      }
      loadAdminChats();
      break;
    }

    case 'chat:message': {
      const msg = payload.message;
      if (!msg) return;

      // 1. If currently viewing this chat, update active messages view in 0ms
      if (normChatId && (normChatId === normActiveChatId || !normActiveChatId)) {
        if (normChatId === normActiveChatId) {
          if (!window.currentAdminCachedMessages) window.currentAdminCachedMessages = [];
          const existsIndex = window.currentAdminCachedMessages.findIndex(m => m.id === msg.id);
          if (existsIndex >= 0) {
            window.currentAdminCachedMessages[existsIndex] = msg;
          } else {
            window.currentAdminCachedMessages.push(msg);
            if (msg.sender !== 'Raoprime' && msg.sender !== 'RP') {
              playConnectChime();
              showAdminDeviceNotification(msg, activeChatId);
              sendAdminWsEvent('chat:read', { chatId: activeChatId, reader: 'Raoprime' });
            }
          }
          renderAdminMessages(window.currentAdminCachedMessages);
          scrollAdminToBottom();
        }
      }

      // 2. Update allChats list in sidebar in 0ms
      let foundChat = allChats.find(c => c.chatId.toLowerCase() === normChatId);
      if (foundChat) {
        foundChat.lastMessage = msg;
        foundChat.lastActivity = msg.timestamp || new Date().toISOString();
        if (normChatId !== normActiveChatId && msg.sender !== 'Raoprime' && msg.sender !== 'RP') {
          foundChat.unseenCount = (foundChat.unseenCount || 0) + 1;
        }
        allChats = [foundChat, ...allChats.filter(c => c !== foundChat)];
        filterChats();
      } else {
        loadAdminChats();
      }
      break;
    }

    case 'chat:typing': {
      if (normChatId === normActiveChatId && payload.sender !== 'Raoprime') {
        updateAdminTypingUI(true, Boolean(payload.isTyping));
      }
      break;
    }

    case 'chat:presence': {
      if (normChatId === normActiveChatId) {
        updateAdminTypingUI(Boolean(payload.isClientOnline), false);
      }
      break;
    }

    case 'chat:read': {
      if (normChatId === normActiveChatId && window.currentAdminCachedMessages) {
        let changed = false;
        window.currentAdminCachedMessages.forEach(m => {
          if ((m.sender === 'Raoprime' || m.sender === 'RP') && m.status !== 'seen') {
            m.status = 'seen';
            changed = true;
          }
        });
        if (changed) renderAdminMessages(window.currentAdminCachedMessages);
      }
      break;
    }

    case 'chat:reaction': {
      if (normChatId === normActiveChatId && window.currentAdminCachedMessages && payload.messageId) {
        const target = window.currentAdminCachedMessages.find(m => m.id === payload.messageId);
        if (target) {
          target.reactions = payload.reactions;
          renderAdminMessages(window.currentAdminCachedMessages);
        }
      }
      break;
    }

    case 'chat:edited': {
      if (normChatId === normActiveChatId && window.currentAdminCachedMessages && payload.messageId) {
        const target = window.currentAdminCachedMessages.find(m => m.id === payload.messageId);
        if (target) {
          target.text = payload.text;
          target.isEdited = true;
          renderAdminMessages(window.currentAdminCachedMessages);
        }
      }
      break;
    }

    case 'call:incoming': {
      if (isCallActive) return;
      const call = payload.call;
      if (call && call.caller !== 'Raoprime' && call.status === 'ringing') {
        pendingCall = call;
        pendingCallChatId = payload.chatId || activeChatId || 'default';
        showAdminIncomingModal(call, pendingCallChatId);
      }
      break;
    }

    case 'call:signal': {
      const fromRole = payload.from || payload.sender;
      if (fromRole === 'Raoprime' || fromRole === 'RP') break; // Ignore our own echo
      if (payload.signal) {
        if (isCallActive && peerConnection && peerConnection.signalingState !== 'closed') {
          await handleIncomingSignal(payload.signal);
        } else {
          // Buffer signals that arrive during ringing or before acceptance
          if (payload.signal.sdp && payload.signal.sdp.type === 'offer') {
            pendingSdpOffer = payload.signal.sdp;
          }
          if (payload.signal.candidate) {
            pendingCandidates.push(payload.signal.candidate);
          }
        }
      }
      break;
    }

    case 'call:accepted': {
      if (isCallActive) {
        showToast('Client connected in Ultra HD!');
        if (peerConnection && peerConnection.localDescription) {
          sendAdminCallSignal({ sdp: peerConnection.localDescription });
        }
      }
      break;
    }

    case 'call:ended': {
      cleanupCall();
      showToast('Call ended by client');
      break;
    }
  }
}

// WhatsApp-grade Action States
let adminEditingMessageId = null;
let adminReplyingMessageId = null;
let adminContextTargetMessage = null;
let adminIgnoreNextClickUntil = 0;

document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) window.lucide.createIcons();
  initAdminNotifications();

  setupMobileViewport();

  const msgInput = document.getElementById('adminMessageInput');
  msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendAdminTextMessage();
    } else if (e.key === 'Escape' && adminEditingMessageId) {
      e.preventDefault();
      cancelAdminEditingMessage();
    }
  });

  let lastAdminTypingTime = 0;
  msgInput.addEventListener('input', () => {
    // Auto-expand textarea dynamically up to 140px
    msgInput.style.height = 'auto';
    msgInput.style.height = Math.min(msgInput.scrollHeight, 140) + 'px';

    if (!activeChatId) return;
    const now = Date.now();
    if (now - lastAdminTypingTime > 1000) {
      lastAdminTypingTime = now;
      sendAdminTypingStatus(true);
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      lastAdminTypingTime = 0;
      sendAdminTypingStatus(false);
    }, 2500);
  });

  msgInput.addEventListener('focus', () => {
    setTimeout(scrollAdminToBottom, 300);
  });

  // Admin Message Context Menu (Right-click & Long-press)
  setupAdminMessageContextMenu();

  // Admin Heartbeat Loop (15s fallback pinger)
  setInterval(sendAdminHeartbeat, 15000);

  // Resume polling & WS on window visibility
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && adminToken) {
      if (!isAdminWsConnected) initAdminWebSocket();
      triggerAdminChatsPoll();
      if (activeChatId) triggerActiveMsgsPoll();
    }
  });

  // Verify authentication before loading chats
  await checkAuthStatus();
});

function sendAdminHeartbeat() {
  if (!adminToken || isAdminWsConnected) return; // WebSocket maintains continuous presence automatically
  fetch('/api/chat/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: activeChatId || 'all', sender: 'Raoprime' })
  }).catch(() => {});
}

// ──────────────────────────────────────────────────────────────
// Mobile Viewport & Virtual Keyboard Handler
// ──────────────────────────────────────────────────────────────

function setupMobileViewport() {
  if (window.visualViewport) {
    const handleViewport = () => {
      scrollAdminToBottom();
    };
    window.visualViewport.addEventListener('resize', handleViewport);
  }
}

// ──────────────────────────────────────────────────────────────
// Authentication & Security Handlers
// ──────────────────────────────────────────────────────────────

async function checkAuthStatus() {
  if (!adminToken) {
    showLoginGateway();
    return;
  }

  try {
    const res = await fetch('/api/admin/verify', {
      headers: { 'x-admin-token': adminToken }
    });
    const data = await res.json();
    if (data.success) {
      hideLoginGateway();
      startPolling();
    } else {
      showLoginGateway();
    }
  } catch (e) {
    showLoginGateway();
  }
}

function showLoginGateway() {
  const gateway = document.getElementById('loginGateway');
  if (gateway) {
    gateway.classList.remove('hidden');
    setTimeout(() => document.getElementById('adminPasswordInput')?.focus(), 200);
  }
}

function hideLoginGateway() {
  const gateway = document.getElementById('loginGateway');
  if (gateway) gateway.classList.add('hidden');
}

function startPolling() {
  initAdminWebSocket();
  triggerAdminChatsPoll();
  triggerActiveMsgsPoll();
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const input = document.getElementById('adminPasswordInput');
  const errorBox = document.getElementById('loginErrorMsg');
  const unlockBtn = document.getElementById('unlockBtn');
  const password = input.value.trim();

  if (!password) return;

  unlockBtn.disabled = true;
  unlockBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Verifying...</span>`;
  if (window.lucide) window.lucide.createIcons();
  errorBox.classList.add('hidden');

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();

    if (data.success && data.token) {
      adminToken = data.token;
      localStorage.setItem('raoprime_admin_token', adminToken);
      input.value = '';
      hideLoginGateway();
      startPolling();
      showToast('Vault unlocked. Welcome, Admin.');
    } else {
      errorBox.textContent = data.error || 'Authentication failed';
      errorBox.classList.remove('hidden');
      input.focus();
    }
  } catch (err) {
    errorBox.textContent = 'Server connection error. Please retry.';
    errorBox.classList.remove('hidden');
  } finally {
    unlockBtn.disabled = false;
    unlockBtn.innerHTML = `<i data-lucide="shield-check" class="w-4 h-4"></i><span>Unlock Admin Vault</span>`;
    if (window.lucide) window.lucide.createIcons();
  }
}

async function handleAdminLogout() {
  try {
    await fetch('/api/admin/logout', {
      method: 'POST',
      headers: { 'x-admin-token': adminToken }
    });
  } catch (e) {}

  if (adminWs) {
    try { adminWs.close(); } catch (e) {}
    adminWs = null;
    isAdminWsConnected = false;
  }

  adminToken = '';
  localStorage.removeItem('raoprime_admin_token');
  if (adminChatsPollTimer) clearTimeout(adminChatsPollTimer);
  if (activeMsgsPollTimer) clearTimeout(activeMsgsPollTimer);
  pollIntervals.forEach(clearInterval);
  showLoginGateway();
  showToast('Admin session locked.');
}

async function sendAdminTypingStatus(isTyping) {
  if (!activeChatId) return;
  if (sendAdminWsEvent('chat:typing', { chatId: activeChatId, sender: 'Raoprime', isTyping })) return;
  try {
    await fetch('/api/chat/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: activeChatId,
        sender: 'Raoprime',
        isTyping
      })
    });
  } catch (e) {}
}

let lastAdminTypingSig = '';

function updateAdminTypingUI(isOnline, isTyping) {
  const meta = document.getElementById('activeClientMeta');
  const bubble = document.getElementById('adminTypingBubbleContainer');
  const radarDot = document.getElementById('activeClientRadarDot');
  const clientName = document.getElementById('activeClientName')?.textContent || 'Client';

  const typingSig = `${clientName}:${isOnline}:${isTyping}`;
  if (typingSig === lastAdminTypingSig) return;
  lastAdminTypingSig = typingSig;

  if (isTyping) {
    if (meta) {
      meta.innerHTML = `
        <span class="text-rose-400 font-semibold flex items-center gap-1.5 animate-pulse">
          <span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span> ${escapeHtml(clientName)} is typing...
        </span>`;
    }
    if (bubble && bubble.classList.contains('hidden')) {
      bubble.classList.remove('hidden');
      scrollAdminToBottom();
    }
    if (radarDot) {
      radarDot.className = 'absolute bottom-0 right-0 w-2.5 h-2.5 bg-rose-500 border-2 border-[#0a0c12] rounded-full animate-ping';
    }
  } else if (isOnline) {
    if (meta) {
      meta.innerHTML = `
        <span class="text-emerald-400 font-semibold flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Active now
        </span>`;
    }
    if (bubble) bubble.classList.add('hidden');
    if (radarDot) {
      radarDot.className = 'absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#0a0c12] rounded-full radar-pulse';
    }
  } else {
    // Offline
    if (meta) {
      meta.innerHTML = `
        <span class="text-slate-400 font-medium flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span> Offline
        </span>`;
    }
    if (bubble) bubble.classList.add('hidden');
    if (radarDot) {
      radarDot.className = 'absolute bottom-0 right-0 w-2.5 h-2.5 bg-slate-500 border-2 border-[#0a0c12] rounded-full';
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Load Conversations List (Sequential Non-Blocking & DOM Diffed)
// ──────────────────────────────────────────────────────────────

let lastChatsSig = '';
let lastRenderedActiveChatId = '';
let isPollingAdminChats = false;
let adminChatsPollTimer = null;

async function triggerAdminChatsPoll() {
  if (!adminToken) return;
  if (isPollingAdminChats) return;
  isPollingAdminChats = true;
  try {
    await loadAdminChats();
  } catch (e) {
  } finally {
    isPollingAdminChats = false;
    const interval = isAdminWsConnected ? 30000 : (document.hidden ? 5000 : 2500);
    if (adminChatsPollTimer) clearTimeout(adminChatsPollTimer);
    adminChatsPollTimer = setTimeout(triggerAdminChatsPoll, interval);
  }
}

async function loadAdminChats() {
  if (!adminToken) return;
  try {
    const res = await fetch('/api/admin/chats', {
      headers: { 'x-admin-token': adminToken }
    });
    if (res.status === 401) {
      handleAdminLogout();
      return;
    }
    const data = await res.json();
    if (data.success && data.chats) {
      allChats = data.chats;

      const currentSig = data.chats.map(c =>
        `${c.chatId}:${c.totalMessages}:${c.unseenCount}:${c.isOnline ? 1 : 0}:${c.isTyping ? 1 : 0}:${c.lastMessage?.status || ''}:${c.lastMessage?.timestamp || ''}`
      ).join('|');

      const isSearchActive = document.activeElement === document.getElementById('searchInput');

      const isInitialLoading = Boolean(document.getElementById('chatsContainer')?.textContent.includes('Loading conversations'));
      if (currentSig !== lastChatsSig || activeChatId !== lastRenderedActiveChatId || isInitialLoading) {
        lastChatsSig = currentSig;
        lastRenderedActiveChatId = activeChatId;
        if (!isSearchActive) {
          filterChats();
        }
      }

      // On desktop: if no chat selected and we have chats, auto-select the first one
      if (!activeChatId && allChats.length > 0) {
        if (window.innerWidth >= 768) {
          selectChat(allChats[0].chatId, false);
        } else {
          // On mobile, keep first chat referenced without forcing workspace open
          activeChatId = allChats[0].chatId;
        }
      }
    }
  } catch (err) {
    console.warn('Admin chats poll error:', err);
  }
}

function filterChats() {
  const query = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const container = document.getElementById('chatsContainer');
  if (!container) return;

  let list = allChats;
  if (query) {
    list = list.filter(c => 
      c.clientName.toLowerCase().includes(query) ||
      (c.lastMessage && c.lastMessage.text && c.lastMessage.text.toLowerCase().includes(query))
    );
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div class="py-16 text-center text-slate-500 text-xs space-y-1">
        <i data-lucide="inbox" class="w-8 h-8 mx-auto text-slate-600"></i>
        <p class="font-medium text-slate-400">No active conversations</p>
        <p class="text-[11px] text-slate-600">Share your link with clients to start</p>
      </div>`;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  container.innerHTML = list.map(c => {
    const isActive = c.chatId === activeChatId;
    const initial = (c.clientName || 'C').charAt(0).toUpperCase();
    const timeFormatted = c.lastMessage?.timestamp 
      ? new Date(c.lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';
    const isLiveOnline = Boolean(c.isOnline);
    const isClientTyping = Boolean(c.isTyping);
    const snippetHtml = isClientTyping
      ? `<span class="text-rose-400 font-semibold animate-pulse flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span> typing...</span>`
      : escapeHtml(c.lastMessage?.text || 'No messages yet');

    return `
      <div onclick="selectChat('${c.chatId}', true)" class="chat-item p-3.5 flex items-center gap-3 cursor-pointer hover:bg-slate-900/60 active:bg-rose-950/30 transition-colors ${isActive ? 'active' : ''}">
        <div class="relative shrink-0">
          <div class="w-11 h-11 rounded-full bg-gradient-to-tr from-rose-900 to-red-700 flex items-center justify-center text-white font-extrabold text-sm shadow-md ring-1 ring-black">
            ${initial}
          </div>
          <span class="absolute bottom-0 right-0 w-2.5 h-2.5 ${isLiveOnline ? 'bg-emerald-500 radar-pulse' : 'bg-slate-500'} border-2 border-[#090b10] rounded-full"></span>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-bold text-white truncate max-w-[130px] sm:max-w-[150px]">${escapeHtml(c.clientName)}</h4>
            <span class="text-[10px] text-slate-500 shrink-0 ml-1">${timeFormatted}</span>
          </div>
          <div class="flex items-center justify-between mt-1">
            <p class="text-[11px] text-slate-400 truncate max-w-[140px] sm:max-w-[160px]">${snippetHtml}</p>
            <div class="flex items-center gap-1 shrink-0 ml-1">
              ${c.unseenCount > 0 ? `<span class="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-sky-500 text-white shadow-sm animate-pulse">${c.unseenCount}</span>` : ''}
              ${c.totalFiles > 0 ? `<span class="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-rose-900/40 text-rose-300 border border-rose-700/40">${c.totalFiles} files</span>` : ''}
            </div>
          </div>
        </div>
        <button onclick="event.stopPropagation(); confirmDeleteChat('${c.chatId}', '${escapeHtml(c.clientName)}')" class="w-7 h-7 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/40 flex items-center justify-center transition-all shrink-0 ml-0.5 cursor-pointer active:scale-90" title="Delete chat">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

// ──────────────────────────────────────────────────────────────
// Select & Load Active Conversation (Mobile-Responsive Switcher)
// ──────────────────────────────────────────────────────────────

function selectChat(chatId, isUserTap = false) {
  if (activeChatId === chatId && !isUserTap) return;
  activeChatId = chatId;
  sendAdminWsEvent('join', { chatId, role: 'Raoprime', sender: 'Raoprime' });
  lastAdminMsgSig = '';
  lastAdminTypingSig = '';
  lastMsgCount = 0;
  lastRenderedActiveChatId = chatId;

  const current = allChats.find(c => c.chatId === chatId);
  updateAdminEndChatButton(current?.isEnded);
  const clientName = current ? current.clientName : decodeURIComponent(chatId);

  document.getElementById('activeClientName').textContent = clientName;
  document.getElementById('activeClientAvatar').textContent = clientName.charAt(0).toUpperCase();
  const isOnline = Boolean(current?.isOnline);
  document.getElementById('activeClientMeta').innerHTML = isOnline
    ? `<span class="text-emerald-400 font-semibold flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-emerald-400 radar-pulse"></span> Active now</span>`
    : `<span class="text-slate-400 font-medium flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-slate-500"></span> Offline</span>`;

  const radarDot = document.getElementById('activeClientRadarDot');
  if (radarDot) {
    radarDot.className = isOnline 
      ? 'absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#0a0c12] rounded-full radar-pulse'
      : 'absolute bottom-0 right-0 w-2.5 h-2.5 bg-slate-500 border-2 border-[#0a0c12] rounded-full';
  }
  document.getElementById('adminMessageInput').placeholder = `Reply as Raoprime to ${clientName}...`;

  // Immediately clear old messages and display smooth loading placeholder
  const container = document.getElementById('adminMessagesList');
  if (container) {
    container.innerHTML = `
      <div class="flex items-center justify-center h-48 text-slate-500 text-xs">
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></div>
          <span>Loading ${escapeHtml(clientName)}'s conversation...</span>
        </div>
      </div>`;
  }

  filterChats();

  // Reset poll lock and trigger immediate fetch
  if (activeMsgsPollTimer) clearTimeout(activeMsgsPollTimer);
  isPollingActiveMsgs = false;
  triggerActiveMsgsPoll();

  // On mobile: switch views only if explicitly tapped
  if (window.innerWidth < 768 && isUserTap) {
    const inbox = document.getElementById('inboxSidebar');
    const workspace = document.getElementById('chatWorkspace');
    if (inbox && workspace) {
      inbox.classList.add('hidden');
      workspace.classList.remove('hidden');
      workspace.classList.add('flex');
    }
  }
}

function showInboxOnMobile() {
  const inbox = document.getElementById('inboxSidebar');
  const workspace = document.getElementById('chatWorkspace');
  if (inbox && workspace) {
    inbox.classList.remove('hidden');
    workspace.classList.add('hidden');
    workspace.classList.remove('flex');
  }
}

// ──────────────────────────────────────────────────────────────
// Message Stream for Active Chat (Real-time Seen / Delivered / Active)
// ──────────────────────────────────────────────────────────────

let lastAdminMsgSig = '';
let isPollingActiveMsgs = false;
let activeMsgsPollTimer = null;

function renderAdminMessageStatus(status, isRaoprime) {
  if (!isRaoprime) return '';
  const s = status || 'delivered';
  if (s === 'seen') {
    return `<span class="inline-flex items-center text-sky-400 shrink-0 select-none ml-1" title="Seen by Client">
      <svg class="w-3.5 h-3.5 inline" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 6L7 17l-5-5"></path>
        <path d="M22 10l-7.5 7.5-2-2"></path>
      </svg>
    </span>`;
  }
  if (s === 'delivered') {
    return `<span class="inline-flex items-center text-slate-400/90 shrink-0 select-none ml-1" title="Delivered">
      <svg class="w-3.5 h-3.5 inline" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 6L7 17l-5-5"></path>
        <path d="M22 10l-7.5 7.5-2-2"></path>
      </svg>
    </span>`;
  }
  return `<span class="inline-flex items-center text-slate-400/70 shrink-0 select-none ml-1" title="Sent">
    <svg class="w-3 h-3 inline" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  </span>`;
}

function formatAdminMessageText(text) {
  if (!text) return '';
  let escaped = escapeHtml(text);

  // Auto-detect & format URLs with clean styling & external icon
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
  escaped = escaped.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="underline decoration-rose-300/60 hover:decoration-rose-200 text-rose-200 font-medium inline-flex items-center gap-1 hover:text-white transition-colors" onclick="event.stopPropagation()">${url}<svg class="w-3.5 h-3.5 inline shrink-0 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>`;
  });

  // Format bold **text**
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>');

  // Format inline code `code`
  escaped = escaped.replace(/`([^`]+)`/g, '<code class="bg-black/30 border border-white/10 px-1.5 py-0.5 rounded text-[13px] font-mono text-rose-200">$1</code>');

  return escaped;
}

async function triggerActiveMsgsPoll() {
  if (!adminToken || !activeChatId) {
    if (activeMsgsPollTimer) clearTimeout(activeMsgsPollTimer);
    activeMsgsPollTimer = setTimeout(triggerActiveMsgsPoll, 3000);
    return;
  }
  if (isPollingActiveMsgs) return;
  isPollingActiveMsgs = true;
  try {
    await loadActiveMessages();
  } catch (e) {
  } finally {
    isPollingActiveMsgs = false;
    const interval = isAdminWsConnected ? 30000 : (document.hidden ? 5000 : 2000);
    if (activeMsgsPollTimer) clearTimeout(activeMsgsPollTimer);
    activeMsgsPollTimer = setTimeout(triggerActiveMsgsPoll, interval);
  }
}

async function loadActiveMessages() {
  if (!activeChatId || !adminToken) return;
  const requestedChatId = activeChatId;

  try {
    const res = await fetch(`/api/chat/messages?chatId=${encodeURIComponent(requestedChatId)}&reader=Raoprime`, {
      headers: { 'x-admin-token': adminToken || '' }
    });
    // Discard response if user switched to another chat while request was pending
    if (requestedChatId !== activeChatId) return;

    const data = await res.json();
    if (requestedChatId !== activeChatId) return;

    if (data.success && data.messages) {
      window.currentAdminCachedMessages = data.messages;
      if (typeof data.isEnded !== 'undefined') updateAdminEndChatButton(data.isEnded);
      const currentSig = data.messages.map(m => `${m.id}:${m.status || ''}:${m.isEdited ? '1' : '0'}:${JSON.stringify(m.reactions || {})}:${m.text || ''}`).join('|');
      if (currentSig !== lastAdminMsgSig) {
        const isNewLength = data.messages.length !== lastMsgCount;
        lastAdminMsgSig = currentSig;
        lastMsgCount = data.messages.length;
        renderAdminMessages(data.messages);
        if (isNewLength) {
          scrollAdminToBottom();
        }
      }

      // Check if client is typing or actively online
      const isClientTyping = Boolean(data.typing && (data.typing.Client || data.typing[requestedChatId]));
      const isClientOnline = Boolean(data.online && data.online.Client);
      updateAdminTypingUI(isClientOnline, isClientTyping);
    }
  } catch (err) {
    console.error('loadActiveMessages error:', err);
  }
}

function renderAdminMessages(messages) {
  const container = document.getElementById('adminMessagesList');
  if (!container) return;

  if (messages.length === 0) {
    container.innerHTML = `
      <div class="py-16 text-center text-slate-500 text-xs">
        <p>No messages yet in this conversation.</p>
        <p class="text-[11px] text-slate-600 mt-1">Send a message or document below to initiate.</p>
      </div>`;
    return;
  }

  let lastDateStr = '';

  try {
    container.innerHTML = messages.map((msg, index) => {
    const isRaoprime = msg.sender === 'Raoprime' || msg.sender === 'RP';
    const prevMsg = index > 0 ? messages[index - 1] : null;
    const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;

    const msgDate = new Date(msg.timestamp);
    const dateFormatted = msgDate.toDateString();
    let dateDividerHtml = '';

    const isNewDay = dateFormatted !== lastDateStr;
    if (isNewDay) {
      lastDateStr = dateFormatted;
      const now = new Date();
      let label = msgDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: msgDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
      if (dateFormatted === now.toDateString()) label = 'Today';
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      if (dateFormatted === yesterday.toDateString()) label = 'Yesterday';

      dateDividerHtml = `
        <div class="flex justify-center my-3 select-none">
          <span class="px-3.5 py-1 rounded-full bg-[#111520]/90 border border-white/10 text-[10.5px] font-semibold text-slate-400 tracking-wider uppercase backdrop-blur-md shadow-sm">
            ${label}
          </span>
        </div>
      `;
    }

    const isSameSenderAsPrev = !isNewDay && prevMsg && (prevMsg.sender === msg.sender || ((prevMsg.sender === 'Raoprime' || prevMsg.sender === 'RP') && isRaoprime));
    const isSameSenderAsNext = nextMsg && (nextMsg.sender === msg.sender || ((nextMsg.sender === 'Raoprime' || nextMsg.sender === 'RP') && isRaoprime)) && (new Date(nextMsg.timestamp)).toDateString() === dateFormatted;

    const topSpacing = isNewDay ? 'mt-1' : (isSameSenderAsPrev ? 'mt-1' : 'mt-3.5');
    const midClass = isSameSenderAsNext ? 'bubble-mid' : '';

    const timeFormatted = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const editedBadge = msg.isEdited ? `<span class="text-[9.5px] ${isRaoprime ? 'text-rose-200/80' : 'text-slate-400/80'} italic mr-0.5" title="Edited message">(edited)</span>` : '';
    const canEdit = Boolean(msg && msg.type === 'text');
    const isEditingThis = adminEditingMessageId === msg.id;

    // WhatsApp Quoted Reply card
    const quotedReplyHtml = msg.replyTo ? `
      <div class="mb-1.5 p-2 rounded-xl bg-black/25 border-l-[3.5px] border-rose-400 text-xs select-none">
        <div class="font-bold text-rose-300 text-[11px] leading-tight">${escapeHtml(msg.replyTo.sender)}</div>
        <div class="text-slate-300 truncate text-[12px] mt-0.5 leading-snug">${escapeHtml(msg.replyTo.text)}</div>
      </div>
    ` : '';

    // WhatsApp Reaction pill
    const reactionEntries = Object.entries(msg.reactions || {});
    const reactionBadgeHtml = reactionEntries.length ? `
      <div class="absolute -bottom-2.5 ${isRaoprime ? 'right-2.5' : 'left-2.5'} z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#111520] border border-white/20 text-xs shadow-md select-none hover:scale-105 transition-transform" title="Reactions: ${reactionEntries.map(([s, e]) => `${s}: ${e}`).join(', ')}">
        ${Array.from(new Set(reactionEntries.map(([, e]) => e))).map(e => `<span>${e}</span>`).join('')}
      </div>
    ` : '';

    // In-bubble time & status element
    const timeStatusHtml = `
      <span class="inline-flex items-center gap-0.5 shrink-0 select-none text-[10.5px] leading-none ${isRaoprime ? 'text-rose-200/80' : 'text-slate-400'}">
        ${editedBadge}
        <span class="tracking-tight">${timeFormatted}</span>
        ${renderAdminMessageStatus(msg.status, isRaoprime)}
      </span>
    `;

    if (msg.type === 'system') {
      return `
        ${dateDividerHtml}
        <div class="flex justify-center my-4 select-none animate-in fade-in zoom-in-95 duration-200">
          <div class="px-4 py-2 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-200 text-xs font-semibold flex items-center gap-2 backdrop-blur-md shadow-lg">
            <span class="w-2 h-2 rounded-full bg-rose-400 animate-pulse"></span>
            <span>${escapeHtml(msg.text || 'Your chat Ends')}</span>
          </div>
        </div>
      `;
    }

    let bubbleContent = '';

    if (msg.type === 'text') {
      bubbleContent = `
        <div class="px-3.5 pt-2 pb-1.5 min-w-[105px] w-fit">
          ${quotedReplyHtml}
          <div class="text-[14.5px] sm:text-[15px] bubble-text select-text">${formatAdminMessageText(msg.text)}</div>
          <div class="flex items-center justify-end gap-1 mt-1 -mb-0.5">
            ${timeStatusHtml}
          </div>
        </div>
      `;
    } else if (msg.type === 'file' && msg.file) {
      const f = msg.file;
      const ext = (f.originalName.split('.').pop() || '').toLowerCase();
      const isImg = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext);
      const isAudio = ['wav', 'mp3', 'flac', 'm4a', 'aiff', 'ogg'].includes(ext);
      const isVideo = ['mp4', 'mov', 'webm'].includes(ext);

      if (isImg) {
        bubbleContent = `
          <div class="overflow-hidden rounded-2xl min-w-[200px]">
            ${quotedReplyHtml ? `<div class="p-2">${quotedReplyHtml}</div>` : ''}
            <a href="${f.downloadUrl}" target="_blank" rel="noopener" class="block bg-black/40">
              <img src="${f.downloadUrl}?preview=1" alt="${escapeHtml(f.originalName)}" loading="lazy" class="max-w-[280px] sm:max-w-sm max-h-72 w-full object-cover hover:scale-[1.01] transition-transform duration-300">
            </a>
            <div class="p-2 sm:p-2.5 flex items-center justify-between text-xs border-t border-white/10 bg-black/30 backdrop-blur-md">
              <div class="min-w-0 pr-2">
                <span class="truncate block font-semibold text-[13px] text-white">${escapeHtml(f.originalName)}</span>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <span class="font-mono text-[10.5px] text-slate-300/80">${f.formattedSize}</span>
                  <span class="text-slate-500">•</span>
                  ${timeStatusHtml}
                </div>
              </div>
              <a href="${f.downloadUrl}" download class="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 active:scale-90 flex items-center justify-center text-white shrink-0 transition-all" aria-label="Download image" title="Download">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              </a>
            </div>
          </div>
        `;
      } else if (isAudio) {
        bubbleContent = `
          <div class="p-3 sm:p-3.5 space-y-2 max-w-[280px] sm:max-w-sm min-w-[220px]">
            ${quotedReplyHtml}
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-300 flex items-center justify-center shrink-0">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
              </div>
              <span class="text-[13px] font-semibold truncate text-white">${escapeHtml(f.originalName)}</span>
            </div>
            <audio src="${f.downloadUrl}" controls preload="metadata" class="w-full h-8 rounded-lg"></audio>
            <div class="flex items-center justify-between text-[10.5px] opacity-90 pt-0.5">
              <span class="font-mono text-slate-300">${f.formattedSize}</span>
              <div class="flex items-center gap-2">
                <a href="${f.downloadUrl}" download class="hover:underline font-semibold text-rose-300">Download</a>
                ${timeStatusHtml}
              </div>
            </div>
          </div>
        `;
      } else if (isVideo) {
        bubbleContent = `
          <div class="overflow-hidden rounded-2xl max-w-[280px] sm:max-w-sm min-w-[220px]">
            ${quotedReplyHtml ? `<div class="p-2">${quotedReplyHtml}</div>` : ''}
            <video src="${f.downloadUrl}" controls playsinline webkit-playsinline class="w-full max-h-72 object-cover bg-black"></video>
            <div class="p-2 sm:p-2.5 flex items-center justify-between text-xs border-t border-white/10 bg-black/30 backdrop-blur-md">
              <div class="min-w-0 pr-2">
                <span class="truncate block font-semibold text-[13px] text-white">${escapeHtml(f.originalName)}</span>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <span class="font-mono text-[10.5px] text-slate-300/80">${f.formattedSize}</span>
                  <span class="text-slate-500">•</span>
                  ${timeStatusHtml}
                </div>
              </div>
              <a href="${f.downloadUrl}" download class="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 active:scale-90 flex items-center justify-center text-white shrink-0 transition-all" title="Download">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              </a>
            </div>
          </div>
        `;
      } else {
        const tag = (ext || 'FILE').toUpperCase().slice(0, 4);
        bubbleContent = `
          <div class="p-3 sm:p-3.5 max-w-[280px] sm:max-w-sm min-w-[220px]">
            ${quotedReplyHtml}
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-300 flex flex-col items-center justify-center shrink-0 border border-rose-500/20">
                  <span class="text-[10px] font-black tracking-tighter uppercase">${tag}</span>
                </div>
                <div class="min-w-0">
                  <p class="text-[13px] font-semibold truncate text-white leading-tight" title="${escapeHtml(f.originalName)}">${escapeHtml(f.originalName)}</p>
                  <p class="text-[10.5px] text-slate-300/80 font-mono mt-0.5">${f.formattedSize}</p>
                </div>
              </div>
              <a href="${f.downloadUrl}" download class="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white shrink-0 flex items-center justify-center transition-all shadow-sm" title="Download">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              </a>
            </div>
            <div class="flex items-center justify-end mt-2 pt-1 border-t border-white/5">
              ${timeStatusHtml}
            </div>
          </div>
        `;
      }
    }

    // Sender Label:
    // Never show for outgoing Raoprime messages.
    // For incoming client messages, only show at start of cluster.
    const showSenderLabel = !isRaoprime && !isSameSenderAsPrev;
    const clientName = document.getElementById('activeClientName')?.textContent || msg.sender || 'Client';
    const senderHeaderHtml = showSenderLabel ? `
      <div class="text-[11px] font-semibold text-rose-300/90 mb-1 px-1.5 select-none flex items-center gap-1">
        <span>${escapeHtml(clientName)}</span>
      </div>
    ` : '';

    return `
      ${dateDividerHtml}
      <div class="admin-message-row flex flex-col ${isRaoprime ? 'items-end' : 'items-start'} ${topSpacing} ${reactionEntries.length ? 'mb-2' : ''} group relative" data-msg-id="${msg.id}" data-msg-sender="${msg.sender}">
        ${senderHeaderHtml}

        <div class="relative flex items-center gap-1.5 ${isRaoprime ? 'flex-row-reverse' : 'flex-row'} max-w-full">
          <!-- Main Bubble -->
          <div class="${isRaoprime ? 'bubble-admin-out' : 'bubble-admin-in'} ${midClass} shadow-md cursor-pointer select-text relative group/bubble ${isEditingThis ? 'ring-2 ring-rose-400 shadow-rose-500/30' : ''}">
            ${bubbleContent}
            ${reactionBadgeHtml}

            <!-- WhatsApp Bubble Chevron Button (Desktop Hover Only) -->
            <button type="button" onclick="openAdminMessageContextMenuById('${msg.id}', event)" class="message-action-btn absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/40 hover:bg-black/70 text-slate-300 hover:text-white opacity-0 sm:group-hover/bubble:opacity-100 flex items-center justify-center transition-all shadow-sm cursor-pointer z-10" title="Options">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          </div>

          <!-- Desktop Quick Actions Pill (1-Click Copy, Edit, Reply, React) -->
          <div class="hidden sm:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity select-none z-10 px-1 py-0.5 rounded-full bg-[#121622]/95 border border-white/10 backdrop-blur-md shadow-lg shrink-0">
            <button type="button" onclick="quickAdminReactMessage('${msg.id}', '👍', event)" class="p-1 hover:scale-125 transition-transform text-xs" title="React 👍">👍</button>
            <button type="button" onclick="quickAdminCopyMessage('${msg.id}', event)" class="p-1.5 text-slate-400 hover:text-sky-300 hover:bg-white/10 rounded-full transition-colors cursor-pointer" title="Copy Text">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            ${canEdit ? `
              <button type="button" onclick="quickAdminEditMessage('${msg.id}', event)" class="p-1.5 text-slate-400 hover:text-rose-300 hover:bg-white/10 rounded-full transition-colors cursor-pointer" title="Edit Message">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
              </button>
            ` : ''}
            <button type="button" onclick="quickAdminReplyMessage('${msg.id}', event)" class="p-1.5 text-slate-400 hover:text-emerald-300 hover:bg-white/10 rounded-full transition-colors cursor-pointer" title="Reply">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 17 4 12 9 7"></polyline>
                <path d="M20 18v-2a4 4 0 0 0-4-4H4"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
  } catch (renderErr) {
    console.error('renderAdminMessages error:', renderErr);
    container.innerHTML = `
      <div class="py-16 text-center text-slate-500 text-xs">
        <p class="text-rose-400 font-semibold">Unable to display messages</p>
        <p class="text-[11px] text-slate-600 mt-1">Please select another conversation or retry.</p>
      </div>`;
  }

  if (window.lucide) window.lucide.createIcons();
}

// ──────────────────────────────────────────────────────────────
// Send Reply as Raoprime & Message Edit
// ──────────────────────────────────────────────────────────────

async function sendAdminTextMessage() {
  if (!activeChatId) {
    showToast('Please select a client conversation from the list first');
    return;
  }

  const input = document.getElementById('adminMessageInput');
  const text = input ? input.value.trim() : '';
  if (!text) return;

  // If in edit mode, save edited message
  if (adminEditingMessageId) {
    try {
      const res = await fetch('/api/chat/message/edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken
        },
        body: JSON.stringify({
          chatId: activeChatId,
          messageId: adminEditingMessageId,
          text,
          sender: 'Raoprime'
        })
      });
      const data = await res.json();
      if (!data.success) {
        showToast('Edit error: ' + (data.error || 'Failed to edit'));
        return;
      }
      cancelAdminEditingMessage();
      loadActiveMessages();
      loadAdminChats();
      showToast('✓ Message updated');
    } catch (err) {
      showToast('Failed to edit message: ' + err.message);
    }
    return;
  }

  // Quoted reply payload if replying
  let replyPayload = undefined;
  if (adminReplyingMessageId) {
    const rMsg = (window.currentAdminCachedMessages || []).find(m => m.id === adminReplyingMessageId);
    if (rMsg) {
      replyPayload = {
        id: rMsg.id,
        sender: (rMsg.sender === 'Raoprime' || rMsg.sender === 'RP') ? 'Raoprime' : (rMsg.sender || 'Client'),
        text: rMsg.type === 'text' ? rMsg.text : (rMsg.file ? `[File] ${rMsg.file.originalName}` : 'Attachment')
      };
    }
    cancelAdminReplyMessage();
  }

  if (input) {
    input.value = '';
    input.style.height = 'auto';
  }

  // Reset typing immediately
  clearTimeout(typingTimeout);
  isCurrentlyTyping = false;
  sendAdminTypingStatus(false);

  // 1. Instant 0ms Optimistic UI Rendering (guarantees message appears instantly)
  const clientMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const optimisticMsg = {
    id: clientMsgId,
    chatId: activeChatId,
    sender: 'Raoprime',
    type: 'text',
    text,
    status: 'sent',
    timestamp: new Date().toISOString(),
    replyTo: replyPayload
  };
  if (!window.currentAdminCachedMessages) window.currentAdminCachedMessages = [];
  window.currentAdminCachedMessages.push(optimisticMsg);
  renderAdminMessages(window.currentAdminCachedMessages);
  scrollAdminToBottom();

  // 2. High-speed WebSocket delivery (0ms)
  const sentViaWs = sendAdminWsEvent('chat:message', {
    id: clientMsgId,
    chatId: activeChatId,
    sender: 'Raoprime',
    role: 'Raoprime',
    text,
    replyTo: replyPayload
  });

  // 3. Fallback to HTTP only if WebSocket is disconnected or failed
  if (!sentViaWs) {
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken
        },
        body: JSON.stringify({
          id: clientMsgId,
          chatId: activeChatId,
          sender: 'Raoprime',
          text,
          replyTo: replyPayload
        })
      });
      const data = await res.json();
      if (data.success && data.message) {
        const idx = window.currentAdminCachedMessages.findIndex(m => m.id === clientMsgId);
        if (idx >= 0) {
          window.currentAdminCachedMessages[idx] = data.message;
          renderAdminMessages(window.currentAdminCachedMessages);
        }
      } else if (data.error) {
        showToast('Notice: ' + data.error);
      }
      triggerActiveMsgsPoll();
      triggerAdminChatsPoll();
    } catch (err) {
      console.warn('HTTP send notice:', err);
    }
  }
}

// ──────────────────────────────────────────────────────────────
// WhatsApp-grade Admin Actions (Copy, Edit, Reply, Reactions)
// ──────────────────────────────────────────────────────────────

async function copyAdminTextToClipboard(text) {
  if (!text) return false;

  // 1. Modern Async Clipboard API
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('Admin clipboard API failed, attempting fallback:', err);
    }
  }

  // 2. Synchronous textarea fallback (tested on iOS Safari & Android WebView)
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '-9999px';
    ta.style.width = '2em';
    ta.style.height = '2em';
    ta.style.padding = '0';
    ta.style.border = 'none';
    ta.style.outline = 'none';
    ta.style.boxShadow = 'none';
    ta.style.background = 'transparent';
    ta.style.fontSize = '16px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const successful = document.execCommand('copy');
    document.body.removeChild(ta);
    return successful;
  } catch (err) {
    console.error('All admin copy methods failed:', err);
    return false;
  }
}

async function quickAdminCopyMessage(msgId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const msg = (window.currentAdminCachedMessages || []).find(m => m.id === msgId);
  if (!msg) return;

  let textToCopy = '';
  if (msg.type === 'text') {
    textToCopy = msg.text;
  } else if (msg.type === 'file' && msg.file) {
    textToCopy = window.location.origin + msg.file.downloadUrl;
  }
  if (!textToCopy) return;

  const ok = await copyAdminTextToClipboard(textToCopy);
  if (ok) {
    showToast('✓ Message copied to clipboard');
  } else {
    showToast('Failed to copy');
  }
}

function quickAdminEditMessage(msgId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const msg = (window.currentAdminCachedMessages || []).find(m => m.id === msgId);
  if (!msg) return;
  startAdminEditingMessage(msg);
}

function quickAdminReplyMessage(msgId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const msg = (window.currentAdminCachedMessages || []).find(m => m.id === msgId);
  if (!msg) return;
  startAdminReplyingMessage(msg);
}

async function quickAdminReactMessage(msgId, emoji, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  await reactToAdminMessage(msgId, emoji);
}

function setupAdminMessageContextMenu() {
  const container = document.getElementById('adminMessagesList');
  if (!container) return;

  // 1. Mouse Right-Click (Desktop)
  container.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.admin-message-row');
    if (!row) return;
    const msgId = row.dataset.msgId;
    if (!msgId) return;

    e.preventDefault();
    openAdminMessageContextMenuById(msgId, e);
  });

  // 2. Mobile Touch Long-Press (380ms)
  let touchTimer = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchTargetRow = null;

  container.addEventListener('touchstart', (e) => {
    if (e.target.closest('button, a, input, audio, video')) return;
    const row = e.target.closest('.admin-message-row');
    if (!row) return;
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchTargetRow = row;

    if (touchTimer) clearTimeout(touchTimer);
    touchTimer = setTimeout(() => {
      if (touchTargetRow) {
        const msgId = touchTargetRow.dataset.msgId;
        if (msgId) {
          if (navigator.vibrate) {
            try { navigator.vibrate(40); } catch (err) {}
          }
          adminIgnoreNextClickUntil = Date.now() + 450;
          openAdminMessageContextMenuById(msgId, { clientX: touchStartX, clientY: touchStartY });
        }
      }
    }, 380);
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (!touchTimer) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartX);
    const dy = Math.abs(touch.clientY - touchStartY);
    if (dx > 8 || dy > 8) {
      clearTimeout(touchTimer);
      touchTimer = null;
      touchTargetRow = null;
    }
  }, { passive: true });

  container.addEventListener('touchend', () => {
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }
    touchTargetRow = null;
  });

  container.addEventListener('touchcancel', () => {
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }
    touchTargetRow = null;
  });

  // Suppress synthetic clicks immediately after long-press release
  document.addEventListener('click', (e) => {
    if (Date.now() < adminIgnoreNextClickUntil) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    const menu = document.getElementById('adminMessageContextMenu');
    if (menu && !menu.classList.contains('hidden')) {
      if (!menu.contains(e.target) && !e.target.closest('.message-action-btn')) {
        closeAdminMessageContextMenu();
      }
    }
  }, true);

  const chatStream = document.getElementById('adminChatStream');
  if (chatStream) {
    chatStream.addEventListener('scroll', closeAdminMessageContextMenu, true);
  }
  window.addEventListener('scroll', closeAdminMessageContextMenu, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAdminMessageContextMenu();
      if (adminEditingMessageId) cancelAdminEditingMessage();
      if (adminReplyingMessageId) cancelAdminReplyMessage();
    }
  });
}

function openAdminMessageContextMenuById(msgId, event) {
  if (event) {
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
    if (typeof event.preventDefault === 'function' && event.cancelable) event.preventDefault();
  }
  const msg = (window.currentAdminCachedMessages || []).find(m => m.id === msgId);
  if (!msg) return;

  adminContextTargetMessage = msg;
  const menu = document.getElementById('adminMessageContextMenu');
  const backdrop = document.getElementById('adminContextMenuBackdrop');
  if (!menu) return;

  const editBtn = document.getElementById('adminCtxEditBtn');
  const canEdit = canAdminEditMessage(msg);
  if (editBtn) {
    if (canEdit) {
      editBtn.classList.remove('hidden');
    } else {
      editBtn.classList.add('hidden');
    }
  }

  if (backdrop) backdrop.classList.remove('hidden');
  menu.classList.remove('hidden');

  let targetX = 0;
  let targetY = 0;

  if (event && event.clientX && event.clientY) {
    targetX = event.clientX;
    targetY = event.clientY;
  } else {
    const row = document.querySelector(`.admin-message-row[data-msg-id="${msgId}"]`);
    if (row) {
      const rect = row.getBoundingClientRect();
      targetX = rect.left + rect.width / 2;
      targetY = rect.top + 25;
    }
  }

  const menuWidth = 200;
  const menuHeight = canEdit ? 180 : 135;

  let posX = targetX;
  let posY = targetY;

  if (posX + menuWidth > window.innerWidth - 12) {
    posX = window.innerWidth - menuWidth - 12;
  }
  if (posX < 12) posX = 12;

  if (posY + menuHeight > window.innerHeight - 12) {
    posY = Math.max(12, posY - menuHeight - 10);
  }
  if (posY < 12) posY = 12;

  menu.style.left = `${posX}px`;
  menu.style.top = `${posY}px`;

  if (window.lucide) window.lucide.createIcons();
}

function closeAdminMessageContextMenu() {
  const menu = document.getElementById('adminMessageContextMenu');
  const backdrop = document.getElementById('adminContextMenuBackdrop');
  if (menu && !menu.classList.contains('hidden')) {
    menu.classList.add('hidden');
  }
  if (backdrop && !backdrop.classList.contains('hidden')) {
    backdrop.classList.add('hidden');
  }
}

async function handleAdminContextCopy() {
  if (!adminContextTargetMessage) return;
  const msg = adminContextTargetMessage;

  let textToCopy = '';
  if (msg.type === 'text') {
    textToCopy = msg.text;
  } else if (msg.type === 'file' && msg.file) {
    textToCopy = window.location.origin + msg.file.downloadUrl;
  }
  if (!textToCopy) return;

  const ok = await copyAdminTextToClipboard(textToCopy);
  closeAdminMessageContextMenu();

  if (ok) {
    showToast('✓ Message copied to clipboard');
  } else {
    showToast('Failed to copy');
  }
}

function handleAdminContextEdit() {
  if (!adminContextTargetMessage) return;
  const msg = adminContextTargetMessage;
  closeAdminMessageContextMenu();
  startAdminEditingMessage(msg);
}

function handleAdminContextReply() {
  if (!adminContextTargetMessage) return;
  const msg = adminContextTargetMessage;
  closeAdminMessageContextMenu();
  startAdminReplyingMessage(msg);
}

async function handleAdminContextReact(emoji) {
  if (!adminContextTargetMessage) return;
  const msgId = adminContextTargetMessage.id;
  closeAdminMessageContextMenu();
  await reactToAdminMessage(msgId, emoji);
}

async function reactToAdminMessage(msgId, emoji) {
  try {
    const res = await fetch('/api/chat/message/react', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminToken
      },
      body: JSON.stringify({
        chatId: activeChatId,
        messageId: msgId,
        emoji,
        sender: 'Raoprime'
      })
    });
    const data = await res.json();
    if (data.success) {
      triggerActiveMsgsPoll();
    }
  } catch (e) {
    console.warn('React error:', e);
  }
}

function startAdminEditingMessage(msg) {
  if (!msg || msg.type !== 'text') return;
  if (adminReplyingMessageId) cancelAdminReplyMessage();
  adminEditingMessageId = msg.id;

  const banner = document.getElementById('adminEditBanner');
  const preview = document.getElementById('adminEditingPreviewText');
  const input = document.getElementById('adminMessageInput');
  const sendBtn = document.getElementById('adminSendBtn');

  if (banner) banner.classList.remove('hidden');
  if (preview) preview.textContent = msg.text;

  if (input) {
    input.value = msg.text;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    setTimeout(() => {
      input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }

  if (sendBtn) {
    sendBtn.innerHTML = '<svg class="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    sendBtn.title = 'Save edited message';
  }

  if (window.currentAdminCachedMessages) {
    renderAdminMessages(window.currentAdminCachedMessages);
  }

  if (window.lucide) window.lucide.createIcons();
}

function cancelAdminEditingMessage() {
  adminEditingMessageId = null;

  const banner = document.getElementById('adminEditBanner');
  const input = document.getElementById('adminMessageInput');
  const sendBtn = document.getElementById('adminSendBtn');

  if (banner) banner.classList.add('hidden');
  if (input) {
    input.value = '';
    input.style.height = 'auto';
  }

  if (sendBtn) {
    sendBtn.innerHTML = '<svg class="w-5 h-5 transition-transform group-hover:-translate-y-0.5 group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
    sendBtn.title = 'Send Reply';
  }

  if (window.currentAdminCachedMessages) {
    renderAdminMessages(window.currentAdminCachedMessages);
  }

  if (window.lucide) window.lucide.createIcons();
}

function startAdminReplyingMessage(msg) {
  if (!msg) return;
  if (adminEditingMessageId) cancelAdminEditingMessage();
  adminReplyingMessageId = msg.id;

  const banner = document.getElementById('adminReplyBanner');
  const senderLabel = document.getElementById('adminReplySenderLabel');
  const preview = document.getElementById('adminReplyPreviewText');
  const input = document.getElementById('adminMessageInput');

  if (banner) banner.classList.remove('hidden');
  const name = (msg.sender === 'Raoprime' || msg.sender === 'RP') ? 'Raoprime' : (msg.sender || 'Client');
  if (senderLabel) senderLabel.textContent = `Replying to ${name}`;
  if (preview) preview.textContent = msg.type === 'text' ? msg.text : (msg.file ? `[File] ${msg.file.originalName}` : 'Attachment');

  if (input) {
    input.focus();
    setTimeout(() => {
      input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }
}

function cancelAdminReplyMessage() {
  adminReplyingMessageId = null;
  const banner = document.getElementById('adminReplyBanner');
  if (banner) banner.classList.add('hidden');
}

// ──────────────────────────────────────────────────────────────
// Admin File Uploading (Mobile-Resilient Streaming, 1GB Support)
// ──────────────────────────────────────────────────────────────

let isAdminCurrentlyUploading = false;

async function onAdminFilesChosen(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  if (!activeChatId) {
    showToast('Please select a client conversation first');
    e.target.value = '';
    return;
  }

  if (isAdminCurrentlyUploading) {
    showToast('An upload is currently in progress. Please wait a moment.');
    return;
  }

  const fileList = Array.from(files);
  e.target.value = '';

  isAdminCurrentlyUploading = true;
  const activeCard = document.getElementById('adminActiveUploadCard');
  const fileNameEl = document.getElementById('adminUploadingFileName');
  const percentEl = document.getElementById('adminUploadingPercent');
  const barEl = document.getElementById('adminUploadingBar');
  const bytesEl = document.getElementById('adminUploadingBytes');
  const speedEl = document.getElementById('adminUploadingSpeed');
  const etaEl = document.getElementById('adminUploadingEta');

  if (activeCard) activeCard.classList.remove('hidden');
  scrollAdminToBottom();

  for (let fIdx = 0; fIdx < fileList.length; fIdx++) {
    const file = fileList[fIdx];
    if (file.size > 1024 * 1024 * 1024) {
      showToast('File "' + file.name + '" exceeds 1GB limit (' + formatBytes(file.size) + '). Max allowed is 1GB.');
      continue;
    }

    if (fileNameEl) fileNameEl.textContent = (fileList.length > 1 ? '(' + (fIdx + 1) + '/' + fileList.length + ') ' : '') + file.name;
    if (barEl) barEl.style.width = '0%';
    if (percentEl) percentEl.textContent = '0%';
    if (bytesEl) bytesEl.textContent = '0 / ' + formatBytes(file.size);
    if (speedEl) speedEl.textContent = '0 MB/s';
    if (etaEl) etaEl.textContent = '';

    const activeChunkSize = file.size > 8 * 1024 * 1024 ? 4 * 1024 * 1024 : 2 * 1024 * 1024;
    const uploadId = 'upl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const totalChunks = Math.max(1, Math.ceil(file.size / activeChunkSize));

    try {
      // 1. Init Upload Session
      const initRes = await fetch('/api/upload/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken || ''
        },
        body: JSON.stringify({
          uploadId,
          fileName: file.name,
          fileSize: file.size,
          totalChunks,
          chunkSize: activeChunkSize,
          fileType: file.type || 'application/octet-stream',
          chatId: activeChatId,
          sender: 'Raoprime'
        })
      });
      const initData = await initRes.json();
      if (!initRes.ok || !initData.success) {
        throw new Error(initData.error || 'Server init failed');
      }

      // 2. Stream Chunks with Retry, Speed & ETA tracking
      let lastUploaded = 0;
      let lastTime = Date.now();

      for (let cIdx = 0; cIdx < totalChunks; cIdx++) {
        const start = cIdx * activeChunkSize;
        const end = Math.min(file.size, start + activeChunkSize);
        const chunkBlob = file.slice(start, end);

        let sent = false;
        let retries = 0;
        let lastError = null;

        while (!sent && retries < 10) {
          try {
            const res = await fetch('/api/upload/chunk?uploadId=' + uploadId + '&chunkIndex=' + cIdx + '&totalChunks=' + totalChunks, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/octet-stream',
                'x-upload-id': uploadId,
                'x-chunk-index': cIdx.toString(),
                'x-total-chunks': totalChunks.toString(),
                'x-admin-token': adminToken || ''
              },
              body: chunkBlob
            });
            if (res.ok) {
              const cJson = await res.json();
              if (cJson.success) sent = true;
              else throw new Error(cJson.error || 'Chunk rejected');
            } else {
              throw new Error('HTTP ' + res.status);
            }
          } catch (e) {
            retries++;
            lastError = e;
            await new Promise(r => setTimeout(r, Math.min(3000, 350 * (retries + 1))));
          }
        }

        if (!sent) {
          throw new Error('Failed at chunk ' + (cIdx + 1) + '/' + totalChunks + ': ' + (lastError ? lastError.message : 'Network drop'));
        }

        const uploadedNow = Math.min(file.size, (cIdx + 1) * activeChunkSize);
        const percent = Math.min(99, Math.round((uploadedNow / file.size) * 100));
        if (barEl) barEl.style.width = percent + '%';
        if (percentEl) percentEl.textContent = percent + '%';
        if (bytesEl) bytesEl.textContent = formatBytes(uploadedNow) + ' / ' + formatBytes(file.size);

        const now = Date.now();
        const diff = (now - lastTime) / 1000;
        if (diff > 0.4) {
          const speed = (uploadedNow - lastUploaded) / diff;
          const formattedSpeed = (speed > 1024 * 1024) ? (speed / (1024 * 1024)).toFixed(1) + ' MB/s' : Math.round(speed / 1024) + ' KB/s';
          if (speedEl) speedEl.textContent = formattedSpeed;

          const remainingBytes = file.size - uploadedNow;
          if (speed > 0 && etaEl) {
            const remainingSec = Math.round(remainingBytes / speed);
            if (remainingSec < 60) {
              etaEl.textContent = 'ETA: ' + remainingSec + 's';
            } else {
              const mins = Math.floor(remainingSec / 60);
              const secs = remainingSec % 60;
              etaEl.textContent = 'ETA: ' + mins + 'm ' + secs + 's';
            }
          }
          lastUploaded = uploadedNow;
          lastTime = now;
        }
      }

      // 3. Finalize
      if (percentEl) percentEl.textContent = 'Finalizing...';
      const finRes = await fetch('/api/upload/finalize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken || ''
        },
        body: JSON.stringify({ uploadId })
      });
      const finData = await finRes.json();
      if (!finRes.ok || !finData.success) {
        throw new Error(finData.error || 'Server assembly error');
      }

      if (barEl) barEl.style.width = '100%';
      if (percentEl) percentEl.textContent = '100%';
      showToast('✓ File "' + file.name + '" sent successfully!');

      // Immediate 0ms local message rendering in chat
      if (finData && finData.message) {
        if (!Array.isArray(window.currentAdminCachedMessages)) {
          window.currentAdminCachedMessages = [];
        }
        const exists = window.currentAdminCachedMessages.some(m => m.id === finData.message.id);
        if (!exists) {
          window.currentAdminCachedMessages.push(finData.message);
          renderAdminMessages(window.currentAdminCachedMessages);
          scrollAdminToBottom();
        }
      }

      // Sync active conversation and chats list in background
      loadActiveMessages();
      triggerAdminChatsPoll();
    } catch (err) {
      console.error('Admin upload error:', err);
      showToast('Failed to upload ' + file.name + ': ' + err.message);
    }
  }

  isAdminCurrentlyUploading = false;
  setTimeout(() => {
    if (activeCard) activeCard.classList.add('hidden');
    if (barEl) barEl.style.width = '0%';
    if (percentEl) percentEl.textContent = '0%';
    if (etaEl) etaEl.textContent = '';
  }, 1200);
}

// Standalone single file helper
async function uploadAdminFile(file) {
  return onAdminFilesChosen({ target: { files: [file], value: '' } });
}

// ──────────────────────────────────────────────────────────────
// Helpers & Actions
// ──────────────────────────────────────────────────────────────

function scrollAdminToBottom() {
  const stream = document.getElementById('adminChatStream');
  if (stream) {
    stream.scrollTop = stream.scrollHeight;
  }
}

function copyClientLink() {
  if (!activeChatId) return;
  const base = window.location.origin;
  const link = `${base}/?chat=${encodeURIComponent(activeChatId)}`;
  navigator.clipboard.writeText(link).then(() => {
    showToast(`Client link copied!`);
  }).catch(() => {
    prompt('Copy link:', link);
  });
}

function downloadClientZip() {
  if (!activeChatId || !adminToken) return;
  window.location.href = `/api/admin/download-all/${encodeURIComponent(activeChatId)}?token=${encodeURIComponent(adminToken)}`;
}

// ──────────────────────────────────────────────────────────────
// Delete Conversation (Instant Deletion for Tests & Cleanups)
// ──────────────────────────────────────────────────────────────
let pendingDeleteChatId = null;

function confirmDeleteActiveChat() {
  if (!activeChatId) {
    showToast('No active conversation selected.');
    return;
  }
  const clientName = document.getElementById('activeClientName')?.textContent || activeChatId;
  confirmDeleteChat(activeChatId, clientName);
}

function confirmDeleteChat(chatId, clientName) {
  pendingDeleteChatId = chatId;
  const span = document.getElementById('deleteClientNameSpan');
  if (span) span.textContent = clientName || chatId;
  const modal = document.getElementById('deleteChatModal');
  if (modal) {
    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }
}

function closeDeleteModal() {
  pendingDeleteChatId = null;
  const modal = document.getElementById('deleteChatModal');
  if (modal) modal.classList.add('hidden');
}

async function executeDeleteChat() {
  if (!pendingDeleteChatId || !adminToken) return;
  const targetId = pendingDeleteChatId;
  closeDeleteModal();

  try {
    const res = await fetch(`/api/admin/chat/${encodeURIComponent(targetId)}?token=${encodeURIComponent(adminToken)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Chat "${targetId}" deleted.`);
      if (activeChatId === targetId) {
        activeChatId = null;
        lastMsgCount = 0;
        const container = document.getElementById('adminMessagesList');
        if (container) container.innerHTML = '';
        closeWorkspaceMobile();
      }
      await loadAdminChats();
    } else {
      showToast('Delete failed: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    showToast('Delete error: ' + err.message);
  }
}


function showToast(text) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = text;
  toast.classList.remove('hidden');
  toast.style.opacity = '1';
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 3000);
}

function escapeHtml(string) {
  const entityMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(string).replace(/[&<>"']/g, s => entityMap[s]);
}

// ──────────────────────────────────────────────────────────────
// Ultra HD WebRTC Calling Suite (Admin / Raoprime Console)
// Dynamic Authenticated TURN • Mobile-Resilient • Zero Echo
// ──────────────────────────────────────────────────────────────
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ],
  iceCandidatePoolSize: 10
};

async function getRtcConfiguration() {
  try {
    const res = await fetch('/api/call/ice-servers');
    const data = await res.json();
    if (data.success && data.config) {
      return data.config;
    }
  } catch (e) {
    console.warn('Admin ICE server fetch notice:', e);
  }
  return RTC_CONFIG;
}

function playConnectChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {}
}

let peerConnection = null;
let localStream = null;
let pendingCall = null;
let pendingCallChatId = null;
let isCallActive = false;
let isMicMuted = false;
let isCamOff = false;
let currentFacingMode = 'user';
let callPollInterval = null;
let lastSignalSeq = 0;
let pendingCandidates = [];
let ringtoneAudioCtx = null;
let ringtoneInterval = null;
let callStartTime = null;
let callDurationTimer = null;
let currentCallType = 'video';

// Background incoming call polling for Admin (Checks for calls from ANY client with in-flight guard)
let isCheckingAdminCall = false;
setInterval(checkAdminIncomingCalls, 5000);

async function checkAdminIncomingCalls() {
  if (isAdminWsConnected || isCallActive || !adminToken || isCheckingAdminCall) return;
  isCheckingAdminCall = true;
  try {
    const queryChat = activeChatId || 'all';
    const res = await fetch(`/api/call/status?role=admin&chatId=${encodeURIComponent(queryChat)}`);
    const data = await res.json();
    if (data.success && data.active && data.call) {
      if (data.call.caller !== 'Raoprime' && data.call.status === 'ringing') {
        if (!pendingCall) {
          pendingCall = data.call;
          pendingCallChatId = data.chatId || activeChatId || 'default';
          showAdminIncomingModal(data.call, pendingCallChatId);
        }
      } else if (data.call.status === 'ended') {
        cleanupCall();
      }
    } else if (data.call && data.call.status === 'ended') {
      cleanupCall();
    }
  } catch (e) {
  } finally {
    isCheckingAdminCall = false;
  }
}

function showAdminIncomingModal(call, cid) {
  const modal = document.getElementById('incomingCallModal');
  if (!modal) return;

  const callerNameEl = document.getElementById('incomingCallerName');
  const callTypeEl = document.getElementById('incomingCallType');
  const callerInitEl = document.getElementById('incomingCallerInitial');

  const name = call.caller || cid || 'Client';
  if (callerNameEl) callerNameEl.textContent = name;
  if (callerInitEl) callerInitEl.textContent = name.charAt(0).toUpperCase();
  if (callTypeEl) {
    const isVid = call.type === 'video';
    callTypeEl.innerHTML = `<i data-lucide="${isVid ? 'video' : 'phone'}" class="w-4 h-4"></i> Incoming 1080p Ultra HD ${isVid ? 'Video' : 'Voice'} Call...`;
    if (window.lucide) window.lucide.createIcons();
  }

  modal.classList.remove('hidden');
  playRingtone();
}

async function startAdminCall(type = 'video') {
  if (isCallActive) return;
  if (!activeChatId) {
    showToast('Please select a client chat first to call');
    return;
  }
  const targetChat = activeChatId;

  currentCallType = type;
  isCallActive = true;
  lastSignalSeq = 0;
  pendingCandidates = [];
  pendingSdpOffer = null;
  pendingCallChatId = targetChat;

  // 1. Prime and unlock browser audio & video contexts synchronously on user gesture
  const remoteAudioEl = document.getElementById('remoteAudio');
  if (remoteAudioEl) {
    remoteAudioEl.muted = false;
    remoteAudioEl.volume = 1.0;
    remoteAudioEl.play().catch(() => {});
  }
  const remoteVideoEl = document.getElementById('remoteVideo');
  if (remoteVideoEl) {
    remoteVideoEl.muted = false;
    remoteVideoEl.volume = 1.0;
    remoteVideoEl.play().catch(() => {});
  }

  const peerName = document.getElementById('activeClientName')?.textContent || targetChat;
  const initial = peerName.charAt(0).toUpperCase();

  const overlay = document.getElementById('callOverlay');
  const durationEl = document.getElementById('callDuration');
  const peerNameEl = document.getElementById('callOverlayPeerName');
  const visualizerEl = document.getElementById('audioCallVisualizer');
  const localContainer = document.getElementById('localVideoContainer');
  const camBtn = document.getElementById('camToggleBtn');
  const flipBtn = document.getElementById('flipCamBtn');
  const clientInitEl = document.getElementById('callOverlayClientInitial');
  const audioInitEl = document.getElementById('audioCallInitial');
  const audioPeerNameEl = document.getElementById('audioCallPeerName');

  if (overlay) overlay.classList.remove('hidden');
  if (peerNameEl) peerNameEl.textContent = peerName;
  if (clientInitEl) clientInitEl.textContent = initial;
  if (audioPeerNameEl) audioPeerNameEl.textContent = peerName;
  if (audioInitEl) audioInitEl.textContent = initial;
  if (durationEl) durationEl.textContent = 'Calling client...';

  if (type === 'audio') {
    if (visualizerEl) visualizerEl.classList.remove('hidden');
    if (remoteVideoEl) {
      remoteVideoEl.classList.add('opacity-0', 'pointer-events-none');
      remoteVideoEl.classList.remove('hidden');
    }
    if (localContainer) localContainer.classList.add('hidden');
    if (camBtn) camBtn.classList.add('hidden');
    if (flipBtn) flipBtn.classList.add('hidden');
  } else {
    if (visualizerEl) visualizerEl.classList.add('hidden');
    if (remoteVideoEl) {
      remoteVideoEl.classList.remove('opacity-0', 'pointer-events-none', 'hidden');
    }
    if (localContainer) localContainer.classList.remove('hidden');
    if (camBtn) camBtn.classList.remove('hidden');
    if (flipBtn) flipBtn.classList.remove('hidden');
  }

  // 2. Ring the client immediately on backend (WS + HTTP fallback)
  sendAdminWsEvent('call:initiate', { chatId: targetChat, caller: 'Raoprime', type });
  try {
    await fetch('/api/call/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: targetChat,
        caller: 'Raoprime',
        type
      })
    });
  } catch (e) {
    console.warn('Admin call initiate API notice:', e);
  }

  // 3. Acquire media and start WebRTC offer
  try {
    await acquireLocalMedia(type === 'video');
    await initPeerConnection(type === 'video');

    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: type === 'video'
    });
    await peerConnection.setLocalDescription(offer);
    await sendAdminCallSignal({ sdp: offer });

    if (!isAdminWsConnected) startSignalPolling();
    showToast(`HD ${type === 'video' ? 'Video' : 'Voice'} Call started...`);
  } catch (err) {
    console.error('Admin call media setup warning:', err);
    if (!isAdminWsConnected) startSignalPolling();
  }
}

async function acceptIncomingCall() {
  stopRingtone();
  const modal = document.getElementById('incomingCallModal');
  if (modal) modal.classList.add('hidden');

  if (!pendingCall) return;
  const call = pendingCall;
  const callChatId = pendingCallChatId || activeChatId || 'default';
  currentCallType = call.type || 'video';
  isCallActive = true;
  lastSignalSeq = 0;

  // Prime and unlock browser audio & video contexts synchronously on user gesture
  const remoteAudioEl = document.getElementById('remoteAudio');
  if (remoteAudioEl) {
    remoteAudioEl.muted = false;
    remoteAudioEl.volume = 1.0;
    remoteAudioEl.play().catch(() => {});
  }
  const remoteVideoEl = document.getElementById('remoteVideo');
  if (remoteVideoEl) {
    remoteVideoEl.muted = false;
    remoteVideoEl.volume = 1.0;
    remoteVideoEl.play().catch(() => {});
  }

  const peerName = call.caller || callChatId || 'Client';
  const initial = peerName.charAt(0).toUpperCase();

  const overlay = document.getElementById('callOverlay');
  const durationEl = document.getElementById('callDuration');
  const peerNameEl = document.getElementById('callOverlayPeerName');
  const visualizerEl = document.getElementById('audioCallVisualizer');
  const localContainer = document.getElementById('localVideoContainer');
  const camBtn = document.getElementById('camToggleBtn');
  const flipBtn = document.getElementById('flipCamBtn');
  const clientInitEl = document.getElementById('callOverlayClientInitial');
  const audioInitEl = document.getElementById('audioCallInitial');
  const audioPeerNameEl = document.getElementById('audioCallPeerName');

  if (overlay) overlay.classList.remove('hidden');
  if (peerNameEl) peerNameEl.textContent = peerName;
  if (clientInitEl) clientInitEl.textContent = initial;
  if (audioPeerNameEl) audioPeerNameEl.textContent = peerName;
  if (audioInitEl) audioInitEl.textContent = initial;
  if (durationEl) durationEl.textContent = 'Connecting HD...';

  if (currentCallType === 'audio') {
    if (visualizerEl) visualizerEl.classList.remove('hidden');
    if (remoteVideoEl) {
      remoteVideoEl.classList.add('opacity-0', 'pointer-events-none');
      remoteVideoEl.classList.remove('hidden');
    }
    if (localContainer) localContainer.classList.add('hidden');
    if (camBtn) camBtn.classList.add('hidden');
    if (flipBtn) flipBtn.classList.add('hidden');
  } else {
    if (visualizerEl) visualizerEl.classList.add('hidden');
    if (remoteVideoEl) {
      remoteVideoEl.classList.remove('opacity-0', 'pointer-events-none', 'hidden');
    }
    if (localContainer) localContainer.classList.remove('hidden');
    if (camBtn) camBtn.classList.remove('hidden');
    if (flipBtn) flipBtn.classList.remove('hidden');
  }

  // Notify backend call is accepted immediately (WS + HTTP)
  sendAdminWsEvent('call:accept', { chatId: callChatId });
  try {
    await fetch('/api/call/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: callChatId })
    });
  } catch (e) {}

  try {
    await acquireLocalMedia(currentCallType === 'video');
    await initPeerConnection(currentCallType === 'video');

    // Deliver buffered SDP offer immediately if already arrived
    if (pendingSdpOffer) {
      const offer = pendingSdpOffer;
      pendingSdpOffer = null;
      await handleIncomingSignal({ sdp: offer });
    }

    if (!isAdminWsConnected) startSignalPolling();
    showToast('Ultra HD connected!');
  } catch (err) {
    console.error('Admin accept setup warning:', err);
    if (!isAdminWsConnected) startSignalPolling();
  }
}

async function declineCall() {
  stopRingtone();
  const modal = document.getElementById('incomingCallModal');
  if (modal) modal.classList.add('hidden');

  const callChatId = pendingCallChatId || activeChatId || 'default';
  sendAdminWsEvent('call:end', { chatId: callChatId });
  await fetch('/api/call/end', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: callChatId })
  }).catch(() => {});
  
  pendingCall = null;
  pendingCallChatId = null;
  pendingSdpOffer = null;
  pendingCandidates = [];
}

async function endCall() {
  const callChatId = pendingCallChatId || activeChatId || 'default';
  sendAdminWsEvent('call:end', { chatId: callChatId });
  await fetch('/api/call/end', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: callChatId })
  }).catch(() => {});
  cleanupCall();
  showToast('Call ended');
}

async function acquireLocalMedia(isVideo) {
  let stream = null;
  if (isVideo) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: { facingMode: currentFacingMode }
      });
    } catch (e1) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      } catch (e2) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e3) {
          console.warn('Admin mic & camera permission notice:', e3);
        }
      }
    }
  } else {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
    } catch (e1) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e2) {
        console.warn('Admin mic permission notice:', e2);
      }
    }
  }

  // Graceful synthetic track fallback so WebRTC never crashes
  if (!stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const dest = ctx.createMediaStreamDestination();
        stream = dest.stream;
      }
    } catch (e) {}
    if (!stream) {
      try { stream = new MediaStream(); } catch (e) {}
    }
  }

  localStream = stream;
  const localVideoEl = document.getElementById('localVideo');
  if (localVideoEl && localStream && localStream.getVideoTracks().length > 0) {
    localVideoEl.srcObject = localStream;
  }
}

async function initPeerConnection(isVideo) {
  const config = await getRtcConfiguration();
  peerConnection = new RTCPeerConnection(config);

  if (localStream) {
    localStream.getTracks().forEach(track => {
      try {
        peerConnection.addTrack(track, localStream);
      } catch (e) {}
    });
  }

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && event.candidate.candidate) {
      sendAdminCallSignal({ candidate: event.candidate });
    }
  };

  const remoteAudioEl = document.getElementById('remoteAudio');
  const remoteVideoEl = document.getElementById('remoteVideo');

  peerConnection.ontrack = (event) => {
    console.log('📡 Got remote track (admin):', event.track.kind);
    const track = event.track;

    if (track.kind === 'audio') {
      if (remoteAudioEl) {
        const audioStream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([track]);
        remoteAudioEl.srcObject = audioStream;
        remoteAudioEl.muted = false;
        remoteAudioEl.volume = 1.0;
        remoteAudioEl.play().catch(e => console.warn('Audio play notice (admin):', e));
      }
    } else if (track.kind === 'video') {
      if (remoteVideoEl) {
        const videoStream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([track]);
        remoteVideoEl.srcObject = videoStream;
        // Keep video muted so it doesn't fight remoteAudio for speaker access!
        remoteVideoEl.muted = true;
        remoteVideoEl.play().catch(e => console.warn('Video play notice (admin):', e));
      }
    }
  };

  peerConnection.onconnectionstatechange = () => {
    console.log('Peer connection state (admin):', peerConnection.connectionState);
    if (peerConnection.connectionState === 'connected') {
      startCallDurationTimer();
      playConnectChime();
      if (remoteAudioEl) {
        remoteAudioEl.muted = false;
        remoteAudioEl.volume = 1.0;
        remoteAudioEl.play().catch(() => {});
      }
      if (remoteVideoEl) remoteVideoEl.play().catch(() => {});
      showToast('1080p Ultra HD Connected • Encrypted');
    } else if (peerConnection.connectionState === 'failed') {
      if (peerConnection.restartIce) {
        peerConnection.restartIce();
      }
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    console.log('ICE connection state (admin):', peerConnection.iceConnectionState);
    if (peerConnection.iceConnectionState === 'connected' || peerConnection.iceConnectionState === 'completed') {
      startCallDurationTimer();
      if (remoteAudioEl) {
        remoteAudioEl.muted = false;
        remoteAudioEl.volume = 1.0;
        remoteAudioEl.play().catch(() => {});
      }
      if (remoteVideoEl) remoteVideoEl.play().catch(() => {});
    }
  };
}

async function sendAdminCallSignal(signal) {
  const targetChatId = pendingCallChatId || activeChatId || 'default';
  // Send over WebSocket first in 0ms!
  if (sendAdminWsEvent('call:signal', { signal, from: 'Raoprime', chatId: targetChatId })) {
    return;
  }
  // Secondary HTTP fallback
  try {
    await fetch('/api/call/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: targetChatId,
        from: 'Raoprime',
        signal
      })
    });
  } catch (e) {}
}

function startSignalPolling() {
  if (callPollInterval) clearInterval(callPollInterval);
  // WebSocket streams signals with 0ms delay! Only run polling as fallback.
  if (isAdminWsConnected) return;

  callPollInterval = setInterval(async () => {
    if (!isCallActive || isAdminWsConnected) {
      clearInterval(callPollInterval);
      return;
    }
    const targetChatId = pendingCallChatId || activeChatId || 'default';

    try {
      const res = await fetch(`/api/call/signals?chatId=${encodeURIComponent(targetChatId)}&forRole=Raoprime&since=${lastSignalSeq}`);
      const data = await res.json();
      if (data.status === 'ended') {
        cleanupCall();
        showToast('Call ended by client');
        return;
      }
      if (data.signals && data.signals.length > 0) {
        for (const item of data.signals) {
          if (item.seq && item.seq > lastSignalSeq) {
            lastSignalSeq = item.seq;
          }
          await handleIncomingSignal(item.signal);
        }
      }
    } catch (e) {}
  }, 1000);
}

async function handleIncomingSignal(sig) {
  if (!peerConnection) {
    if (sig.sdp && sig.sdp.type === 'offer') pendingSdpOffer = sig.sdp;
    if (sig.candidate) pendingCandidates.push(sig.candidate);
    return;
  }

  try {
    if (sig.sdp) {
      if (sig.sdp.type === 'offer') {
        if (peerConnection.signalingState !== 'stable') {
          console.warn('Admin signaling state not stable for offer:', peerConnection.signalingState);
        }
        await peerConnection.setRemoteDescription(new RTCSessionDescription(sig.sdp));
        // Flush pending candidates now that remote description is set
        while (pendingCandidates.length > 0) {
          const cand = pendingCandidates.shift();
          try { await peerConnection.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
        }

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await sendAdminCallSignal({ sdp: answer });
      } else if (sig.sdp.type === 'answer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(sig.sdp));
        // Flush pending candidates
        while (pendingCandidates.length > 0) {
          const cand = pendingCandidates.shift();
          try { await peerConnection.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
        }
        startCallDurationTimer();
        playConnectChime();
      }
    } else if (sig.candidate) {
      if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(sig.candidate));
        } catch (e) {
          console.warn('ICE add notice (admin):', e);
        }
      } else {
        pendingCandidates.push(sig.candidate);
      }
    }
  } catch (err) {
    console.warn('Admin signal handling notice:', err);
  }
}

function toggleCallMic() {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    isMicMuted = !audioTrack.enabled;
    const btn = document.getElementById('micToggleBtn');
    const icon = document.getElementById('micIcon');
    if (isMicMuted) {
      btn.classList.add('bg-red-600', 'text-white');
      btn.classList.remove('bg-white/10');
      icon.setAttribute('data-lucide', 'mic-off');
    } else {
      btn.classList.remove('bg-red-600');
      btn.classList.add('bg-white/10');
      icon.setAttribute('data-lucide', 'mic');
    }
    if (window.lucide) window.lucide.createIcons();
    showToast(isMicMuted ? 'Microphone Muted' : 'Microphone Unmuted');
  }
}

function toggleCallCamera() {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    isCamOff = !videoTrack.enabled;
    const btn = document.getElementById('camToggleBtn');
    const icon = document.getElementById('camIcon');
    if (isCamOff) {
      btn.classList.add('bg-red-600', 'text-white');
      btn.classList.remove('bg-white/10');
      icon.setAttribute('data-lucide', 'video-off');
    } else {
      btn.classList.remove('bg-red-600');
      btn.classList.add('bg-white/10');
      icon.setAttribute('data-lucide', 'video');
    }
    if (window.lucide) window.lucide.createIcons();
    showToast(isCamOff ? 'Camera Turned Off' : 'Camera Turned On');
  }
}

async function flipCamera() {
  if (!localStream || currentCallType !== 'video') return;
  currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

  try {
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        facingMode: currentFacingMode
      }
    });

    const newVideoTrack = newStream.getVideoTracks()[0];
    const oldVideoTrack = localStream.getVideoTracks()[0];

    if (oldVideoTrack) {
      oldVideoTrack.stop();
      localStream.removeTrack(oldVideoTrack);
    }
    localStream.addTrack(newVideoTrack);

    const localVideoEl = document.getElementById('localVideo');
    if (localVideoEl) {
      localVideoEl.srcObject = localStream;
      if (currentFacingMode === 'user') {
        localVideoEl.classList.add('mirror');
      } else {
        localVideoEl.classList.remove('mirror');
      }
    }

    if (peerConnection && peerConnection.getSenders) {
      const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        await sender.replaceTrack(newVideoTrack);
      }
    }
    showToast(`Camera switched to ${currentFacingMode === 'user' ? 'Front' : 'Back'}`);
  } catch (err) {
    showToast('Failed to switch camera: ' + err.message);
  }
}

function startCallDurationTimer() {
  if (callDurationTimer) clearInterval(callDurationTimer);
  callStartTime = Date.now();
  const el = document.getElementById('callDuration');
  callDurationTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    if (el) el.textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopCallDurationTimer() {
  if (callDurationTimer) {
    clearInterval(callDurationTimer);
    callDurationTimer = null;
  }
  const el = document.getElementById('callDuration');
  if (el) el.textContent = '00:00';
}

function playRingtone() {
  try {
    stopRingtone();
    ringtoneAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    const playChime = () => {
      if (!ringtoneAudioCtx || ringtoneAudioCtx.state === 'closed') return;
      const now = ringtoneAudioCtx.currentTime;
      
      const osc1 = ringtoneAudioCtx.createOscillator();
      const gain1 = ringtoneAudioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.18, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc1.connect(gain1);
      gain1.connect(ringtoneAudioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.5);

      const osc2 = ringtoneAudioCtx.createOscillator();
      const gain2 = ringtoneAudioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.2);
      gain2.gain.setValueAtTime(0.2, now + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc2.connect(gain2);
      gain2.connect(ringtoneAudioCtx.destination);
      osc2.start(now + 0.2);
      osc2.stop(now + 0.8);

      const osc3 = ringtoneAudioCtx.createOscillator();
      const gain3 = ringtoneAudioCtx.createGain();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(1174.66, now + 0.4);
      gain3.gain.setValueAtTime(0.22, now + 0.4);
      gain3.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      osc3.connect(gain3);
      gain3.connect(ringtoneAudioCtx.destination);
      osc3.start(now + 0.4);
      osc3.stop(now + 1.2);
    };

    playChime();
    ringtoneInterval = setInterval(playChime, 2500);
  } catch (e) {}
}

function stopRingtone() {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
  if (ringtoneAudioCtx) {
    try { ringtoneAudioCtx.close(); } catch (e) {}
    ringtoneAudioCtx = null;
  }
}

function cleanupCall() {
  stopRingtone();
  stopCallDurationTimer();

  if (callPollInterval) {
    clearInterval(callPollInterval);
    callPollInterval = null;
  }

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }

  if (peerConnection) {
    try { peerConnection.close(); } catch (e) {}
    peerConnection = null;
  }

  isCallActive = false;
  pendingCall = null;
  pendingCallChatId = null;
  pendingSdpOffer = null;
  pendingCandidates = [];
  isMicMuted = false;
  isCamOff = false;

  const overlay = document.getElementById('callOverlay');
  if (overlay) overlay.classList.add('hidden');

  const modal = document.getElementById('incomingCallModal');
  if (modal) modal.classList.add('hidden');

  const remoteVideoEl = document.getElementById('remoteVideo');
  if (remoteVideoEl) remoteVideoEl.srcObject = null;

  const remoteAudioEl = document.getElementById('remoteAudio');
  if (remoteAudioEl) remoteAudioEl.srcObject = null;

  const localVideoEl = document.getElementById('localVideo');
  if (localVideoEl) localVideoEl.srcObject = null;

  const micBtn = document.getElementById('micToggleBtn');
  const micIcon = document.getElementById('micIcon');
  if (micBtn) {
    micBtn.classList.remove('bg-red-600');
    micBtn.classList.add('bg-white/10');
  }
  if (micIcon) micIcon.setAttribute('data-lucide', 'mic');

  const camBtn = document.getElementById('camToggleBtn');
  const camIcon = document.getElementById('camIcon');
  if (camBtn) {
    camBtn.classList.remove('bg-red-600');
    camBtn.classList.add('bg-white/10');
  }
  if (camIcon) camIcon.setAttribute('data-lucide', 'video');

  if (window.lucide) window.lucide.createIcons();
}


