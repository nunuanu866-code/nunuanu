const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://lwllncasntzevgidsdro.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.NUNUANU_APP_URL || 'https://nununanu-app.vercel.app';

const CUSTOMER_PUSH_TEXT = {
  booking_confirmed: {
    title: '예약 확정',
    body: '예약이 확정되었습니다. 내 예약 확인에서 확인해주세요.',
  },
  booking_rejected: {
    title: '예약 거절',
    body: '예약 요청이 거절되었습니다. 자세한 내용은 매장으로 문의해주세요.',
  },
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

function normalizeRecipientPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('82')) return digits;
  if (digits.startsWith('0')) return `82${digits.slice(1)}`;
  return digits;
}

async function sbInsert(table, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase INSERT ${r.status}: ${await r.text()}`);
  return r.json();
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
    console.warn('[customer-push-event] dispatch trigger skipped', error);
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
    const text = CUSTOMER_PUSH_TEXT[type];

    if (!bookingId || !/^[0-9a-f-]{36}$/i.test(bookingId)) {
      return json(res, 400, { ok: false, error: 'invalid_booking_id' });
    }
    if (!phone) return json(res, 400, { ok: false, error: 'invalid_phone' });
    if (!text) return json(res, 400, { ok: false, error: 'unsupported_type' });

    const eventKey = `customer:${phone}:${bookingId}:${type}:${Date.now()}`;
    const rows = await sbInsert('push_notification_events', {
      event_key: eventKey,
      type,
      title: text.title,
      body: text.body,
      audience: 'all',
      booking_id: bookingId,
      staff_id: null,
      data: {
        target: 'customer',
        recipient_phone: phone,
        url: '/',
      },
      status: 'pending',
    });

    await triggerDispatch(req);

    return json(res, 200, { ok: true, event: rows?.[0] || null });
  } catch (error) {
    console.error('[customer-push-event]', error);
    return json(res, 500, { ok: false, error: String(error.message || error) });
  }
}
