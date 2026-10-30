// Raoprime Official Service Worker
// Enables Native Android / Desktop OS Notification Panel Alerts and Background Sync

const CACHE_NAME = 'raoprime-v2.3';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle Notification Clicks (Tapping on Android Notification Bar or Windows/Mac Action Center)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) 
    ? event.notification.data.url 
    : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 1. If chat window is already open, focus it
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.url && client.url.includes(targetUrl.split('?')[0])) {
            return client.focus();
          }
        }
      }
      // 2. Otherwise open fresh window/tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Push Event listener (For Web Push API integration)
self.addEventListener('push', (event) => {
  let payload = { title: 'Raoprime', body: 'New confidential communication received', url: '/' };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body || 'New message received',
    icon: '/assets/rp-logo.jpg',
    badge: '/assets/rp-logo.jpg',
    vibrate: [250, 100, 250],
    tag: payload.tag || 'raoprime-notification',
    renotify: true,
    data: {
      url: payload.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Raoprime', options)
  );
});
