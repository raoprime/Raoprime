/**
 * Raoprime — Executive Instagram DM Style Client Chat & Vault
 * Mobile-First High-Performance Architecture
 */

const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks (Optimized for Vercel Serverless & Mobile)

// State
let currentChatId = 'default';
let currentRole = 'Client'; // 'Client' or 'Raoprime'

// End Chat & Session Conclusion Logic
function updateChatEndedState(isEnded) {
  window.currentChatIsEnded = Boolean(isEnded);
  const composer = document.getElementById('messageComposerContainer');
  const endedDock = document.getElementById('chatEndedDock');
  if (!composer || !endedDock) return;
  if (isEnded) {
    composer.classList.add('hidden');
    endedDock.classList.remove('hidden');
    endedDock.classList.add('flex');
  } else {
    composer.classList.remove('hidden');
    endedDock.classList.add('hidden');
    endedDock.classList.remove('flex');
  }
}

function startFreshNewChat() {
  const freshId = 'Client_' + Date.now().toString().slice(-6);
  localStorage.setItem('raoprime_client', freshId);
  window.location.href = '/?chatId=' + encodeURIComponent(freshId);
}

let lastMessagesCount = 0;
let isCurrentlyUploading = false;
let typingTimeout = null;
let isCurrentlyTyping = false;

// ⚡ Ultra-Low-Latency WebSocket Real-Time Engine (0ms delivery for Chat & 1080p Calling)
let appWs = null;
let isWsConnected = false;
let wsReconnectTimer = null;
let pendingSdpOffer = null;

function initAppWebSocket() {
  if (appWs && (appWs.readyState === WebSocket.OPEN || appWs.readyState === WebSocket.CONNECTING)) {
    return;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  try {
    appWs = new WebSocket(wsUrl);

    appWs.onopen = () => {
      isWsConnected = true;
      console.log('⚡ Ultra-fast real-time WebSocket connected');
      sendWsEvent('join', { chatId: currentChatId, role: currentRole, sender: currentRole });
      loadMessages();
    };

    appWs.onmessage = async (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        handleWsEvent(payload);
      } catch (err) {
        console.warn('WS message parse error:', err);
      }
    };

    appWs.onerror = () => {};

    appWs.onclose = () => {
      isWsConnected = false;
      if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
      wsReconnectTimer = setTimeout(initAppWebSocket, 3000);
    };
  } catch (err) {
    if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
    wsReconnectTimer = setTimeout(initAppWebSocket, 5000);
  }
}

function sendWsEvent(event, data = {}) {
  if (appWs && appWs.readyState === WebSocket.OPEN) {
    try {
      appWs.send(JSON.stringify({ event, chatId: currentChatId, role: currentRole, sender: currentRole, ...data }));
      return true;
    } catch (e) {
      console.warn('WS send error:', e);
    }
  }
  return false;
}

async function handleWsEvent(payload) {
  const { event, chatId } = payload;
  const currentNorm = (currentChatId || '').toLowerCase().trim();
  const eventNorm = (chatId || '').toLowerCase().trim();

  // Ignore events meant exclusively for other rooms
  if (eventNorm && eventNorm !== currentNorm && eventNorm !== 'all') {
    return;
  }

  switch (event) {
    case 'chat:verification-updated': {
      if (payload && payload.chatId === currentChatId) {
        currentClientVerification = {
          verified: Boolean(payload.verified),
          status: payload.status || (payload.verified ? 'verified' : (payload.photoUrl ? 'pending' : 'none')),
          provider: payload.provider || currentClientVerification.provider || 'custom',
          photoUrl: payload.photoUrl || currentClientVerification.photoUrl,
          email: payload.email || currentClientVerification.email,
          name: payload.name || currentClientVerification.name,
          phoneNumber: payload.phoneNumber || currentClientVerification.phoneNumber,
          verifiedAt: payload.verifiedAt || currentClientVerification.verifiedAt
        };
        updateClientProfileHeaderUI();
      }
      break;
    }
    case 'chat:verification-requested': {
      if (payload.chatId && payload.chatId.toLowerCase() === (currentChatId || '').toLowerCase()) {
        showVerificationRequestedBanner();
        showToast('⚠️ Raoprime requested you to add your photo to verify your identity');
      }
      break;
    }
    case 'chat:ended': {
      if (payload.chatId === currentChatId) {
        updateChatEndedState(payload.isEnded);
        loadMessages();
      }
      break;
    }

    case 'chat:message': {
      const msg = payload.message;
      if (!msg) return;
      if (!window.currentCachedMessages) window.currentCachedMessages = [];
      const inDom = document.querySelector(`.message-row[data-msg-id="${msg.id}"]`);
      if (!inDom) {
        window.currentCachedMessages.push(msg);
        renderMessages(window.currentCachedMessages);
        scrollToBottom();
        if (msg.sender !== currentRole) {
          playMessageSound();
          showDeviceSystemNotification(msg);
          sendWsEvent('chat:read', { reader: currentRole });
        }
      }
      break;
    }

    case 'chat:typing': {
      if (payload.sender !== currentRole) {
        updateTypingUI(true, Boolean(payload.isTyping));
      }
      break;
    }

    case 'chat:presence': {
      updateTypingUI(Boolean(payload.isAdminOnline), false);
      break;
    }

    case 'chat:read': {
      if (window.currentCachedMessages) {
        let changed = false;
        window.currentCachedMessages.forEach(m => {
          if (m.sender === currentRole && m.status !== 'seen') {
            m.status = 'seen';
            changed = true;
          }
        });
        if (changed) renderMessages(window.currentCachedMessages);
      }
      break;
    }

    case 'chat:reaction': {
      if (window.currentCachedMessages && payload.messageId) {
        const target = window.currentCachedMessages.find(m => m.id === payload.messageId);
        if (target) {
          target.reactions = payload.reactions;
          renderMessages(window.currentCachedMessages);
        }
      }
      break;
    }

    case 'chat:edited': {
      if (window.currentCachedMessages && payload.messageId) {
        const target = window.currentCachedMessages.find(m => m.id === payload.messageId);
        if (target) {
          target.text = payload.text;
          target.isEdited = true;
          renderMessages(window.currentCachedMessages);
        }
      }
      break;
    }

    case 'chat:deleted': {
      if (window.currentCachedMessages && payload.messageId) {
        window.currentCachedMessages = window.currentCachedMessages.filter(m => m.id !== payload.messageId);
        renderMessages(window.currentCachedMessages);
      }
      break;
    }

    case 'chat:renamed': {
      if (currentChatId && currentChatId.toLowerCase() === (payload.oldChatId || '').toLowerCase()) {
        currentChatId = payload.newChatId;
        localStorage.setItem('raoprime_client', currentChatId);
        sendWsEvent('join', { chatId: currentChatId, role: currentRole, sender: currentRole });
      }
      break;
    }

    case 'call:incoming':
    case 'call:signal':
    case 'call:accepted':
    case 'call:ended': {
      break;
    }
  }
}

// Official Luxury Acoustic Double-Ping Chime
function playLuxuryChime() {
  if (typeof window !== 'undefined' && localStorage.getItem('raoprime_sound_enabled') === 'false') {
    return; // User muted message chimes
  }
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;

    // Tone 1: 880 Hz (A5 harmonic)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.14, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Tone 2: 1320 Hz (E6 pure fifth above)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1320, now + 0.08);
    gain2.gain.setValueAtTime(0.16, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.48);
  } catch (e) {}
}

function playMessageSound() {
  playLuxuryChime();
}

// Native Android / Desktop OS Notification Panel Alerts
function initServiceWorkerAndNotifications() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js?v=2.4')
      .then(reg => {
        console.log('Raoprime ServiceWorker active:', reg.scope);
      })
      .catch(err => console.warn('SW registration notice:', err));
  }
  updateNotificationUi();

  // If permission is still default, quietly request on first user interaction click/tap
  if ('Notification' in window && Notification.permission === 'default') {
    const handleFirstUserGesture = () => {
      document.removeEventListener('click', handleFirstUserGesture);
      document.removeEventListener('touchstart', handleFirstUserGesture);
      if (Notification.permission === 'default' && !sessionStorage.getItem('rp_notif_banner_dismissed')) {
        requestNotificationPermission().catch(() => {});
      }
    };
    document.addEventListener('click', handleFirstUserGesture, { once: true });
    document.addEventListener('touchstart', handleFirstUserGesture, { once: true });
  }
}

function updateNotificationUi() {
  const banner = document.getElementById('notifPermissionBanner');
  const bellBtn = document.getElementById('notifBellBtn');
  const bellIcon = document.getElementById('notifBellIcon');
  const bellDot = document.getElementById('notifBellDot');
  const bellBadge = document.getElementById('notifBellBadge');

  if (!('Notification' in window)) {
    if (banner) banner.classList.add('hidden');
    if (bellBtn) bellBtn.classList.add('hidden');
    return;
  }

  const perm = Notification.permission;
  const isDismissed = sessionStorage.getItem('rp_notif_banner_dismissed') === '1';

  if (perm === 'granted') {
    if (banner) banner.classList.add('hidden');
    if (bellBtn) {
      bellBtn.classList.remove('hidden');
      bellBtn.title = '🔔 Notifications Active (Click to test alert)';
    }
    if (bellIcon) {
      bellIcon.classList.remove('text-amber-400', 'text-zinc-300', 'text-slate-200');
      bellIcon.classList.add('text-emerald-400');
    }
    if (bellDot) {
      bellDot.classList.remove('bg-amber-400', 'bg-rose-500', 'hidden');
      bellDot.classList.add('bg-emerald-400');
    }
    if (bellBadge) bellBadge.classList.add('hidden');
  } else if (perm === 'denied') {
    if (banner) banner.classList.add('hidden');
    if (bellBtn) {
      bellBtn.classList.remove('hidden');
      bellBtn.title = '⚠️ Notifications Blocked in Browser Settings (Click for help)';
    }
    if (bellIcon) {
      bellIcon.classList.remove('text-emerald-400', 'text-amber-400');
      bellIcon.classList.add('text-zinc-300');
    }
    if (bellDot) {
      bellDot.classList.remove('bg-emerald-400', 'bg-amber-400', 'hidden');
      bellDot.classList.add('bg-rose-500');
    }
    if (bellBadge) bellBadge.classList.add('hidden');
  } else {
    // default
    if (banner) {
      if (isDismissed) banner.classList.add('hidden');
      else banner.classList.remove('hidden');
    }
    if (bellBtn) {
      bellBtn.classList.remove('hidden');
      bellBtn.title = '🔔 Turn on Device Notifications';
    }
    if (bellIcon) {
      bellIcon.classList.remove('text-emerald-400', 'text-zinc-300');
      bellIcon.classList.add('text-amber-400');
    }
    if (bellDot) {
      bellDot.classList.remove('bg-emerald-400', 'bg-rose-500');
      bellDot.classList.add('bg-amber-400');
      bellDot.classList.remove('hidden');
    }
    if (bellBadge) {
      bellBadge.classList.remove('hidden');
    }
  }
}

async function toggleOrRequestNotification() {
  if (!('Notification' in window)) {
    showToast('Notifications are not supported on this browser.');
    return;
  }
  if (Notification.permission === 'granted') {
    playLuxuryChime();
    showToast('🔔 Notifications active! Test alert sent.');
    showDeviceSystemNotification({
      sender: 'Raoprime',
      text: '🔔 Test alert: Notifications are fully active on this device!',
      id: 'test_alert_' + Date.now()
    }, true);
    return;
  }
  if (Notification.permission === 'denied') {
    showToast('⚠️ Notifications blocked. Tap 🔒 in browser address bar to allow.');
    return;
  }
  await requestNotificationPermission();
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('Notifications are not supported on this browser.');
    return;
  }
  try {
    let perm = Notification.permission;
    if (typeof Notification.requestPermission === 'function') {
      const p = Notification.requestPermission();
      if (p && typeof p.then === 'function') {
        perm = await p;
      } else {
        perm = await new Promise(resolve => Notification.requestPermission(resolve));
      }
    }
    updateNotificationUi();
    if (perm === 'granted') {
      playLuxuryChime();
      showToast('🔔 Device notification alerts active!');
      showDeviceSystemNotification({
        sender: 'Raoprime',
        text: 'Notification alerts enabled! You will be notified instantly in your status bar when Raoprime messages you.',
        id: 'welcome_alert_' + Date.now()
      }, true);
    } else if (perm === 'denied') {
      showToast('Notifications were disabled in browser settings.');
    }
  } catch (err) {
    console.warn('Notification permission error:', err);
  }
}

function dismissNotificationBanner() {
  sessionStorage.setItem('rp_notif_banner_dismissed', '1');
  const banner = document.getElementById('notifPermissionBanner');
  if (banner) banner.classList.add('hidden');
}

function showDeviceSystemNotification(msg, force = false) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  // If user is actively focused on this tab, skip OS notification bar spam unless forced (e.g. test)
  if (!force && !document.hidden && document.hasFocus()) return;

  const senderTitle = msg.sender === 'Raoprime' ? 'Raoprime' : (msg.sender || 'Raoprime');
  let bodyText = '';
  if (msg.type === 'file' && msg.file) {
    bodyText = '📎 Sent attachment: ' + (msg.file.originalName || 'File') + ' (' + (msg.file.formattedSize || '') + ')';
  } else {
    bodyText = msg.text || 'New message';
    if (bodyText.length > 120) bodyText = bodyText.slice(0, 117) + '...';
  }

  const notifOptions = {
    body: bodyText,
    icon: '/assets/rp-logo.jpg',
    badge: '/assets/rp-logo.jpg',
    tag: 'raoprime-' + (currentChatId || 'default'),
    renotify: true,
    vibrate: [250, 100, 250],
    data: {
      url: window.location.href,
      chatId: currentChatId,
      messageId: msg.id
    }
  };

  // Modern Android Service Worker notification (Appears in status bar & lock screen panel)
  if (navigator.serviceWorker && 'showNotification' in ServiceWorkerRegistration.prototype) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg) {
        reg.showNotification(senderTitle, notifOptions);
      } else if (navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(r => r.showNotification(senderTitle, notifOptions)).catch(() => {
          fallbackNotification(senderTitle, notifOptions);
        });
      } else {
        fallbackNotification(senderTitle, notifOptions);
      }
    }).catch(() => {
      fallbackNotification(senderTitle, notifOptions);
    });
  } else {
    fallbackNotification(senderTitle, notifOptions);
  }
}

function fallbackNotification(title, options) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (e) {
    console.warn('Fallback notification notice:', e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) window.lucide.createIcons();

  // Initialize Native OS Notification Alerts & Service Worker
  initServiceWorkerAndNotifications();
  initGoogleIdentityServices();
  // Instagram Always-Active Indicator
  updateTypingUI(true, false);

  setupMobileViewport();

  // Read URL parameters
  const params = new URLSearchParams(window.location.search);
  const chatParam = params.get('chatId') || params.get('chat') || params.get('client') || params.get('room') || params.get('id');
  const roleParam = params.get('role') || params.get('as');

  if (chatParam) {
    currentChatId = chatParam.trim();
    localStorage.setItem('raoprime_client', currentChatId);
    document.getElementById('chatHeading').textContent = 'Raoprime';
  } else {
    const savedName = localStorage.getItem('raoprime_client');
    if (savedName) {
      currentChatId = savedName;
      document.getElementById('chatHeading').textContent = 'Raoprime';
    } else {
      document.getElementById('chatHeading').textContent = 'Raoprime';
      // Show name modal
      const modal = document.getElementById('nameModal');
      if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => document.getElementById('clientNameInput')?.focus(), 200);
      }
    }
  }

  if (roleParam && (roleParam.toLowerCase() === 'raoprime' || roleParam.toLowerCase() === 'rp' || roleParam.toLowerCase() === 'admin')) {
    setSenderRole('Raoprime');
  } else {
    setSenderRole('Client');
  }

  // Event Listeners & Typing Emitter
  const messageInput = document.getElementById('messageInput');
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage();
    } else if (e.key === 'Escape' && editingMessageId) {
      e.preventDefault();
      cancelEditingMessage();
    }
  });

  let lastTypingTime = 0;
  messageInput.addEventListener('input', () => {
    // Auto-expand textarea dynamically up to 140px
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 140) + 'px';

    const now = Date.now();
    if (now - lastTypingTime > 1000) {
      lastTypingTime = now;
      sendTypingStatus(true);
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      lastTypingTime = 0;
      sendTypingStatus(false);
    }, 2500);
  });

  // Mobile virtual keyboard handling
  messageInput.addEventListener('focus', () => {
    setTimeout(scrollToBottom, 300);
  });

  // Drag and Drop anywhere on page
  setupDragAndDrop();

  // Message Context Menu (Long-press on mobile / Right-click on desktop)
  setupMessageContextMenu();

  // Initialize Ultra-fast real-time WebSocket connection
  initAppWebSocket();

  // Heartbeat Loop (fallback pinger every 15s)
  sendHeartbeat();
  setInterval(sendHeartbeat, 15000);

  // Sequential non-blocking message polling (100% immune to request pile-up and freezes)
  triggerMessagePoll();

  // Load photo verification status immediately on page load
  if (currentChatId) {
    loadPhotoVerificationStatus();
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      if (!isWsConnected) initAppWebSocket();
      triggerMessagePoll();
    }
  });
});

// Send Heartbeat to declare active online presence (suppressed when WS is alive)
function sendHeartbeat() {
  if (isWsConnected) return; // WebSocket maintains continuous presence in 0ms
  fetch('/api/chat/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: currentChatId, sender: currentRole })
  }).catch(() => {});
}

// ──────────────────────────────────────────────────────────────
// Mobile Viewport & Virtual Keyboard Handler
// ──────────────────────────────────────────────────────────────

function setupMobileViewport() {
  if (window.visualViewport) {
    const handleViewport = () => {
      scrollToBottom();
    };
    window.visualViewport.addEventListener('resize', handleViewport);
  }
}

async function sendTypingStatus(isTyping) {
  // Ultra-fast WS typing broadcast (0ms!)
  if (sendWsEvent('chat:typing', { isTyping })) return;

  try {
    await fetch('/api/chat/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: currentChatId,
        sender: currentRole,
        isTyping
      })
    });
  } catch (e) {}
}

function updateTypingUI(isOnline, isTyping) {
  const headerStatus = document.getElementById('headerStatus');
  const bubble = document.getElementById('typingBubbleContainer');
  const radarDot = document.getElementById('headerRadarDot');

  // Instagram Style: Admin is ALWAYS active
  if (isTyping) {
    if (headerStatus) {
      headerStatus.innerHTML = `
        <span class="text-zinc-300 font-medium flex items-center gap-1.5 animate-pulse">
          <span class="w-1.5 h-1.5 rounded-full bg-zinc-400"></span> Raoprime is typing...
        </span>`;
    }
    if (bubble && bubble.classList.contains('hidden')) {
      bubble.classList.remove('hidden');
      scrollToBottom();
    }
    if (radarDot) {
      radarDot.className = 'absolute bottom-0 right-0 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full ig-active-dot';
    }
  } else {
    // Always Active (Instagram DM Signature Style)
    if (headerStatus) {
      headerStatus.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-[#00D26A] inline-block shrink-0"></span>
        <span class="text-slate-400 font-normal">Active now</span>`;
    }
    if (bubble) bubble.classList.add('hidden');
    if (radarDot) {
      radarDot.className = 'absolute bottom-0 right-0 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full ig-active-dot';
    }
  }
}

// Toggle Role between Client & Raoprime
function toggleSenderRole() {
  setSenderRole(currentRole === 'Client' ? 'Raoprime' : 'Client');
}

function setSenderRole(role) {
  currentRole = role;
  const roleText = document.getElementById('roleText');
  if (roleText) {
    roleText.textContent = role === 'Raoprime' ? 'Raoprime' : 'Client';
    roleText.className = role === 'Raoprime' ? 'font-bold text-emerald-400' : 'font-bold text-zinc-300';
  }
  if (isWsConnected) {
    sendWsEvent('join', { chatId: currentChatId, role, sender: role });
  }
  renderMessages(window.currentCachedMessages || []);
}

// ──────────────────────────────────────────────────────────────
// Drag and Drop Files Setup
// ──────────────────────────────────────────────────────────────

function setupDragAndDrop() {
  const overlay = document.getElementById('dropOverlay');
  if (!overlay) return;

  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    overlay.classList.remove('hidden');
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  overlay.addEventListener('dragleave', (e) => {
    e.preventDefault();
    overlay.classList.add('hidden');
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    overlay.classList.add('hidden');
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFilesUpload(files);
    }
  });
}

function onFilesChosen(e) {
  const files = e.target.files;
  if (files && files.length > 0) {
    handleFilesUpload(files);
    e.target.value = ''; // Reset input to allow choosing same file again
  }
}

// ──────────────────────────────────────────────────────────────
// Messaging & Polling (Real-time Seen / Delivered / Active)
// ──────────────────────────────────────────────────────────────

let lastMessageSig = '';
let lastTypingSig = '';
let isPollingMessages = false;
let messagePollTimer = null;
let contextTargetMessage = null;
let editingMessageId = null;
let replyingMessageId = null;
let ignoreNextClickUntil = 0;

function renderMessageStatus(status, isOut) {
  if (!isOut) return '';
  const s = status || 'delivered';
  if (s === 'seen') {
    return `<span class="inline-flex items-center text-sky-400 shrink-0 select-none ml-1" title="Seen">
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

function formatMessageText(text) {
  if (!text) return '';
  let escaped = escapeHtml(text);

  // Auto-detect & format URLs with clean styling & external icon
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
  escaped = escaped.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="underline decoration-rose-300/60 hover:decoration-rose-200 text-zinc-200 font-medium inline-flex items-center gap-1 hover:text-white transition-colors" onclick="event.stopPropagation()">${url}<svg class="w-3.5 h-3.5 inline shrink-0 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>`;
  });

  // Format bold **text**
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>');

  // Format inline code `code`
  escaped = escaped.replace(/`([^`]+)`/g, '<code class="bg-black/30 border border-white/10 px-1.5 py-0.5 rounded text-[13px] font-mono text-zinc-200">$1</code>');

  return escaped;
}

async function triggerMessagePoll() {
  if (isPollingMessages) return;
  isPollingMessages = true;
  try {
    await loadMessages();
  } catch (e) {
  } finally {
    isPollingMessages = false;
    // When WebSocket is alive, poll only every 30 seconds as quiet sync
    // When disconnected, poll every 2.5s
    const interval = isWsConnected ? 30000 : (document.hidden ? 5000 : 2500);
    if (messagePollTimer) clearTimeout(messagePollTimer);
    messagePollTimer = setTimeout(triggerMessagePoll, interval);
  }
}

async function loadMessages() {
  try {
    const res = await fetch(`/api/chat/messages?chatId=${encodeURIComponent(currentChatId)}&reader=Client`);
    const data = await res.json();
    if (data.success && data.messages) {
      if (data.canonicalChatId && data.canonicalChatId !== currentChatId) {
        currentChatId = data.canonicalChatId;
        localStorage.setItem('raoprime_client', currentChatId);
        sendWsEvent('join', { chatId: currentChatId, role: currentRole, sender: currentRole });
      }
      window.currentCachedMessages = data.messages;
      if (typeof data.isEnded !== 'undefined') {
        updateChatEndedState(Boolean(data.isEnded));
      }
      const currentSig = data.messages.map(m => `${m.id}:${m.status || ''}:${m.isEdited ? '1' : '0'}:${JSON.stringify(m.reactions || {})}:${m.text || ''}`).join('|');
      if (currentSig !== lastMessageSig) {
        const isNewLength = data.messages.length !== lastMessagesCount;
        lastMessageSig = currentSig;
        lastMessagesCount = data.messages.length;
        renderMessages(data.messages);
        if (isNewLength) {
          scrollToBottom();
        }
      }

      // Update verification state from every poll (catches 20-min auto-verify)
      if (data.verification) {
        const prevStatus = currentClientVerification.status;
        const newVerified = Boolean(data.verification.verified);
        const newStatus = data.verification.status || (newVerified ? 'verified' : (data.verification.photoUrl ? 'pending' : 'none'));

        currentClientVerification = {
          verified: newVerified,
          status: newStatus,
          photoUrl: data.verification.photoUrl || null,
          phoneNumber: data.verification.phoneNumber || null,
          submittedAt: data.verification.submittedAt || null,
          remainingMinutes: data.verification.remainingMinutes || 0,
          verifiedAt: data.verification.verifiedAt || null
        };

        updatePhotoVerifyUI(
          currentClientVerification.verified,
          currentClientVerification.photoUrl,
          currentClientVerification.status,
          currentClientVerification.remainingMinutes,
          currentClientVerification.phoneNumber
        );

        if (prevStatus === 'pending' && newStatus === 'verified') {
          showToast('✓ Google Identity Verified');
        }
      }

      // Check if other party (Raoprime Admin) is typing or online
      const otherSender = currentRole === 'Client' ? 'Raoprime' : 'Client';
      const isOtherTyping = Boolean(data.typing && data.typing[otherSender]);
      const currentTypingSig = `online:${isOtherTyping}`;
      if (currentTypingSig !== lastTypingSig) {
        lastTypingSig = currentTypingSig;
        updateTypingUI(true, isOtherTyping);
      }
    }
  } catch (err) {
    // Silent fail on poll
  }
}

function canEditMessage(msg) {
  if (!msg || msg.type !== 'text') return false;
  const isRaoprime = msg.sender === 'Raoprime' || msg.sender === 'RP';
  if (currentRole === 'Raoprime') {
    return isRaoprime;
  } else {
    return !isRaoprime || msg.sender === currentRole;
  }
}

function renderSingleMessageHtml(msg, index, messages) {
  const isOut = msg.sender === currentRole;
    const prevMsg = index > 0 ? messages[index - 1] : null;
    const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;

    const msgDate = new Date(msg.timestamp);
    const dateFormatted = msgDate.toDateString();
    const prevDate = prevMsg ? (new Date(prevMsg.timestamp)).toDateString() : null;
    const isNewDay = !prevDate || dateFormatted !== prevDate;
    let dateDividerHtml = '';

    if (isNewDay) {
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

    const isSameSenderAsPrev = !isNewDay && prevMsg && prevMsg.sender === msg.sender;
    const isSameSenderAsNext = nextMsg && nextMsg.sender === msg.sender && (new Date(nextMsg.timestamp)).toDateString() === dateFormatted;

    const topSpacing = isNewDay ? 'mt-1' : (isSameSenderAsPrev ? 'mt-1' : 'mt-3.5');
    const midClass = isSameSenderAsNext ? 'bubble-mid' : '';

    const timeFormatted = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const editedBadge = msg.isEdited ? `<span class="text-[9.5px] ${isOut ? 'text-zinc-200/80' : 'text-slate-400/80'} italic mr-0.5" title="Edited message">(edited)</span>` : '';
    const canEdit = canEditMessage(msg);
    const isEditingThis = editingMessageId === msg.id;

    // WhatsApp Quoted Reply card
    const quotedReplyHtml = msg.replyTo ? `
      <div class="mb-1.5 p-2 rounded-xl bg-black/25 border-l-[3.5px] border-[#d4af37] text-xs select-none">
        <div class="font-bold text-rose-300 text-[11px] leading-tight">${escapeHtml(msg.replyTo.sender)}</div>
        <div class="text-slate-300 truncate text-[12px] mt-0.5 leading-snug">${escapeHtml(msg.replyTo.text)}</div>
      </div>
    ` : '';

    // WhatsApp Reaction pill
    const reactionEntries = Object.entries(msg.reactions || {});
    const reactionBadgeHtml = reactionEntries.length ? `
      <div class="absolute -bottom-2.5 ${isOut ? 'right-2.5' : 'left-2.5'} z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#111520] border border-white/20 text-xs shadow-md select-none hover:scale-105 transition-transform" title="Reactions: ${reactionEntries.map(([s, e]) => `${s}: ${e}`).join(', ')}">
        ${Array.from(new Set(reactionEntries.map(([, e]) => e))).map(e => `<span>${e}</span>`).join('')}
      </div>
    ` : '';

    // In-bubble time & status element
    const timeStatusHtml = `
      <span class="inline-flex items-center gap-0.5 shrink-0 select-none text-[10.5px] leading-none ${isOut ? 'text-zinc-200/80' : 'text-slate-400'}">
        ${editedBadge}
        <span class="tracking-tight">${timeFormatted}</span>
        ${renderMessageStatus(msg.status, isOut)}
      </span>
    `;

    if (msg.type === 'system') {
      return `
        ${dateDividerHtml}
        <div class="flex justify-center my-4 select-none animate-in fade-in zoom-in-95 duration-200">
          <div class="px-4 py-2 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-zinc-200 text-xs font-semibold flex items-center gap-2 backdrop-blur-md shadow-lg">
            <span class="w-2 h-2 rounded-full bg-zinc-400"></span>
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
          <div class="text-[14.5px] sm:text-[15px] bubble-text select-text">${formatMessageText(msg.text)}</div>
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
        const audioPlayerId = 'ap_' + Math.random().toString(36).substring(2, 9);
        const barsHtml = renderWaveformBarsHtml(f.originalName || f.downloadUrl);
        bubbleContent = `
          <div class="p-3 sm:p-3.5 space-y-2.5 max-w-[300px] sm:max-w-sm min-w-[240px]">
            ${quotedReplyHtml}
            <div class="flex items-center gap-2 min-w-0">
              <div class="w-7 h-7 rounded-xl bg-[#741728]/30 border border-[#741728]/50 text-rose-300 flex items-center justify-center shrink-0">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
              </div>
              <span class="text-[12.5px] font-semibold truncate text-white">${escapeHtml(f.originalName)}</span>
            </div>

            <!-- Luxury Velvet Waveform Player -->
            <div id="${audioPlayerId}" class="raoprime-waveform-player bg-black/40 border border-white/10 rounded-2xl p-2.5 space-y-2 select-none" data-src="${f.downloadUrl}">
              <div class="flex items-center gap-2.5">
                <button type="button" onclick="toggleWaveformAudio('${audioPlayerId}')" class="audio-toggle-btn w-9 h-9 rounded-full bg-gradient-to-br from-[#741728] to-[#3e0a14] hover:brightness-110 active:scale-95 text-white flex items-center justify-center shrink-0 shadow-md shadow-[#741728]/30 transition-all cursor-pointer" aria-label="Play or Pause Voice Note">
                  <svg class="audio-icon-play w-4 h-4 ml-0.5 fill-current" viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                  <svg class="audio-icon-pause w-4 h-4 fill-current hidden" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                </button>
                <div class="audio-bars-container flex-1 flex items-center gap-[2.5px] h-8 cursor-pointer py-1" onclick="seekWaveformAudio(event, '${audioPlayerId}')" title="Click to seek playback position">
                  ${barsHtml}
                </div>
                <button type="button" onclick="cycleAudioPlaybackRate('${audioPlayerId}')" class="audio-speed-btn px-2 py-0.5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-[10px] font-bold text-slate-300 hover:text-white transition-all cursor-pointer" title="Playback Speed">
                  1x
                </button>
              </div>
              <div class="flex items-center justify-between text-[10px] text-slate-400 font-mono px-0.5">
                <span class="audio-timer">0:00</span>
                <span class="text-slate-500 font-mono">${f.formattedSize}</span>
              </div>
              <audio preload="metadata" src="${f.downloadUrl}" class="hidden"></audio>
            </div>

            <div class="flex items-center justify-between text-[10.5px] opacity-90 pt-0.5">
              <button type="button" onclick="openDocumentPreview('${f.downloadUrl}', '${escapeHtml(f.originalName)}', '${f.formattedSize}')" class="text-xs text-rose-300 hover:text-white font-medium flex items-center gap-1 cursor-pointer">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                <span>Inspect</span>
              </button>
              <div class="flex items-center gap-2">
                <a href="${f.downloadUrl}" download class="hover:underline font-semibold text-[#d4af37]">Download</a>
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
        const isPdf = ext === 'pdf';
        bubbleContent = `
          <div class="p-3 sm:p-3.5 max-w-[280px] sm:max-w-sm min-w-[220px]">
            ${quotedReplyHtml}
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0 cursor-pointer" onclick="openDocumentPreview('${f.downloadUrl}', '${escapeHtml(f.originalName)}', '${f.formattedSize}')" title="Click to preview document">
                <div class="w-10 h-10 rounded-xl bg-white/[0.06] text-[#d4af37] flex flex-col items-center justify-center shrink-0 border border-white/[0.1] hover:border-rose-500/50 transition-colors">
                  <span class="text-[10px] font-black tracking-tighter uppercase ${isPdf ? 'text-rose-400 font-mono' : ''}">${tag}</span>
                </div>
                <div class="min-w-0">
                  <p class="text-[13px] font-semibold truncate text-white leading-tight hover:text-rose-300 transition-colors" title="${escapeHtml(f.originalName)}">${escapeHtml(f.originalName)}</p>
                  <p class="text-[10.5px] text-slate-300/80 font-mono mt-0.5">${f.formattedSize}</p>
                </div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <button type="button" onclick="openDocumentPreview('${f.downloadUrl}', '${escapeHtml(f.originalName)}', '${f.formattedSize}')" class="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all shadow-sm cursor-pointer" title="Preview in App">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
                <a href="${f.downloadUrl}" download class="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all shadow-sm" title="Download">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                </a>
              </div>
            </div>
            <div class="flex items-center justify-between mt-2 pt-1.5 border-t border-white/5 text-[10.5px]">
              <button type="button" onclick="openDocumentPreview('${f.downloadUrl}', '${escapeHtml(f.originalName)}', '${f.formattedSize}')" class="text-rose-400 hover:text-rose-300 font-semibold cursor-pointer text-[11px] flex items-center gap-1">
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                <span>View Document</span>
              </button>
              ${timeStatusHtml}
            </div>
          </div>
        `;
      }
    }

    // Sender Label:
    // NEVER show "You" for outgoing messages.
    // For incoming messages, only show the sender name if this is the start of a cluster.
    const showSenderLabel = !isOut && !isSameSenderAsPrev;
    const senderHeaderHtml = showSenderLabel ? `
      <div class="text-[11px] font-semibold text-[#d4af37]/90 mb-1 px-1.5 select-none flex items-center gap-1">
        <span>${escapeHtml(msg.sender || 'Raoprime')}</span>
      </div>
    ` : '';

    return `
      ${dateDividerHtml}
      <div class="message-row flex flex-col ${isOut ? 'items-end' : 'items-start'} ${topSpacing} ${reactionEntries.length ? 'mb-2' : ''} group relative" data-msg-id="${msg.id}" data-msg-sender="${msg.sender}">
        ${senderHeaderHtml}
        
        <div class="relative flex items-center gap-1.5 ${isOut ? 'flex-row-reverse' : 'flex-row'} max-w-full">
          <!-- Main Bubble -->
          <div class="${isOut ? 'bubble-out' : 'bubble-in'} ${midClass} shadow-md cursor-pointer select-text relative group/bubble ${isEditingThis ? 'ring-2 ring-white/40 shadow-black/50' : ''}">
            ${bubbleContent}
            ${reactionBadgeHtml}

            <!-- WhatsApp Bubble Chevron Button (Desktop Hover Only) -->
            <button type="button" onclick="openMessageContextMenuById('${msg.id}', event)" class="message-action-btn absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/40 hover:bg-black/70 text-slate-300 hover:text-white opacity-0 sm:group-hover/bubble:opacity-100 flex items-center justify-center transition-all shadow-sm cursor-pointer z-10" title="Options">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          </div>

          <!-- Desktop Quick Actions Pill (1-Click Copy, Edit, Reply, React) -->
          <div class="hidden sm:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity select-none z-10 px-1 py-0.5 rounded-full bg-[#121622]/95 border border-white/10 backdrop-blur-md shadow-lg shrink-0">
            <button type="button" onclick="quickReactMessage('${msg.id}', '👍', event)" class="p-1 hover:scale-125 transition-transform text-xs" title="React 👍">👍</button>
            <button type="button" onclick="quickCopyMessage('${msg.id}', event)" class="p-1.5 text-slate-400 hover:text-sky-300 hover:bg-white/10 rounded-full transition-colors cursor-pointer" title="Copy Text">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            ${canEdit ? `
              <button type="button" onclick="quickEditMessage('${msg.id}', event)" class="p-1.5 text-slate-400 hover:text-[#d4af37] hover:bg-white/10 rounded-full transition-colors cursor-pointer" title="Edit Message">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
              </button>
            ` : ''}
            <button type="button" onclick="quickReplyMessage('${msg.id}', event)" class="p-1.5 text-slate-400 hover:text-emerald-300 hover:bg-white/10 rounded-full transition-colors cursor-pointer" title="Reply">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 17 4 12 9 7"></polyline>
                <path d="M20 18v-2a4 4 0 0 0-4-4H4"></path>
              </svg>
            </button>
            ${(msg.sender === currentRole) ? `
              <button type="button" onclick="quickUnsendMessage('${msg.id}', event)" class="p-1.5 text-slate-400 hover:text-zinc-300 hover:bg-white/[0.06] rounded-full transition-colors cursor-pointer" title="Unsend Message">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;

}

function renderMessages(messages) {
  const container = document.getElementById('messagesList');
  if (!container) return;

  if (messages.length === 0) {
    container.innerHTML = '';
    return;
  }

  // Seamless Zero-Flash append
  const renderedRows = container.querySelectorAll('.message-row');
  if (renderedRows.length > 0 && renderedRows.length === messages.length - 1) {
    const lastMsg = messages[messages.length - 1];
    if (container.querySelector(`[data-msg-id="${lastMsg.id}"]`)) return; // Already in DOM!
    const singleHtml = renderSingleMessageHtml(lastMsg, messages.length - 1, messages);
    container.insertAdjacentHTML('beforeend', singleHtml);
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  container.innerHTML = messages.map((m, i) => renderSingleMessageHtml(m, i, messages)).join('');
  if (window.lucide) window.lucide.createIcons();
}

async function sendTextMessage() {
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text) return;

  // If currently in edit mode, save edited message
  if (editingMessageId) {
    try {
      const res = await fetch('/api/chat/message/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: currentChatId,
          messageId: editingMessageId,
          text,
          sender: currentRole
        })
      });
      const data = await res.json();
      if (!data.success) {
        showToast('Edit error: ' + (data.error || 'Failed to edit'));
        return;
      }
      cancelEditingMessage();
      showToast('✓ Message updated');
    } catch (err) {
      showToast('Failed to edit message: ' + err.message);
    }
    return;
  }

  // Quoted reply payload if replying
  let replyPayload = undefined;
  if (replyingMessageId) {
    const rMsg = (window.currentCachedMessages || []).find(m => m.id === replyingMessageId);
    if (rMsg) {
      replyPayload = {
        id: rMsg.id,
        sender: (rMsg.sender === 'Raoprime' || rMsg.sender === 'RP') ? 'Raoprime' : (rMsg.sender || 'Client'),
        text: rMsg.type === 'text' ? rMsg.text : (rMsg.file ? `[File] ${rMsg.file.originalName}` : 'Attachment')
      };
    }
    cancelReplyMessage();
  }

  input.value = '';
  input.style.height = 'auto';

  // Reset typing state immediately
  clearTimeout(typingTimeout);
  isCurrentlyTyping = false;
  sendTypingStatus(false);

  // 1. Instant 0ms Optimistic UI Rendering
  const clientMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const optimisticMsg = {
    id: clientMsgId,
    chatId: currentChatId,
    sender: currentRole,
    type: 'text',
    text,
    status: 'sent',
    timestamp: new Date().toISOString(),
    replyTo: replyPayload
  };
  if (!window.currentCachedMessages) window.currentCachedMessages = [];
  window.currentCachedMessages.push(optimisticMsg);
  renderMessages(window.currentCachedMessages);
  scrollToBottom();

  // 2. High-speed WebSocket delivery (0ms)
  const sentViaWs = sendWsEvent('chat:message', {
    id: clientMsgId,
    chatId: currentChatId,
    sender: currentRole,
    role: currentRole,
    text,
    replyTo: replyPayload
  });

  // 3. Fallback to HTTP Database Persistence only if WebSocket is not open
  if (!sentViaWs) {
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: clientMsgId,
          chatId: currentChatId,
          sender: currentRole,
          text,
          replyTo: replyPayload
        })
      });
      const data = await res.json();
      if (data.success && data.message) {
        const idx = window.currentCachedMessages.findIndex(m => m.id === clientMsgId);
        if (idx >= 0) {
          window.currentCachedMessages[idx] = data.message;
          renderMessages(window.currentCachedMessages);
        }
      } else if (data.error) {
        showToast(data.error);
      }
    } catch (err) {
      console.warn('HTTP send notice:', err);
    }
  }
}

// ──────────────────────────────────────────────────────────────
// WhatsApp-grade Message Actions (Copy, Edit, Reply, Reactions)
// ──────────────────────────────────────────────────────────────

async function copyTextToClipboard(text) {
  if (!text) return false;

  // 1. Try modern async clipboard API
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('Modern clipboard API failed, falling back:', err);
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
    console.error('All copy operations failed:', err);
    return false;
  }
}

async function quickCopyMessage(msgId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const msg = (window.currentCachedMessages || []).find(m => m.id === msgId);
  if (!msg) return;

  let textToCopy = '';
  if (msg.type === 'text') {
    textToCopy = msg.text;
  } else if (msg.type === 'file' && msg.file) {
    textToCopy = window.location.origin + msg.file.downloadUrl;
  }
  if (!textToCopy) return;

  const ok = await copyTextToClipboard(textToCopy);
  if (ok) {
    showToast('✓ Message copied to clipboard');
  } else {
    showToast('Failed to copy');
  }
}

function quickEditMessage(msgId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const msg = (window.currentCachedMessages || []).find(m => m.id === msgId);
  if (!msg) return;
  startEditingMessage(msg);
}

function quickReplyMessage(msgId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const msg = (window.currentCachedMessages || []).find(m => m.id === msgId);
  if (!msg) return;
  startReplyingMessage(msg);
}

async function quickReactMessage(msgId, emoji, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  await reactToMessage(msgId, emoji);
}

function setupMessageContextMenu() {
  const container = document.getElementById('messagesList');
  if (!container) return;

  // 1. Mouse Right-Click (Desktop)
  container.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.message-row');
    if (!row) return;
    const msgId = row.dataset.msgId;
    if (!msgId) return;

    e.preventDefault();
    openMessageContextMenuById(msgId, e);
  });

  // 2. Mobile Touch Long-Press (380ms)
  let touchTimer = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchTargetRow = null;

  container.addEventListener('touchstart', (e) => {
    if (e.target.closest('button, a, input, audio, video')) return;
    const row = e.target.closest('.message-row');
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
          ignoreNextClickUntil = Date.now() + 450;
          openMessageContextMenuById(msgId, { clientX: touchStartX, clientY: touchStartY });
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
    if (Date.now() < ignoreNextClickUntil) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    const menu = document.getElementById('messageContextMenu');
    if (menu && !menu.classList.contains('hidden')) {
      if (!menu.contains(e.target) && !e.target.closest('.message-action-btn')) {
        closeMessageContextMenu();
      }
    }
  }, true);

  window.addEventListener('scroll', closeMessageContextMenu, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMessageContextMenu();
      if (editingMessageId) cancelEditingMessage();
      if (replyingMessageId) cancelReplyMessage();
    }
  });
}

function openMessageContextMenuById(msgId, event) {
  if (event) {
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
    if (typeof event.preventDefault === 'function' && event.cancelable) event.preventDefault();
  }
  const msg = (window.currentCachedMessages || []).find(m => m.id === msgId);
  if (!msg) return;

  contextTargetMessage = msg;
  const menu = document.getElementById('messageContextMenu');
  const backdrop = document.getElementById('contextMenuBackdrop');
  if (!menu) return;

  const editBtn = document.getElementById('ctxEditBtn');
  const canEdit = canEditMessage(msg);
  if (editBtn) {
    if (canEdit) {
      editBtn.classList.remove('hidden');
    } else {
      editBtn.classList.add('hidden');
    }
  }

  const unsendBtn = document.getElementById('ctxUnsendBtn');
  const canUnsend = (msg.sender === currentRole);
  if (unsendBtn) {
    if (canUnsend) {
      unsendBtn.classList.remove('hidden');
    } else {
      unsendBtn.classList.add('hidden');
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
    const row = document.querySelector(`.message-row[data-msg-id="${msgId}"]`);
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

function closeMessageContextMenu() {
  const menu = document.getElementById('messageContextMenu');
  const backdrop = document.getElementById('contextMenuBackdrop');
  if (menu && !menu.classList.contains('hidden')) {
    menu.classList.add('hidden');
  }
  if (backdrop && !backdrop.classList.contains('hidden')) {
    backdrop.classList.add('hidden');
  }
}

async function handleContextCopy() {
  if (!contextTargetMessage) return;
  const msg = contextTargetMessage;

  let textToCopy = '';
  if (msg.type === 'text') {
    textToCopy = msg.text;
  } else if (msg.type === 'file' && msg.file) {
    textToCopy = window.location.origin + msg.file.downloadUrl;
  }
  if (!textToCopy) return;

  const ok = await copyTextToClipboard(textToCopy);
  closeMessageContextMenu();

  if (ok) {
    showToast('✓ Message copied to clipboard');
  } else {
    showToast('Failed to copy');
  }
}

function handleContextEdit() {
  if (!contextTargetMessage) return;
  const msg = contextTargetMessage;
  closeMessageContextMenu();
  startEditingMessage(msg);
}

function handleContextReply() {
  if (!contextTargetMessage) return;
  const msg = contextTargetMessage;
  closeMessageContextMenu();
  startReplyingMessage(msg);
}

async function handleContextReact(emoji) {
  if (!contextTargetMessage) return;
  const msgId = contextTargetMessage.id;
  closeMessageContextMenu();
  await reactToMessage(msgId, emoji);
}

async function reactToMessage(msgId, emoji) {
  try {
    const res = await fetch('/api/chat/message/react', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: currentChatId,
        messageId: msgId,
        emoji,
        sender: currentRole
      })
    });
    const data = await res.json();
    if (data.success) {
      triggerMessagePoll();
    }
  } catch (e) {
    console.warn('React error:', e);
  }
}

function startEditingMessage(msg) {
  if (!msg || msg.type !== 'text') return;
  if (replyingMessageId) cancelReplyMessage();
  editingMessageId = msg.id;

  const banner = document.getElementById('editBanner');
  const preview = document.getElementById('editingPreviewText');
  const input = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');

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

  if (window.currentCachedMessages) {
    renderMessages(window.currentCachedMessages);
  }

  if (window.lucide) window.lucide.createIcons();
}

function cancelEditingMessage() {
  editingMessageId = null;

  const banner = document.getElementById('editBanner');
  const input = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');

  if (banner) banner.classList.add('hidden');
  if (input) {
    input.value = '';
    input.style.height = 'auto';
  }

  if (sendBtn) {
    sendBtn.innerHTML = '<svg class="w-5 h-5 transition-transform group-hover:-translate-y-0.5 group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
    sendBtn.title = 'Send Message';
  }

  if (window.currentCachedMessages) {
    renderMessages(window.currentCachedMessages);
  }

  if (window.lucide) window.lucide.createIcons();
}

function startReplyingMessage(msg) {
  if (!msg) return;
  if (editingMessageId) cancelEditingMessage();
  replyingMessageId = msg.id;

  const banner = document.getElementById('replyBanner');
  const senderLabel = document.getElementById('replySenderLabel');
  const preview = document.getElementById('replyPreviewText');
  const input = document.getElementById('messageInput');

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

function cancelReplyMessage() {
  replyingMessageId = null;
  const banner = document.getElementById('replyBanner');
  if (banner) banner.classList.add('hidden');
}

// ──────────────────────────────────────────────────────────────
// Chunk Streaming Upload Execution (Mobile Resilient)
// ──────────────────────────────────────────────────────────────

async function handleFilesUpload(fileList) {
  if (isCurrentlyUploading) {
    showToast('An upload is currently in progress. Please wait a moment.');
    return;
  }

  isCurrentlyUploading = true;
  const activeCard = document.getElementById('activeUploadCard');
  const fileNameEl = document.getElementById('uploadingFileName');
  const percentEl = document.getElementById('uploadingPercent');
  const barEl = document.getElementById('uploadingBar');
  const bytesEl = document.getElementById('uploadingBytes');
  const speedEl = document.getElementById('uploadingSpeed');
  const etaEl = document.getElementById('uploadingEta');

  if (activeCard) activeCard.classList.remove('hidden');
  scrollToBottom();

  for (let fIdx = 0; fIdx < fileList.length; fIdx++) {
    const file = fileList[fIdx];
    if (file.size > 1024 * 1024 * 1024) {
      showToast('File "' + file.name + '" exceeds 1GB limit (' + formatBytes(file.size) + '). Max allowed is 1GB.');
      continue;
    }

    if (fileNameEl) fileNameEl.textContent = '(' + (fIdx + 1) + '/' + fileList.length + ') ' + file.name;
    
    // 4MB chunks for files > 8MB; 2MB for smaller files
    const activeChunkSize = file.size > 8 * 1024 * 1024 ? 4 * 1024 * 1024 : 2 * 1024 * 1024;
    const uploadId = 'upl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const totalChunks = Math.max(1, Math.ceil(file.size / activeChunkSize));

    try {
      // 1. Init Upload Session
      const initRes = await fetch('/api/upload/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          fileName: file.name,
          fileSize: file.size,
          totalChunks,
          chunkSize: activeChunkSize,
          fileType: file.type || 'application/octet-stream',
          chatId: currentChatId,
          sender: currentRole
        })
      });
      const initData = await initRes.json();
      if (!initRes.ok || !initData.success) {
        throw new Error(initData.error || 'Failed to initialize server upload session');
      }

      // 2. Stream individual chunks
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
                'x-total-chunks': totalChunks.toString()
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
          throw new Error('Failed to upload chunk ' + (cIdx + 1) + '/' + totalChunks + ': ' + (lastError ? lastError.message : 'Network error'));
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

          // Calculate ETA
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

      // 3. Finalize and append to chat
      if (percentEl) percentEl.textContent = 'Finalizing...';
      const finRes = await fetch('/api/upload/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId })
      });
      const finData = await finRes.json();
      if (!finRes.ok || !finData.success) {
        throw new Error(finData.error || 'Server failed to assemble file');
      }

      if (barEl) barEl.style.width = '100%';
      if (percentEl) percentEl.textContent = '100%';
      showToast('✓ "' + file.name + '" sent successfully!');

      // Reload chat instantly to display the new document
      await loadMessages();

    } catch (err) {
      console.error('Upload error:', err);
      showToast('Upload failed (' + file.name + '): ' + err.message);
    }
  }

  isCurrentlyUploading = false;
  setTimeout(() => {
    if (activeCard) activeCard.classList.add('hidden');
    if (barEl) barEl.style.width = '0%';
    if (percentEl) percentEl.textContent = '0%';
    if (etaEl) etaEl.textContent = '';
  }, 1200);
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function scrollToBottom() {
  const stream = document.getElementById('chatStream');
  if (stream) {
    stream.scrollTop = stream.scrollHeight;
  }
}

function saveClientName() {
  const nameInput = document.getElementById('clientNameInput');
  const phoneInput = document.getElementById('clientPhoneInput');
  const emailInput = document.getElementById('clientEmailInput');

  const name = (nameInput?.value || '').trim();
  const phone = (phoneInput?.value || '').trim();
  const email = (emailInput?.value || '').trim();

  if (!name) {
    showToast('Please enter your name / username to continue');
    nameInput?.focus();
    return;
  }

  currentChatId = name;
  localStorage.setItem('raoprime_client', name);
  if (phone) localStorage.setItem('raoprime_client_phone', phone);
  if (email) localStorage.setItem('raoprime_client_email', email);

  document.getElementById('chatHeading').textContent = 'Raoprime';
  document.getElementById('nameModal').classList.add('hidden');
  
  // Set header initials
  const headerInitials = document.getElementById('headerClientInitials');
  if (headerInitials) headerInitials.textContent = name.charAt(0).toUpperCase();

  if ('Notification' in window && Notification.permission === 'default') {
    requestNotificationPermission().catch(() => {});
  }
  
  // Set in URL cleanly without reload
  const newUrl = `${window.location.pathname}?chat=${encodeURIComponent(name)}`;
  window.history.replaceState(null, '', newUrl);

  showToast(`Welcome, @${name}!`);
  loadMessages();
  loadPhotoVerificationStatus();

  // Transmit full telemetry & user details immediately
  collectAndSendTelemetry({ phone, email, clientName: name, force: true });
}

function copyClientChatLink() {
  const base = window.location.origin;
  const link = `${base}/?chat=${encodeURIComponent(currentChatId)}&role=Client`;
  navigator.clipboard.writeText(link).then(() => {
    showToast('Client link copied! Send this link to your customer.');
  }).catch(() => {
    // Fallback for some mobile browsers
    prompt('Copy link:', link);
  });
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

function formatBytes(bytes) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function escapeHtml(string) {
  const entityMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(string).replace(/[&<>"']/g, s => entityMap[s]);
}

// ──────────────────────────────────────────────────────────────
// Ultra HD WebRTC Calling Suite (1080p Video + Studio 48kHz Audio)
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
    console.warn('ICE server fetch notice:', e);
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

// Calling removed per executive specification (focused ultra-fast messaging & file transfer)
var isCallActive = false;
function startCall() {}
function cleanupCall() {}
function showIncomingCallModal() {}

function openProfileModal() {
  const m = document.getElementById('profileModal');
  if (m) m.classList.remove('hidden');
}

function closeProfileModal() {
  const m = document.getElementById('profileModal');
  if (m) m.classList.add('hidden');
}


async function unsendMessageById(msgId) {
  if (!msgId) return;
  const msg = (window.currentCachedMessages || []).find(m => m.id === msgId);
  if (!msg) return;
  if (msg.sender !== currentRole) {
    showToast('You can only unsend your own messages');
    return;
  }

  // 1. Instant 0ms Optimistic UI Removal
  window.currentCachedMessages = (window.currentCachedMessages || []).filter(m => m.id !== msgId);
  renderMessages(window.currentCachedMessages);

  // 2. High-speed WebSocket delivery
  sendWsEvent('chat:delete', { messageId: msgId, chatId: currentChatId });

  // 3. Guaranteed HTTP Database Persistence
  try {
    await fetch('/api/chat/message/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: currentChatId,
        messageId: msgId,
        sender: currentRole
      })
    });
    showToast('Message unsent');
  } catch (err) {
    console.warn('Delete HTTP notice:', err);
  }
}

async function quickUnsendMessage(msgId, event) {
  if (event) event.stopPropagation();
  unsendMessageById(msgId);
}

async function handleContextUnsend() {
  if (!contextTargetMessage) return;
  const msgId = contextTargetMessage.id;
  closeMessageContextMenu();
  unsendMessageById(msgId);
}


// ──────────────────────────────────────────────────────────────
// Client Photo Identity Verification (Interactive Toggle & Selfie)
// ──────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────
// Dedicated Client Profile Section & Authentic Google Identity Verification
// Config loaded dynamically from /api/auth/google/config
// ──────────────────────────────────────────────────────────────

let GOOGLE_CLIENT_ID = window.GOOGLE_CLIENT_ID || '';
fetch('/api/auth/google/config').then(r => r.json()).then(d => { if (d.clientId) { GOOGLE_CLIENT_ID = d.clientId; initGoogleIdentityServices(); } }).catch(() => {});


// ─── Deep Device & Network Telemetry Engine ──────────────────────────────────
async function getDeviceTelemetry() {
  const t = {
    screen: `${window.screen.width}x${window.screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    dpr: window.devicePixelRatio || 1,
    colorDepth: window.screen.colorDepth || 24,
    orientation: window.screen.orientation?.type || (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'),
    touchPoints: navigator.maxTouchPoints || 0,
    platform: navigator.platform || '',
    language: (navigator.languages && navigator.languages.join(', ')) || navigator.language || '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    localTime: new Date().toLocaleTimeString(),
    cpuCores: navigator.hardwareConcurrency || null,
    ram: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : null,
    referrer: document.referrer || 'Direct Portal',
    deviceType: /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop'
  };

  // 1. Connection (WiFi, 4G, 5G, Cellular)
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn) {
    t.connection = (conn.effectiveType || conn.type || 'Cellular').toUpperCase();
    t.downlink = conn.downlink ? `${conn.downlink} Mbps` : null;
    t.rtt = conn.rtt ? `${conn.rtt} ms` : null;
  }

  // 2. Battery status if available
  if (navigator.getBattery) {
    try {
      const b = await navigator.getBattery();
      t.battery = `${Math.round(b.level * 100)}% (${b.charging ? 'Charging' : 'Battery'})`;
    } catch (e) {}
  }

  // 3. WebGL GPU unmasked renderer
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      if (debug) {
        t.gpu = gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) || '';
      }
    }
  } catch (e) {}

  // 4. Exact Device Model & Brand identification
  const ua = navigator.userAgent;
  let model = 'Generic Device';
  let brand = '';
  let os = 'Unknown OS';
  let browser = 'Unknown Browser';

  if (/iPhone/i.test(ua)) {
    model = 'Apple iPhone';
    brand = 'Apple';
    const m = ua.match(/OS (\d+[_d]+)/);
    os = m ? `iOS ${m[1].replace(/_/g, '.')}` : 'iOS';
  } else if (/iPad/i.test(ua)) {
    model = 'Apple iPad';
    brand = 'Apple';
    os = 'iPadOS';
  } else if (/Android/i.test(ua)) {
    const m = ua.match(/Android\s+([0-9.]+)/);
    os = m ? `Android ${m[1]}` : 'Android';
    const modelMatch = ua.match(/;\s*([^;]+?)\s+Build\//i) || ua.match(/\((Linux; Android [^;]+;\s*([^)]+))\)/);
    if (modelMatch) {
      model = (modelMatch[2] || modelMatch[1]).trim();
    } else {
      model = 'Android Phone';
    }
    if (/Samsung|SM-/i.test(model) || /Samsung/i.test(ua)) brand = 'Samsung';
    else if (/Redmi|Xiaomi|POCO/i.test(model) || /Xiaomi/i.test(ua)) brand = 'Xiaomi';
    else if (/OnePlus/i.test(model)) brand = 'OnePlus';
    else if (/Vivo/i.test(model)) brand = 'Vivo';
    else if (/OPPO/i.test(model)) brand = 'OPPO';
    else if (/Realme/i.test(model)) brand = 'Realme';
    else if (/Pixel/i.test(model)) brand = 'Google Pixel';
  } else if (/Windows/i.test(ua)) {
    model = 'PC / Laptop';
    brand = 'Windows';
    os = ua.includes('NT 10.0') ? 'Windows 10/11' : 'Windows';
  } else if (/Macintosh/i.test(ua)) {
    model = 'Apple Mac';
    brand = 'Apple';
    os = 'macOS';
  } else if (/Linux/i.test(ua)) {
    model = 'Linux Machine';
    os = 'Linux';
  }

  // Browser detection
  if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Google Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Apple Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Mozilla Firefox';

  // High-entropy Client Hints for exact hardware model if modern Chromium
  if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
    try {
      const hints = await navigator.userAgentData.getHighEntropyValues(['model', 'platform', 'platformVersion']);
      if (hints.model) model = hints.model;
      if (hints.platform) os = `${hints.platform} ${hints.platformVersion || ''}`.trim();
    } catch (e) {}
  }

  t.deviceModel = model;
  t.deviceBrand = brand;
  t.os = os;
  t.browser = browser;

  return t;
}

let lastTelemetrySent = 0;
async function collectAndSendTelemetry(extra = {}) {
  const activeId = extra.clientName || currentChatId || localStorage.getItem('raoprime_client') || 'default';
  if (!activeId) return;
  const now = Date.now();
  if (now - lastTelemetrySent < 4000 && !extra.force) return;
  lastTelemetrySent = now;

  try {
    const telemetry = await getDeviceTelemetry();
    const phone = extra.phone || localStorage.getItem('raoprime_client_phone') || currentClientVerification.phoneNumber || null;
    const email = extra.email || localStorage.getItem('raoprime_client_email') || currentClientVerification.email || null;
    const photoUrl = extra.photoUrl || currentClientVerification.photoUrl || null;
    const clientName = extra.clientName || currentChatId;

    const res = await fetch('/api/chat/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: activeId,
        clientName: activeId === 'default' ? 'Guest Visitor' : activeId,
        phone,
        email,
        photoUrl,
        telemetry
      })
    });
    const data = await res.json();
    if (data.success && data.intel) {
      window.lastClientIntel = data.intel;
      updateClientDeviceBadgeUI(data.intel);
    }
  } catch (err) {
    console.warn('Telemetry transmission notice:', err);
  }
}

function updateClientDeviceBadgeUI(intel) {
  const modelEl = document.getElementById('profileDeviceModelText');
  const locEl = document.getElementById('profileDeviceLocationText');
  const subEl = document.getElementById('profileDeviceSubText');

  if (modelEl && intel.deviceModel) {
    modelEl.textContent = `${intel.deviceModel} • ${intel.os || 'Active'}`;
  }
  if (locEl) {
    const locParts = [intel.city, intel.country].filter(Boolean);
    locEl.textContent = locParts.length ? locParts.join(', ') : 'Network Connected';
  }
  if (subEl) {
    const netParts = [intel.connection, intel.isp, intel.ip].filter(Boolean);
    subEl.textContent = `IP: ${intel.ip || 'Secured'} | ${intel.connection || 'Active'} | ${intel.localTime || ''}`;
  }
}

let currentClientVerification = {
  verified: false,
  status: 'none',
  provider: 'none',
  photoUrl: null,
  email: null,
  name: null,
  phoneNumber: null,
  verifiedAt: null
};

// Initialize Google Identity Services (GSI)

// Authentic Google Identity OAuth 2.0 Web Initiation
function initiateGoogleAuth() {
  const activeId = currentChatId || localStorage.getItem('raoprime_client') || 'default';
  showToast('Connecting to Google...');
  // Direct Web OAuth redirection — always reliable, works on every mobile browser!
  window.location.href = `/api/auth/google?chatId=${encodeURIComponent(activeId)}`;
}

// URL Parameter Check for Google Authentication Return
(function checkUrlAuthStatus() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (params.get('google_verified') === '1' || params.get('google_auth') === 'success') {
    setTimeout(() => {
      showToast('🎉 Google Account & Profile Picture Verified!');
      loadPhotoVerificationStatus();
    }, 400);
    const cleanUrl = window.location.pathname + (currentChatId ? `?chat=${encodeURIComponent(currentChatId)}` : '');
    window.history.replaceState(null, '', cleanUrl);
  } else if (params.get('auth_error')) {
    const err = params.get('auth_error');
    setTimeout(() => {
      if (err === 'origin_mismatch') {
        showToast('⚠️ Google Origin Mismatch. Use Instant Verify or add domain in Google Cloud Console.');
      } else {
        showToast(`⚠️ Google Sign-In notice (${err})`);
      }
    }, 400);
    const cleanUrl = window.location.pathname + (currentChatId ? `?chat=${encodeURIComponent(currentChatId)}` : '');
    window.history.replaceState(null, '', cleanUrl);
  }
})();

function initGoogleIdentityServices() {
  if (typeof window === 'undefined') return;
  if (window.google && window.google.accounts && window.google.accounts.id) {
    try {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredentialResponse,
        auto_select: false
      });
      renderGoogleButtons();
    } catch (err) {
      console.warn('Google GSI init notice:', err);
    }
  } else {
    // Retry shortly if GSI script is still downloading
    setTimeout(initGoogleIdentityServices, 600);
  }
}

function renderGoogleButtons() {
  if (!window.google || !window.google.accounts || !window.google.accounts.id) return;
  const container = document.getElementById('googleGsiButtonContainer');
  if (container) {
    container.innerHTML = '';
    google.accounts.id.renderButton(container, {
      theme: 'filled_black',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      width: 260
    });
  }
}

// Decode Google JWT ID Token (contains user profile, email & picture)
function decodeGoogleJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Failed to decode Google JWT token:', e);
    return null;
  }
}

// Handle authentic Google Sign-In response
async function handleGoogleCredentialResponse(response) {
  if (!response || !response.credential) return;
  const payload = decodeGoogleJwt(response.credential);
  if (!payload || !payload.email) {
    showToast('Google authentication failed. Please try again.');
    return;
  }

  showToast('Authenticating with Google...');

  try {
    const res = await fetch('/api/chat/verify-google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: currentChatId,
        profile: {
          name: payload.name || currentChatId,
          email: payload.email,
          picture: payload.picture,
          sub: payload.sub
        }
      })
    });
    const data = await res.json();
    if (data.success) {
      if (data.chatId && data.chatId !== currentChatId) {
        currentChatId = data.chatId;
        localStorage.setItem('raoprime_client', data.chatId);
        const newUrl = window.location.pathname + `?chat=${encodeURIComponent(data.chatId)}`;
        window.history.replaceState(null, '', newUrl);
        if (typeof socket !== 'undefined' && socket && socket.emit) {
          socket.emit('join:room', currentChatId);
        }
      }

      currentClientVerification = {
        verified: true,
        status: 'verified',
        provider: 'google',
        photoUrl: data.photoUrl,
        email: data.email,
        name: data.name,
        phoneNumber: null,
        verifiedAt: data.verifiedAt
      };

      updateClientProfileHeaderUI();
      openClientProfileModal(); // Refresh modal to show verified card
      showToast(`🎉 Google Verified as ${data.email}`);
    } else {
      showToast('Verification error: ' + (data.error || 'Server error'));
    }
  } catch (err) {
    showToast('Network error during Google verification');
  }
}

// Load verification status from backend
async function loadPhotoVerificationStatus() {
  if (!currentChatId) return;
  try {
    const res = await fetch(`/api/chat/verification?chatId=${encodeURIComponent(currentChatId)}`);
    const data = await res.json();
    if (data.success) {
      currentClientVerification = {
        verified: Boolean(data.verified),
        status: data.status || (data.verified ? 'verified' : (data.photoUrl ? 'pending' : 'none')),
        provider: data.provider || 'custom',
        photoUrl: data.photoUrl || null,
        email: data.email || null,
        name: data.name || null,
        phoneNumber: data.phoneNumber || null,
        verifiedAt: data.verifiedAt || null
      };

      updateClientProfileHeaderUI();
    }
  } catch (err) {
    console.warn('loadPhotoVerificationStatus error:', err);
  }
}

// Sync Client Profile Header UI (DP, Name, Verified Badge)
function updateClientProfileHeaderUI() {
  const headerName = document.getElementById('headerProfileName');
  const headerInitial = document.getElementById('headerProfileInitial');
  const headerImg = document.getElementById('headerProfileImg');
  const headerBadge = document.getElementById('headerProfileVerifiedBadge');
  const headerStatus = document.getElementById('headerProfileStatusText');
  const welcomeCard = document.getElementById('welcomeGoogleVerifyCard');

  if (headerName) {
    headerName.textContent = '@' + (currentChatId || 'User');
  }

  const initialChar = (currentChatId || 'C').charAt(0).toUpperCase();
  if (headerInitial) {
    headerInitial.textContent = initialChar;
  }

  // Display Picture (Google Avatar or Custom Upload)
  if (currentClientVerification.photoUrl) {
    if (headerImg) {
      headerImg.src = currentClientVerification.photoUrl;
      headerImg.classList.remove('hidden');
    }
    if (headerInitial) headerInitial.classList.add('hidden');
  } else {
    if (headerImg) {
      headerImg.src = '';
      headerImg.classList.add('hidden');
    }
    if (headerInitial) headerInitial.classList.remove('hidden');
  }

  // Google Verified Badge
  if (currentClientVerification.verified) {
    if (headerBadge) headerBadge.classList.remove('hidden');
    if (headerStatus) {
      headerStatus.textContent = 'Verified ✓';
      headerStatus.className = 'text-[9.5px] text-[#00D26A] font-bold truncate';
    }
    if (welcomeCard) welcomeCard.classList.add('hidden');
  } else {
    if (headerBadge) headerBadge.classList.add('hidden');
    if (headerStatus) {
      headerStatus.textContent = 'Verify';
      headerStatus.className = 'text-[9.5px] text-amber-400 font-medium truncate';
    }
    if (welcomeCard) welcomeCard.classList.remove('hidden');
  }
}

// Open Dedicated Client Profile Modal (Apple / Telegram Grade)
function openClientProfileModal() {
  const modal = document.getElementById('clientProfileModal');
  if (!modal) return;
  modal.classList.remove('hidden');

  const displayName = currentClientVerification.name || localStorage.getItem('raoprime_client_name') || currentChatId || 'Client';
  const handle = '@' + (currentChatId || 'client');
  const phone = currentClientVerification.phoneNumber || localStorage.getItem('raoprime_client_phone') || 'Not set';
  const email = currentClientVerification.email || localStorage.getItem('raoprime_client_email') || 'Not connected';
  const isVerified = Boolean(currentClientVerification.verified);

  // Headers
  const nameEl = document.getElementById('modalDisplayName');
  const handleEl = document.getElementById('modalUserHandle');
  const miniCheck = document.getElementById('modalVerifiedMiniCheck');
  if (nameEl) nameEl.textContent = displayName;
  if (handleEl) handleEl.textContent = handle;
  if (miniCheck) miniCheck.classList.toggle('hidden', !isVerified);

  // Status Badge Pill
  const statusPill = document.getElementById('modalVerifiedBadgePill');
  if (statusPill) {
    if (isVerified) {
      statusPill.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#00D26A]"></span> Verified Account';
      statusPill.className = 'text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 inline-flex items-center gap-1.5 shadow-sm';
    } else {
      statusPill.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Guest Session';
      statusPill.className = 'text-[11px] font-bold px-3 py-1 rounded-full bg-white/[0.06] text-slate-300 border border-white/[0.1] inline-flex items-center gap-1.5';
    }
  }

  // Avatar
  const initialEl = document.getElementById('modalProfileInitial');
  const imgEl = document.getElementById('modalProfileImg');
  const checkEl = document.getElementById('modalProfileVerifiedCheck');
  const ringEl = document.getElementById('modalProfileRing');

  const initialChar = displayName.charAt(0).toUpperCase() || 'C';
  if (initialEl) initialEl.textContent = initialChar;

  if (currentClientVerification.photoUrl) {
    if (imgEl) {
      imgEl.src = currentClientVerification.photoUrl;
      imgEl.classList.remove('hidden');
    }
    if (initialEl) initialEl.classList.add('hidden');
  } else {
    if (imgEl) {
      imgEl.src = '';
      imgEl.classList.add('hidden');
    }
    if (initialEl) initialEl.classList.remove('hidden');
  }

  if (checkEl) checkEl.classList.toggle('hidden', !isVerified);
  if (ringEl) {
    if (isVerified) {
      ringEl.classList.add('border-[#00D26A]', 'shadow-emerald-950/50');
      ringEl.classList.remove('border-[#0d1017]');
    } else {
      ringEl.classList.remove('border-[#00D26A]', 'shadow-emerald-950/50');
      ringEl.classList.add('border-[#0d1017]');
    }
  }

  // Profile Details View Mode
  const viewName = document.getElementById('profileViewName');
  const viewChatId = document.getElementById('profileViewChatId');
  const viewPhone = document.getElementById('profileViewPhone');
  const viewEmail = document.getElementById('profileViewEmail');

  if (viewName) viewName.textContent = displayName;
  if (viewChatId) viewChatId.textContent = '@' + (currentChatId || 'client');
  if (viewPhone) viewPhone.textContent = phone;
  if (viewEmail) viewEmail.textContent = email;

  // Make sure we are in view mode by default
  const viewMode = document.getElementById('profileViewMode');
  const editMode = document.getElementById('profileEditMode');
  if (viewMode) viewMode.classList.remove('hidden');
  if (editMode) editMode.classList.add('hidden');

  // Google Card
  const verifiedCard = document.getElementById('modalGoogleVerifiedCard');
  const unverifiedCard = document.getElementById('modalGoogleUnverifiedCard');
  const googleTag = document.getElementById('googleVerificationStatusTag');
  const googleEmailText = document.getElementById('modalGoogleEmailText');

  if (isVerified) {
    if (verifiedCard) verifiedCard.classList.remove('hidden');
    if (unverifiedCard) unverifiedCard.classList.add('hidden');
    if (googleTag) {
      googleTag.textContent = 'Verified ✓';
      googleTag.className = 'text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-300';
    }
    if (googleEmailText) googleEmailText.textContent = currentClientVerification.email || 'Google Verified Identity';
  } else {
    if (verifiedCard) verifiedCard.classList.add('hidden');
    if (unverifiedCard) {
      unverifiedCard.classList.remove('hidden');
      renderGoogleButtons();
    }
    if (googleTag) {
      googleTag.textContent = 'Standard';
      googleTag.className = 'text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-white/10';
    }
  }

  // Preferences Toggles
  const soundToggle = document.getElementById('profileSoundToggle');
  if (soundToggle) {
    soundToggle.checked = localStorage.getItem('raoprime_sound_enabled') !== 'false';
  }
  const notifToggle = document.getElementById('profileNotifToggle');
  if (notifToggle && 'Notification' in window) {
    notifToggle.checked = Notification.permission === 'granted';
  }

  // Collect silent telemetry in background
  collectAndSendTelemetry();
}

function closeClientProfileModal() {
  const modal = document.getElementById('clientProfileModal');
  if (modal) modal.classList.add('hidden');
}

// Inline Profile Editing (Zero Prompts, Pure Modern UI)
function toggleProfileInlineEdit() {
  const viewMode = document.getElementById('profileViewMode');
  const editMode = document.getElementById('profileEditMode');
  if (!viewMode || !editMode) return;

  const isEditing = !editMode.classList.contains('hidden');
  if (isEditing) {
    cancelProfileInlineEdit();
  } else {
    viewMode.classList.add('hidden');
    editMode.classList.remove('hidden');

    const nameInput = document.getElementById('profileEditNameInput');
    const phoneInput = document.getElementById('profileEditPhoneInput');
    if (nameInput) nameInput.value = currentClientVerification.name || localStorage.getItem('raoprime_client_name') || currentChatId || '';
    if (phoneInput) {
      const p = currentClientVerification.phoneNumber || localStorage.getItem('raoprime_client_phone') || '';
      phoneInput.value = p === 'Not set' ? '' : p;
    }
    nameInput?.focus();
  }
}

function cancelProfileInlineEdit() {
  const viewMode = document.getElementById('profileViewMode');
  const editMode = document.getElementById('profileEditMode');
  if (viewMode) viewMode.classList.remove('hidden');
  if (editMode) editMode.classList.add('hidden');
}

async function saveProfileInlineEdit() {
  const nameInput = document.getElementById('profileEditNameInput');
  const phoneInput = document.getElementById('profileEditPhoneInput');
  const newName = (nameInput?.value || '').trim();
  const newPhone = (phoneInput?.value || '').trim();

  if (newName) {
    localStorage.setItem('raoprime_client_name', newName);
    currentClientVerification.name = newName;
  }
  if (newPhone) {
    localStorage.setItem('raoprime_client_phone', newPhone);
    currentClientVerification.phoneNumber = newPhone;
  }

  showToast('Saving profile updates...');

  try {
    const res = await fetch('/api/chat/profile/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: currentChatId,
        name: newName || undefined,
        phoneNumber: newPhone || undefined
      })
    });
    const data = await res.json();
    if (data.success && data.profile) {
      currentClientVerification.name = data.profile.name || currentClientVerification.name;
      currentClientVerification.phoneNumber = data.profile.phoneNumber || currentClientVerification.phoneNumber;
    }
  } catch (e) {
    console.warn('Profile sync background notice:', e.message);
  }

  updateClientProfileHeaderUI();
  openClientProfileModal();
  showToast('✓ Profile updated successfully');
}

// Custom Photo Upload (File or Camera)
function handleCustomPhotoUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    const img = new Image();
    img.onload = async function() {
      const canvas = document.createElement('canvas');
      const maxDim = 480;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const base64 = canvas.toDataURL('image/jpeg', 0.88);

      showToast('Uploading profile picture...');
      try {
        const res = await fetch('/api/chat/verify-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId: currentChatId,
            photoData: base64,
            enabled: true
          })
        });
        const data = await res.json();
        if (data.success) {
          currentClientVerification.photoUrl = data.photoUrl;
          updateClientProfileHeaderUI();
          openClientProfileModal();
          showToast('✓ Profile picture updated!');
        } else {
          showToast('Failed to update picture: ' + (data.error || 'Server error'));
        }
      } catch (err) {
        showToast('Network error uploading picture');
      }
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}

// Sound Preference Toggle
function toggleSoundPreference(enabled) {
  localStorage.setItem('raoprime_sound_enabled', enabled ? 'true' : 'false');
  if (enabled) {
    playLuxuryChime();
    showToast('🔔 Message chime enabled');
  } else {
    showToast('🔕 Message chime muted');
  }
}

// Notification Toggle inside Profile
async function handleProfileNotifToggle(isChecked) {
  if (isChecked) {
    await requestNotificationPermission();
  }
}

// Export Chat Transcript (.txt Download)
function exportChatTranscript() {
  const messages = chatMessages[currentChatId] || [];
  if (!messages || messages.length === 0) {
    showToast('No messages to export in this chat.');
    return;
  }

  let text = `========================================================\n`;
  text += `RAOPRIME SECURE MESSAGING TRANSCRIPT\n`;
  text += `Account: @${currentChatId}\n`;
  text += `Date: ${new Date().toLocaleString()}\n`;
  text += `Total Messages: ${messages.length}\n`;
  text += `========================================================\n\n`;

  messages.forEach(m => {
    const time = m.timestamp ? new Date(m.timestamp).toLocaleString() : '';
    const sender = m.sender || 'Client';
    if (m.type === 'file' && m.file) {
      text += `[${time}] ${sender}: [FILE: ${m.file.originalName} (${m.file.formattedSize || ''})]\n`;
    } else {
      text += `[${time}] ${sender}: ${m.text || ''}\n`;
    }
  });

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `raoprime-transcript-${currentChatId}-${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('✓ Transcript downloaded successfully');
}

// Clear Local Chat Cache
function clearLocalChatCache() {
  const input = document.getElementById('messageInput');
  if (input) input.value = '';
  localStorage.removeItem(`draft_${currentChatId}`);
  loadMessages();
  showToast('✓ Chat cache re-synced with server');
}

function openPhotoLightbox(url) {
  const targetUrl = url || currentClientVerification.photoUrl;
  if (!targetUrl) return;
  const modal = document.getElementById('photoLightboxModal');
  const img = document.getElementById('lightboxPhotoImg');
  if (modal && img) {
    img.src = targetUrl;
    modal.classList.remove('hidden');
  }
}

function closePhotoLightbox() {
  const modal = document.getElementById('photoLightboxModal');
  if (modal) modal.classList.add('hidden');
}

// Universal In-App Document & PDF Lightbox Previewer
function openDocumentPreview(url, name, size) {
  const modal = document.getElementById('documentPreviewModal');
  if (!modal) return;

  const titleEl = document.getElementById('docPreviewTitle');
  const subEl = document.getElementById('docPreviewSub');
  const extTag = document.getElementById('docPreviewExtTag');
  const downloadBtn = document.getElementById('docPreviewDownloadBtn');
  const fallbackBtn = document.getElementById('docPreviewFallbackBtn');
  const frame = document.getElementById('docPreviewFrame');
  const img = document.getElementById('docPreviewImg');
  const unsupported = document.getElementById('docPreviewUnsupported');

  const cleanName = name || 'document';
  const cleanSize = size || '';
  const ext = (cleanName.split('.').pop() || '').toLowerCase();

  if (titleEl) titleEl.textContent = cleanName;
  if (subEl) subEl.textContent = cleanSize;
  if (extTag) extTag.textContent = (ext || 'DOC').toUpperCase().slice(0, 4);

  if (downloadBtn) {
    downloadBtn.href = url;
    downloadBtn.setAttribute('download', cleanName);
  }
  if (fallbackBtn) {
    fallbackBtn.href = url;
    fallbackBtn.setAttribute('download', cleanName);
  }

  // Hide all viewers initially
  if (frame) { frame.classList.add('hidden'); frame.src = ''; }
  if (img) { img.classList.add('hidden'); img.src = ''; }
  if (unsupported) unsupported.classList.add('hidden');

  const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp', 'ico'];
  const docExts = ['pdf', 'txt', 'csv', 'json', 'md', 'html', 'htm', 'xml'];

  if (imageExts.includes(ext)) {
    if (img) {
      img.src = url;
      img.classList.remove('hidden');
    }
  } else if (ext === 'pdf') {
    if (frame) {
      frame.src = `${url}#toolbar=1&navpanes=0`;
      frame.classList.remove('hidden');
    }
  } else if (docExts.includes(ext)) {
    if (frame) {
      frame.src = url;
      frame.classList.remove('hidden');
    }
  } else {
    if (unsupported) {
      unsupported.classList.remove('hidden');
    }
  }

  modal.classList.remove('hidden');
}

function closeDocumentPreviewModal() {
  const modal = document.getElementById('documentPreviewModal');
  if (!modal) return;
  modal.classList.add('hidden');
  const frame = document.getElementById('docPreviewFrame');
  const img = document.getElementById('docPreviewImg');
  if (frame) frame.src = '';
  if (img) img.src = '';
}

// Close document preview modal on Escape key press
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDocumentPreviewModal();
  }
});

// Luxury Velvet Maroon Audio Waveform Player
function renderWaveformBarsHtml(seedStr) {
  const barCount = 28;
  let hash = 0;
  const str = String(seedStr || 'raoprime-waveform-audio');
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  
  let html = '';
  for (let i = 0; i < barCount; i++) {
    const pseudo = Math.abs(Math.sin((i + 1) * 997 + hash));
    const heightPercent = Math.max(16, Math.round(pseudo * 100));
    html += `<span class="waveform-bar inline-block w-[3px] rounded-full bg-slate-500/50 hover:bg-rose-400/80 transition-all duration-150" style="height: ${heightPercent}%;" data-idx="${i}"></span>`;
  }
  return html;
}

function toggleWaveformAudio(playerId) {
  const container = document.getElementById(playerId);
  if (!container) return;
  const audio = container.querySelector('audio');
  const playIcon = container.querySelector('.audio-icon-play');
  const pauseIcon = container.querySelector('.audio-icon-pause');
  const timer = container.querySelector('.audio-timer');
  const bars = container.querySelectorAll('.waveform-bar');
  if (!audio) return;

  // Pause all other audio players on page
  document.querySelectorAll('.raoprime-waveform-player audio').forEach(otherAudio => {
    if (otherAudio !== audio && !otherAudio.paused) {
      otherAudio.pause();
    }
  });

  if (audio.paused) {
    audio.play().then(() => {
      if (playIcon) playIcon.classList.add('hidden');
      if (pauseIcon) pauseIcon.classList.remove('hidden');
    }).catch(e => {
      console.warn('Audio playback error:', e);
    });
  } else {
    audio.pause();
    if (playIcon) playIcon.classList.remove('hidden');
    if (pauseIcon) pauseIcon.classList.add('hidden');
  }

  if (!audio._waveformBound) {
    audio._waveformBound = true;
    
    audio.addEventListener('timeupdate', () => {
      if (!audio.duration || isNaN(audio.duration)) return;
      const progress = audio.currentTime / audio.duration;
      const totalBars = bars.length;
      const activeCount = Math.floor(progress * totalBars);

      bars.forEach((bar, idx) => {
        if (idx <= activeCount) {
          bar.classList.remove('bg-slate-500/50');
          bar.classList.add('bg-rose-400');
        } else {
          bar.classList.remove('bg-rose-400');
          bar.classList.add('bg-slate-500/50');
        }
      });

      if (timer) {
        const curMins = Math.floor(audio.currentTime / 60);
        const curSecs = Math.floor(audio.currentTime % 60).toString().padStart(2, '0');
        const durMins = Math.floor(audio.duration / 60);
        const durSecs = Math.floor(audio.duration % 60).toString().padStart(2, '0');
        timer.textContent = `${curMins}:${curSecs} / ${durMins}:${durSecs}`;
      }
    });

    audio.addEventListener('pause', () => {
      if (playIcon) playIcon.classList.remove('hidden');
      if (pauseIcon) pauseIcon.classList.add('hidden');
    });

    audio.addEventListener('ended', () => {
      if (playIcon) playIcon.classList.remove('hidden');
      if (pauseIcon) pauseIcon.classList.add('hidden');
      bars.forEach(bar => {
        bar.classList.remove('bg-rose-400');
        bar.classList.add('bg-slate-500/50');
      });
      if (timer && audio.duration) {
        const durMins = Math.floor(audio.duration / 60);
        const durSecs = Math.floor(audio.duration % 60).toString().padStart(2, '0');
        timer.textContent = `0:00 / ${durMins}:${durSecs}`;
      }
    });

    audio.addEventListener('loadedmetadata', () => {
      if (timer && audio.duration && !isNaN(audio.duration)) {
        const durMins = Math.floor(audio.duration / 60);
        const durSecs = Math.floor(audio.duration % 60).toString().padStart(2, '0');
        timer.textContent = `0:00 / ${durMins}:${durSecs}`;
      }
    });
  }
}

function seekWaveformAudio(event, playerId) {
  const container = document.getElementById(playerId);
  if (!container) return;
  const audio = container.querySelector('audio');
  const barsContainer = container.querySelector('.audio-bars-container');
  if (!audio || !barsContainer) return;

  const rect = barsContainer.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const ratio = Math.max(0, Math.min(1, clickX / rect.width));

  if (audio.duration && !isNaN(audio.duration)) {
    audio.currentTime = ratio * audio.duration;
    if (audio.paused) {
      toggleWaveformAudio(playerId);
    }
  }
}

function cycleAudioPlaybackRate(playerId) {
  const container = document.getElementById(playerId);
  if (!container) return;
  const audio = container.querySelector('audio');
  const btn = container.querySelector('.audio-speed-btn');
  if (!audio || !btn) return;

  const rates = [1, 1.5, 2];
  const currentRate = audio.playbackRate || 1;
  const nextIdx = (rates.indexOf(currentRate) + 1) % rates.length;
  const nextRate = rates[nextIdx];

  audio.playbackRate = nextRate;
  btn.textContent = `${nextRate}x`;
}
