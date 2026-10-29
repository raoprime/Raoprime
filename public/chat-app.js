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
  const chatParam = params.get('chat') || params.get('client') || params.get('room');
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