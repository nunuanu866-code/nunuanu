import crypto from 'node:crypto';
import webpush from 'web-push';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://lwllncasntzevgidsdro.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const PRIVATE_KEY = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const APP_URL = process.env.NUNUANU_APP_URL || 'https://nununanu-app.vercel.app';
const WEB_PUSH_PUBLIC_KEY = process.env.WEB_PUSH_PUBLIC_KEY;
const WEB_PUSH_PRIVATE_KEY = process.env.WEB_PUSH_PRIVATE_KEY;
const WEB_PUSH_SUBJECT = process.env.WEB_PUSH_SUBJECT || 'mailto:nunuanu866@gmail.com';

if (WEB_PUSH_PUBLIC_KEY && WEB_PUSH_PRIVATE_KEY) {
  webpush.setVapidDetails(WEB_PUSH_SUBJECT, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY);
}

const TYPE_TITLE = {
  booking_request: '예약 요청 접수',
  booking_confirmed: '예약 확정',
  booking_rejected: '예약 거절',
  booking_cancel_requested: '취소 요청 접수',
  booking_cancelled: '예약 취소 확정',
  booking_updated: '예약 수정',
  staff_added: '스텝 추가',
  staff_updated: '스텝 수정',
  staff_deleted: '스텝 삭제',
  staff_permission_updated: '스텝 권한 변경',
  staff_approval_requested: '스텝 승인 요청',
  staff_approval_confirmed: '스텝 승인 완료',
  staff_day_off_updated: '스텝 휴무 변경',
  schedule_notice_updated: '일정 공지 변경',
  admin_notice: '관리자 알림',
};

const DEFAULT_BODY = {
  booking_request: '새 고객 예약 요청이 접수되었습니다.',
  booking_confirmed: '예약이 확정되었습니다.',
  booking_rejected: '예약 요청이 거절되었습니다.',
  booking_cancel_requested: '고객 취소 요청이 접수되었습니다.',
  booking_cancelled: '예약 취소가 확정되었습니다.',
  booking_updated: '예약 정보가 수정되었습니다.',
  staff_added: '스텝이 추가되었습니다.',
  staff_updated: '스텝 정보가 수정되었습니다.',
  staff_deleted: '스텝이 삭제되었습니다.',
  staff_permission_updated: '스텝 권한이 변경되었습니다.',
  staff_approval_requested: '스텝 권한 승인 요청이 접수되었습니다.',
  staff_approval_confirmed: '스텝 권한이 승인되었습니다.',
  staff_day_off_updated: '스텝 휴무가 변경되었습니다.',
  schedule_notice_updated: '일정 공지사항이 변경되었습니다.',
  admin_notice: '관리자 페이지 변경사항이 있습니다.',
};

function json(res, status, body) {
  res.status(status).json(body);
}

function sbHeaders(extra = {}) {
  const headers = {
    apikey: SERVICE_KEY,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (!String(SERVICE_KEY || '').startsWith('sb_secret_')) {
    headers.Authorization = `Bearer ${SERVICE_KEY}`;
  }
  return { ...headers, ...extra };
}

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`Supabase GET ${r.status}: ${await r.text()}`);
  return r.json();
}

async function sbPatch(table, filter, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: sbHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase PATCH ${r.status}: ${await r.text()}`);
}

function b64url(value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getFirebaseAccessToken() {
  if (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
    throw new Error('FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY missing');
  }
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(PRIVATE_KEY, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const assertion = `${unsigned}.${signature}`;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!r.ok) throw new Error(`Google OAuth ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.access_token;
}

function eventUrl(event) {
  const data = event.data || {};
  if (data.url) return new URL(String(data.url), APP_URL).toString();
  if (data.target === 'customer') return new URL('/', APP_URL).toString();
  return `${APP_URL}/admin.html`;
}

function stringData(event) {
  const data = {
    event_id: event.id,
    type: event.type,
    booking_id: event.booking_id || '',
    staff_id: event.staff_id || '',
    ...(event.data || {}),
  };
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value ?? '')]));
}

function hasBrokenKorean(value) {
  const text = String(value || '');
  return text.includes('�')
    || /[占筌椰袁諭]/.test(text)
    || text.includes('?덉')
    || text.includes('?ㅽ')
    || text.includes('?붿')
    || text.includes('怨좉')
    || text.includes('痍⑥')
    || text.includes('쨌');
}

function cleanFallbackText(value, fallback = '') {
  const text = String(value || '').trim();
  if (!text || hasBrokenKorean(text)) return fallback;
  return text;
}

async function loadBookingForEvent(event) {
  if (!event.booking_id) return null;
  const rows = await sbGet(
    `bookings?select=id,booking_date,start_time,service_detail,status,customers(name,phone)&id=eq.${encodeURIComponent(event.booking_id)}&limit=1`
  );
  return rows?.[0] || null;
}

function formatBookingBody(booking, fallback = '') {
  if (!booking) return cleanFallbackText(fallback, '');
  const name = booking.customers?.name || '고객';
  const date = booking.booking_date || '';
  const time = String(booking.start_time || '').slice(0, 5);
  return [name, [date, time].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
}

async function normalizePushEvent(event) {
  const booking = await loadBookingForEvent(event).catch(() => null);
  const data = { ...(event.data || {}) };
  if (data.target === 'customer' && !data.recipient_phone && booking?.customers?.phone) {
    data.recipient_phone = String(booking.customers.phone).replace(/\D/g, '');
  }

  const isCustomerEvent = data.target === 'customer';
  const fallbackTitle = TYPE_TITLE[event.type] || '누누아누 알림';
  const fallbackBody = DEFAULT_BODY[event.type] || formatBookingBody(booking, '관리자 페이지 변경사항이 있습니다.');
  const title = isCustomerEvent
    ? cleanFallbackText(event.title, fallbackTitle)
    : (TYPE_TITLE[event.type] || cleanFallbackText(event.title, '누누아누 알림'));

  let body = cleanFallbackText(event.body, '');
  if (!body && event.type && event.type.startsWith('booking_')) {
    body = formatBookingBody(booking, fallbackBody);
  }
  if (!body) body = fallbackBody;

  return { ...event, title: cleanFallbackText(title, '누누아누 알림'), body, data };
}

function notificationText(event) {
  return {
    title: cleanFallbackText(event.title, '누누아누 알림'),
    body: cleanFallbackText(event.body, ''),
  };
}

async function sendFcm(token, event, accessToken) {
  if (!PROJECT_ID) throw new Error('FIREBASE_PROJECT_ID missing');
  if (!accessToken) throw new Error('Firebase access token missing');
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token,
        notification: notificationText(event),
        data: stringData(event),
        webpush: {
          fcm_options: { link: eventUrl(event) },
          notification: {
            icon: '/nunuanu-app-icon-192.png',
            badge: '/favicon-32.png',
            requireInteraction: true,
            tag: event.event_key || event.id,
          },
        },
      },
    }),
  });

  const text = await r.text();
  if (!r.ok) {
    const err = new Error(`FCM ${r.status}: ${text}`);
    err.status = r.status;
    err.body = text;
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

async function sendWebPush(token, event) {
  if (!WEB_PUSH_PUBLIC_KEY || !WEB_PUSH_PRIVATE_KEY) {
    throw new Error('WEB_PUSH_PUBLIC_KEY/WEB_PUSH_PRIVATE_KEY missing');
  }
  const subscription = JSON.parse(token.slice('webpush:'.length));
  const payload = JSON.stringify({
    notification: notificationText(event),
    data: {
      ...stringData(event),
      url: eventUrl(event),
    },
  });
  return webpush.sendNotification(subscription, payload, {
    TTL: 60 * 60 * 24,
    urgency: 'high',
  });
}

async function sendPushToken(token, event, accessToken) {
  if (String(token || '').startsWith('webpush:')) {
    return sendWebPush(token, event);
  }
  return sendFcm(token, event, accessToken);
}

function tokenNeedsFcm(token) {
  return !String(token || '').startsWith('webpush:');
}

function subscriptionQuery(event) {
  const base = 'push_subscriptions?select=id,token,user_role,staff_id,staff_name&enabled=eq.true';
  if (event.data?.target === 'customer') {
    const phone = String(event.data?.recipient_phone || '').replace(/\D/g, '');
    if (!phone) return `${base}&id=eq.00000000-0000-0000-0000-000000000000`;
    return `${base}&user_role=eq.staff&staff_name=eq.${encodeURIComponent(`customer:${phone}`)}`;
  }
  // Admin-side notifications must be identical on every logged-in admin/staff device.
  // Customer subscriptions are excluded later by filterSubscriptionsForEvent().
  return base;
}

function filterSubscriptionsForEvent(subscriptions, event) {
  const rows = subscriptions || [];
  if (event.data?.target === 'customer') return rows;
  return rows.filter(sub => !String(sub.staff_name || '').startsWith('customer:'));
}

function isInvalidTokenError(error) {
  const body = String(error?.body || error?.message || '');
  return error?.status === 404
    || error?.statusCode === 404
    || error?.statusCode === 410
    || body.includes('UNREGISTERED')
    || body.includes('registration-token-not-registered');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});

  const secret = process.env.PUSH_DISPATCH_SECRET;
  if (secret) {
    const auth = req.headers.authorization || '';
    const querySecret = req.query?.secret;
    const isVercelCron = req.headers['x-vercel-cron'];
    if (!isVercelCron && auth !== `Bearer ${secret}` && querySecret !== secret) {
      return json(res, 401, { ok: false, error: 'unauthorized' });
    }
  }

  if (!SERVICE_KEY) {
    return json(res, 500, {
      ok: false,
      error: 'missing_env',
      missing: ['SUPABASE_SERVICE_ROLE_KEY'],
    });
  }

  if (!WEB_PUSH_PUBLIC_KEY || !WEB_PUSH_PRIVATE_KEY) {
    console.warn('[push-dispatch] WEB_PUSH_PUBLIC_KEY/WEB_PUSH_PRIVATE_KEY missing. Web Push tokens will fail.');
  }

  const limit = Math.min(Number(req.query?.limit || 20), 50);
  const events = await sbGet(`push_notification_events?select=*&status=eq.pending&order=created_at.asc&limit=${limit}`);
  if (!events.length) return json(res, 200, { ok: true, processed: 0 });

  let accessToken = null;
  const result = [];

  for (const event of events) {
    let sent = 0;
    let failed = 0;
    let lastError = '';
    const pushEvent = await normalizePushEvent(event);
    const subscriptions = filterSubscriptionsForEvent(await sbGet(subscriptionQuery(pushEvent)), pushEvent);

    if (!subscriptions.length) {
      await sbPatch('push_notification_events', `id=eq.${event.id}`, {
        status: 'failed',
        attempts: Number(event.attempts || 0) + 1,
        last_error: 'no_active_subscriptions',
      });
      result.push({ id: event.id, sent, failed, error: 'no_active_subscriptions' });
      continue;
    }

    for (const sub of subscriptions) {
      try {
        if (tokenNeedsFcm(sub.token) && !accessToken) {
          accessToken = await getFirebaseAccessToken();
        }
        await sendPushToken(sub.token, pushEvent, accessToken);
        await sbPatch('push_subscriptions', `id=eq.${sub.id}`, { last_error: null });
        sent += 1;
      } catch (error) {
        failed += 1;
        lastError = String(error.message || error);
        if (isInvalidTokenError(error)) {
          await sbPatch('push_subscriptions', `id=eq.${sub.id}`, { enabled: false, last_error: lastError });
        } else {
          await sbPatch('push_subscriptions', `id=eq.${sub.id}`, { last_error: lastError });
        }
      }
    }

    await sbPatch('push_notification_events', `id=eq.${event.id}`, {
      status: sent > 0 ? 'sent' : 'failed',
      attempts: Number(event.attempts || 0) + 1,
      sent_at: sent > 0 ? new Date().toISOString() : null,
      last_error: sent > 0 ? null : lastError || 'send_failed',
    });
    result.push({ id: event.id, sent, failed, lastError });
  }

  return json(res, 200, { ok: true, processed: result.length, result });
}
