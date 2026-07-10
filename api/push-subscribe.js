const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://lwllncasntzevgidsdro.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

async function sbPatch(table, filter, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: sbHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase PATCH ${r.status}: ${await r.text()}`);
}

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`Supabase GET ${r.status}: ${await r.text()}`);
  return r.json();
}

async function sbUpsert(table, body, onConflict) {
  const suffix = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${suffix}`, {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase UPSERT ${r.status}: ${await r.text()}`);
  return r.json();
}

function safeSubscription(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_role: row.user_role,
    staff_id: row.staff_id,
    staff_name: row.staff_name,
    device_label: row.device_label,
    platform: row.platform,
    enabled: row.enabled === true,
    last_error: row.last_error || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_seen_at: row.last_seen_at,
  };
}

function normalizeRecipientPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('82')) return digits;
  if (digits.startsWith('0')) return `82${digits.slice(1)}`;
  return digits;
}

function cleanPayload(body) {
  const requestedRole = body.user_role === 'staff' ? 'staff' : body.user_role === 'customer' ? 'customer' : 'admin';
  const recipientPhone = normalizeRecipientPhone(body.recipient_phone || body.phone);
  const role = requestedRole === 'customer' ? 'staff' : requestedRole;
  return {
    token: String(body.token || ''),
    user_role: role,
    staff_id: requestedRole === 'staff' ? (body.staff_id || null) : null,
    staff_name: requestedRole === 'customer' ? `customer:${recipientPhone}` : (body.staff_name || null),
    platform: body.platform || null,
    device_label: body.device_label || (requestedRole === 'customer' ? `고객 알림 · ${recipientPhone.slice(-4)}` : null),
    enabled: body.enabled !== false,
    last_seen_at: new Date().toISOString(),
    last_error: null,
  };
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
    const token = String(body.token || '');
    if (!token || token.length < 20) return json(res, 400, { ok: false, error: 'invalid_token' });

    if (body.action === 'status') {
      const rows = await sbGet(
        `push_subscriptions?select=id,user_role,staff_id,staff_name,device_label,platform,enabled,last_error,created_at,updated_at,last_seen_at&token=eq.${encodeURIComponent(token)}&limit=1`
      );
      return json(res, 200, { ok: true, subscription: safeSubscription(rows?.[0] || null) });
    }

    if (body.action === 'disable') {
      await sbPatch('push_subscriptions', `token=eq.${encodeURIComponent(token)}`, {
        enabled: false,
        last_seen_at: new Date().toISOString(),
      });
      return json(res, 200, { ok: true, disabled: true });
    }

    const saved = await sbUpsert('push_subscriptions', cleanPayload(body), 'token');
    return json(res, 200, { ok: true, subscription: saved?.[0] || null });
  } catch (error) {
    console.error('[push-subscribe]', error);
    return json(res, 500, { ok: false, error: String(error.message || error) });
  }
}
