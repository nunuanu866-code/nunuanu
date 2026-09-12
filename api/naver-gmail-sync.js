import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://lwllncasntzevgidsdro.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SYNC_SECRET = process.env.NAVER_GMAIL_SYNC_SECRET || '';
const NAVER_SENDER = 'naverbooking_noreply@navercorp.com';
const DEFAULT_DURATION_MINUTES = 60;
const APP_URL = process.env.NUNUANU_APP_URL || 'https://nununanu-app.vercel.app';

const KO = {
  naver: '\uB124\uC774\uBC84',
  naverBooking: '\uB124\uC774\uBC84 \uC608\uC57D',
  customer: '\uACE0\uAC1D',
  hair: '\uD5E4\uC5B4',
  makeup: '\uBA54\uC774\uD06C\uC5C5',
  make: '\uBA54\uC774\uD06C',
  morning: '\uC624\uC804',
  afternoon: '\uC624\uD6C4',
  confirmed: '\uD655\uC815',
  cancelled: '\uCDE8\uC18C',
  complete: '\uC644\uB8CC',
};

const FIELD_LABELS = {
  name: [
    '\uC608\uC57D\uC790\uBA85',
    '\uC608\uC57D\uC790',
    '\uC774\uB984',
    '\uACE0\uAC1D\uBA85',
    '\uC2E0\uCCAD\uC790',
  ],
  product: [
    '\uC608\uC57D\uC0C1\uD488',
    '\uC0C1\uD488\uBA85',
    '\uC774\uC6A9\uC0C1\uD488',
    '\uC608\uC57D \uC0C1\uD488',
    '\uC0C1\uD488',
    '\uC2DC\uC220',
    '\uC11C\uBE44\uC2A4',
  ],
  datetime: [
    '\uC774\uC6A9\uC77C\uC2DC',
    '\uC608\uC57D\uC77C\uC2DC',
    '\uBC29\uBB38\uC77C\uC2DC',
    '\uC774\uC6A9 \uC77C\uC2DC',
    '\uC608\uC57D \uB0A0\uC9DC',
    '\uBC29\uBB38 \uB0A0\uC9DC',
    '\uC774\uC6A9 \uB0A0\uC9DC',
    '\uBC29\uBB38\uC608\uC815\uC77C',
  ],
  reservationNo: [
    '\uC608\uC57D\uBC88\uD638',
    '\uC608\uC57D \uBC88\uD638',
    '\uC608\uC57DID',
    '\uC608\uC57D ID',
    '\uC811\uC218\uBC88\uD638',
  ],
  phone: [
    '\uC5F0\uB77D\uCC98',
    '\uD734\uB300\uD3F0',
    '\uC804\uD654\uBC88\uD638',
    '\uC608\uC57D\uC790 \uC5F0\uB77D\uCC98',
    '\uD734\uB300\uC804\uD654',
  ],
};

const FIELD_BOUNDARY_LABELS = [
  '\uC608\uC57D\uC2E0\uCCAD \uC77C\uC2DC',
  '\uC608\uC57D\uC2E0\uCCAD\uC77C\uC2DC',
  '\uC608\uC57D\uB0B4\uC5ED',
  '\uC608\uC57D\uCDE8\uC18C \uC77C\uC2DC',
  '\uC608\uC57D\uCDE8\uC18C\uC77C\uC2DC',
  '\uC608\uC57D\uCDE8\uC18C\uB0B4\uC5ED',
  '\uACB0\uC81C\uC0C1\uD0DC',
  '\uBC29\uBB38\uC790 \uC815\uBCF4',
  '\uC694\uCCAD\uC0AC\uD56D',
];

const ALL_FIELD_LABELS = [...new Set([...Object.values(FIELD_LABELS).flat(), ...FIELD_BOUNDARY_LABELS])];

function json(res, status, body) {
  res.status(status).json(body);
}

function authorize(req) {
  if (!SYNC_SECRET) return true;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${SYNC_SECRET}` || req.headers['x-naver-gmail-sync-secret'] === SYNC_SECRET;
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

async function sbUpsert(table, body, onConflict, merge = true) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: 'POST',
    headers: sbHeaders({ Prefer: `${merge ? 'resolution=merge-duplicates' : 'resolution=ignore-duplicates'},return=representation` }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase UPSERT ${r.status}: ${await r.text()}`);
  return r.json();
}

async function triggerPushDispatch(req) {
  const secret = process.env.PUSH_DISPATCH_SECRET;
  const host = req.headers.host ? 'https://' + req.headers.host : APP_URL;
  const url = new URL('/api/push-dispatch', host);
  url.searchParams.set('limit', '20');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const r = await fetch(url.toString(), {
      method: 'POST',
      headers: secret ? { Authorization: 'Bearer ' + secret } : {},
      signal: controller.signal,
    });
    return r.ok;
  } catch (error) {
    console.warn('[naver-gmail-sync] push dispatch trigger skipped', error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function suppressPendingPushEventsForBooking(bookingId, sinceIso) {
  if (!bookingId) return false;
  try {
    const since = encodeURIComponent(sinceIso || new Date(Date.now() - 5 * 60 * 1000).toISOString());
    await sbPatch(
      'push_notification_events',
      `booking_id=eq.${encodeURIComponent(bookingId)}&status=eq.pending&created_at=gte.${since}`,
      {
        status: 'sent',
        sent_at: new Date().toISOString(),
        last_error: 'suppressed_naver_resync',
      }
    );
    return true;
  } catch (error) {
    console.warn('[naver-gmail-sync] suppress pending push events skipped', error);
    return false;
  }
}

async function findProcessedMailEvent(payload) {
  const messageId = String(payload.messageId || payload.id || '').trim();
  if (!messageId) return null;
  const path = 'naver_booking_mail_events?select=message_id,booking_id,processed_status,event_type&message_id=eq.' + encodeURIComponent(messageId) + '&limit=1';
  const rows = await sbGet(path).catch(() => []);
  return rows?.[0] || null;
}

async function enqueueNaverBookingUpdatedPush(parsed, payload, bookingId) {
  if (!bookingId) return null;
  const messageId = String(payload.messageId || payload.id || hash(String(payload.subject || '') + ':' + String(payload.receivedAt || '')));
  const dateTime = [parsed.bookingDate, parsed.startTime].filter(Boolean).join(' ');
  const body = [parsed.customerDisplayName || parsed.customerName || KO.customer, dateTime].filter(Boolean).join(' \u00B7 ');
  const rows = await sbUpsert('push_notification_events', {
    event_key: 'naver-mail:' + messageId + ':booking_updated',
    type: 'booking_updated',
    title: '\uC608\uC57D \uC218\uC815',
    body,
    audience: 'admin',
    booking_id: bookingId,
    staff_id: null,
    data: {
      url: '/admin.html',
      tab: 'schedule',
      booking_id: bookingId,
      booking_date: parsed.bookingDate,
      date: parsed.bookingDate,
      start_time: parsed.startTime,
      source: 'naver-gmail',
    },
    status: 'pending',
    attempts: 0,
    last_error: null,
    sent_at: null,
  }, 'event_key', false);
  return rows?.[0] || null;
}
function hash(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 16);
}

function normalizeText(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|td|th|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function cleanField(value) {
  return String(value || '')
    .replace(/^[|:：>\-\s]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function trimAtFollowingFieldLabel(value, currentLabels = []) {
  const current = new Set(currentLabels);
  let result = String(value || '');
  for (const label of ALL_FIELD_LABELS) {
    if (current.has(label)) continue;
    const match = result.match(new RegExp(`\\s+${escapeRegex(label)}\\s*[:：>\\-]?`, 'i'));
    if (match && match.index > 0) {
      result = result.slice(0, match.index);
    }
  }
  return result;
}

function pickField(text, labels) {
  const source = String(text || '');
  const lines = source.split('\n').map(line => line.trim()).filter(Boolean);
  const labelSet = new Set(labels);

  for (const label of labels) {
    const escaped = escapeRegex(label);
    const inline = new RegExp(`${escaped}\\s*[:：>\\-]?\\s*([^\\n]+)`, 'i');
    const inlineMatch = source.match(inline);
    if (inlineMatch) {
      const value = cleanField(trimAtFollowingFieldLabel(inlineMatch[1], labels));
      if (value && !labelSet.has(value)) return value;
    }

    const index = lines.findIndex(line => (
      line === label ||
      line.startsWith(`${label} `) ||
      line.startsWith(`${label}:`) ||
      line.startsWith(`${label}：`)
    ));
    if (index >= 0) {
      const sameLine = cleanField(trimAtFollowingFieldLabel(lines[index].replace(new RegExp(`^${escaped}\\s*[:：>\\-]?\\s*`, 'i'), ''), labels));
      if (sameLine && sameLine !== label && !labelSet.has(sameLine)) return sameLine;
      const next = lines.slice(index + 1).find(line => !labelSet.has(line));
      if (next) return cleanField(trimAtFollowingFieldLabel(next, labels));
    }
  }
  return '';
}


function detectEventType(text) {
  const value = String(text || '');
  if (value.includes(KO.cancelled) || /cancel(?:led)?/i.test(value)) return 'cancelled';
  if (
    value.includes(KO.confirmed) ||
    value.includes(KO.complete) ||
    /confirm(?:ed)?|reservation completed/i.test(value)
  ) return 'confirmed';
  return '';
}

function normalizeHour(hour, marker) {
  const m = String(marker || '').toUpperCase();
  if ((m === KO.afternoon || m === 'PM') && hour < 12) return hour + 12;
  if ((m === KO.morning || m === 'AM') && hour === 12) return 0;
  return hour;
}

function parseNaverDateTime(value) {
  const text = String(value || '').replace(/\s+/g, ' ');
  const full = text.match(/(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})[.\-/일]?(?:\s*\([^)]+\))?.{0,40}?(오전|오후|AM|PM)?\s*(\d{1,2})\s*(?:[:시]\s*(\d{1,2})\s*분?)?/i);
  const short = full ? null : text.match(/(\d{1,2})[.\-/월]\s*(\d{1,2})[.\-/일]?(?:\s*\([^)]+\))?.{0,40}?(오전|오후|AM|PM)?\s*(\d{1,2})\s*(?:[:시]\s*(\d{1,2})\s*분?)?/i);

  let year;
  let month;
  let day;
  let marker;
  let hour;
  let minute;
  if (full) {
    year = Number(full[1]);
    month = Number(full[2]);
    day = Number(full[3]);
    marker = full[4] || '';
    hour = Number(full[5]);
    minute = Number(full[6] || 0);
  } else if (short) {
    year = new Date().getFullYear();
    month = Number(short[1]);
    day = Number(short[2]);
    marker = short[3] || '';
    hour = Number(short[4]);
    minute = Number(short[5] || 0);
  } else {
    return null;
  }

  hour = normalizeHour(hour, marker);
  let start = new Date(year, month - 1, day, hour, minute, 0);
  if (!full && start.getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000) {
    start = new Date(year + 1, month - 1, day, hour, minute, 0);
  }

  const endMatch = text.match(/[~\-–]\s*(오전|오후|AM|PM)?\s*(\d{1,2})\s*(?:[:시]\s*(\d{1,2})\s*분?)?/i);
  let endTime = '';
  if (endMatch) {
    const endHour = normalizeHour(Number(endMatch[2]), endMatch[1] || marker || '');
    const endMinute = Number(endMatch[3] || 0);
    endTime = toTime(endHour, endMinute);
  }

  return {
    date: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
    startTime: toTime(start.getHours(), start.getMinutes()),
    endTime,
  };
}

function toTime(hour, minute) {
  return `${String(Number(hour || 0)).padStart(2, '0')}:${String(Number(minute || 0)).padStart(2, '0')}`;
}

function addMinutes(time, minutes) {
  const [h, m] = String(time || '00:00').split(':').map(Number);
  const total = Math.max(0, (h || 0) * 60 + (m || 0) + Number(minutes || 0));
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function cleanPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('82') && digits.length >= 11) return `0${digits.slice(2)}`;
  return digits;
}

function pinFromPhone(phone) {
  const digits = cleanPhone(phone);
  return (digits.slice(-4) || '0000').padStart(4, '0');
}

function serviceTypeFromText(text) {
  const value = String(text || '').toLowerCase();
  const hasHair = value.includes(KO.hair) || /hair/.test(value);
  const hasMakeup = value.includes(KO.makeup) || value.includes(KO.make) || /make\s*up|makeup|make-up/.test(value);
  if (hasHair && hasMakeup) return 'both';
  if (hasMakeup) return 'makeup';
  return 'hair';
}

function withNaverPrefix(name) {
  const clean = String(name || '').replace(new RegExp(`^${KO.naver}\\s*`), '').trim() || KO.customer;
  return `${KO.naver} ${clean}`;
}

function cleanSourceKey(value) {
  const compact = String(value || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 120);
  return compact || hash(value);
}

function fallbackName(text) {
  const match = String(text || '').match(/([\uAC00-\uD7A3A-Za-z*]{2,24})\s*\uB2D8/);
  return match?.[1] || '';
}

function cleanNaverCustomerName(value) {
  return cleanField(trimAtFollowingFieldLabel(value, []))
    .replace(/\s*(예약신청\s*일시|예약내역|예약취소\s*일시|예약취소내역|예약상품|이용일시|예약번호|결제상태).*$/i, '')
    .trim();
}

function parseNaverMessage(payload) {
  const subject = normalizeText(payload.subject || '');
  const body = normalizeText(payload.plainBody || payload.htmlBody || payload.body || '');
  const text = normalizeText(`${subject}\n${body}`);
  const eventType = detectEventType(text);
  if (!eventType) {
    return { skipped: true, reason: 'unsupported_naver_mail_type', subject, rawBody: body.slice(0, 12000) };
  }

  const rawName = pickField(text, FIELD_LABELS.name) || fallbackName(text);
  const customerName = cleanNaverCustomerName(rawName);
  const rawDateTime = pickField(text, FIELD_LABELS.datetime) || text;
  const reservationNo = cleanField(pickField(text, FIELD_LABELS.reservationNo));
  const productName = cleanField(pickField(text, FIELD_LABELS.product)) || KO.naverBooking;
  const rawPhone = pickField(text, FIELD_LABELS.phone);
  const parsedTime = parseNaverDateTime(rawDateTime);

  const missing = [];
  if (!customerName) missing.push('customer_name');
  if (!parsedTime) missing.push('booking_datetime');
  if (!reservationNo) missing.push('reservation_no');
  if (missing.length) {
    const error = new Error(`parse_missing_fields:${missing.join(',')}`);
    error.parsed = {
      eventType,
      sourceKey: payload.messageId ? `message-${payload.messageId}` : '',
      customerName: customerName || rawName || '',
      productName,
      rawSubject: subject,
      rawBody: body.slice(0, 12000),
    };
    throw error;
  }

  const sourceKey = `reservation-${cleanSourceKey(reservationNo)}`;
  const serviceType = serviceTypeFromText(productName);
  const duration = serviceType === 'both' ? 120 : DEFAULT_DURATION_MINUTES;
  const endTime = parsedTime.endTime || addMinutes(parsedTime.startTime, duration);
  const phone = cleanPhone(rawPhone) || `naver-reservation-${cleanSourceKey(reservationNo)}`.slice(0, 64);

  return {
    eventType,
    sourceKey,
    reservationNo,
    customerName: customerName,
    customerDisplayName: withNaverPrefix(customerName),
    phone,
    pin: pinFromPhone(phone),
    bookingDate: parsedTime.date,
    startTime: parsedTime.startTime,
    endTime,
    productName,
    serviceType,
    serviceDetail: `${KO.naverBooking} - ${productName}`,
    rawSubject: subject,
    rawBody: body.slice(0, 12000),
  };
}

async function logMailEvent(parsed, payload, bookingId, status, errorMessage = '') {
  try {
    await sbUpsert('naver_booking_mail_events', {
      message_id: String(payload.messageId || payload.id || hash(`${payload.subject}:${payload.receivedAt}`)),
      thread_id: String(payload.threadId || ''),
      gmail_account: String(payload.gmailAccount || 'nunuanu866@gmail.com'),
      mail_from: String(payload.from || NAVER_SENDER),
      subject: String(payload.subject || parsed.rawSubject || ''),
      event_type: parsed.eventType || 'unknown',
      source_key: parsed.sourceKey || '',
      booking_id: bookingId || null,
      customer_name: parsed.customerName || '',
      booking_date: parsed.bookingDate || null,
      start_time: parsed.startTime || null,
      product_name: parsed.productName || '',
      raw_body: parsed.rawBody || '',
      processed_status: status,
      error_message: errorMessage,
      processed_at: new Date().toISOString(),
    }, 'message_id');
  } catch (error) {
    console.warn('[naver-gmail-sync] event log skipped', error);
  }
}

async function findNaverLink(sourceKey) {
  if (!sourceKey) return null;
  const links = await sbGet(`naver_booking_links?select=booking_id,customer_id,status,last_event_type&source_key=eq.${encodeURIComponent(sourceKey)}&order=created_at.desc&limit=1`).catch(() => []);
  return links?.[0] || null;
}

async function findLinkedBooking(sourceKey) {
  const link = await findNaverLink(sourceKey);
  const bookingId = link?.booking_id;
  if (!bookingId) return null;
  const rows = await sbGet(`bookings?select=id,customer_id,status&id=eq.${encodeURIComponent(bookingId)}&limit=1`).catch(() => []);
  return rows?.[0] || { id: bookingId, customer_id: link.customer_id || null };
}

async function upsertLink(parsed, bookingId, customerId, status, payload) {
  try {
    await sbUpsert('naver_booking_links', {
      source_key: parsed.sourceKey,
      reservation_no: parsed.reservationNo || '',
      booking_id: bookingId || null,
      customer_id: customerId || null,
      customer_name: parsed.customerName || '',
      customer_phone: parsed.phone || '',
      booking_date: parsed.bookingDate || null,
      start_time: parsed.startTime || null,
      end_time: parsed.endTime || null,
      product_name: parsed.productName || '',
      service_type: parsed.serviceType || '',
      status,
      first_message_id: String(payload.messageId || ''),
      last_message_id: String(payload.messageId || ''),
      last_event_type: parsed.eventType || status,
      last_synced_at: new Date().toISOString(),
    }, 'source_key');
  } catch (error) {
    console.warn('[naver-gmail-sync] booking link skipped', error);
  }
}

async function findCustomerByPhone(phone) {
  if (!phone) return null;
  const rows = await sbGet(`customers?select=id,name,phone,pin,memo&phone=eq.${encodeURIComponent(phone)}&limit=1`).catch(() => []);
  return rows?.[0] || null;
}

async function findExistingBookingByDetails(parsed, customerId) {
  if (!customerId) return null;
  const sameSlot = await sbGet(
    `bookings?select=id,customer_id,status,booking_date,start_time,end_time,service_type,service_detail&customer_id=eq.${encodeURIComponent(customerId)}&booking_date=eq.${encodeURIComponent(parsed.bookingDate)}&start_time=eq.${encodeURIComponent(parsed.startTime)}&order=created_at.desc&limit=1`
  ).catch(() => []);
  if (sameSlot?.[0]?.id) return sameSlot[0];

  if (String(parsed.phone || '').startsWith('naver-reservation-')) {
    const rows = await sbGet(
      `bookings?select=id,customer_id,status,booking_date,start_time,end_time,service_type,service_detail&customer_id=eq.${encodeURIComponent(customerId)}&order=created_at.desc&limit=1`
    ).catch(() => []);
    if (rows?.[0]?.id) return rows[0];
  }

  return null;
}

function legacyReservationPhonePrefix(parsed) {
  const reservationNo = cleanSourceKey(parsed?.reservationNo || '');
  return reservationNo ? `naver-reservation-${reservationNo}` : '';
}

function idListParam(ids) {
  return ids.map(id => encodeURIComponent(id)).join(',');
}

async function findLegacyCustomersByReservation(parsed) {
  const prefix = legacyReservationPhonePrefix(parsed);
  if (!prefix) return [];
  const rows = await sbGet(
    `customers?select=id,name,phone,memo&phone=like.${encodeURIComponent(prefix + '*')}&limit=50`
  ).catch(() => []);
  const exactPhone = String(parsed?.phone || '');
  return (rows || []).filter(row => row?.id && String(row.phone || '') !== exactPhone);
}

async function findLegacyBookingByReservation(parsed) {
  const customers = await findLegacyCustomersByReservation(parsed);
  const ids = customers.map(customer => customer.id).filter(Boolean);
  if (!ids.length) return null;
  const rows = await sbGet(
    `bookings?select=id,customer_id,status,booking_date,start_time,end_time,service_type,service_detail&customer_id=in.(${idListParam(ids)})&booking_date=eq.${encodeURIComponent(parsed.bookingDate)}&start_time=eq.${encodeURIComponent(parsed.startTime)}&status=eq.confirmed&order=created_at.asc&limit=1`
  ).catch(() => []);
  return rows?.[0] || null;
}
async function ensureCustomer(parsed) {
  const existing = await findCustomerByPhone(parsed.phone);
  if (existing?.id) {
    const patch = {};
    if (parsed.customerDisplayName && existing.name !== parsed.customerDisplayName) {
      patch.name = parsed.customerDisplayName;
    }
    if (!existing.pin && parsed.pin) patch.pin = parsed.pin;
    if (Object.keys(patch).length) {
      await sbPatch('customers', `id=eq.${encodeURIComponent(existing.id)}`, patch);
    }
    return existing.id;
  }

  const created = await sbPost('customers', {
    name: parsed.customerDisplayName,
    phone: parsed.phone,
    pin: parsed.pin,
    memo: `${KO.naverBooking} ${KO.customer}`,
  });
  return created?.[0]?.id || null;
}

async function upsertConfirmedBooking(parsed, payload) {
  const existingLink = await findNaverLink(parsed.sourceKey);
  const linked = existingLink?.booking_id ? await findLinkedBooking(parsed.sourceKey) : null;
  const customerId = await ensureCustomer(parsed);
  if (!customerId) throw new Error(`customer_not_saved:${parsed.sourceKey}`);
  const legacyExisting = linked ? null : await findLegacyBookingByReservation(parsed);
  const existing = linked || await findExistingBookingByDetails(parsed, customerId) || legacyExisting;

  const bookingPayload = {
    customer_id: customerId,
    booking_date: parsed.bookingDate,
    start_time: parsed.startTime,
    end_time: parsed.endTime,
    service_type: parsed.serviceType,
    service_detail: parsed.serviceDetail,
    customer_memo: '',
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
    cancelled_at: null,
  };

  let bookingId = existing?.id || '';
  let action = 'updated';
  if (bookingId) {
    await sbPatch('bookings', `id=eq.${encodeURIComponent(bookingId)}`, bookingPayload);
  } else {
    const created = await sbPost('bookings', bookingPayload);
    bookingId = created?.[0]?.id || '';
    action = 'created';
  }
  if (!bookingId) throw new Error(`booking_not_saved:${parsed.sourceKey}`);

  if (existingLink?.status === 'pending_cancel_match' || existingLink?.last_event_type === 'cancelled') {
    await sbPatch('bookings', `id=eq.${encodeURIComponent(bookingId)}`, {
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      customer_memo: '',
    });
    await upsertLink(parsed, bookingId, customerId, 'cancelled', payload);
    await logMailEvent(parsed, payload, bookingId, 'processed', 'Applied previously received cancellation.');
    return { action: 'cancelled_from_pending', bookingId };
  }

  await upsertLink(parsed, bookingId, customerId, 'confirmed', payload);
  await logMailEvent(parsed, payload, bookingId, 'processed');
  return { action, bookingId };
}

async function cancelBooking(parsed, payload) {
  const linked = await findLinkedBooking(parsed.sourceKey);
  const existingCustomer = linked ? null : await findCustomerByPhone(parsed.phone);
  const legacyExisting = linked ? null : await findLegacyBookingByReservation(parsed);
  const existing = linked || (existingCustomer?.id ? await findExistingBookingByDetails(parsed, existingCustomer.id) : null) || legacyExisting;
  if (!existing?.id) {
    await upsertLink(parsed, null, null, 'pending_cancel_match', payload);
    await logMailEvent(parsed, payload, null, 'processed', 'pending_cancel_match: Matching confirmation has not been synced yet.');
    return { action: 'pending_cancel_match', bookingId: null, pending: true };
  }

  await sbPatch('bookings', `id=eq.${encodeURIComponent(existing.id)}`, {
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    customer_memo: '',
  });
  await upsertLink(parsed, existing.id, existing.customer_id || null, 'cancelled', payload);
  await logMailEvent(parsed, payload, existing.id, 'processed');
  return { action: 'cancelled', bookingId: existing.id };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  if (!authorize(req)) return json(res, 401, { ok: false, error: 'unauthorized' });
  if (!SERVICE_KEY) return json(res, 500, { ok: false, error: 'missing_SUPABASE_SERVICE_ROLE_KEY' });

  const syncStartedAt = new Date().toISOString();
  const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (!String(payload.from || '').toLowerCase().includes(NAVER_SENDER)) {
    return json(res, 200, { ok: true, skipped: true, reason: 'not_naver_booking_sender' });
  }

  const previous = await findProcessedMailEvent(payload);
  const forceReprocess = payload.forceReprocess === true || payload.force === true;
  const suppressPush = payload.suppressPush === true;
  if (!forceReprocess && previous?.processed_status === 'processed') {
    return json(res, 200, { ok: true, skipped: true, reason: 'already_processed', bookingId: previous.booking_id || null });
  }

  let parsed;
  try {
    parsed = parseNaverMessage(payload);
    if (parsed.skipped) {
      await logMailEvent({ eventType: 'unknown', rawSubject: parsed.subject || payload.subject || '', rawBody: parsed.rawBody || '' }, payload, null, 'processed', parsed.reason);
      return json(res, 200, { ok: true, skipped: true, reason: parsed.reason });
    }

    const result = parsed.eventType === 'cancelled'
      ? await cancelBooking(parsed, payload)
      : await upsertConfirmedBooking(parsed, payload);

    if (!suppressPush && parsed.eventType === 'confirmed' && result.action === 'updated') {
      await enqueueNaverBookingUpdatedPush(parsed, payload, result.bookingId);
    }
    const resyncPushSuppressed = suppressPush && result.bookingId
      ? await suppressPendingPushEventsForBooking(result.bookingId, syncStartedAt)
      : false;
    const dispatchTriggered = suppressPush ? false : await triggerPushDispatch(req);

    return json(res, 200, { ok: true, eventType: parsed.eventType, dispatchTriggered, resyncPushSuppressed, ...result });
  } catch (error) {
    const status = error.status || 422;
    const fallback = error.parsed || parsed || {
      eventType: 'unknown',
      sourceKey: payload.messageId ? `message-${payload.messageId}` : '',
      rawSubject: payload.subject || '',
      rawBody: normalizeText(payload.plainBody || payload.htmlBody || '').slice(0, 12000),
    };
    if (!error.logged) {
      await logMailEvent(fallback, payload, null, 'failed', String(error.message || error));
    }
    console.error('[naver-gmail-sync]', error);
    return json(res, status, { ok: false, error: String(error.message || error) });
  }
}
