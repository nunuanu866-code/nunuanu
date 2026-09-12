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
  const data = event.notification?.data || {};
  const buildTarget = () => {
    const raw = data.url || (data.target === 'customer' ? '/' : '/admin.html');
    const url = new URL(raw, self.location.origin);
    if (url.pathname.endsWith('/admin.html')) {
      const tab = data.tab || (data.type && String(data.type).startsWith('booking_') ? 'schedule' : '');
      if (tab) url.searchParams.set('tab', tab);
      const date = data.date || data.booking_date;
      if (date) url.searchParams.set('date', date);
      const bookingId = data.booking_id || data.bookingId;
      if (bookingId) url.searchParams.set('booking_id', bookingId);
      if (data.start_time) url.searchParams.set('start_time', data.start_time);
      if (data.staff_id) url.searchParams.set('staff_id', data.staff_id);
    }
    return url;
  };
  const targetUrl = buildTarget();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const exact = clients.find(client => {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin !== targetUrl.origin) return false;
        if (targetUrl.pathname === '/') return clientUrl.pathname === '/' || clientUrl.pathname === '/index.html';
        return clientUrl.pathname === targetUrl.pathname;
      });
      const existing = exact || clients.find(client => new URL(client.url).origin === targetUrl.origin);
      if (existing) {
        if ('navigate' in existing) {
          return existing.navigate(targetUrl.href).then(client => (client || existing).focus());
        }
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl.href);
    })
  );
});

self.addEventListener('push', event => {
  let payload;
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      notification: {
        title: self.DEFAULT_NOTIFICATION_TITLE,
        body: event.data ? event.data.text() : '',
      },
    };
  }

  const notification = (payload && payload.notification) || payload || {};
  const data = payload.data || {};
  if (!notification.title || hasBrokenKorean(notification.title)) {
    notification.title = self.DEFAULT_NOTIFICATION_TITLE;
  }

  event.waitUntil(
    self.registration.showNotification(notification.title || '누누아누 알림', {
      body: notification.body || '',
      icon: '/nunuanu-app-icon-192.png',
      badge: '/favicon-32.png',
      tag: data.event_key || data.event_id || data.booking_id || 'nununanu-push',
      data,
      requireInteraction: true,
    })
  );
});
