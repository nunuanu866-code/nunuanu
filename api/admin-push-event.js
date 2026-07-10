const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://lwllncasntzevgidsdro.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.NUNUANU_APP_URL || 'https://nununanu-app.vercel.app';

const ADMIN_PUSH_TEXT = {
  booking_request: { title: '예약 요청 접수', body: '새 고객 예약 요청이 접수되었습니다.' },
  booking_confirmed: { title: '예약 확정', body: '예약이 확정되었습니다.' },
  booking_rejected: { title: '예약 거절', body: '예약 요청이 거절되었습니다.' },
  booking_cancel_requested: { title: '취소 요청 접수', body: '고객 취소 요청이 접수되었습니다.' },
  booking_cancelled: { title: '예약 취소 확정', body: '예약 취소가 확정되었습니다.' },
  booking_updated: { title: '예약 수정', body: '예약 정보가 수정되었습니다.' },
  staff_added: { title: '스텝 추가', body: '스텝이 추가되었습니다.' },
  staff_updated: { title: '스텝 수정', body: '스텝 정보가 수정되었습니다.' },
  staff_deleted: { title: '스텝 삭제', body: '스텝이 삭제되었습니다.' },
  staff_permission_updated: { title: '스텝 권한 변경', body: '스텝 권한이 변경되었습니다.' },
  staff_approval_requested: { title: '스텝 승인 요청', body: '스텝 권한 승인 요청이 접수되었습니다.' },
  staff_approval_confirmed: { title: '스텝 승인 완료', body: '스텝 권한이 승인되었습니다.' },
  staff_day_off_updated: { title: '스텝 휴무 변경', body: '스텝 휴무가 변경되었습니다.' },
  schedule_notice_updated: { title: '일정 공지 변경', body: '일정 공지사항이 변경되었습니다.' },
  admin_notice: { title: '관리자 알림', body: '관리자 페이지 변경사항이 있습니다.' },
};

const IDEMPOTENT_BOOKING_TYPES = new Set([
  'booking_request',
  'booking_confirmed',
  'booking_rejected',
  'booking_cancel_requested',
  'booking_cancelled',
  'staff_approval_requested',
  'staff_approval_confirmed',
]);

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

function normalizeRecipientPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('82')) return digits;
  if (digits.startsWith('0')) return `82${digits.slice(1)}`;
  return digits;
}

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`Supabase GET ${r.status}: ${await r.text()}`);
  return r.json();
}

async function sbUpsertPushEvent(body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/push_notification_events?on_conflict=event_key`, {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase UPSERT ${r.status}: ${await r.text()}`);
  return r.json();
}

async function loadBooking(bookingId) {
  const rows = await sbGet(
    `bookings?select=id,status,booking_date,start_time,service_type,service_detail,customers(name,phone)&id=eq.${encodeURIComponent(bookingId)}&limit=1`
  );
  return rows?.[0] || null;
}

function bookingBody(booking, fallback) {
  if (!booking) return fallback;
  const name = booking.customers?.name || '고객';
  const date = booking.booking_date || '';
  const time = String(booking.start_time || '').slice(0, 5);
  return [name, [date, time].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || fallback;
}

function eventKeyFor(type, bookingId, supplied) {
  const key = String(supplied || '').trim();
  if (key) return key;
  if (bookingId && IDEMPOTENT_BOOKING_TYPES.has(type)) return `booking:${bookingId}:${type}`;
  return `admin:${type}:${bookingId || 'global'}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function triggerDispatch(req) {
  const secret = process.env.PUSH_DISPATCH_SECRET;
  const host = req.headers.host ? `https://${req.headers.host}` : APP_URL;
  const url = new URL('/api/push-dispatch', host);
  url.searchParams.set('limit', '20');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    await fetch(url.toString(), {
      method: 'POST',
      headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      signal: controller.signal,
    });
  } catch (error) {
    console.warn('[admin-push-event] dispatch trigger skipped', error);
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'OPTIONS') return json(res, 204, {});

  if (!SERVICE_KEY) {
    return json(res, 500, { ok: false, error: 'missing SUPABASE_SERVICE_ROLE_KEY' });
  }

  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const bookingId = String(body.bookingId || body.booking_id || '').trim();
    const type = String(body.type || '').trim();
    const phone = normalizeRecipientPhone(body.phone || body.recipient_phone);
    const text = ADMIN_PUSH_TEXT[type];

    if (bookingId && !/^[0-9a-f-]{36}$/i.test(bookingId)) {
      return json(res, 400, { ok: false, error: 'invalid_booking_id' });
    }
    if (!text) return json(res, 400, { ok: false, error: 'unsupported_type' });

    const booking = bookingId ? await loadBooking(bookingId) : null;
    if (bookingId && !booking) return json(res, 404, { ok: false, error: 'booking_not_found' });

    const bookingPhone = normalizeRecipientPhone(booking?.customers?.phone);
    if (phone && bookingPhone && phone !== bookingPhone) {
      return json(res, 403, { ok: false, error: 'phone_mismatch' });
    }

    const data = {
      url: '/admin.html',
      ...safeObject(body.data),
      ...(booking ? {
        booking_date: booking.booking_date,
        start_time: String(booking.start_time || '').slice(0, 5),
      } : {}),
    };

    const rows = await sbUpsertPushEvent({
      event_key: eventKeyFor(type, bookingId, body.eventKey || body.event_key),
      type,
      title: String(body.title || text.title),
      body: String(body.body || bookingBody(booking, text.body)),
      audience: ['admin', 'staff', 'all'].includes(body.audience) ? body.audience : 'all',
      booking_id: bookingId || null,
      staff_id: body.staff_id || body.staffId || null,
      data,
      status: 'pending',
      attempts: 0,
      last_error: null,
      sent_at: null,
    });

    await triggerDispatch(req);

    return json(res, 200, { ok: true, event: rows?.[0] || null });
  } catch (error) {
    console.error('[admin-push-event]', error);
    return json(res, 500, { ok: false, error: String(error.message || error) });
  }
}
