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
    }
  });

  msgInput.addEventListener('input', () => {
    if (!activeChatId) return;
    if (!isCurrentlyTyping) {
      isCurrentlyTyping = true;
      sendAdminTypingStatus(true);
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      isCurrentlyTyping = false;
      sendAdminTypingStatus(false);
    }, 2000);
  });

  msgInput.addEventListener('focus', () => {
    setTimeout(scrollAdminToBottom, 300);
  });

  // Verify authentication before loading chats
  await checkAuthStatus();
});

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
  loadAdminChats();
  pollIntervals.forEach(clearInterval);
  pollIntervals = [
    setInterval(loadAdminChats, 2000),
    setInterval(loadActiveMessages, 1200)
  ];
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

function updateAdminTypingUI(isTyping) {
  const meta = document.getElementById('activeClientMeta');
  const bubble = document.getElementById('adminTypingBubbleContainer');
  const clientName = document.getElementById('activeClientName')?.textContent || 'Client';

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
  } else {
    if (meta) {
      meta.innerHTML = `
        <span class="text-emerald-400 font-semibold flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Active conversation
        </span>`;
    }
    if (bubble) {
      bubble.classList.add('hidden');
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Load Conversations List
// ──────────────────────────────────────────────────────────────

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
      filterChats();

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
    const lastSnippet = c.lastMessage?.text || 'No messages yet';

    return `
      <div onclick="selectChat('${c.chatId}', true)" class="chat-item p-3.5 flex items-center gap-3 cursor-pointer hover:bg-slate-900/60 active:bg-rose-950/30 transition-colors ${isActive ? 'active' : ''}">
        <div class="relative shrink-0">
          <div class="w-11 h-11 rounded-full bg-gradient-to-tr from-rose-900 to-red-700 flex items-center justify-center text-white font-extrabold text-sm shadow-md ring-1 ring-black">
            ${initial}
          </div>
          <span class="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#090b10] rounded-full"></span>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-bold text-white truncate max-w-[140px] sm:max-w-[160px]">${escapeHtml(c.clientName)}</h4>
            <span class="text-[10px] text-slate-500 shrink-0 ml-1">${timeFormatted}</span>
          </div>
          <div class="flex items-center justify-between mt-1">
            <p class="text-[11px] text-slate-400 truncate max-w-[170px] sm:max-w-[190px]">${escapeHtml(lastSnippet)}</p>
            ${c.totalFiles > 0 ? `<span class="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-rose-900/40 text-rose-300 border border-rose-700/40 shrink-0 ml-1">${c.totalFiles} files</span>` : ''}
          </div>
        </div>
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
  const current = allChats.find(c => c.chatId === chatId);
  const clientName = current ? current.clientName : decodeURIComponent(chatId);

  document.getElementById('activeClientName').textContent = clientName;
  document.getElementById('activeClientAvatar').textContent = clientName.charAt(0).toUpperCase();
  document.getElementById('activeClientMeta').innerHTML = `
    <span class="text-emerald-400 font-semibold flex items-center gap-1">
      <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Active conversation (${current?.totalFiles || 0} files)
    </span>`;
  document.getElementById('adminMessageInput').placeholder = `Reply as Raoprime to ${clientName}...`;

  filterChats();
  lastMsgCount = 0; // Force re-render
  loadActiveMessages();

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
// Message Stream for Active Chat
// ──────────────────────────────────────────────────────────────

async function loadActiveMessages() {
  if (!activeChatId) return;

  try {
    const res = await fetch(`/api/chat/messages?chatId=${encodeURIComponent(activeChatId)}`);
    const data = await res.json();
    if (data.success && data.messages) {
      if (data.messages.length !== lastMsgCount) {
        lastMsgCount = data.messages.length;
        renderAdminMessages(data.messages);
        scrollAdminToBottom();
      }

      // Check if client is typing
      const isClientTyping = Boolean(data.typing && (data.typing.Client || data.typing[activeChatId]));
      updateAdminTypingUI(isClientTyping);
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

    return `
      <div class="flex flex-col ${isRaoprime ? 'items-end' : 'items-start'}">
        <div class="text-[10px] font-semibold text-slate-500 mb-1 px-1">${senderTitle}</div>
        <div class="${isRaoprime ? 'bubble-admin-out' : 'bubble-admin-in'} max-w-[85%] sm:max-w-md shadow-md">
          ${bubbleContent}
        </div>
        <div class="text-[10px] text-slate-600 mt-1 px-1">${timeFormatted}</div>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

// ──────────────────────────────────────────────────────────────
// Send Reply as Raoprime
// ──────────────────────────────────────────────────────────────

async function sendAdminTextMessage() {
  if (!activeChatId) return;

  const input = document.getElementById('adminMessageInput');
  const text = input.value.trim();
  if (!text) return;

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
    loadActiveMessages();
    loadAdminChats();
  } catch (err) {
    showToast('Failed to send reply: ' + err.message);
  }
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

    loadActiveMessages();
    loadAdminChats();
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