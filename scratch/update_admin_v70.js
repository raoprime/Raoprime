/**
 * update_admin_v70.js
 * Updates public/admin.js to show Google Verified badges & emails
 */

const fs = require('fs');
const path = require('path');

const adminJsPath = path.join(__dirname, '..', 'public', 'admin.js');
let js = fs.readFileSync(adminJsPath, 'utf8');

// 1. Replace updateAdminVerificationBadge & viewClientVerifiedPhoto
const verBadgePattern = /let currentAdminViewingChatId = null;[\s\S]*?function closeAdminPhotoModal\(\) \{[\s\S]*?\}/;

const newAdminVerFunctions = `let currentAdminViewingChatId = null;

function updateAdminVerificationBadge(chat) {
  const area = document.getElementById('activeClientVerifyArea');
  if (!area) return;
  if (!chat) {
    area.innerHTML = '';
    return;
  }

  const isVerified = Boolean(chat.isVerified);
  const email = chat.verifiedEmail || chat.email || '';
  const isGoogle = chat.provider === 'google' || Boolean(email);
  const hasPhoto = Boolean(chat.verifiedPhoto);

  if (isVerified) {
    area.innerHTML = \`
      <button type="button" onclick="viewClientVerifiedPhoto('\${chat.verifiedPhoto || ''}', '\${escapeHtml(chat.clientName)}', '\${email}', '\${isGoogle ? 'google' : 'custom'}')" class="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[10.5px] font-bold flex items-center gap-1.5 hover:bg-emerald-500/25 transition-all cursor-pointer shadow-sm" title="\${isGoogle ? \`Google Verified: \${email}\` : 'Verified Identity'}">
        \${isGoogle ? \`
          <svg class="w-3.5 h-3.5 shrink-0 inline" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.33 24 12 24z"/>
            <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.15 0 9.99 0 12s.45 3.85 1.24 5.42l4.04-3.15z"/>
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
          </svg>
          <span>Google Verified</span>
        \` : \`
          <svg class="w-3 h-3 text-[#00D26A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Verified DP</span>
        \`}
      </button>
    \`;
  } else {
    area.innerHTML = \`
      <button type="button" onclick="adminRequestPhotoVerification('\${chat.chatId}', '\${escapeHtml(chat.clientName)}')" class="px-2 py-0.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[10.5px] font-semibold flex items-center gap-1 transition-all cursor-pointer active:scale-95" title="Request identity verification">
        <svg class="w-3 h-3 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        <span>Request Verify</span>
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
      showToast(\`📢 Verification requested from \${clientName}\`);
    } else {
      showToast('Error requesting verification: ' + (data.error || 'Server error'));
    }
  } catch (err) {
    showToast('Network error requesting verification');
  }
}

function viewClientVerifiedPhoto(url, name, email, provider) {
  currentAdminViewingChatId = activeChatId;

  const modal = document.getElementById('adminPhotoModal');
  const img = document.getElementById('adminPhotoModalImg');
  const nameEl = document.getElementById('adminPhotoModalName');
  const statusEl = document.getElementById('adminPhotoModalStatus');
  const phoneEl = document.getElementById('adminPhotoModalPhone');
  const approveBtn = document.getElementById('adminPhotoModalApproveBtn');

  if (modal) {
    if (img) {
      if (url) {
        img.src = url;
        img.classList.remove('hidden');
      } else {
        img.classList.add('hidden');
      }
    }
    if (nameEl) nameEl.textContent = name || 'Client';

    const isGoogle = provider === 'google' || Boolean(email);
    if (statusEl) {
      statusEl.innerHTML = isGoogle
        ? '<span class="w-1.5 h-1.5 rounded-full bg-[#00D26A]"></span> Google Verified Account ✓'
        : '<span class="w-1.5 h-1.5 rounded-full bg-[#00D26A]"></span> Verified Identity Photo';
      statusEl.className = 'text-[11px] text-emerald-400 font-semibold flex items-center gap-1';
    }

    if (phoneEl) {
      phoneEl.textContent = email ? \`✉ \${email}\` : 'Google Verified Identity';
    }

    if (approveBtn) approveBtn.classList.add('hidden');

    modal.classList.remove('hidden');
  }
}

function closeAdminPhotoModal() {
  const modal = document.getElementById('adminPhotoModal');
  if (modal) modal.classList.add('hidden');
}`;

if (verBadgePattern.test(js)) {
  js = js.replace(verBadgePattern, newAdminVerFunctions);
  console.log('✓ Updated admin verification functions with Google support');
} else {
  console.log('⚠ Could not match verBadgePattern in admin.js');
}

fs.writeFileSync(adminJsPath, js, 'utf8');
console.log('admin.js updated successfully (v=7.0)!');
