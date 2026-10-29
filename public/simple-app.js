/**
 * Simple, Clean Client Upload Engine
 */

let selectedFiles = [];
let isUploading = false;
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunk

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) window.lucide.createIcons();
  setupDropzone();
});

function setupDropzone() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');

  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files && files.length > 0) handleFiles(files);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      handleFiles(fileInput.files);
      fileInput.value = '';
    }
  });
}

function handleFiles(files) {
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!selectedFiles.some(item => item.name === f.name && item.size === f.size)) {
      selectedFiles.push(f);
    }
  }
  renderFilesList();
}

function renderFilesList() {
  const container = document.getElementById('selectedFilesContainer');
  const list = document.getElementById('filesList');
  const countEl = document.getElementById('fileCount');

  if (selectedFiles.length === 0) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  countEl.textContent = selectedFiles.length;

  list.innerHTML = selectedFiles.map((file, idx) => `
    <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
      <div class="flex items-center gap-2.5 min-w-0">
        <i data-lucide="file" class="w-4 h-4 text-red-500 shrink-0"></i>
        <span class="font-medium text-slate-200 truncate max-w-xs" title="${file.name}">${file.name}</span>
        <span class="text-[11px] font-mono text-slate-500 shrink-0">${formatBytes(file.size)}</span>
      </div>
      <button type="button" onclick="removeFile(${idx})" class="text-slate-500 hover:text-red-400 p-1">
        <i data-lucide="x" class="w-3.5 h-3.5"></i>
      </button>
    </div>
  `).join('');

  if (window.lucide) window.lucide.createIcons();
}

function removeFile(index) {
  if (isUploading) return;
  selectedFiles.splice(index, 1);
  renderFilesList();
}

function clearFiles() {
  if (isUploading) return;
  selectedFiles = [];
  renderFilesList();
}

async function startUpload() {
  const name = document.getElementById('clientName').value.trim();
  const contact = document.getElementById('clientContact').value.trim();

  if (!name) {
    alert('Please enter your name.');
    document.getElementById('clientName').focus();
    return;
  }
  if (!contact) {
    alert('Please enter your phone or email.');
    document.getElementById('clientContact').focus();
    return;
  }
  if (selectedFiles.length === 0) {
    alert('Please choose or drag at least one document to upload.');
    return;
  }

  isUploading = true;
  const uploadBtn = document.getElementById('uploadBtn');
  const progressBox = document.getElementById('progressBox');
  const progressBar = document.getElementById('progressBar');
  const progressTitle = document.getElementById('progressFileTitle');
  const progressPercent = document.getElementById('progressPercent');
  const progressSize = document.getElementById('progressSize');
  const progressSpeed = document.getElementById('progressSpeed');

  uploadBtn.disabled = true;
  uploadBtn.classList.add('opacity-50', 'pointer-events-none');
  progressBox.classList.remove('hidden');

  const caseId = 'CASE-RP-' + Date.now().toString().slice(-4);
  let finalReceipt = 'REC-RP-' + Math.floor(1000 + Math.random() * 9000);

  try {
    for (let fIdx = 0; fIdx < selectedFiles.length; fIdx++) {
      const file = selectedFiles[fIdx];
      progressTitle.textContent = `Uploading (${fIdx + 1}/${selectedFiles.length}): ${file.name}`;
      
      const uploadId = 'upl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

      // 1. Init
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
          caseId,
          clientName: name,
          clientEmail: contact.includes('@') ? contact : '',
          clientPhone: !contact.includes('@') ? contact : '',
          category: 'general',
          notes: ''
        })
      });

      // 2. Stream chunks
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
            else throw new Error('Chunk failed');
          } catch (err) {
            retries++;
            await new Promise(r => setTimeout(r, 800));
          }
        }

        const uploadedNow = Math.min(file.size, (cIdx + 1) * CHUNK_SIZE);
        const percent = Math.round((uploadedNow / file.size) * 100);
        progressBar.style.width = percent + '%';
        progressPercent.textContent = percent + '%';
        progressSize.textContent = `${formatBytes(uploadedNow)} / ${formatBytes(file.size)}`;

        const now = Date.now();
        const diff = (now - lastTime) / 1000;
        if (diff > 0.5) {
          const speed = (uploadedNow - lastUploaded) / diff;
          progressSpeed.textContent = (speed > 1024 * 1024) ? (speed / (1024 * 1024)).toFixed(1) + ' MB/s' : Math.round(speed / 1024) + ' KB/s';
          lastUploaded = uploadedNow;
          lastTime = now;
        }
      }

      // 3. Finalize
      const finRes = await fetch('/api/upload/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId })
      });
      const finData = await finRes.json();
      if (finData.receiptNumber) finalReceipt = finData.receiptNumber;
    }

    // Success State
    document.getElementById('uploadState').classList.add('hidden');
    document.getElementById('successState').classList.remove('hidden');
    document.getElementById('successReceipt').textContent = finalReceipt;
    if (window.lucide) window.lucide.createIcons();

  } catch (err) {
    alert('Upload error: ' + err.message);
  } finally {
    isUploading = false;
    uploadBtn.disabled = false;
    uploadBtn.classList.remove('opacity-50', 'pointer-events-none');
    progressBox.classList.add('hidden');
  }
}

function resetUploadForm() {
  selectedFiles = [];
  renderFilesList();
  document.getElementById('uploadState').classList.remove('hidden');
  document.getElementById('successState').classList.add('hidden');
}

// Submissions Drawer (for you to check and download files)
async function toggleAdminDrawer() {
  const drawer = document.getElementById('adminDrawer');
  const isHidden = drawer.classList.contains('hidden');
  
  if (isHidden) {
    drawer.classList.remove('hidden');
    await loadDrawerSubmissions();
  } else {
    drawer.classList.add('hidden');
  }
}

async function loadDrawerSubmissions() {
  const list = document.getElementById('drawerList');
  list.innerHTML = '<p class="text-slate-500 text-center py-8">Loading submissions...</p>';

  try {
    const res = await fetch('/api/submissions');
    const data = await res.json();
    const subs = data.submissions || [];

    if (subs.length === 0) {
      list.innerHTML = '<p class="text-slate-500 text-center py-8">No uploaded documents yet.</p>';
      return;
    }

    list.innerHTML = subs.map(item => `
      <div class="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
        <div class="flex items-center justify-between">
          <span class="font-bold text-white text-xs">${item.clientName}</span>
          <a href="/api/download-all/${item.caseId}" class="text-[11px] text-red-400 hover:underline font-semibold flex items-center gap-1">
            <i data-lucide="download" class="w-3 h-3"></i> Download All (ZIP)
          </a>
        </div>
        <div class="text-[11px] text-slate-400">${item.clientEmail || item.clientPhone || 'No contact'} • ${item.files.length} file(s)</div>
        <div class="space-y-1 pt-1 border-t border-slate-800/60">
          ${item.files.map(f => `
            <div class="flex items-center justify-between text-[11px] text-slate-300">
              <span class="truncate max-w-[200px]" title="${f.originalName}">${f.originalName}</span>
              <a href="${f.downloadUrl}" download class="text-slate-400 hover:text-white ml-2"><i data-lucide="download" class="w-3 h-3"></i></a>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    if (window.lucide) window.lucide.createIcons();
  } catch (err) {
    list.innerHTML = '<p class="text-red-400 text-center py-8">Failed to load submissions.</p>';
  }
}

function formatBytes(bytes) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
