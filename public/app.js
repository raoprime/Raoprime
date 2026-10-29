/**
 * RP Media & Production — Secure Client Document & Media Vault
 * Zero-Error Resumable Chunk Streaming Engine
 */

// Global App State
const state = {
  activeTab: 'upload',
  queue: [], // Array of FileUploadTask
  isUploading: false,
  settings: {},
  submissions: [],
  filteredSubmissions: [],
  activeCaseId: '',
  lastReceipt: null
};

// Chunk Configuration: 5MB per chunk for bulletproof memory and network tolerance
const CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_RETRIES = 5; // Automatic backoff resilience against network drops

// ──────────────────────────────────────────────────────────────
// Initialization
// ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) window.lucide.createIcons();
  
  await loadSettings();
  initUrlParams();
  initDropzone();
  loadVaultMetrics();

  // If no case ID is present, auto-generate an RP case reference
  if (!document.getElementById('caseId').value) {
    generateNewCaseId();
  }
});

// Load Settings from Server
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success && data.settings) {
      state.settings = data.settings;
      applySettingsToUI(data.settings);
    }
  } catch (err) {
    console.warn('Failed to load portal settings:', err);
  }
}

function applySettingsToUI(settings) {
  // Update Header & Brand
  const logoEl = document.getElementById('headerLogo');
  if (logoEl && settings.activeLogo) {
    logoEl.src = settings.activeLogo;
  }
  const previewLogo = document.getElementById('settingsLogoPreview');
  if (previewLogo && settings.activeLogo) {
    previewLogo.src = settings.activeLogo;
  }
  const nameEl = document.getElementById('brandCompanyName');
  if (nameEl && settings.companyName) {
    nameEl.textContent = settings.companyName;
  }
  const titleEl = document.getElementById('brandPortalTitle');
  if (titleEl && settings.portalTitle) {
    titleEl.textContent = settings.portalTitle;
  }
  const footerBrand = document.getElementById('footerBrand');
  if (footerBrand && settings.companyName) {
    footerBrand.textContent = settings.companyName;
  }

  // Populate Settings Form inputs
  if (document.getElementById('settingCompanyName')) {
    document.getElementById('settingCompanyName').value = settings.companyName || '';
    document.getElementById('settingPortalTitle').value = settings.portalTitle || '';
    document.getElementById('settingSupportEmail').value = settings.supportEmail || '';
    document.getElementById('settingTagline').value = settings.tagline || '';
  }
}

// Read URL Parameters (for customer pre-filled links)
function initUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const client = params.get('client') || params.get('name');
  const email = params.get('email');
  const phone = params.get('phone');
  const caseId = params.get('case') || params.get('caseId');
  const category = params.get('category');
  const tab = params.get('tab');

  if (client) document.getElementById('clientName').value = decodeURIComponent(client);
  if (email) document.getElementById('clientEmail').value = decodeURIComponent(email);
  if (phone) document.getElementById('clientPhone').value = decodeURIComponent(phone);
  if (caseId) document.getElementById('caseId').value = decodeURIComponent(caseId);
  if (category) document.getElementById('docCategory').value = category;

  if (tab === 'vault') switchTab('vault');
  if (tab === 'settings') switchTab('settings');
}

// Auto-generate Case ID with RP Signature
function generateNewCaseId() {
  const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();
  const timestamp = Date.now().toString().slice(-4);
  const newId = `CASE-RP-${timestamp}-${randomChars}`;
  document.getElementById('caseId').value = newId;
  showToast(`Case Reference ${newId} initialized`, 'info');
}

// ──────────────────────────────────────────────────────────────
// Tab Navigation
// ──────────────────────────────────────────────────────────────

function switchTab(tabId) {
  state.activeTab = tabId;
  
  // Toggle views
  document.getElementById('viewUpload').classList.toggle('hidden', tabId !== 'upload');
  document.getElementById('viewVault').classList.toggle('hidden', tabId !== 'vault');
  document.getElementById('viewSettings').classList.toggle('hidden', tabId !== 'settings');

  // Toggle tab buttons
  document.getElementById('tabBtnUpload').classList.toggle('active', tabId === 'upload');
  document.getElementById('tabBtnVault').classList.toggle('active', tabId === 'vault');
  document.getElementById('tabBtnSettings').classList.toggle('active', tabId === 'settings');

  if (tabId === 'vault') {
    loadVaultSubmissions();
    loadVaultMetrics();
  }

  if (window.lucide) window.lucide.createIcons();
}

// ──────────────────────────────────────────────────────────────
// Dropzone & File Queue Handling
// ──────────────────────────────────────────────────────────────

function initDropzone() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    }, false);
  });

  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      addFilesToQueue(files);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (fileInput.files && fileInput.files.length > 0) {
      addFilesToQueue(fileInput.files);
      fileInput.value = ''; // Reset input to allow selecting same file again
    }
  });
}

function addFilesToQueue(fileList) {
  const currentCategory = document.getElementById('docCategory').value;
  let addedCount = 0;

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    
    // Check if duplicate in queue
    const exists = state.queue.some(item => item.file.name === file.name && item.file.size === file.size && item.status !== 'error');
    if (exists) continue;

    const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

    const task = {
      id: taskId,
      file: file,
      fileName: file.name,
      fileSize: file.size,
      formattedSize: formatBytes(file.size),
      category: currentCategory,
      totalChunks: totalChunks,
      uploadedChunks: new Set(),
      status: 'queued', // queued, uploading, paused, completed, error
      progress: 0,
      speed: 0, // B/s
      eta: 0, // seconds
      uploadId: null,
      abortController: null,
      errorMsg: ''
    };

    state.queue.push(task);
    addedCount++;
  }

  if (addedCount > 0) {
    showToast(`Added ${addedCount} document${addedCount > 1 ? 's' : ''} to upload staging`, 'success');
  }

  renderQueue();
}

function renderQueue() {
  const container = document.getElementById('queueContainer');
  const emptyMsg = document.getElementById('emptyQueueMsg');
  const toolbar = document.getElementById('queueToolbar');
  const statsText = document.getElementById('queueStatsText');

  if (state.queue.length === 0) {
    container.innerHTML = '';
    emptyMsg.classList.remove('hidden');
    toolbar.classList.add('hidden');
    return;
  }

  emptyMsg.classList.add('hidden');
  toolbar.classList.remove('hidden');

  let totalBytes = 0;
  state.queue.forEach(t => totalBytes += t.fileSize);
  statsText.textContent = `${state.queue.length} files (${formatBytes(totalBytes)})`;

  container.innerHTML = state.queue.map(task => {
    const iconName = getFileIcon(task.fileName);
    const isCompleted = task.status === 'completed';
    const isUploading = task.status === 'uploading';
    const isPaused = task.status === 'paused';
    const isError = task.status === 'error';

    let statusBadge = '';
    if (isCompleted) {
      statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">VAULTED</span>`;
    } else if (isUploading) {
      statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>STREAMING</span>`;
    } else if (isPaused) {
      statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">PAUSED</span>`;
    } else if (isError) {
      statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">RETRY NEEDED</span>`;
    } else {
      statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">STAGED</span>`;
    }

    return `
      <div id="card_${task.id}" class="p-4 rounded-2xl bg-[#0f121a] border border-slate-800 transition-all space-y-3">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 text-red-400">
              <i data-lucide="${iconName}" class="w-5 h-5"></i>
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <h4 class="text-sm font-semibold text-white truncate max-w-xs sm:max-w-md" title="${task.fileName}">${task.fileName}</h4>
                ${statusBadge}
              </div>
              <div class="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                <span class="font-mono text-slate-300">${task.formattedSize}</span>
                <span>•</span>
                <span class="capitalize text-red-300/90 font-medium">${task.category}</span>
                ${task.totalChunks > 1 ? `<span>•</span><span class="text-[11px] font-mono text-slate-500">${task.totalChunks} chunks</span>` : ''}
              </div>
            </div>
          </div>

          <!-- Item Action Buttons -->
          <div class="flex items-center gap-1.5 shrink-0">
            ${isUploading ? `
              <button onclick="pauseUpload('${task.id}')" class="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-all" title="Pause">
                <i data-lucide="pause" class="w-4 h-4"></i>
              </button>
            ` : ''}
            ${isPaused ? `
              <button onclick="resumeUpload('${task.id}')" class="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-all" title="Resume">
                <i data-lucide="play" class="w-4 h-4"></i>
              </button>
            ` : ''}
            ${!isCompleted ? `
              <button onclick="removeTask('${task.id}')" class="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-all" title="Cancel & Remove">
                <i data-lucide="x" class="w-4 h-4"></i>
              </button>
            ` : `
              <span class="text-emerald-400 p-1.5"><i data-lucide="check" class="w-4 h-4"></i></span>
            `}
          </div>
        </div>

        <!-- Progress Bar & Metrics -->
        <div class="space-y-1.5">
          <div class="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800/80">
            <div id="bar_${task.id}" class="h-full rounded-full transition-all duration-300 ${isCompleted ? 'bg-emerald-500' : 'bg-gradient-to-r from-red-600 via-rose-600 to-red-500 progress-bar-animated'}" style="width: ${task.progress}%"></div>
          </div>
          <div class="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span id="text_progress_${task.id}" class="text-slate-300 font-semibold">${task.progress.toFixed(1)}% Completed</span>
            <span id="text_metrics_${task.id}">
              ${isUploading ? `${formatSpeed(task.speed)} • ETA: ${task.eta}s` : (isCompleted ? 'Verified & Stored' : 'Awaiting start')}
            </span>
          </div>
        </div>

        ${task.errorMsg ? `
          <div class="text-[11px] text-rose-400 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20 flex items-center justify-between">
            <span>${task.errorMsg}</span>
            <button onclick="retryTask('${task.id}')" class="text-red-400 hover:underline font-bold ml-2">Retry Now</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

function removeTask(taskId) {
  const task = state.queue.find(t => t.id === taskId);
  if (task && task.abortController) {
    task.abortController.abort();
  }
  state.queue = state.queue.filter(t => t.id !== taskId);
  renderQueue();
}

function clearCompletedOrAll() {
  if (state.isUploading) {
    showToast('Cannot clear staging area while uploads are actively streaming', 'warning');
    return;
  }
  state.queue = [];
  renderQueue();
  showToast('Upload queue cleared', 'info');
}

// ──────────────────────────────────────────────────────────────
// Chunk Streaming Upload Execution
// ──────────────────────────────────────────────────────────────

async function startAllUploads() {
  // Validate Form Inputs
  const clientName = document.getElementById('clientName').value.trim();
  const clientEmail = document.getElementById('clientEmail').value.trim();
  const clientPhone = document.getElementById('clientPhone').value.trim();
  const caseId = document.getElementById('caseId').value.trim();
  const notes = document.getElementById('clientNotes').value.trim();

  if (!clientName) {
    showToast('Please enter Client / Entity Name before uploading', 'error');
    document.getElementById('clientName').focus();
    return;
  }

  if (!clientEmail) {
    showToast('Please enter an official Email Address for receipts', 'error');
    document.getElementById('clientEmail').focus();
    return;
  }

  if (state.queue.length === 0) {
    showToast('Please add at least one document or media file to begin', 'warning');
    return;
  }

  state.activeCaseId = caseId || document.getElementById('caseId').value;
  state.isUploading = true;
  document.getElementById('startUploadBtn').disabled = true;
  document.getElementById('startUploadBtn').innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Streaming Documents...</span>`;
  if (window.lucide) window.lucide.createIcons();

  const metadata = {
    clientName,
    clientEmail,
    clientPhone,
    caseId: state.activeCaseId,
    notes
  };

  // Upload tasks sequentially to keep client and server RAM completely flat
  for (const task of state.queue) {
    if (task.status === 'completed') continue;
    await processTaskUpload(task, metadata);
  }

  state.isUploading = false;
  document.getElementById('startUploadBtn').disabled = false;
  document.getElementById('startUploadBtn').innerHTML = `<i data-lucide="play" class="w-4 h-4 fill-current"></i><span>Transmit All Documents</span>`;
  if (window.lucide) window.lucide.createIcons();

  // Check if all completed
  const allDone = state.queue.every(t => t.status === 'completed');
  if (allDone && state.queue.length > 0) {
    showSubmissionSuccessModal(metadata, state.queue);
  }
}

async function processTaskUpload(task, metadata) {
  task.status = 'uploading';
  task.errorMsg = '';
  task.abortController = new AbortController();
  updateTaskCardUI(task);

  try {
    // Step 1: Initialize Upload Session on Server
    const initPayload = {
      uploadId: task.uploadId || `upl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      fileName: task.fileName,
      fileSize: task.fileSize,
      totalChunks: task.totalChunks,
      chunkSize: CHUNK_SIZE,
      fileType: task.file.type,
      caseId: metadata.caseId,
      clientName: metadata.clientName,
      clientEmail: metadata.clientEmail,
      clientPhone: metadata.clientPhone,
      category: task.category,
      notes: metadata.notes
    };

    task.uploadId = initPayload.uploadId;

    const initRes = await fetch('/api/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(initPayload),
      signal: task.abortController.signal
    });

    const initData = await initRes.json();
    if (!initData.success) {
      throw new Error(initData.error || 'Failed to initialize upload session');
    }

    // Existing chunks on disk if resuming
    if (initData.existingChunks && Array.isArray(initData.existingChunks)) {
      initData.existingChunks.forEach(idx => task.uploadedChunks.add(idx));
    }

    // Step 2: Stream Chunks with Automatic Retry Protocol
    let lastUploadedBytes = task.uploadedChunks.size * CHUNK_SIZE;
    let lastTime = Date.now();

    for (let chunkIndex = 0; chunkIndex < task.totalChunks; chunkIndex++) {
      if (task.uploadedChunks.has(chunkIndex)) {
        continue; // Already on disk
      }

      if (task.status === 'paused') {
        return; // Halted by user
      }

      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(task.fileSize, start + CHUNK_SIZE);
      const chunkBlob = task.file.slice(start, end);

      // Upload this specific chunk with automatic backoff retry
      let chunkSuccess = false;
      let attempt = 0;

      while (!chunkSuccess && attempt < MAX_RETRIES) {
        attempt++;
        try {
          const chunkRes = await fetch(`/api/upload/chunk?uploadId=${task.uploadId}&chunkIndex=${chunkIndex}&totalChunks=${task.totalChunks}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'x-upload-id': task.uploadId,
              'x-chunk-index': chunkIndex.toString(),
              'x-total-chunks': task.totalChunks.toString()
            },
            body: chunkBlob,
            signal: task.abortController.signal
          });

          if (!chunkRes.ok) {
            throw new Error(`Server returned status ${chunkRes.status}`);
          }

          const chunkData = await chunkRes.json();
          if (chunkData.success) {
            chunkSuccess = true;
            task.uploadedChunks.add(chunkIndex);
          } else {
            throw new Error(chunkData.error || 'Chunk upload failed');
          }
        } catch (chunkErr) {
          if (task.status === 'paused' || task.abortController.signal.aborted) {
            return;
          }
          console.warn(`Chunk ${chunkIndex} failed (attempt ${attempt}/${MAX_RETRIES}):`, chunkErr.message);
          if (attempt >= MAX_RETRIES) {
            throw new Error(`Network timeout on chunk ${chunkIndex + 1}. Max retries exceeded.`);
          }
          // Exponential backoff
          await new Promise(r => setTimeout(r, Math.min(3000, 500 * Math.pow(2, attempt))));
        }
      }

      // Compute granular progress & speed
      const uploadedBytes = Math.min(task.fileSize, (chunkIndex + 1) * CHUNK_SIZE);
      task.progress = (uploadedBytes / task.fileSize) * 100;

      const now = Date.now();
      const timeDiff = (now - lastTime) / 1000;
      if (timeDiff > 0.5) {
        const bytesDiff = uploadedBytes - lastUploadedBytes;
        task.speed = bytesDiff / timeDiff; // B/s
        const remainingBytes = task.fileSize - uploadedBytes;
        task.eta = task.speed > 0 ? Math.ceil(remainingBytes / task.speed) : 0;
        lastUploadedBytes = uploadedBytes;
        lastTime = now;
      }

      updateTaskCardUI(task);
    }

    // Step 3: Finalize and Assemble on Server
    const finalRes = await fetch('/api/upload/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId: task.uploadId }),
      signal: task.abortController.signal
    });

    const finalData = await finalRes.json();
    if (!finalData.success) {
      throw new Error(finalData.error || 'Server error while stitching and finalizing document');
    }

    task.status = 'completed';
    task.progress = 100;
    state.lastReceipt = finalData.receiptNumber;
    updateTaskCardUI(task);
    showToast(`"${task.fileName}" successfully vaulted`, 'success');

  } catch (err) {
    if (task.status !== 'paused') {
      task.status = 'error';
      task.errorMsg = err.message || 'Transmission failed';
      updateTaskCardUI(task);
      showToast(`Error uploading ${task.fileName}: ${err.message}`, 'error');
    }
  }
}

function pauseUpload(taskId) {
  const task = state.queue.find(t => t.id === taskId);
  if (task && task.status === 'uploading') {
    task.status = 'paused';
    if (task.abortController) task.abortController.abort();
    updateTaskCardUI(task);
    showToast(`Paused upload of ${task.fileName}`, 'info');
  }
}

async function resumeUpload(taskId) {
  const task = state.queue.find(t => t.id === taskId);
  if (task && task.status === 'paused') {
    const clientName = document.getElementById('clientName').value.trim() || 'Client';
    const clientEmail = document.getElementById('clientEmail').value.trim() || '';
    const caseId = document.getElementById('caseId').value.trim() || state.activeCaseId;
    await processTaskUpload(task, { clientName, clientEmail, caseId });
  }
}

function retryTask(taskId) {
  resumeUpload(taskId);
}

// Live update of DOM elements without full re-render
function updateTaskCardUI(task) {
  const bar = document.getElementById(`bar_${task.id}`);
  const textProgress = document.getElementById(`text_progress_${task.id}`);
  const textMetrics = document.getElementById(`text_metrics_${task.id}`);

  if (bar) {
    bar.style.width = `${task.progress}%`;
    if (task.status === 'completed') {
      bar.className = 'h-full rounded-full transition-all duration-300 bg-emerald-500';
    }
  }

  if (textProgress) {
    textProgress.textContent = `${task.progress.toFixed(1)}% Completed`;
  }

  if (textMetrics) {
    if (task.status === 'uploading') {
      textMetrics.textContent = `${formatSpeed(task.speed)} • ETA: ${task.eta}s`;
    } else if (task.status === 'completed') {
      textMetrics.textContent = 'Verified & Stored';
    } else if (task.status === 'paused') {
      textMetrics.textContent = 'Paused';
    } else if (task.status === 'error') {
      textMetrics.textContent = 'Interrupted';
    }
  }

  if (task.status === 'completed' || task.status === 'paused' || task.status === 'error') {
    renderQueue();
  }
}

// ──────────────────────────────────────────────────────────────
// Success Modal & Digital Receipt
// ──────────────────────────────────────────────────────────────

function showSubmissionSuccessModal(metadata, tasks) {
  const receiptCode = state.lastReceipt || `REC-${metadata.caseId.slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
  document.getElementById('receiptNumber').textContent = receiptCode;
  document.getElementById('receiptCaseId').textContent = metadata.caseId;
  document.getElementById('receiptClientName').textContent = metadata.clientName;
  document.getElementById('receiptFileCount').textContent = `${tasks.length} Documents (${formatBytes(tasks.reduce((acc, t) => acc + t.fileSize, 0))})`;
  document.getElementById('receiptTimestamp').textContent = new Date().toLocaleString();

  document.getElementById('receiptModal').classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

function closeReceiptModalAndReset() {
  document.getElementById('receiptModal').classList.add('hidden');
  state.queue = [];
  renderQueue();
  generateNewCaseId();
  loadVaultMetrics();
}

function openWhatsAppConfirmation() {
  const receipt = document.getElementById('receiptNumber').textContent;
  const caseId = document.getElementById('receiptCaseId').textContent;
  const clientName = document.getElementById('receiptClientName').textContent;
  const count = document.getElementById('receiptFileCount').textContent;

  const msg = `*RP MEDIA & PRODUCTION — OFFICIAL DOCUMENT VAULT RECEIPT*\n` +
    `----------------------------------------\n` +
    `*Receipt Code:* ${receipt}\n` +
    `*Case Reference:* ${caseId}\n` +
    `*Client / Entity:* ${clientName}\n` +
    `*Payload:* ${count}\n` +
    `*Integrity:* 256-Bit TLS Chunk Verified\n` +
    `*Status:* Successfully Stored in Private Vault\n` +
    `----------------------------------------\n` +
    `Your files have been received by the review desk.`;

  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
}

// ──────────────────────────────────────────────────────────────
// Vault Desk (Admin / Specialist Review)
// ──────────────────────────────────────────────────────────────

async function loadVaultSubmissions() {
  try {
    const res = await fetch('/api/submissions');
    const data = await res.json();
    if (data.success) {
      state.submissions = data.submissions || [];
      filterVaultSubmissions();
    }
  } catch (err) {
    showToast('Failed to load vault documents: ' + err.message, 'error');
  }
}

async function loadVaultMetrics() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    if (data.success && data.stats) {
      const s = data.stats;
      document.getElementById('metricSubmissions').textContent = s.totalSubmissions;
      document.getElementById('metricFiles').textContent = s.totalFiles;
      document.getElementById('metricSize').textContent = s.formattedTotalBytes;
      document.getElementById('metricPending').textContent = s.pendingReviews;
      
      const badge = document.getElementById('vaultBadge');
      if (s.totalFiles > 0) {
        badge.textContent = s.totalFiles;
        badge.classList.remove('hidden');
      }
    }
  } catch (err) {
    console.warn('Stats load error:', err);
  }
}

function filterVaultSubmissions() {
  const query = (document.getElementById('vaultSearch')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('vaultFilterStatus')?.value || 'all';

  let list = state.submissions;

  if (query) {
    list = list.filter(item => 
      item.caseId.toLowerCase().includes(query) ||
      item.clientName.toLowerCase().includes(query) ||
      (item.clientEmail && item.clientEmail.toLowerCase().includes(query)) ||
      item.files.some(f => f.originalName.toLowerCase().includes(query))
    );
  }

  if (statusFilter !== 'all') {
    list = list.filter(item => item.status === statusFilter);
  }

  state.filteredSubmissions = list;
  renderVaultList();
}

function renderVaultList() {
  const listEl = document.getElementById('vaultList');
  const emptyEl = document.getElementById('vaultEmptyMsg');

  if (state.filteredSubmissions.length === 0) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');

  listEl.innerHTML = state.filteredSubmissions.map(item => {
    const formattedDate = new Date(item.createdAt).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    let statusClass = 'bg-red-500/10 text-red-400 border-red-500/20';
    if (item.status === 'Verified') statusClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (item.status === 'Under Review') statusClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    if (item.status === 'Archived') statusClass = 'bg-slate-800 text-slate-400 border-slate-700';

    return `
      <div class="rounded-2xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-lg transition-all hover:border-red-500/30">
        
        <!-- Case Top Header -->
        <div class="p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800/80 bg-slate-950/40">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 font-bold text-sm">
              <i data-lucide="briefcase" class="w-5 h-5"></i>
            </div>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h4 class="text-base font-bold text-white">${item.clientName}</h4>
                <span class="px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${statusClass} border">
                  ${item.status}
                </span>
                <span class="px-2 py-0.5 rounded text-[11px] font-mono text-red-300 bg-slate-800 border border-slate-700">
                  ${item.caseId}
                </span>
              </div>
              <div class="text-xs text-slate-400 flex items-center gap-2 mt-1">
                ${item.clientEmail ? `<span>${item.clientEmail}</span><span>•</span>` : ''}
                ${item.clientPhone ? `<span>${item.clientPhone}</span><span>•</span>` : ''}
                <span>${formattedDate}</span>
              </div>
            </div>
          </div>

          <!-- Case Quick Actions -->
          <div class="flex items-center gap-2 w-full md:w-auto justify-end">
            <select onchange="updateCaseStatus('${item.caseId}', this.value)" class="px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-red-500 cursor-pointer">
              <option value="Submitted" ${item.status === 'Submitted' ? 'selected' : ''}>Submitted</option>
              <option value="Under Review" ${item.status === 'Under Review' ? 'selected' : ''}>Under Review</option>
              <option value="Verified" ${item.status === 'Verified' ? 'selected' : ''}>Verified & Accepted</option>
              <option value="Archived" ${item.status === 'Archived' ? 'selected' : ''}>Archived</option>
            </select>

            <a href="/api/download-all/${item.caseId}" class="btn-primary-rp px-3 py-1.5 rounded-xl text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all" title="Download all files zipped">
              <i data-lucide="download-cloud" class="w-3.5 h-3.5"></i>
              <span>Download ZIP</span>
            </a>

            <button onclick="deleteCase('${item.caseId}')" class="p-1.5 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-all" title="Delete Case">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        ${item.notes ? `
          <div class="px-5 py-2.5 bg-slate-950/20 text-xs text-slate-400 border-b border-slate-800/40 flex items-center gap-2">
            <i data-lucide="message-square" class="w-3.5 h-3.5 text-red-400 shrink-0"></i>
            <span class="italic font-normal">"${item.notes}"</span>
          </div>
        ` : ''}

        <!-- Stored Files Grid -->
        <div class="p-4 sm:p-5">
          <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Vaulted Documents & Media (${item.files.length})
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            ${item.files.map(file => {
              const fileIcon = getFileIcon(file.originalName);
              return `
                <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3 group hover:border-red-500/30 transition-all">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0 text-red-400">
                      <i data-lucide="${fileIcon}" class="w-4 h-4"></i>
                    </div>
                    <div class="min-w-0">
                      <p class="text-xs font-semibold text-white truncate" title="${file.originalName}">${file.originalName}</p>
                      <span class="text-[10px] font-mono text-slate-400">${file.formattedSize} • ${file.category}</span>
                    </div>
                  </div>

                  <div class="flex items-center gap-1 shrink-0">
                    <button onclick="previewFile('${item.caseId}', '${file.fileId}', '${encodeURIComponent(file.originalName)}', '${file.formattedSize}', '${file.mimeType}')" class="p-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-all" title="Preview">
                      <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                    </button>
                    <a href="/api/download/${item.caseId}/${file.fileId}" download class="p-1 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-all" title="Direct Download">
                      <i data-lucide="download" class="w-3.5 h-3.5"></i>
                    </a>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

async function updateCaseStatus(caseId, newStatus) {
  try {
    const res = await fetch(`/api/submissions/${caseId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Case status updated to "${newStatus}"`, 'success');
      loadVaultMetrics();
    }
  } catch (err) {
    showToast('Failed to update status: ' + err.message, 'error');
  }
}

async function deleteCase(caseId) {
  if (!confirm(`Are you sure you want to permanently delete case ${caseId} and all associated vaulted documents? This action cannot be undone.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/submissions/${caseId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Case and files deleted successfully', 'info');
      state.submissions = state.submissions.filter(s => s.caseId !== caseId);
      filterVaultSubmissions();
      loadVaultMetrics();
    }
  } catch (err) {
    showToast('Delete error: ' + err.message, 'error');
  }
}

// ──────────────────────────────────────────────────────────────
// Document Preview Desk
// ──────────────────────────────────────────────────────────────

function previewFile(caseId, fileId, originalName, formattedSize, mimeType) {
  const decodedName = decodeURIComponent(originalName);
  document.getElementById('previewFileName').textContent = decodedName;
  document.getElementById('previewFileSize').textContent = formattedSize;
  
  const downloadUrl = `/api/download/${caseId}/${fileId}`;
  const inlineUrl = `${downloadUrl}?preview=1`;
  document.getElementById('previewDownloadBtn').href = downloadUrl;

  const contentBox = document.getElementById('previewContent');
  contentBox.innerHTML = '';

  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType.includes('pdf');
  const isVideo = mimeType.startsWith('video/');
  const isAudio = mimeType.startsWith('audio/');

  if (isImage) {
    contentBox.innerHTML = `<img src="${inlineUrl}" alt="${decodedName}" class="max-w-full max-h-full object-contain rounded-xl shadow-2xl">`;
  } else if (isPdf) {
    contentBox.innerHTML = `<iframe src="${inlineUrl}" class="w-full h-full rounded-xl border border-slate-800" frameborder="0"></iframe>`;
  } else if (isVideo) {
    contentBox.innerHTML = `<video src="${inlineUrl}" controls autoplay class="max-w-full max-h-full rounded-xl shadow-2xl"></video>`;
  } else if (isAudio) {
    contentBox.innerHTML = `
      <div class="p-8 text-center space-y-4">
        <div class="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto text-red-400">
          <i data-lucide="music" class="w-10 h-10"></i>
        </div>
        <audio src="${inlineUrl}" controls class="w-full max-w-md mx-auto"></audio>
      </div>`;
  } else {
    contentBox.innerHTML = `
      <div class="p-12 text-center space-y-3 max-w-md">
        <i data-lucide="file-question" class="w-16 h-16 text-slate-500 mx-auto mb-2"></i>
        <h5 class="text-base font-bold text-white">Direct Preview Not Supported</h5>
        <p class="text-xs text-slate-400">This file type (${mimeType}) cannot be directly previewed in the browser. You can download the original file to view it on your device.</p>
        <a href="${downloadUrl}" download class="btn-primary-rp inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-xs font-semibold mt-2">
          <i data-lucide="download" class="w-4 h-4"></i> Download Original File
        </a>
      </div>`;
  }

  document.getElementById('previewModal').classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

function closePreviewModal() {
  document.getElementById('previewModal').classList.add('hidden');
  document.getElementById('previewContent').innerHTML = '';
}

// ──────────────────────────────────────────────────────────────
// Share Customer Link Modal
// ──────────────────────────────────────────────────────────────

function openShareModal() {
  const currentCase = document.getElementById('caseId').value || 'CASE-RP-' + Math.floor(1000 + Math.random() * 9000);
  const currentName = document.getElementById('clientName').value || '';
  const currentCategory = document.getElementById('docCategory').value || 'identity';

  document.getElementById('shareClientName').value = currentName;
  document.getElementById('shareCaseId').value = currentCase;
  document.getElementById('shareCategory').value = currentCategory;

  updateShareUrl();
  document.getElementById('shareModal').classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

function closeShareModal() {
  document.getElementById('shareModal').classList.add('hidden');
}

function updateShareUrl() {
  const name = encodeURIComponent(document.getElementById('shareClientName').value.trim());
  const caseId = encodeURIComponent(document.getElementById('shareCaseId').value.trim());
  const category = encodeURIComponent(document.getElementById('shareCategory').value);

  const base = window.location.origin;
  const fullUrl = `${base}/?client=${name}&case=${caseId}&category=${category}`;
  document.getElementById('shareResultUrl').value = fullUrl;
}

function copyShareUrl() {
  const urlInput = document.getElementById('shareResultUrl');
  navigator.clipboard.writeText(urlInput.value).then(() => {
    const btn = document.getElementById('copyShareBtn');
    btn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i><span>Copied!</span>`;
    if (window.lucide) window.lucide.createIcons();
    showToast('Direct upload link copied to clipboard', 'success');
    setTimeout(() => {
      btn.innerHTML = `<i data-lucide="copy" class="w-3.5 h-3.5"></i><span>Copy</span>`;
      if (window.lucide) window.lucide.createIcons();
    }, 2000);
  });
}

function sendShareWhatsApp() {
  const url = document.getElementById('shareResultUrl').value;
  const name = document.getElementById('shareClientName').value.trim() || 'Client';
  const text = `Hello ${name},\n\nPlease use this secure link to upload your required documents and master files to RP Vault:\n${url}\n\nOur system supports large files of any size without transmission limits.`;
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
}

// ──────────────────────────────────────────────────────────────
// Settings & Brand Logo Management
// ──────────────────────────────────────────────────────────────

async function savePortalSettings(e) {
  e.preventDefault();
  
  const payload = {
    companyName: document.getElementById('settingCompanyName').value.trim(),
    portalTitle: document.getElementById('settingPortalTitle').value.trim(),
    supportEmail: document.getElementById('settingSupportEmail').value.trim(),
    tagline: document.getElementById('settingTagline').value.trim()
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      state.settings = data.settings;
      applySettingsToUI(data.settings);
      showToast('Portal configuration saved successfully', 'success');
    }
  } catch (err) {
    showToast('Failed to save settings: ' + err.message, 'error');
  }
}

async function selectPresetLogo(logoPath) {
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeLogo: logoPath })
    });
    const data = await res.json();
    if (data.success) {
      state.settings = data.settings;
      applySettingsToUI(data.settings);
      showToast('Active brand logo updated', 'success');
    }
  } catch (err) {
    showToast('Failed to switch logo: ' + err.message, 'error');
  }
}

async function uploadCustomLogo(e) {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('logo', file);

  try {
    showToast('Uploading custom logo...', 'info');
    const res = await fetch('/api/settings/logo-upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      state.settings = data.settings;
      applySettingsToUI(data.settings);
      showToast('Custom logo uploaded & set as active', 'success');
    } else {
      throw new Error(data.error || 'Failed to upload logo');
    }
  } catch (err) {
    showToast('Logo upload error: ' + err.message, 'error');
  }
}

// ──────────────────────────────────────────────────────────────
// Helpers & Utilities
// ──────────────────────────────────────────────────────────────

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
  if (bytesPerSec > 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  }
  return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
}

function getFileIcon(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (['pdf'].includes(ext)) return 'file-text';
  if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) return 'file-type-2';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'file-spreadsheet';
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'tiff', 'bmp'].includes(ext)) return 'image';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'prores'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'aac', 'flac', 'aiff', 'm4a'].includes(ext)) return 'music';
  return 'file';
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `p-3.5 rounded-2xl shadow-2xl border text-xs font-semibold flex items-center gap-2.5 transition-all duration-300 pointer-events-auto max-w-sm animate-fade-in ${
    type === 'success' ? 'bg-[#0f1d19] border-emerald-500/30 text-emerald-300' :
    type === 'error' ? 'bg-[#250d12] border-rose-500/40 text-rose-300' :
    type === 'warning' ? 'bg-[#231d10] border-amber-500/30 text-amber-300' :
    'bg-[#190c10] border-red-500/30 text-red-200'
  }`;

  const iconName = 
    type === 'success' ? 'check-circle-2' :
    type === 'error' ? 'alert-triangle' :
    type === 'warning' ? 'alert-circle' : 'info';

  toast.innerHTML = `<i data-lucide="${iconName}" class="w-4 h-4 shrink-0"></i><span>${message}</span>`;
  container.appendChild(toast);
  if (window.lucide) window.lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
