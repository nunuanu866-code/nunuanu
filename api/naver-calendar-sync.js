import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://lwllncasntzevgidsdro.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SYNC_SECRET = process.env.NAVER_CALENDAR_SYNC_SECRET;
const ICS_URLS = String(process.env.NAVER_CALENDAR_ICS_URLS || process.env.NAVER_CALENDAR_ICS_URL || '')
  .split(/[\n,]+/)
  .map(v => v.trim())
  .filter(Boolean);

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

async function sbPost(tableOrPath, body, prefer = 'return=representation') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tableOrPath}`, {
    method: 'POST',
    headers: sbHeaders({ Prefer: prefer }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase POST ${r.status}: ${await r.text()}`);
  return r.json();
}

async function sbPatch(table, filter, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: sbHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase PATCH ${r.status}: ${await r.text()}`);
  return r.json();
}

async function sbUpsert(table, body, onConflict) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase UPSERT ${r.status}: ${await r.text()}`);
  return r.json();
}

function hash(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 16);
}

function decodeIcsText(value) {
  return String(value || '')
    .replace(/\\n/g, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function unfoldIcs(text) {
  return String(text || '').replace(/\r?\n[ \t]/g, '');
}

function prop(block, key) {
  const line = block.split(/\r?\n/).find(v => v.startsWith(`${key}:`) || v.startsWith(`${key};`));
  if (!line) return '';
  return decodeIcsText(line.slice(line.indexOf(':') + 1));
}

function toKstParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function parseCalendarDateTime(rawValue) {
  const raw = String(rawValue || '').trim();
  const m = raw.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?/);
  if (!m) return null;
  if (!m[4]) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: '10:00' };
  if (raw.endsWith('Z')) {
    return toKstParts(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5] || 0), Number(m[6] || 0))));
  }
  return {
    date: `${m[1]}-${m[2]}-${m[3]}`,
    time: `${m[4]}:${m[5] || '00'}`,
  };
}

function addMinutes(time, minutes) {
  const [h, m] = String(time || '00:00').split(':').map(Number);
  const total = Math.max(0, h * 60 + m + Number(minutes || 0));
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function serviceType(text) {
  const value = String(text || '').toLowerCase();
  const hasHair = /헤어|hair/.test(value);
  const hasMakeup = /메이크업|make\s*up|makeup/.test(value);
  if (hasHair && hasMakeup) return 'both';
  if (hasMakeup) return 'makeup';
  return 'hair';
}

function cleanPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('82')) return `0${digits.slice(2)}`;
  return digits;
}

function eventName(summary, description) {
  const phone = (summary + ' ' + description).match(/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/)?.[0] || '';
  const cleaned = String(summary || '')
    .replace(phone, '')
    .replace(/\[[^\]]*네이버[^\]]*\]/g, '')
    .replace(/네이버\s*예약/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const first = (cleaned.split(/[-|/]/)[0] || cleaned || '고객').trim();
  return /^네이버\s*/.test(first) ? first : `네이버 ${first}`;
}

function parseIcsEvents(text, sourceIndex = 0) {
  const unfolded = unfoldIcs(text);
  const calendarMethod = prop(unfolded, 'METHOD').toUpperCase();
  const blocks = [...unfolded.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].map(m => m[1]);
  return blocks.map((block, index) => {
    const uid = prop(block, 'UID') || `generated-${hash(block + index)}`;
    const summary = prop(block, 'SUMMARY') || '네이버 캘린더 예약';
    const description = prop(block, 'DESCRIPTION');
    const dtStart = parseCalendarDateTime(prop(block, 'DTSTART'));
    const dtEnd = parseCalendarDateTime(prop(block, 'DTEND'));
    if (!dtStart) return null;
    const phone = cleanPhone((summary + ' ' + description).match(/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/)?.[0] || '');
    const type = serviceType(`${summary} ${description}`);
    const end = dtEnd?.time && dtEnd.time !== dtStart.time ? dtEnd.time : addMinutes(dtStart.time, type === 'both' ? 100 : 60);
    const status = prop(block, 'STATUS').toUpperCase();
    const sourceKey = `calendar-${hash(`${sourceIndex}:${uid}`)}`;
    return {
      sourceKey,
      uid,
      reservationNo: uid,
      name: eventName(summary, description),
      phone: phone || `naver-calendar-${hash(sourceKey)}`,
      date: dtStart.date,
      start: dtStart.time,
      end,
      serviceType: type,
      productName: summary,
      description,
      cancelled: status === 'CANCELLED' || calendarMethod === 'CANCEL',
    };
  }).filter(Boolean);
}

function bookingMemo(ev) {
  return [
    'NAVER_BOOKING',
    'NAVER_CALENDAR',
    `NAVER_SOURCE_KEY:${ev.sourceKey}`,
    `NAVER_CALENDAR_UID:${ev.uid}`,
    `NAVER_CALENDAR_SYNCED_AT:${new Date().toISOString()}`,
    ev.description ? `설명: ${ev.description}` : '',
  ].filter(Boolean).join('\n');
}

async function ensureCustomer(ev) {
  const rows = await sbGet(`customers?select=id,name,phone,pin,memo&phone=eq.${encodeURIComponent(ev.phone)}&limit=1`);
  if (rows?.[0]?.id) return rows[0].id;
  const digits = cleanPhone(ev.phone);
  const pin = (digits.slice(-4) || '0000').padStart(4, '0');
  const created = await sbPost('customers', {
    name: ev.name,
    phone: ev.phone,
    pin,
    memo: '네이버 캘린더 자동 동기화 고객',
  });
  return created?.[0]?.id || null;
}

async function findLinkedBooking(sourceKey) {
  const links = await sbGet(`naver_booking_links?select=booking_id&source_key=eq.${encodeURIComponent(sourceKey)}&order=updated_at.desc&limit=1`).catch(() => []);
  const bookingId = links?.[0]?.booking_id;
  if (bookingId) return bookingId;
  const rows = await sbGet(`bookings?select=id&customer_memo=ilike.${encodeURIComponent(`*NAVER_SOURCE_KEY:${sourceKey}*`)}&order=created_at.desc&limit=1`).catch(() => []);
  return rows?.[0]?.id || null;
}

async function syncEvent(ev) {
  const existingBookingId = await findLinkedBooking(ev.sourceKey);

  if (ev.cancelled) {
    if (existingBookingId) {
      await sbPatch('bookings', `id=eq.${encodeURIComponent(existingBookingId)}`, {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        customer_memo: bookingMemo(ev),
      });
    }
    await sbUpsert('naver_booking_links', {
      source_key: ev.sourceKey,
      reservation_no: ev.reservationNo,
      booking_id: existingBookingId || null,
      customer_name: ev.name,
      customer_phone: ev.phone,
      booking_date: ev.date,
      start_time: ev.start,
      end_time: ev.end,
      product_name: ev.productName,
      service_type: ev.serviceType,
      status: 'cancelled',
      last_event_type: 'calendar_cancelled',
      last_synced_at: new Date().toISOString(),
    }, 'source_key').catch(() => null);
    return existingBookingId ? 'cancelled' : 'cancel_missing';
  }

  const customerId = await ensureCustomer(ev);
  if (!customerId) throw new Error(`customer_not_saved:${ev.sourceKey}`);

  const payload = {
    customer_id: customerId,
    booking_date: ev.date,
    start_time: ev.start,
    end_time: ev.end,
    service_type: ev.serviceType,
    service_detail: `네이버 캘린더 - ${ev.productName}`,
    customer_memo: bookingMemo(ev),
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
  };

  let bookingId = existingBookingId;
  let result = 'updated';
  if (bookingId) {
    await sbPatch('bookings', `id=eq.${encodeURIComponent(bookingId)}`, payload);
  } else {
    const created = await sbPost('bookings', payload);
    bookingId = created?.[0]?.id || null;
    result = 'created';
  }
  if (!bookingId) throw new Error(`booking_not_saved:${ev.sourceKey}`);

  await sbUpsert('naver_booking_links', {
    source_key: ev.sourceKey,
    reservation_no: ev.reservationNo,
    booking_id: bookingId,
    customer_id: customerId,
    customer_name: ev.name,
    customer_phone: ev.phone,
    booking_date: ev.date,
    start_time: ev.start,
    end_time: ev.end,
    product_name: ev.productName,
    service_type: ev.serviceType,
    status: 'confirmed',
    last_event_type: 'calendar_confirmed',
    last_synced_at: new Date().toISOString(),
  }, 'source_key').catch(() => null);

  return result;
}

async function fetchCalendar(url) {
  const r = await fetch(url, {
    headers: {
      Accept: 'text/calendar, text/plain, */*',
      'User-Agent': 'NUNUANU calendar sync',
    },
  });
  if (!r.ok) throw new Error(`calendar_fetch_${r.status}`);
  return r.text();
}

function authorize(req) {
  if (!SYNC_SECRET) return true;
  const auth = req.headers.authorization || '';
  const querySecret = req.query?.secret;
  const isVercelCron = req.headers['x-vercel-cron'];
  return Boolean(isVercelCron || auth === `Bearer ${SYNC_SECRET}` || querySecret === SYNC_SECRET);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { ok: false, error: 'method_not_allowed' });
  if (!authorize(req)) return json(res, 401, { ok: false, error: 'unauthorized' });
  if (!SERVICE_KEY) return json(res, 500, { ok: false, error: 'missing_SUPABASE_SERVICE_ROLE_KEY' });
  if (!ICS_URLS.length) return json(res, 400, { ok: false, error: 'missing_NAVER_CALENDAR_ICS_URL' });

  const stats = { fetched: 0, parsed: 0, created: 0, updated: 0, cancelled: 0, skipped: 0, failed: 0 };
  const errors = [];

  for (let i = 0; i < ICS_URLS.length; i += 1) {
    try {
      const text = await fetchCalendar(ICS_URLS[i]);
      stats.fetched += 1;
      const events = parseIcsEvents(text, i);
      stats.parsed += events.length;
      for (const ev of events) {
        try {
          const result = await syncEvent(ev);
          if (result === 'created') stats.created += 1;
          else if (result === 'updated') stats.updated += 1;
          else if (result === 'cancelled') stats.cancelled += 1;
          else stats.skipped += 1;
        } catch (error) {
          stats.failed += 1;
          errors.push({ sourceKey: ev.sourceKey, error: String(error.message || error) });
        }
      }
    } catch (error) {
      stats.failed += 1;
      errors.push({ calendar: i + 1, error: String(error.message || error) });
    }
  }

  return json(res, errors.length ? 207 : 200, { ok: errors.length === 0, stats, errors });
}
