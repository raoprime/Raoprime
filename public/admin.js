/**
 * Raoprime Admin Portal Logic (Secured with Cryptographic HMAC Authentication)
 * Mobile-First High-Performance Architecture
 */

const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks (Optimized for Vercel Serverless & Mobile)

let allChats = [];
let activeChatId = null;
let lastMsgCount = 0;
let isUploading = false;
let typingTimeout = null;
let isCurrentlyTyping = false;
let adminToken = localStorage.getItem('raoprime_admin_token') || '';
let pollIntervals = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) window.lucide.createIcons();

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

  // Admin Heartbeat Loop (5s secondary pulse)
  setInterval(sendAdminHeartbeat, 5000);

  // Resume polling on window visibility
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && adminToken) {
      triggerAdminChatsPoll();
      if (activeChatId) triggerActiveMsgsPoll();
    }
  });

  // Verify authentication before loading chats
  await checkAuthStatus();
});

function sendAdminHeartbeat() {
  if (!adminToken) return;
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
      const vh = window.visualViewport.height;
      document.body.style.height = `${vh}px`;
      scrollAdminToBottom();
    };
    window.visualViewport.addEventListener('resize', handleViewport);
    window.visualViewport.addEventListener('scroll', () => {
      window.scrollTo(0, 0);
    });
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
    const interval = document.hidden ? 4000 : 1500;
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

      if (currentSig !== lastChatsSig || activeChatId !== lastRenderedActiveChatId) {
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
  activeChatId = chatId;
  lastAdminMsgSig = '';
  lastAdminTypingSig = '';
  lastMsgCount = 0;
  lastRenderedActiveChatId = chatId;

  const current = allChats.find(c => c.chatId === chatId);
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

  filterChats();
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
    return `<span class="inline-flex items-center gap-0.5 text-sky-400 font-semibold ml-1.5" title="Seen by Client"><svg class="w-3.5 h-3.5 inline fill-current" viewBox="0 0 16 16"><path d="M12.354 4.354a.5.5 0 0 0-.708-.708L5 10.293 1.854 7.146a.5.5 0 1 0-.708.708l3.5 3.5a.5.5 0 0 0 .708 0l7-7zm-4.708 7.293L15.354 3.94a.5.5 0 1 0-.708-.708L7.646 10.94l-.708-.707a.5.5 0 0 0-.708.708l1.062 1.061a.5.5 0 0 0 .708 0z"/></svg><span class="text-[9px]">Seen</span></span>`;
  }
  if (s === 'delivered') {
    return `<span class="inline-flex items-center gap-0.5 text-slate-400 font-medium ml-1.5" title="Delivered"><svg class="w-3.5 h-3.5 inline fill-current" viewBox="0 0 16 16"><path d="M12.354 4.354a.5.5 0 0 0-.708-.708L5 10.293 1.854 7.146a.5.5 0 1 0-.708.708l3.5 3.5a.5.5 0 0 0 .708 0l7-7zm-4.708 7.293L15.354 3.94a.5.5 0 1 0-.708-.708L7.646 10.94l-.708-.707a.5.5 0 0 0-.708.708l1.062 1.061a.5.5 0 0 0 .708 0z"/></svg><span class="text-[9px]">Delivered</span></span>`;
  }
  return `<span class="inline-flex items-center gap-0.5 text-slate-500 font-medium ml-1.5" title="Sent"><svg class="w-3 h-3 inline fill-current" viewBox="0 0 16 16"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg><span class="text-[9px]">Sent</span></span>`;
}

async function triggerActiveMsgsPoll() {
  if (!adminToken || !activeChatId) {
    if (activeMsgsPollTimer) clearTimeout(activeMsgsPollTimer);
    activeMsgsPollTimer = setTimeout(triggerActiveMsgsPoll, 1200);
    return;
  }
  if (isPollingActiveMsgs) return;
  isPollingActiveMsgs = true;
  try {
    await loadActiveMessages();
  } catch (e) {
  } finally {
    isPollingActiveMsgs = false;
    const interval = document.hidden ? 3000 : 1000;
    if (activeMsgsPollTimer) clearTimeout(activeMsgsPollTimer);
    activeMsgsPollTimer = setTimeout(triggerActiveMsgsPoll, interval);
  }
}

async function loadActiveMessages() {
  if (!activeChatId || !adminToken) return;

  try {
    const res = await fetch(`/api/chat/messages?chatId=${encodeURIComponent(activeChatId)}&reader=Raoprime`, {
      headers: { 'x-admin-token': adminToken || '' }
    });
    const data = await res.json();
    if (data.success && data.messages) {
      window.currentAdminCachedMessages = data.messages;
      const currentSig = data.messages.map(m => `${m.id}:${m.status || ''}:${m.isEdited ? '1' : '0'}:${m.text || ''}`).join('|');
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
      const isClientTyping = Boolean(data.typing && (data.typing.Client || data.typing[activeChatId]));
      const isClientOnline = Boolean(data.online && data.online.Client);
      updateAdminTypingUI(isClientOnline, isClientTyping);
    }
  } catch (err) {
    // Silent fail
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

  container.innerHTML = messages.map(msg => {
    const isRaoprime = msg.sender === 'Raoprime' || msg.sender === 'RP';
    const timeFormatted = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const senderTitle = isRaoprime ? 'Raoprime (You)' : (document.getElementById('activeClientName').textContent || 'Client');

    let bubbleContent = '';

    if (msg.type === 'text') {
      bubbleContent = `<div class="px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words">${escapeHtml(msg.text)}</div>`;
    } else if (msg.type === 'file' && msg.file) {
      const f = msg.file;
      const ext = (f.originalName.split('.').pop() || '').toLowerCase();
      const isImg = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext);
      const isAudio = ['wav', 'mp3', 'flac', 'm4a', 'aiff', 'ogg'].includes(ext);
      const isVideo = ['mp4', 'mov', 'webm'].includes(ext);

      if (isImg) {
        bubbleContent = `
          <div class="overflow-hidden rounded-2xl">
            <a href="${f.downloadUrl}" target="_blank" rel="noopener">
              <img src="${f.downloadUrl}?preview=1" alt="${escapeHtml(f.originalName)}" loading="lazy" class="max-w-[260px] sm:max-w-xs max-h-64 object-cover hover:opacity-95 transition-opacity">
            </a>
            <div class="p-2 sm:p-2.5 flex items-center justify-between text-xs border-t border-white/10 bg-black/20">
              <span class="truncate max-w-[160px] sm:max-w-[180px] font-medium text-[11px] sm:text-xs">${escapeHtml(f.originalName)}</span>
              <a href="${f.downloadUrl}" download class="hover:text-rose-300 ml-2 p-1.5 active:scale-90" aria-label="Download image"><i data-lucide="download" class="w-4 h-4"></i></a>
            </div>
          </div>
        `;
      } else if (isAudio) {
        bubbleContent = `
          <div class="p-2.5 sm:p-3 space-y-2 max-w-[260px] sm:max-w-xs">
            <div class="flex items-center gap-2">
              <i data-lucide="music" class="w-4 h-4 text-rose-300"></i>
              <span class="text-xs font-semibold truncate text-white">${escapeHtml(f.originalName)}</span>
            </div>
            <audio src="${f.downloadUrl}" controls preload="metadata" class="w-full h-8 rounded-lg"></audio>
            <div class="flex items-center justify-between text-[11px] opacity-80 pt-0.5">
              <span class="font-mono">${f.formattedSize}</span>
              <a href="${f.downloadUrl}" download class="hover:underline flex items-center gap-1 font-semibold text-rose-300 p-1">
                <i data-lucide="download" class="w-3 h-3"></i> Download
              </a>
            </div>
          </div>
        `;
      } else if (isVideo) {
        bubbleContent = `
          <div class="overflow-hidden rounded-2xl max-w-[260px] sm:max-w-sm">
            <video src="${f.downloadUrl}" controls playsinline webkit-playsinline class="w-full max-h-64 object-cover bg-black"></video>
            <div class="p-2 sm:p-2.5 flex items-center justify-between text-xs border-t border-white/10 bg-black/20">
              <span class="truncate max-w-[150px] sm:max-w-[180px] font-medium text-[11px] sm:text-xs">${escapeHtml(f.originalName)}</span>
              <span class="opacity-80 text-[10px] font-mono">${f.formattedSize}</span>
            </div>
          </div>
        `;
      } else {
        bubbleContent = `
          <div class="p-2.5 sm:p-3 flex items-center justify-between gap-2.5 max-w-[260px] sm:max-w-xs">
            <div class="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <div class="w-9 h-9 rounded-xl bg-black/30 flex items-center justify-center shrink-0">
                <i data-lucide="file-text" class="w-5 h-5 text-rose-300"></i>
              </div>
              <div class="min-w-0">
                <p class="text-xs font-semibold truncate text-white" title="${escapeHtml(f.originalName)}">${escapeHtml(f.originalName)}</p>
                <p class="text-[10px] opacity-75 font-mono">${f.formattedSize}</p>
              </div>
            </div>
            <a href="${f.downloadUrl}" download class="w-8 h-8 rounded-xl bg-black/20 hover:bg-black/40 active:scale-95 text-white shrink-0 flex items-center justify-center transition-all" title="Download">
              <i data-lucide="download" class="w-4 h-4"></i>
            </a>
          </div>
        `;
      }
    }

    const editedBadge = msg.isEdited ? `<span class="text-[9px] text-slate-500 italic ml-1" title="Edited message">(edited)</span>` : '';

    return `
      <div class="admin-message-row flex flex-col ${isRaoprime ? 'items-end' : 'items-start'} group" data-msg-id="${msg.id}" data-msg-sender="${msg.sender}">
        <div class="text-[10px] font-semibold text-slate-500 mb-1 px-1 flex items-center gap-1.5">
          <span>${senderTitle}</span>
          <button onclick="openAdminMessageActionMenu(this.closest('.admin-message-row'))" class="opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-white p-0.5 rounded cursor-pointer" title="Options">
            <i data-lucide="more-horizontal" class="w-3.5 h-3.5"></i>
          </button>
        </div>
        <div class="${isRaoprime ? 'bubble-admin-out' : 'bubble-admin-in'} max-w-[85%] sm:max-w-md shadow-md cursor-pointer select-text transition-transform active:scale-[0.99]">
          ${bubbleContent}
        </div>
        <div class="text-[10px] text-slate-500 mt-1 px-1 flex items-center ${isRaoprime ? 'justify-end' : 'justify-start'}">
          <span>${timeFormatted}</span>
          ${editedBadge}
          ${renderAdminMessageStatus(msg.status, isRaoprime)}
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

// ──────────────────────────────────────────────────────────────
// Send Reply as Raoprime & Message Edit
// ──────────────────────────────────────────────────────────────

async function sendAdminTextMessage() {
  if (!activeChatId) return;

  const input = document.getElementById('adminMessageInput');
  const text = input.value.trim();
  if (!text) return;

  // If in edit mode, save edited message
  if (adminEditingMessageId) {
    try {
      const res = await fetch('/api/chat/message/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      triggerActiveMsgsPoll();
      triggerAdminChatsPoll();
      showToast('Message updated');
    } catch (err) {
      showToast('Failed to edit message: ' + err.message);
    }
    return;
  }

  input.value = '';

  // Reset typing immediately
  clearTimeout(typingTimeout);
  isCurrentlyTyping = false;
  sendAdminTypingStatus(false);

  try {
    await fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: activeChatId,
        sender: 'Raoprime',
        text
      })
    });
    triggerActiveMsgsPoll();
    triggerAdminChatsPoll();
  } catch (err) {
    showToast('Failed to send reply: ' + err.message);
  }
}

// ──────────────────────────────────────────────────────────────
// Admin Message Context Menu & Edit Suite (Long-Press & Right-Click)
// ──────────────────────────────────────────────────────────────

let adminContextTargetMessage = null;
let adminEditingMessageId = null;

function setupAdminMessageContextMenu() {
  const container = document.getElementById('adminMessagesList');
  if (!container) return;

  // 1. Mouse Right-Click (Desktop)
  container.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.admin-message-row');
    if (!row) return;
    const msgId = row.dataset.msgId;
    const msg = (window.currentAdminCachedMessages || []).find(m => m.id === msgId);
    if (!msg) return;

    e.preventDefault();
    openAdminMessageContextMenu(msg, e.clientX, e.clientY);
  });

  // 2. Mobile Touch Long-Press (450ms)
  let touchTimer = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchTargetRow = null;

  container.addEventListener('touchstart', (e) => {
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
        const msg = (window.currentAdminCachedMessages || []).find(m => m.id === msgId);
        if (msg) {
          if (navigator.vibrate) {
            try { navigator.vibrate(40); } catch (err) {}
          }
          openAdminMessageContextMenu(msg, touchStartX, touchStartY);
        }
      }
    }, 450);
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (!touchTimer) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartX);
    const dy = Math.abs(touch.clientY - touchStartY);
    if (dx > 10 || dy > 10) {
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

  // Close context menu on outside click, window scroll, or Escape
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('adminMessageContextMenu');
    if (menu && !menu.contains(e.target) && !e.target.closest('.admin-message-row')) {
      closeAdminMessageContextMenu();
    }
  });

  const chatStream = document.getElementById('adminChatStream');
  if (chatStream) {
    chatStream.addEventListener('scroll', closeAdminMessageContextMenu, true);
  }
  window.addEventListener('scroll', closeAdminMessageContextMenu, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAdminMessageContextMenu();
  });
}

function openAdminMessageActionMenu(rowEl) {
  if (!rowEl) return;
  const msgId = rowEl.dataset.msgId;
  const msg = (window.currentAdminCachedMessages || []).find(m => m.id === msgId);
  if (!msg) return;
  const rect = rowEl.getBoundingClientRect();
  openAdminMessageContextMenu(msg, Math.min(rect.right - 40, window.innerWidth - 160), rect.top + 25);
}

function openAdminMessageContextMenu(msg, x, y) {
  adminContextTargetMessage = msg;
  const menu = document.getElementById('adminMessageContextMenu');
  if (!menu) return;

  const editBtn = document.getElementById('adminCtxEditBtn');
  // Can only edit own messages (sent by Raoprime)
  const isRaoprime = msg.sender === 'Raoprime' || msg.sender === 'RP';
  const canEdit = msg.type === 'text' && isRaoprime;
  if (editBtn) {
    if (canEdit) {
      editBtn.classList.remove('hidden');
    } else {
      editBtn.classList.add('hidden');
    }
  }

  menu.classList.remove('hidden');

  // Viewport bounds safe positioning
  const menuWidth = 150;
  const menuHeight = canEdit ? 85 : 45;
  let posX = x;
  let posY = y;

  if (posX + menuWidth > window.innerWidth - 12) {
    posX = window.innerWidth - menuWidth - 12;
  }
  if (posX < 12) posX = 12;

  if (posY + menuHeight > window.innerHeight - 12) {
    posY = posY - menuHeight - 10;
  }
  if (posY < 12) posY = 12;

  menu.style.left = `${posX}px`;
  menu.style.top = `${posY}px`;

  if (window.lucide) window.lucide.createIcons();
}

function closeAdminMessageContextMenu() {
  const menu = document.getElementById('adminMessageContextMenu');
  if (menu && !menu.classList.contains('hidden')) {
    menu.classList.add('hidden');
  }
}

function handleAdminContextCopy() {
  if (!adminContextTargetMessage) return;
  closeAdminMessageContextMenu();

  let textToCopy = '';
  if (adminContextTargetMessage.type === 'text') {
    textToCopy = adminContextTargetMessage.text;
  } else if (adminContextTargetMessage.type === 'file' && adminContextTargetMessage.file) {
    textToCopy = window.location.origin + adminContextTargetMessage.file.downloadUrl;
  }

  if (textToCopy) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        showToast('Copied to clipboard!');
      }).catch(() => fallbackAdminCopy(textToCopy));
    } else {
      fallbackAdminCopy(textToCopy);
    }
  }
}

function fallbackAdminCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Copied to clipboard!');
  } catch (e) {
    showToast('Failed to copy');
  }
}

function handleAdminContextEdit() {
  if (!adminContextTargetMessage) return;
  const msg = adminContextTargetMessage;
  closeAdminMessageContextMenu();
  startAdminEditingMessage(msg);
}

function startAdminEditingMessage(msg) {
  if (!msg || msg.type !== 'text') return;
  adminEditingMessageId = msg.id;

  const banner = document.getElementById('adminEditBanner');
  const preview = document.getElementById('adminEditingPreviewText');
  const input = document.getElementById('adminMessageInput');
  const sendBtn = document.getElementById('adminSendBtn');

  if (banner) banner.classList.remove('hidden');
  if (preview) preview.textContent = msg.text;

  if (input) {
    input.value = msg.text;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  if (sendBtn) {
    sendBtn.innerHTML = '<i data-lucide="check" class="w-4 h-4 ml-0.5"></i>';
    sendBtn.title = 'Save edited message';
  }

  if (window.lucide) window.lucide.createIcons();
}

function cancelAdminEditingMessage() {
  adminEditingMessageId = null;

  const banner = document.getElementById('adminEditBanner');
  const input = document.getElementById('adminMessageInput');
  const sendBtn = document.getElementById('adminSendBtn');

  if (banner) banner.classList.add('hidden');
  if (input) input.value = '';

  if (sendBtn) {
    sendBtn.innerHTML = '<i data-lucide="send" class="w-4 h-4 ml-0.5 fill-current"></i>';
    sendBtn.title = 'Send Reply';
  }

  if (window.lucide) window.lucide.createIcons();
}

// ──────────────────────────────────────────────────────────────
// Admin File Uploading (Mobile-Resilient Streaming)
// ──────────────────────────────────────────────────────────────

async function onAdminFilesChosen(e) {
  const files = e.target.files;
  if (!files || files.length === 0 || !activeChatId) return;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    await uploadAdminFile(file);
  }
  e.target.value = '';
}

async function uploadAdminFile(file) {
  const uploadId = 'upl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

  showToast(`Uploading ${file.name}...`);

  try {
    // Init
    await fetch('/api/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId,
        fileName: file.name,
        fileSize: file.size,
        totalChunks,
        chunkSize: CHUNK_SIZE,
        fileType: file.type,
        chatId: activeChatId,
        sender: 'Raoprime'
      })
    });

    // Chunks
    for (let cIdx = 0; cIdx < totalChunks; cIdx++) {
      const start = cIdx * CHUNK_SIZE;
      const end = Math.min(file.size, start + CHUNK_SIZE);
      const chunkBlob = file.slice(start, end);

      await fetch(`/api/upload/chunk?uploadId=${uploadId}&chunkIndex=${cIdx}&totalChunks=${totalChunks}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-upload-id': uploadId,
          'x-chunk-index': cIdx.toString(),
          'x-total-chunks': totalChunks.toString()
        },
        body: chunkBlob
      });
    }

    // Finalize
    await fetch('/api/upload/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId })
    });

    triggerActiveMsgsPoll();
    triggerAdminChatsPoll();
    showToast(`File "${file.name}" sent!`);
  } catch (err) {
    showToast(`Failed to upload ${file.name}: ` + err.message);
  }
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
setInterval(checkAdminIncomingCalls, 2000);

async function checkAdminIncomingCalls() {
  if (isCallActive || !adminToken || isCheckingAdminCall) return;
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
  const targetChat = activeChatId || (allChats.length > 0 ? allChats[0].chatId : 'default');

  currentCallType = type;
  isCallActive = true;
  lastSignalSeq = 0;
  pendingCandidates = [];
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

  // 2. Ring the client immediately on backend
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

    startSignalPolling();
    showToast(`HD ${type === 'video' ? 'Video' : 'Voice'} Call started...`);
  } catch (err) {
    console.error('Admin call media setup warning:', err);
    startSignalPolling();
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
  pendingCandidates = [];

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

  // Notify backend call is accepted immediately
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
    startSignalPolling();
    showToast('Ultra HD connected!');
  } catch (err) {
    console.error('Admin accept setup warning:', err);
    startSignalPolling();
  }
}

async function declineCall() {
  stopRingtone();
  const modal = document.getElementById('incomingCallModal');
  if (modal) modal.classList.add('hidden');

  const callChatId = pendingCallChatId || activeChatId || 'default';
  await fetch('/api/call/end', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: callChatId })
  }).catch(() => {});
  
  pendingCall = null;
  pendingCallChatId = null;
}

async function endCall() {
  const callChatId = pendingCallChatId || activeChatId || 'default';
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
  callPollInterval = setInterval(async () => {
    if (!isCallActive) {
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
  }, 600);
}

async function handleIncomingSignal(sig) {
  if (!peerConnection) {
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

