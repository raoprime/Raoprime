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

    case 'call:incoming': {
      if (isCallActive) return;
      const call = payload.call;
      if (call && call.caller !== currentRole && call.status === 'ringing') {
        pendingCall = call;
        showIncomingCallModal(call);
      }
      break;
    }

    case 'call:signal': {
      const fromRole = payload.from || payload.sender;
      if (fromRole && fromRole === currentRole) break; // Ignore our own echo
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
        showToast('Ultra HD connected!');
        if (peerConnection && peerConnection.localDescription) {
          sendCallSignal({ sdp: peerConnection.localDescription });
        }
      }
      break;
    }

    case 'call:ended': {
      cleanupCall();
      showToast('Call ended');
      break;
    }
  }
}

// Official Luxury Acoustic Double-Ping Chime
function playLuxuryChime() {
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
      bellIcon.classList.remove('text-amber-400', 'text-rose-400', 'text-slate-200');
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
      bellIcon.classList.add('text-rose-400');
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
      bellIcon.classList.remove('text-emerald-400', 'text-rose-400');
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

  if (isTyping) {
    if (headerStatus) {
      headerStatus.innerHTML = `
        <span class="text-rose-400 font-semibold flex items-center gap-1.5 animate-pulse">
          <span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span> Raoprime is typing...
        </span>`;
    }
    if (bubble && bubble.classList.contains('hidden')) {
      bubble.classList.remove('hidden');
      scrollToBottom();
    }
    if (radarDot) {
      radarDot.className = 'absolute bottom-0 right-0 w-3 h-3 bg-rose-500 border-2 border-[#0a0c12] rounded-full animate-ping';
    }
  } else if (isOnline) {
    if (headerStatus) {
      headerStatus.innerHTML = `
        <span class="text-emerald-400 font-semibold flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Active now
        </span>
        <span class="text-slate-600 hidden xs:inline">•</span>
        <span class="hidden sm:inline text-slate-400">Encrypted Client Desk</span>`;
    }
    if (bubble) bubble.classList.add('hidden');
    if (radarDot) {
      radarDot.className = 'absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#0a0c12] rounded-full radar-pulse';
    }
  } else {
    // Offline
    if (headerStatus) {
      headerStatus.innerHTML = `
        <span class="text-slate-400 font-medium flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span> Offline
        </span>
        <span class="text-slate-600 hidden xs:inline">•</span>
        <span class="hidden sm:inline text-slate-400">Encrypted Client Desk</span>`;
    }
    if (bubble) bubble.classList.add('hidden');
    if (radarDot) {
      radarDot.className = 'absolute bottom-0 right-0 w-3 h-3 bg-slate-500 border-2 border-[#0a0c12] rounded-full';
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
    roleText.className = role === 'Raoprime' ? 'font-bold text-emerald-400' : 'font-bold text-rose-400';
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
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="underline decoration-rose-300/60 hover:decoration-rose-200 text-rose-200 font-medium inline-flex items-center gap-1 hover:text-white transition-colors" onclick="event.stopPropagation()">${url}<svg class="w-3.5 h-3.5 inline shrink-0 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>`;
  });

  // Format bold **text**
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>');

  // Format inline code `code`
  escaped = escaped.replace(/`([^`]+)`/g, '<code class="bg-black/30 border border-white/10 px-1.5 py-0.5 rounded text-[13px] font-mono text-rose-200">$1</code>');

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

      // Check if other party (Raoprime Admin) is typing or online
      const otherSender = currentRole === 'Client' ? 'Raoprime' : 'Client';
      const isOtherTyping = Boolean(data.typing && data.typing[otherSender]);
      const isOtherOnline = Boolean(data.online && data.online[otherSender]);
      const currentTypingSig = `${isOtherOnline}:${isOtherTyping}`;
      if (currentTypingSig !== lastTypingSig) {
        lastTypingSig = currentTypingSig;
        updateTypingUI(isOtherOnline, isOtherTyping);
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
  let lastDateStr = '';
    const isOut = msg.sender === currentRole;
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

    const isSameSenderAsPrev = !isNewDay && prevMsg && prevMsg.sender === msg.sender;
    const isSameSenderAsNext = nextMsg && nextMsg.sender === msg.sender && (new Date(nextMsg.timestamp)).toDateString() === dateFormatted;

    const topSpacing = isNewDay ? 'mt-1' : (isSameSenderAsPrev ? 'mt-1' : 'mt-3.5');
    const midClass = isSameSenderAsNext ? 'bubble-mid' : '';

    const timeFormatted = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const editedBadge = msg.isEdited ? `<span class="text-[9.5px] ${isOut ? 'text-rose-200/80' : 'text-slate-400/80'} italic mr-0.5" title="Edited message">(edited)</span>` : '';
    const canEdit = canEditMessage(msg);
    const isEditingThis = editingMessageId === msg.id;

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
      <div class="absolute -bottom-2.5 ${isOut ? 'right-2.5' : 'left-2.5'} z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#111520] border border-white/20 text-xs shadow-md select-none hover:scale-105 transition-transform" title="Reactions: ${reactionEntries.map(([s, e]) => `${s}: ${e}`).join(', ')}">
        ${Array.from(new Set(reactionEntries.map(([, e]) => e))).map(e => `<span>${e}</span>`).join('')}
      </div>
    ` : '';

    // In-bubble time & status element
    const timeStatusHtml = `
      <span class="inline-flex items-center gap-0.5 shrink-0 select-none text-[10.5px] leading-none ${isOut ? 'text-rose-200/80' : 'text-slate-400'}">
        ${editedBadge}
        <span class="tracking-tight">${timeFormatted}</span>
        ${renderMessageStatus(msg.status, isOut)}
      </span>
    `;

    if (msg.type === 'system') {
      return `
        ${dateDividerHtml}
        <div class="flex justify-center my-4 select-none animate-in fade-in zoom-in-95 duration-200">
          <div class="px-4 py-2 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-200 text-xs font-semibold flex items-center gap-2 backdrop-blur-md shadow-lg">
            <span class="w-2 h-2 rounded-full bg-rose-400"></span>
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
    // NEVER show "You" for outgoing messages.
    // For incoming messages, only show the sender name if this is the start of a cluster.
    const showSenderLabel = !isOut && !isSameSenderAsPrev;
    const senderHeaderHtml = showSenderLabel ? `
      <div class="text-[11px] font-semibold text-rose-300/90 mb-1 px-1.5 select-none flex items-center gap-1">
        <span>${escapeHtml(msg.sender || 'Raoprime')}</span>
      </div>
    ` : '';

    return `
      ${dateDividerHtml}
      <div class="message-row flex flex-col ${isOut ? 'items-end' : 'items-start'} ${topSpacing} ${reactionEntries.length ? 'mb-2' : ''} group relative" data-msg-id="${msg.id}" data-msg-sender="${msg.sender}">
        ${senderHeaderHtml}
        
        <div class="relative flex items-center gap-1.5 ${isOut ? 'flex-row-reverse' : 'flex-row'} max-w-full">
          <!-- Main Bubble -->
          <div class="${isOut ? 'bubble-out' : 'bubble-in'} ${midClass} shadow-md cursor-pointer select-text relative group/bubble ${isEditingThis ? 'ring-2 ring-rose-400 shadow-rose-500/30' : ''}">
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
              <button type="button" onclick="quickEditMessage('${msg.id}', event)" class="p-1.5 text-slate-400 hover:text-rose-300 hover:bg-white/10 rounded-full transition-colors cursor-pointer" title="Edit Message">
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
              <button type="button" onclick="quickUnsendMessage('${msg.id}', event)" class="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 rounded-full transition-colors cursor-pointer" title="Unsend Message">
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
  return `${dateDividerHtml}<div class="message-row flex flex-col ${isOut ? 'items-end' : 'items-start'} ${topSpacing} ${reactionEntries.length ? 'mb-2' : ''} group relative" data-msg-id="${msg.id}" data-msg-sender="${msg.sender}"><div class="relative flex items-center gap-1.5 ${isOut ? 'flex-row-reverse' : 'flex-row'} max-w-full"><div class="${isOut ? 'bubble-out' : 'bubble-in'} ${midClass} shadow-md cursor-pointer select-text relative group/bubble ${isEditingThis ? 'ring-2 ring-rose-400 shadow-rose-500/30' : ''}">${bubbleContent}${reactionBadgeHtml}<button type="button" onclick="openMessageContextMenuById('${msg.id}', event)" class="message-action-btn absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/40 hover:bg-black/70 text-slate-300 hover:text-white opacity-0 sm:group-hover/bubble:opacity-100 flex items-center justify-center transition-all shadow-sm cursor-pointer z-10" title="Options"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></button></div><div class="hidden sm:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity select-none z-10 px-1 py-0.5 rounded-full bg-[#121622]/95 border border-white/10 backdrop-blur-md shadow-lg shrink-0"><button type="button" onclick="quickReactMessage('${msg.id}', '👍', event)" class="p-1 hover:scale-125 transition-transform text-xs" title="React 👍">👍</button><button type="button" onclick="quickCopyMessage('${msg.id}', event)" class="p-1.5 text-slate-400 hover:text-sky-300 hover:bg-white/10 rounded-full transition-colors cursor-pointer" title="Copy Text"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>${canEdit ? `<button type="button" onclick="quickEditMessage('${msg.id}', event)" class="p-1.5 text-slate-400 hover:text-rose-300 hover:bg-white/10 rounded-full transition-colors cursor-pointer" title="Edit Message"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></button>` : ''}<button type="button" onclick="quickReplyMessage('${msg.id}', event)" class="p-1.5 text-slate-400 hover:text-emerald-300 hover:bg-white/10 rounded-full transition-colors cursor-pointer" title="Reply"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg></button>${(msg.sender === currentRole) ? `<button type="button" onclick="quickUnsendMessage('${msg.id}', event)" class="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 rounded-full transition-colors cursor-pointer" title="Unsend Message"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>` : ''}</div></div></div>`;
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
  const input = document.getElementById('clientNameInput');
  const name = (input.value || '').trim();
  if (!name) return;

  currentChatId = name;
  localStorage.setItem('raoprime_client', name);
  document.getElementById('chatHeading').textContent = 'Raoprime';
  document.getElementById('nameModal').classList.add('hidden');
  if ('Notification' in window && Notification.permission === 'default') {
    requestNotificationPermission().catch(() => {});
  }
  
  // Set in URL cleanly without reload
  const newUrl = `${window.location.pathname}?chat=${encodeURIComponent(name)}`;
  window.history.replaceState(null, '', newUrl);

  loadMessages();
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

let peerConnection = null;
let localStream = null;
let pendingCall = null;
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

// Background check for incoming calls (Universal fallback)
let isCheckingCall = false;
setInterval(checkIncomingCallStatus, 5000);

async function checkIncomingCallStatus() {
  if (isWsConnected || isCallActive || isCheckingCall) return;
  isCheckingCall = true;
  try {
    const res = await fetch(`/api/call/status?role=client&chatId=${encodeURIComponent(currentChatId)}`);
    const data = await res.json();
    if (data.success && data.active && data.call) {
      if (data.call.caller !== currentRole && data.call.status === 'ringing') {
        if (!pendingCall) {
          pendingCall = data.call;
          showIncomingCallModal(data.call);
        }
      } else if (data.call.status === 'ended') {
        cleanupCall();
      }
    } else if (data.call && data.call.status === 'ended') {
      cleanupCall();
    }
  } catch (e) {
  } finally {
    isCheckingCall = false;
  }
}

function showIncomingCallModal(call) {
  const modal = document.getElementById('incomingCallModal');
  if (!modal) return;
  
  const callerNameEl = document.getElementById('incomingCallerName');
  const callTypeEl = document.getElementById('incomingCallType');
  const callerInitEl = document.getElementById('incomingCallerInitial');
  const avatarImg = document.getElementById('incomingCallerAvatarImg');
  const initialFallback = document.getElementById('incomingCallerInitialFallback');
  
  const callerName = call.caller || 'Raoprime';
  if (callerNameEl) callerNameEl.textContent = callerName;
  if (callerInitEl) callerInitEl.textContent = callerName.charAt(0).toUpperCase();

  if (avatarImg && initialFallback) {
    if (callerName === 'Raoprime' || callerName === 'RP') {
      avatarImg.classList.remove('hidden');
      initialFallback.classList.add('hidden');
    } else {
      avatarImg.classList.add('hidden');
      initialFallback.classList.remove('hidden');
    }
  }

  if (callTypeEl) {
    const isVid = call.type === 'video';
    callTypeEl.innerHTML = `<i data-lucide="${isVid ? 'video' : 'phone'}" class="w-4 h-4"></i> Incoming 1080p Ultra HD ${isVid ? 'Video' : 'Voice'} Call...`;
    if (window.lucide) window.lucide.createIcons();
  }

  modal.classList.remove('hidden');
  playRingtone();
}

async function startCall(type = 'video') {
  if (isCallActive) return;
  currentCallType = type;
  isCallActive = true;
  lastSignalSeq = 0;
  pendingCandidates = [];

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

  // 2. Open active call overlay instantly
  const overlay = document.getElementById('callOverlay');
  const durationEl = document.getElementById('callDuration');
  const peerNameEl = document.getElementById('callOverlayPeerName');
  const initialEl = document.getElementById('callOverlayInitial');
  const visualizerEl = document.getElementById('audioCallVisualizer');
  const localContainer = document.getElementById('localVideoContainer');
  const camBtn = document.getElementById('camToggleBtn');
  const flipBtn = document.getElementById('flipCamBtn');

  if (overlay) overlay.classList.remove('hidden');
  if (peerNameEl) peerNameEl.textContent = 'Raoprime';
  if (initialEl) initialEl.textContent = 'RP';
  if (durationEl) durationEl.textContent = 'Calling Raoprime...';

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

  // 3. Ring the callee instantly on backend (WebSocket + HTTP fallback)
  sendWsEvent('call:initiate', { caller: currentRole, type });
  try {
    await fetch('/api/call/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: currentChatId,
        caller: currentRole,
        type
      })
    });
  } catch (e) {
    console.warn('Initiate call API notice:', e);
  }

  // 4. Acquire media with 100% resilient fallback and start WebRTC offer
  try {
    await acquireLocalMedia(type === 'video');
    await initPeerConnection(type === 'video');

    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: type === 'video'
    });
    await peerConnection.setLocalDescription(offer);
    await sendCallSignal({ sdp: offer });

    if (!isWsConnected) startSignalPolling();
    showToast(`HD ${type === 'video' ? 'Video' : 'Voice'} Call initiated...`);
  } catch (err) {
    console.error('Call media setup warning:', err);
    if (!isWsConnected) startSignalPolling();
  }
}

async function acceptIncomingCall() {
  stopRingtone();
  const modal = document.getElementById('incomingCallModal');
  if (modal) modal.classList.add('hidden');

  if (!pendingCall) return;
  const call = pendingCall;
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

  const overlay = document.getElementById('callOverlay');
  const durationEl = document.getElementById('callDuration');
  const peerNameEl = document.getElementById('callOverlayPeerName');
  const initialEl = document.getElementById('callOverlayInitial');
  const visualizerEl = document.getElementById('audioCallVisualizer');
  const localContainer = document.getElementById('localVideoContainer');
  const camBtn = document.getElementById('camToggleBtn');
  const flipBtn = document.getElementById('flipCamBtn');

  if (overlay) overlay.classList.remove('hidden');
  if (peerNameEl) peerNameEl.textContent = call.caller || 'Raoprime';
  if (initialEl) initialEl.textContent = (call.caller || 'R').charAt(0).toUpperCase();
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
  sendWsEvent('call:accept', { chatId: currentChatId });
  try {
    await fetch('/api/call/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: currentChatId })
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

    if (!isWsConnected) startSignalPolling();
    showToast('Ultra HD connected!');
  } catch (err) {
    console.error('Call accept setup warning:', err);
    if (!isWsConnected) startSignalPolling();
  }
}

async function declineCall() {
  stopRingtone();
  const modal = document.getElementById('incomingCallModal');
  if (modal) modal.classList.add('hidden');
  
  sendWsEvent('call:end', { chatId: currentChatId });
  await fetch('/api/call/end', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: currentChatId })
  }).catch(() => {});
  
  pendingCall = null;
  pendingSdpOffer = null;
  pendingCandidates = [];
}

async function endCall() {
  sendWsEvent('call:end', { chatId: currentChatId });
  await fetch('/api/call/end', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: currentChatId })
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
          console.warn('Mic & Camera permission not granted:', e3);
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
        console.warn('Mic permission not granted:', e2);
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
      sendCallSignal({ candidate: event.candidate });
    }
  };

  const remoteAudioEl = document.getElementById('remoteAudio');
  const remoteVideoEl = document.getElementById('remoteVideo');

  peerConnection.ontrack = (event) => {
    console.log('📡 Remote track received:', event.track.kind);
    const track = event.track;

    if (track.kind === 'audio') {
      if (remoteAudioEl) {
        const audioStream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([track]);
        remoteAudioEl.srcObject = audioStream;
        remoteAudioEl.muted = false;
        remoteAudioEl.volume = 1.0;
        remoteAudioEl.play().catch(e => console.warn('Audio play notice:', e));
      }
    } else if (track.kind === 'video') {
      if (remoteVideoEl) {
        const videoStream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([track]);
        remoteVideoEl.srcObject = videoStream;
        // Keep video muted so it doesn't fight remoteAudio for speaker access!
        remoteVideoEl.muted = true;
        remoteVideoEl.play().catch(e => console.warn('Video play notice:', e));
      }
    }
  };

  peerConnection.onconnectionstatechange = () => {
    console.log('Peer connection state:', peerConnection.connectionState);
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
    console.log('ICE connection state:', peerConnection.iceConnectionState);
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

async function sendCallSignal(signal) {
  // Ultra-low latency 0ms transmission via WebSocket
  if (sendWsEvent('call:signal', { signal, from: currentRole })) {
    return;
  }
  // Secondary HTTP fallback
  try {
    await fetch('/api/call/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: currentChatId,
        from: currentRole,
        signal
      })
    });
  } catch (e) {}
}

function startSignalPolling() {
  if (callPollInterval) clearInterval(callPollInterval);
  // WebSocket streams signals in 0ms! Only run HTTP polling if WS is disconnected.
  if (isWsConnected) return;

  callPollInterval = setInterval(async () => {
    if (!isCallActive || isWsConnected) {
      clearInterval(callPollInterval);
      return;
    }
    try {
      const res = await fetch(`/api/call/signals?chatId=${encodeURIComponent(currentChatId)}&forRole=${encodeURIComponent(currentRole)}&since=${lastSignalSeq}`);
      const data = await res.json();
      if (data.status === 'ended') {
        cleanupCall();
        showToast('Call ended by other party');
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
        await peerConnection.setRemoteDescription(new RTCSessionDescription(sig.sdp));
        // Flush pending candidates now that remote description is set
        while (pendingCandidates.length > 0) {
          const cand = pendingCandidates.shift();
          try { await peerConnection.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
        }

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await sendCallSignal({ sdp: answer });
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
          console.warn('ICE add notice:', e);
        }
      } else {
        pendingCandidates.push(sig.candidate);
      }
    }
  } catch (err) {
    console.warn('Signal handling notice:', err);
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
