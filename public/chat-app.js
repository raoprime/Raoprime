/**
 * Raoprime — Executive Instagram DM Style Client Chat & Vault
 * Mobile-First High-Performance Architecture
 */

const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks (Optimized for Vercel Serverless & Mobile)

// State
let currentChatId = 'default';
let currentRole = 'Client'; // 'Client' or 'Raoprime'
let lastMessagesCount = 0;
let isCurrentlyUploading = false;
let typingTimeout = null;
let isCurrentlyTyping = false;

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) window.lucide.createIcons();

  // Setup mobile virtual keyboard & viewport height adaptation
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
    }
  });

  let lastTypingTime = 0;
  messageInput.addEventListener('input', () => {
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

  // Heartbeat Loop (Pings every 2.5s to maintain Live Online Status)
  sendHeartbeat();
  setInterval(sendHeartbeat, 2500);

  // Initial load & Polling (Ultra-fast 800ms polling for WhatsApp/Instagram-grade real-time response)
  loadMessages();
  setInterval(loadMessages, 800);
});

// Send Heartbeat to declare active online presence
function sendHeartbeat() {
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
      const vh = window.visualViewport.height;
      document.body.style.height = `${vh}px`;
      scrollToBottom();
    };
    window.visualViewport.addEventListener('resize', handleViewport);
    window.visualViewport.addEventListener('scroll', () => {
      window.scrollTo(0, 0);
    });
  }
}

async function sendTypingStatus(isTyping) {
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
// Messaging & Polling
// ──────────────────────────────────────────────────────────────

async function loadMessages() {
  try {
    const res = await fetch(`/api/chat/messages?chatId=${encodeURIComponent(currentChatId)}`);
    const data = await res.json();
    if (data.success && data.messages) {
      window.currentCachedMessages = data.messages;
      if (data.messages.length !== lastMessagesCount) {
        lastMessagesCount = data.messages.length;
        renderMessages(data.messages);
        scrollToBottom();
      }

      // Check if other party (Raoprime Admin) is typing or online
      const otherSender = currentRole === 'Client' ? 'Raoprime' : 'Client';
      const isOtherTyping = Boolean(data.typing && data.typing[otherSender]);
      const isOtherOnline = Boolean(data.online && data.online[otherSender]);
      updateTypingUI(isOtherOnline, isOtherTyping);
    }
  } catch (err) {
    // Silent fail on poll
  }
}

function renderMessages(messages) {
  const container = document.getElementById('messagesList');
  if (!container) return;

  container.innerHTML = messages.map(msg => {
    const isOut = msg.sender === currentRole;
    const timeFormatted = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const senderLabel = isOut ? 'You' : (msg.sender === 'Raoprime' || msg.sender === 'RP' ? 'Raoprime' : (msg.sender || 'Client'));

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
        // Generic Document / Archive
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
      <div class="flex flex-col ${isOut ? 'items-end' : 'items-start'}">
        <div class="text-[10px] font-semibold text-slate-500 mb-1 px-1">${senderLabel}</div>
        <div class="${isOut ? 'bubble-out' : 'bubble-in'} max-w-[85%] sm:max-w-md shadow-md">
          ${bubbleContent}
        </div>
        <div class="text-[10px] text-slate-600 mt-1 px-1">${timeFormatted}</div>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

async function sendTextMessage() {
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';

  // Reset typing state immediately
  clearTimeout(typingTimeout);
  isCurrentlyTyping = false;
  sendTypingStatus(false);

  try {
    await fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: currentChatId,
        sender: currentRole,
        text
      })
    });
    loadMessages();
  } catch (err) {
    showToast('Failed to send message: ' + err.message);
  }
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

  activeCard.classList.remove('hidden');
  scrollToBottom();

  for (let fIdx = 0; fIdx < fileList.length; fIdx++) {
    const file = fileList[fIdx];
    fileNameEl.textContent = `(${fIdx + 1}/${fileList.length}) ${file.name}`;
    
    const uploadId = 'upl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

    try {
      // 1. Init Upload Session
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
          chatId: currentChatId,
          sender: currentRole
        })
      });

      // 2. Stream individual chunks
      let lastUploaded = 0;
      let lastTime = Date.now();

      for (let cIdx = 0; cIdx < totalChunks; cIdx++) {
        const start = cIdx * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const chunkBlob = file.slice(start, end);

        let sent = false;
        let retries = 0;

        while (!sent && retries < 5) {
          try {
            const res = await fetch(`/api/upload/chunk?uploadId=${uploadId}&chunkIndex=${cIdx}&totalChunks=${totalChunks}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/octet-stream',
                'x-upload-id': uploadId,
                'x-chunk-index': cIdx.toString(),
                'x-total-chunks': totalChunks.toString()
              },
              body: chunkBlob
            });
            if (res.ok) sent = true;
            else throw new Error('Chunk error');
          } catch (e) {
            retries++;
            await new Promise(r => setTimeout(r, 600));
          }
        }

        const uploadedNow = Math.min(file.size, (cIdx + 1) * CHUNK_SIZE);
        const percent = Math.round((uploadedNow / file.size) * 100);
        barEl.style.width = percent + '%';
        percentEl.textContent = percent + '%';
        bytesEl.textContent = `${formatBytes(uploadedNow)} / ${formatBytes(file.size)}`;

        const now = Date.now();
        const diff = (now - lastTime) / 1000;
        if (diff > 0.4) {
          const speed = (uploadedNow - lastUploaded) / diff;
          speedEl.textContent = (speed > 1024 * 1024) ? (speed / (1024 * 1024)).toFixed(1) + ' MB/s' : Math.round(speed / 1024) + ' KB/s';
          lastUploaded = uploadedNow;
          lastTime = now;
        }
      }

      // 3. Finalize and append to chat
      await fetch('/api/upload/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId })
      });

      // Reload chat instantly to display the new document
      await loadMessages();

    } catch (err) {
      showToast(`Upload error on ${file.name}: ` + err.message);
    }
  }

  isCurrentlyUploading = false;
  activeCard.classList.add('hidden');
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

// Background check for incoming calls (Universal detection)
setInterval(checkIncomingCallStatus, 1500);

async function checkIncomingCallStatus() {
  if (isCallActive) return;
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
  } catch (e) {}
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

  // 3. Ring the callee instantly on backend
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

    startSignalPolling();
    showToast(`HD ${type === 'video' ? 'Video' : 'Voice'} Call initiated...`);
  } catch (err) {
    console.error('Call media setup warning:', err);
    startSignalPolling();
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

  // Notify backend call is accepted immediately
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
    startSignalPolling();
    showToast('Ultra HD connected!');
  } catch (err) {
    console.error('Call accept setup warning:', err);
    startSignalPolling();
  }
}

async function declineCall() {
  stopRingtone();
  const modal = document.getElementById('incomingCallModal');
  if (modal) modal.classList.add('hidden');
  
  await fetch('/api/call/end', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: currentChatId })
  }).catch(() => {});
  
  pendingCall = null;
}

async function endCall() {
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
  callPollInterval = setInterval(async () => {
    if (!isCallActive) {
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
