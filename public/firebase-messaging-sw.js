self.DEFAULT_NOTIFICATION_TITLE = '누누아누 알림';

function hasBrokenKorean(value) {
  return /�|怨|덉|붿|뺤|嫄|痍|꾨|늻|뚮|┝|뀦|쨌|묒|뱀|뚰|븳|젙|냼|껌/.test(String(value || ''));
}

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification?.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const targetUrl = new URL(target, self.location.origin);
      const existing = clients.find(client => {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin !== targetUrl.origin) return false;
        if (targetUrl.pathname === '/') return clientUrl.pathname === '/' || clientUrl.pathname === '/index.html';
        return clientUrl.pathname === targetUrl.pathname;
      });
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl.href);
    })
  );
});

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      notification: {
        title: '누누아누 알림',
        body: event.data ? event.data.text() : '',
      },
    };
  }

  const notification = payload.notification || payload;
  const data = payload.data || {};
  if (!notification.title || hasBrokenKorean(notification.title)) {
    notification.title = self.DEFAULT_NOTIFICATION_TITLE;
  }

  event.waitUntil(
    self.registration.showNotification(notification.title || '누누아누 알림', {
      body: notification.body || '',
      icon: '/nunuanu-app-icon-192.png',
      badge: '/favicon-32.png',
      tag: data.event_id || data.booking_id || 'nununanu-push',
      data,
      requireInteraction: true,
    })
  );
});
