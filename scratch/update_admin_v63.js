/**
 * update_admin_v63.js
 * Updates public/admin.html and public/admin.js with:
 * 1. Client phone number display in admin panel
 * 2. Instant client DP in list and header
 * 3. Pending review status badge with instant "Approve" button
 * 4. Version bump to v=6.3
 */

const fs = require('fs');
const path = require('path');

const adminHtmlPath = path.join(__dirname, '..', 'public', 'admin.html');
const adminJsPath = path.join(__dirname, '..', 'public', 'admin.js');

let html = fs.readFileSync(adminHtmlPath, 'utf8');
let js = fs.readFileSync(adminJsPath, 'utf8');

// ─── 1. UPDATE admin.html ───────────────────────────────────────────
// Replace adminPhotoModal with enhanced modal that displays phone number & approve button
const oldPhotoModalPattern = /<!-- Admin Verified Photo Lightbox Modal -->[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/;

const newPhotoModal = `<!-- Admin Verified Photo Lightbox Modal (with Mobile & Instant Approve) -->
  <div id="adminPhotoModal" onclick="closeAdminPhotoModal()" class="fixed inset-0 bg-black/90 backdrop-blur-md z-50 hidden flex items-center justify-center p-4 cursor-pointer">
    <div class="max-w-md w-full text-center space-y-3" onclick="event.stopPropagation()">
      <div class="relative inline-block rounded-3xl overflow-hidden border border-white/20 shadow-2xl bg-black">
        <img id="adminPhotoModalImg" src="" alt="Client Photo" class="max-h-[75vh] max-w-full object-contain">
        <div class="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/95 via-black/80 to-transparent flex flex-col gap-2 text-xs text-white">
          <div class="flex items-center justify-between">
            <div class="text-left">
              <span id="adminPhotoModalName" class="font-bold block text-sm">Client Name</span>
              <span id="adminPhotoModalStatus" class="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-[#00D26A]"></span> Verified Identity Photo
              </span>
            </div>
            <button type="button" onclick="closeAdminPhotoModal()" class="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold cursor-pointer">Close</button>
          </div>
          <div class="flex items-center justify-between pt-1 border-t border-white/10 text-left">
            <div>
              <span class="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Registered Phone</span>
              <span id="adminPhotoModalPhone" class="text-xs text-sky-300 font-mono font-bold select-all">📞 +91 ----------</span>
            </div>
            <button type="button" id="adminPhotoModalApproveBtn" onclick="adminApproveCurrentModalClient()" class="hidden px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs transition-all shadow-md active:scale-95 cursor-pointer">
              Approve Now
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>`;

if (oldPhotoModalPattern.test(html)) {
  html = html.replace(oldPhotoModalPattern, newPhotoModal);
  console.log('✓ Updated adminPhotoModal in admin.html');
} else {
  console.log('⚠ Could not match oldPhotoModalPattern in admin.html');
}

// Bump version in admin.html to v=6.3
html = html.replace(/admin\.js\?v=[\d.]+/g, 'admin.js?v=6.3');
fs.writeFileSync(adminHtmlPath, html, 'utf8');
console.log('Updated public/admin.html successfully!');

// ─── 2. UPDATE admin.js ─────────────────────────────────────────────

// A. In WebSocket handler for chat:verification-updated (around line 218)
const wsVerPattern = /case 'chat:verification-updated':\s*\{\s*const target = allChats\.find\(c => c\.chatId === payload\.chatId\);[\s\S]*?break;\s*\}/;

const newWsVerHandler = `case 'chat:verification-updated': {
      const target = allChats.find(c => c.chatId === payload.chatId);
      if (target) {
        target.isVerified = Boolean(payload.verified);
        target.verificationStatus = payload.status || (payload.verified ? 'verified' : (payload.photoUrl ? 'pending' : 'none'));
        target.verifiedPhoto = payload.photoUrl || null;
        target.phoneNumber = payload.phoneNumber || target.phoneNumber || null;
        target.remainingMinutes = payload.remainingMinutes || 0;
      }
      if (activeChatId === payload.chatId) {
        const avatarEl = document.getElementById('activeClientAvatar');
        if (payload.photoUrl) {
          avatarEl.innerHTML = \`<img src="\${payload.photoUrl}" class="w-full h-full object-cover rounded-full cursor-pointer" onclick="viewClientVerifiedPhoto('\${payload.photoUrl}', '\${escapeHtml(target ? target.clientName : activeChatId)}', '\${payload.phoneNumber || ''}', '\${payload.status || ''}', '\${payload.chatId}')">\`;
        }
        updateAdminVerificationBadge(target || {
          chatId: payload.chatId,
          clientName: activeChatId,
          isVerified: payload.verified,
          verificationStatus: payload.status,
          verifiedPhoto: payload.photoUrl,
          phoneNumber: payload.phoneNumber,
          remainingMinutes: payload.remainingMinutes
        });
      }
      filterChats();
      break;
    }`;

if (wsVerPattern.test(js)) {
  js = js.replace(wsVerPattern, newWsVerHandler);
  console.log('✓ Updated chat:verification-updated in admin.js');
}

// B. In renderAdminChats sidebar (around line 772):
// Show photo as DP immediately (even if pending), and show ✓ or ⏳ badge!
const sidebarAvatarPattern = /\$\{c\.isVerified && c\.verifiedPhoto \? `onclick="event\.stopPropagation\(\); viewClientVerifiedPhoto\('\$\{c\.verifiedPhoto\}', '\$\{escapeHtml\(c\.clientName\)\}'\)"` : ''\}>[\s\S]*?\$\{c\.isVerified \? `<span class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-\[#00D26A\] border-2 border-\[#090b10\] text-white flex items-center justify-center text-\[8px\] font-bold shadow-sm" title="Verified Identity Photo">✓<\/span>` : ''\}/;

const newSidebarAvatar = `\${c.verifiedPhoto ? \`onclick="event.stopPropagation(); viewClientVerifiedPhoto('\${c.verifiedPhoto}', '\${escapeHtml(c.clientName)}', '\${c.phoneNumber || ''}', '\${c.verificationStatus || (c.isVerified ? 'verified' : 'pending')}', '\${c.chatId}')"\` : ''}>
          \${c.verifiedPhoto ? \`<img src="\${c.verifiedPhoto}" class="w-full h-full object-cover">\` : initial}
        </div>
        \${c.isVerified ? \`<span class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#00D26A] border-2 border-[#090b10] text-white flex items-center justify-center text-[8px] font-bold shadow-sm" title="Google Verified Identity">✓</span>\` : (c.verificationStatus === 'pending' || c.verifiedPhoto ? \`<span class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 border-2 border-[#090b10] text-black flex items-center justify-center text-[8px] font-bold shadow-sm" title="Verification Review in Progress (~20m)">⏳</span>\` : '')}`;

if (sidebarAvatarPattern.test(js)) {
  js = js.replace(sidebarAvatarPattern, newSidebarAvatar);
  console.log('✓ Updated sidebar avatar to display client DP & status badge');
}

// C. In selectChat (around line 820):
// Use client's photo as DP immediately when chat is selected
const selectChatAvatarPattern = /if \(current\?\.isVerified && current\?\.verifiedPhoto\) \{[\s\S]*?avatarEl\.textContent = clientName\.charAt\(0\)\.toUpperCase\(\);\s*\}/;

const newSelectChatAvatar = `if (current?.verifiedPhoto) {
    avatarEl.innerHTML = \`<img src="\${current.verifiedPhoto}" class="w-full h-full object-cover rounded-full cursor-pointer" onclick="viewClientVerifiedPhoto('\${current.verifiedPhoto}', '\${escapeHtml(clientName)}', '\${current.phoneNumber || ''}', '\${current.verificationStatus || (current.isVerified ? 'verified' : 'pending')}', '\${current.chatId}')">\`;
  } else {
    avatarEl.textContent = clientName.charAt(0).toUpperCase();
  }`;

if (selectChatAvatarPattern.test(js)) {
  js = js.replace(selectChatAvatarPattern, newSelectChatAvatar);
  console.log('✓ Updated selectChat to show verifiedPhoto as client DP immediately');
}

// D. Replace updateAdminVerificationBadge and viewClientVerifiedPhoto
const verBadgePattern = /function updateAdminVerificationBadge\(chat\) \{[\s\S]*?function closeAdminPhotoModal\(\) \{[\s\S]*?\}/;

const newVerBadgeFunctions = `let currentAdminViewingChatId = null;

function updateAdminVerificationBadge(chat) {
  const area = document.getElementById('activeClientVerifyArea');
  if (!area) return;
  if (!chat) {
    area.innerHTML = '';
    return;
  }

  const isVerified = Boolean(chat.isVerified);
  const status = chat.verificationStatus || (isVerified ? 'verified' : (chat.verifiedPhoto ? 'pending' : 'none'));
  const hasPhoto = Boolean(chat.verifiedPhoto);
  const phone = chat.phoneNumber || '';

  if (isVerified && hasPhoto) {
    area.innerHTML = \`
      <button type="button" onclick="viewClientVerifiedPhoto('\${chat.verifiedPhoto}', '\${escapeHtml(chat.clientName)}', '\${phone}', 'verified', '\${chat.chatId}')" class="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold flex items-center gap-1 hover:bg-emerald-500/30 transition-all cursor-pointer" title="Verified Photo & Phone: \${phone || 'Confirmed'}">
        <svg class="w-3 h-3 text-[#00D26A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        <span>Verified \${phone ? \`(+91 \${phone.slice(-4)})\` : 'Photo'}</span>
      </button>
    \`;
  } else if (status === 'pending' || hasPhoto) {
    const mins = chat.remainingMinutes || 20;
    area.innerHTML = \`
      <div class="flex items-center gap-1">
        <button type="button" onclick="viewClientVerifiedPhoto('\${chat.verifiedPhoto}', '\${escapeHtml(chat.clientName)}', '\${phone}', 'pending', '\${chat.chatId}')" class="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold flex items-center gap-1 hover:bg-amber-500/30 transition-all cursor-pointer" title="Reviewing (~20 mins). Phone: \${phone || 'Entered'}">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
          <span>Reviewing (~\${mins}m)</span>
        </button>
        <button type="button" onclick="adminApproveCurrentClient('\${chat.chatId}')" class="px-2 py-0.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-extrabold transition-all cursor-pointer shadow-sm active:scale-95" title="Approve now without waiting 20 minutes">
          Approve
        </button>
      </div>
    \`;
  } else {
    area.innerHTML = \`
      <button type="button" onclick="adminRequestPhotoVerification('\${chat.chatId}', '\${escapeHtml(chat.clientName)}')" class="px-2 py-0.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[10.5px] font-semibold flex items-center gap-1 transition-all cursor-pointer active:scale-95" title="Ask client to add their photo & phone to verify identity">
        <svg class="w-3 h-3 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        <span>Request Photo</span>
      </button>
    \`;
  }
}

async function adminRequestPhotoVerification(chatId, clientName) {
  if (!adminToken) return;
  try {
    const res = await fetch('/api/admin/request-verification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminToken
      },
      body: JSON.stringify({ chatId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(\`📢 Photo verification requested from \${clientName}\`);
    } else {
      showToast('Error requesting verification: ' + (data.error || 'Server error'));
    }
  } catch (err) {
    showToast('Network error requesting verification');
  }
}

async function adminApproveCurrentClient(chatId) {
  if (!adminToken || !chatId) return;
  try {
    const res = await fetch('/api/admin/verify-client', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminToken
      },
      body: JSON.stringify({ chatId, approve: true })
    });
    const data = await res.json();
    if (data.success) {
      showToast('✓ Client verification approved instantly!');
      const target = allChats.find(c => c.chatId === chatId);
      if (target) {
        target.isVerified = true;
        target.verificationStatus = 'verified';
        updateAdminVerificationBadge(target);
      }
      closeAdminPhotoModal();
      filterChats();
    } else {
      showToast('Error approving verification: ' + (data.error || 'Server error'));
    }
  } catch (err) {
    showToast('Network error approving verification');
  }
}

function viewClientVerifiedPhoto(url, name, phone, status, chatId) {
  if (!url) return;
  currentAdminViewingChatId = chatId || activeChatId;

  const modal = document.getElementById('adminPhotoModal');
  const img = document.getElementById('adminPhotoModalImg');
  const nameEl = document.getElementById('adminPhotoModalName');
  const statusEl = document.getElementById('adminPhotoModalStatus');
  const phoneEl = document.getElementById('adminPhotoModalPhone');
  const approveBtn = document.getElementById('adminPhotoModalApproveBtn');

  if (modal && img) {
    img.src = url;
    if (nameEl) nameEl.textContent = name || 'Client';

    const isVerified = status === 'verified';
    if (statusEl) {
      statusEl.innerHTML = isVerified
        ? '<span class="w-1.5 h-1.5 rounded-full bg-[#00D26A]"></span> Verified Identity Photo'
        : '<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span> Verification Under Review (~20m)';
      statusEl.className = isVerified
        ? 'text-[11px] text-emerald-400 font-semibold flex items-center gap-1'
        : 'text-[11px] text-amber-300 font-semibold flex items-center gap-1';
    }

    if (phoneEl) {
      phoneEl.textContent = phone ? \`📞 +91 \${phone.replace(/\\D/g, '').slice(-10)}\` : 'No phone registered';
    }

    if (approveBtn) {
      if (!isVerified) {
        approveBtn.classList.remove('hidden');
      } else {
        approveBtn.classList.add('hidden');
      }
    }

    modal.classList.remove('hidden');
  }
}

function adminApproveCurrentModalClient() {
  if (currentAdminViewingChatId) {
    adminApproveCurrentClient(currentAdminViewingChatId);
  }
}

function closeAdminPhotoModal() {
  const modal = document.getElementById('adminPhotoModal');
  if (modal) modal.classList.add('hidden');
}`;

if (verBadgePattern.test(js)) {
  js = js.replace(verBadgePattern, newVerBadgeFunctions);
  console.log('✓ Replaced updateAdminVerificationBadge and viewClientVerifiedPhoto with phone & approve support');
} else {
  console.log('⚠ Could not match verBadgePattern in admin.js');
}

fs.writeFileSync(adminJsPath, js, 'utf8');
console.log('Updated public/admin.js successfully!');
