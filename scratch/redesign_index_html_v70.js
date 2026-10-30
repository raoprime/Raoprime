/**
 * redesign_index_html_v70.js
 * Completely redesigns public/index.html to ultra-premium standards:
 * 1. Includes Google Identity Services GSI SDK
 * 2. Removes calling buttons from header
 * 3. Removes sticky notif banner & photoVerifyStrip clutter
 * 4. Adds luxury Client Profile Button in header (DP + @username + verified badge)
 * 5. Removes all calling modals (incomingCallModal, callOverlay, etc.)
 * 6. Adds dedicated luxury Client Profile Modal with real Google Sign-In
 * 7. Adds elegant Google Verification card in chat welcome section
 */

const fs = require('fs');
const path = require('path');

const indexFile = path.join(__dirname, '..', 'public', 'index.html');
let html = fs.readFileSync(indexFile, 'utf8');

// 1. Add Google GSI SDK in <head>
if (!html.includes('https://accounts.google.com/gsi/client')) {
  html = html.replace('</head>', '  <script src="https://accounts.google.com/gsi/client" async defer></script>\n</head>');
  console.log('✓ Added Google GSI SDK to <head>');
}

// 2. Replace Header with clean, ultra-luxury header (Raoprime on left, Client Profile & Share on right, NO CALL BUTTONS)
const oldHeaderPattern = /<!-- Instagram \/ Apple DM Top Header -->[\s\S]*?<\/header>/;

const newHeader = `<!-- Instagram / Apple DM Top Header (Ultra-Luxury Minimalist) -->
  <header class="h-16 px-4 sm:px-6 bg-[#0a0c12]/95 border-b border-slate-800/80 backdrop-blur-xl flex items-center justify-between z-20 shrink-0 safe-top">
    
    <!-- User Info & Circular RP Logo (Click to View Raoprime Profile) -->
    <div class="flex items-center gap-3 sm:gap-3.5 min-w-0">
      <div onclick="openProfileModal()" class="relative shrink-0 cursor-pointer group" title="View Raoprime Profile">
        <img src="/assets/rp-logo.jpg" alt="Raoprime Logo" class="w-10 h-10 sm:w-11 sm:h-11 rounded-full object-cover border-2 border-[#7a182a] shadow-md shadow-rose-950/60 ring-2 ring-black group-hover:scale-105 transition-transform">
        <!-- Instagram Active Indicator Dot -->
        <span id="headerRadarDot" class="absolute bottom-0 right-0 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full ig-active-dot"></span>
      </div>
      <div onclick="openProfileModal()" class="min-w-0 cursor-pointer">
        <div class="flex items-center gap-1.5">
          <h2 id="chatHeading" class="font-extrabold text-sm sm:text-base text-white tracking-tight truncate max-w-[120px] xs:max-w-[160px] sm:max-w-none group-hover:text-rose-200 transition-colors">Raoprime</h2>
          <svg class="w-4 h-4 text-rose-500 fill-current shrink-0" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
        </div>
        <!-- Status / Real-time Typing Text (Instagram DM Style) -->
        <p id="headerStatus" class="text-[11.5px] sm:text-[12px] text-slate-400 font-normal flex items-center gap-1.5 truncate">
          <span class="w-1.5 h-1.5 rounded-full bg-[#00D26A] inline-block shrink-0"></span>
          <span>Active now</span>
        </p>
      </div>
    </div>

    <!-- Right Header Actions: Client Profile Button & Share Link -->
    <div class="flex items-center gap-2 sm:gap-2.5 shrink-0">
      
      <!-- Client Profile Trigger (DP + Username + Google Verified Checkmark) -->
      <button type="button" onclick="openClientProfileModal()" id="headerProfileBtn" class="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] active:bg-white/[0.18] border border-white/[0.1] backdrop-blur-md transition-all active:scale-95 cursor-pointer shadow-sm group select-none" title="Your Account & Google Verification">
        <div class="relative w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-[#1a2030] to-[#252f48] border border-white/20 flex items-center justify-center overflow-hidden shrink-0 group-hover:border-rose-500/60 transition-colors">
          <span id="headerProfileInitial" class="text-xs font-bold text-white uppercase">C</span>
          <img id="headerProfileImg" src="" alt="DP" class="w-full h-full object-cover hidden">
          <!-- Google Verified Badge Dot -->
          <span id="headerProfileVerifiedBadge" class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#00D26A] border-2 border-[#0a0c12] text-white flex items-center justify-center text-[7px] font-black hidden shadow-sm">✓</span>
        </div>
        <div class="hidden xs:flex flex-col text-left leading-tight pr-0.5">
          <span id="headerProfileName" class="text-xs font-semibold text-slate-200 group-hover:text-white max-w-[90px] sm:max-w-[130px] truncate">@User</span>
          <span id="headerProfileStatusText" class="text-[9.5px] text-slate-400 group-hover:text-slate-300 font-medium truncate">Profile</span>
        </div>
      </button>

      <!-- Share / Invite Link Button -->
      <button onclick="copyClientChatLink()" id="shareLinkBtn" class="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.12] active:bg-white/[0.18] text-slate-200 hover:text-white border border-white/[0.08] backdrop-blur-md transition-all active:scale-90 flex items-center justify-center cursor-pointer shadow-sm" title="Copy Chat Link" aria-label="Copy Chat Link">
        <svg class="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="5" r="3"/>
          <circle cx="6" cy="12" r="3"/>
          <circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
      </button>

    </div>

  </header>`;

if (oldHeaderPattern.test(html)) {
  html = html.replace(oldHeaderPattern, newHeader);
  console.log('✓ Replaced header with clean luxury header (no calling buttons)');
} else {
  console.log('⚠ Could not match oldHeaderPattern');
}

// 3. Remove notifPermissionBanner and photoVerifyStrip completely
const bannerAndStripPattern = /<!-- Device Notification Enable Banner[\s\S]*?<!-- Middle Chat Messages Stream/;
const cleanStreamStart = `<!-- Middle Chat Messages Stream`;

if (bannerAndStripPattern.test(html)) {
  html = html.replace(bannerAndStripPattern, cleanStreamStart);
  console.log('✓ Removed sticky notification banner and photoVerifyStrip');
}

// 4. In Welcome Card, add clean Google Verification banner for unverified users
const welcomeTarget = `<span class="text-[10px] text-slate-500 font-mono">🔒 End-to-end encrypted transfer</span>
      </div>`;

const welcomeReplacement = `<span class="text-[10px] text-slate-500 font-mono">🔒 End-to-end encrypted transfer</span>

        <!-- Luxury Google Identity Verification Card (Auto-hides once verified) -->
        <div id="welcomeGoogleVerifyCard" class="w-full mt-3 p-3.5 rounded-2xl bg-gradient-to-r from-white/[0.04] to-white/[0.02] border border-white/10 flex items-center justify-between gap-3 text-left shadow-lg">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0 shadow-inner">
              <svg class="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.33 24 12 24z"/>
                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.15 0 9.99 0 12s.45 3.85 1.24 5.42l4.04-3.15z"/>
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
              </svg>
            </div>
            <div class="min-w-0">
              <h4 class="text-xs font-bold text-white truncate">Verify with Google</h4>
              <p class="text-[10.5px] text-slate-400 truncate">1-Click official verification & profile photo sync</p>
            </div>
          </div>
          <button type="button" onclick="openClientProfileModal()" class="px-3 py-1.5 rounded-full bg-white hover:bg-slate-100 text-slate-900 font-bold text-[11px] transition-all shadow-md active:scale-95 shrink-0 cursor-pointer">
            Verify
          </button>
        </div>

      </div>`;

if (html.includes(welcomeTarget) && !html.includes('welcomeGoogleVerifyCard')) {
  html = html.replace(welcomeTarget, welcomeReplacement);
  console.log('✓ Added Google Verification card to chat welcome area');
}

// 5. Remove all calling modals (incomingCallModal, callOverlay, etc.)
const callModalsPattern = /<!-- Ultra-Luxury VIP Incoming Call Screen[\s\S]*?<!-- WhatsApp-Grade Profile Photo \/ Info Modal/;
const profileModalStart = `<!-- WhatsApp-Grade Profile Photo / Info Modal`;

if (callModalsPattern.test(html)) {
  html = html.replace(callModalsPattern, profileModalStart);
  console.log('✓ Removed all calling modals from index.html');
}

// 6. Replace photoVerifyModal with the Ultra-Luxury Dedicated Client Profile Modal
const oldVerifyModalPattern = /<!-- Google Identity Verification Modal[\s\S]*?<!-- Photo Full Preview Lightbox Modal -->/;

const newClientProfileModal = `<!-- Ultra-Luxury Dedicated Client Profile Modal (Real Google Verification + DP) -->
  <div id="clientProfileModal" class="fixed inset-0 bg-black/85 backdrop-blur-2xl z-50 hidden flex items-center justify-center p-4">
    <div class="w-full max-w-sm p-6 sm:p-7 rounded-3xl bg-[#0c0e17] border border-white/10 shadow-2xl text-center space-y-5 relative animate-in fade-in zoom-in-95 duration-200">
      
      <!-- Close Button -->
      <button type="button" onclick="closeClientProfileModal()" class="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      <!-- Modal Title -->
      <div class="text-center">
        <h3 class="font-extrabold text-lg text-white">Your Profile</h3>
        <p class="text-xs text-slate-400">Manage identity, Google verification & avatar</p>
      </div>

      <!-- Large Circular Avatar with Camera / Upload Trigger -->
      <div class="relative w-24 h-24 mx-auto">
        <div id="modalProfileRing" class="w-full h-full rounded-full bg-gradient-to-tr from-[#161a27] to-[#252f48] border-2 border-slate-700 flex items-center justify-center overflow-hidden shadow-xl">
          <span id="modalProfileInitial" class="text-3xl font-black text-white uppercase">C</span>
          <img id="modalProfileImg" src="" alt="Profile DP" class="w-full h-full object-cover hidden">
        </div>
        <!-- Google Verified Badge on Avatar -->
        <span id="modalProfileVerifiedCheck" class="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#00D26A] border-2 border-[#0c0e17] text-white flex items-center justify-center text-xs font-black hidden shadow-md">✓</span>
        <!-- Upload Custom Photo Overlay Button -->
        <label for="customPhotoUploadInput" class="absolute -bottom-1 -left-1 w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 border border-white/20 text-slate-200 flex items-center justify-center shadow-md cursor-pointer transition-all active:scale-95" title="Upload custom photo">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          <input type="file" id="customPhotoUploadInput" accept="image/*" class="hidden" onchange="handleCustomPhotoUpload(event)">
        </label>
      </div>

      <!-- Username Display & Quick Edit -->
      <div class="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between text-xs">
        <div class="text-left">
          <span class="text-[10px] text-slate-400 block font-medium">Username</span>
          <span id="modalUsernameText" class="font-bold text-white text-sm">@client</span>
        </div>
        <button type="button" onclick="promptEditUsername()" class="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 text-[11px] font-semibold transition-all cursor-pointer">
          Edit
        </button>
      </div>

      <!-- Original Google Verification Suite -->
      <!-- A. When Verified with Google -->
      <div id="modalGoogleVerifiedCard" class="hidden p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-[#0d1e15] to-emerald-950/40 border border-[#00D26A]/40 text-left space-y-1.5 shadow-lg">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"/>
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.33 24 12 24z"/>
              <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.15 0 9.99 0 12s.45 3.85 1.24 5.42l4.04-3.15z"/>
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
            </svg>
            <span class="text-xs font-bold text-emerald-400">Google Verified Account ✓</span>
          </div>
          <span class="text-[9.5px] font-bold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-500/30">Active</span>
        </div>
        <p id="modalGoogleEmailText" class="text-xs text-slate-200 font-mono select-all font-semibold">user@gmail.com</p>
        <p class="text-[10px] text-emerald-300/80">Identity & profile photo authenticated via Google Identity Services.</p>
      </div>

      <!-- B. When NOT Verified with Google (Official Google Sign-In) -->
      <div id="modalGoogleUnverifiedCard" class="p-4 rounded-2xl bg-white/[0.04] border border-white/10 text-left space-y-2.5 shadow-lg">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.33 24 12 24z"/>
            <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.15 0 9.99 0 12s.45 3.85 1.24 5.42l4.04-3.15z"/>
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
          </svg>
          <span class="text-xs font-bold text-white">Google Verification Service</span>
        </div>
        <p class="text-[11px] text-slate-400 leading-relaxed">
          Verify your account using your official Google identity. Your profile photo and details will be fetched automatically.
        </p>

        <!-- Official Google Sign-In Button Container (rendered via GSI) -->
        <div id="googleGsiButtonContainer" class="flex justify-center pt-1 min-h-[44px]"></div>
      </div>

      <!-- Device Notifications Preference Switch -->
      <div class="px-3.5 py-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between text-xs">
        <div class="text-left">
          <span class="font-bold text-slate-200 block text-xs">Device Notifications</span>
          <span class="text-[10px] text-slate-400">Receive alerts when Raoprime replies</span>
        </div>
        <label class="inline-flex items-center cursor-pointer select-none">
          <input type="checkbox" id="profileNotifToggle" onchange="handleProfileNotifToggle(this.checked)" class="sr-only peer">
          <div class="relative w-10 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00D26A]"></div>
        </label>
      </div>

      <!-- Done Button -->
      <button type="button" onclick="closeClientProfileModal()" class="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition-all active:scale-95 cursor-pointer">
        Done
      </button>

    </div>
  </div>

  <!-- Photo Full Preview Lightbox Modal -->`;

if (oldVerifyModalPattern.test(html)) {
  html = html.replace(oldVerifyModalPattern, newClientProfileModal);
  console.log('✓ Replaced photoVerifyModal with dedicated luxury Client Profile Modal');
} else {
  console.log('⚠ Could not match oldVerifyModalPattern');
}

// 7. Bump version to v=7.0
html = html.replace(/chat-app\.js\?v=[\d.]+/g, 'chat-app.js?v=7.0');

fs.writeFileSync(indexFile, html, 'utf8');
console.log('index.html redesigned successfully (v=7.0)!');
