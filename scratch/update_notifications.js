const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/chat-app.js');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Replace the notification suite
const oldStartStr = '// Native Android / Desktop OS Notification Panel Alerts';
const oldEndStr = '  setupMobileViewport();';

const startIdx = code.indexOf(oldStartStr);
const endIdx = code.indexOf(oldEndStr);

if (startIdx === -1 || endIdx === -1) {
  console.error('Could not find start or end index:', { startIdx, endIdx });
  process.exit(1);
}

const replacement = `// Native Android / Desktop OS Notification Panel Alerts
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

`;

code = code.substring(0, startIdx) + replacement + code.substring(endIdx);

// 2. Add notification prompt trigger in saveClientName
const oldSaveClient = `  document.getElementById('nameModal').classList.add('hidden');`;
const newSaveClient = `  document.getElementById('nameModal').classList.add('hidden');
  if ('Notification' in window && Notification.permission === 'default') {
    requestNotificationPermission().catch(() => {});
  }`;
code = code.replace(oldSaveClient, newSaveClient);

// 3. Add notification prompt trigger in sendTextMessage
const oldSendText = `  // Prevent rapid double-tapping on client`;
const newSendText = `  // Prompt notification permission if user has not chosen yet
  if ('Notification' in window && Notification.permission === 'default') {
    requestNotificationPermission().catch(() => {});
  }

  // Prevent rapid double-tapping on client`;
code = code.replace(oldSendText, newSendText);

// 4. In loadMessages, notify on incoming messages when in background
const oldLoadSig = `      if (currentSig !== lastMessageSig) {
        const isNewLength = data.messages.length !== lastMessagesCount;
        lastMessageSig = currentSig;
        lastMessagesCount = data.messages.length;`;

const newLoadSig = `      if (currentSig !== lastMessageSig) {
        const isNewLength = data.messages.length !== lastMessagesCount;
        if (isNewLength && lastMessagesCount > 0 && data.messages.length > lastMessagesCount) {
          const newMsgs = data.messages.slice(lastMessagesCount);
          const incoming = newMsgs.filter(m => m.sender !== currentRole);
          if (incoming.length > 0) {
            playMessageSound();
            showDeviceSystemNotification(incoming[incoming.length - 1]);
          }
        }
        lastMessageSig = currentSig;
        lastMessagesCount = data.messages.length;`;
code = code.replace(oldLoadSig, newLoadSig);

fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully updated chat-app.js with full notification suite!');
