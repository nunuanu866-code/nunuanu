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

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`Supabase GET ${r.status}: ${await r.text()}`);
  return r.json();
}

function countBy(rows, pick) {
  return (rows || []).reduce((acc, row) => {
    const key = pick(row) || '(blank)';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function trimError(value) {
  const text = String(value || '').trim();
  return text ? text.slice(0, 220) : null;
}

function safeSub(row) {
  return {
    id: row.id,
    user_role: row.user_role,
    staff_id: row.staff_id,
    staff_name: row.staff_name,
    device_label: row.device_label,
    platform: row.platform,
    enabled: row.enabled === true,
    last_error: trimError(row.last_error),
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_seen_at: row.last_seen_at,
  };
}

function safeEvent(row) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    attempts: row.attempts,
    audience: row.audience,
    staff_id: row.staff_id,
    last_error: trimError(row.last_error),
    created_at: row.created_at,
    sent_at: row.sent_at,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  if (!SERVICE_KEY) return json(res, 500, { ok: false, error: 'missing SUPABASE_SERVICE_ROLE_KEY' });

  try {
    const [subs, events] = await Promise.all([
      sbGet('push_subscriptions?select=id,user_role,staff_id,staff_name,device_label,platform,enabled,last_error,created_at,updated_at,last_seen_at&order=updated_at.desc&limit=500'),
      sbGet('push_notification_events?select=id,type,status,attempts,audience,staff_id,last_error,created_at,sent_at&order=created_at.desc&limit=80'),
    ]);

    const adminSubs = subs.filter(row => !String(row.staff_name || '').startsWith('customer:'));
    const active = adminSubs.filter(row => row.enabled === true);
    const inactive = adminSubs.filter(row => row.enabled !== true);
    const staleCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const staleActive = active.filter(row => Date.parse(row.last_seen_at || '') < staleCutoff);

    return json(res, 200, {
      ok: true,
      checked_at: new Date().toISOString(),
      subscriptions: {
        total: adminSubs.length,
        active: active.length,
        inactive: inactive.length,
        stale_active_over_7_days: staleActive.length,
        active_by_platform: countBy(active, row => row.platform),
        inactive_by_error: countBy(inactive, row => trimError(row.last_error) || 'disabled/no_error'),
        recent: adminSubs.slice(0, 40).map(safeSub),
      },
      events: {
        total_recent: events.length,
        by_status: countBy(events, row => row.status),
        by_type: countBy(events, row => row.type),
        recent_failed: events.filter(row => row.status === 'failed').slice(0, 12).map(safeEvent),
        recent_pending: events.filter(row => row.status === 'pending').slice(0, 12).map(safeEvent),
        recent_sent: events.filter(row => row.status === 'sent').slice(0, 12).map(safeEvent),
      },
    });
  } catch (error) {
    console.error('[push-diagnostics]', error);
    return json(res, 500, { ok: false, error: String(error.message || error) });
  }
}
