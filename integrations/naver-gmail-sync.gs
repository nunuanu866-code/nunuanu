/**
 * NUNUANU - Naver Place booking Gmail sync
 *
 * Runs in Google Apps Script under Gmail account: nunuanu866@gmail.com
 * Reads Naver Booking mail from: naverbooking_noreply@navercorp.com
 *
 * Required Script Properties:
 * - SUPABASE_URL: https://lwllncasntzevgidsdro.supabase.co
 * - SUPABASE_KEY: Supabase publishable/anon key used by the app
 *
 * Optional Script Properties:
 * - NAVER_LOOKBACK_DAYS: default 30
 */

const NAVER_GMAIL_ACCOUNT = 'nunuanu866@gmail.com';
const NAVER_BOOKING_SENDER = 'naverbooking_noreply@navercorp.com';
const NAVER_SYNC_LABEL = 'nununanu_naver_booking_synced';
const NAVER_ERROR_LABEL = 'nununanu_naver_booking_error';
const NAVER_DEFAULT_LOOKBACK_DAYS = 30;
const NAVER_DEFAULT_DURATION_MINUTES = 60;
const NAVER_TZ = 'Asia/Seoul';
const NAVER_BOOKING_SELECT = 'id,customer_id,booking_date,start_time,end_time,service_type,service_detail,customer_memo,status,customers(name,phone)';
const GCAL_BOOKING_SELECT = '*,customers(name,phone)';
const GCAL_EVENT_MARKER = 'GCAL_EVENT_ID:';
const GCAL_CANCELLED_MARKER = 'GCAL_CANCELLED_AT:';
const SYSTEM_SERVICE_DETAILS = ['STAFF_AUTH', 'STAFF_ATTENDANCE', 'STAFF_VISIBILITY', 'STAFF_PROFILE', 'CUSTOMER_META', 'AUDIT_LOG'];

function syncNaverBookingEmails() {
  const props = PropertiesService.getScriptProperties();
  const lookbackDays = Number(props.getProperty('NAVER_LOOKBACK_DAYS') || NAVER_DEFAULT_LOOKBACK_DAYS);
  const naverResult = runNaverBookingSync_({
    query: 'from:' + NAVER_BOOKING_SENDER + ' newer_than:' + lookbackDays + 'd',
    maxThreads: Number(props.getProperty('NAVER_SYNC_MAX_THREADS') || 100),
    ignoreProcessed: false,
    mode: 'recent'
  });
  let calendarResult = null;
  try {
    calendarResult = syncConfirmedBookingsToGoogleCalendar();
  } catch (error) {
    calendarResult = { failed: true, message: String(error && error.message ? error.message : error) };
    console.error('[Google Calendar sync from Gmail trigger failed]', calendarResult);
  }
  return { naver: naverResult, googleCalendar: calendarResult };
}

function backfillAllCurrentNaverBookingEmails() {
  const props = PropertiesService.getScriptProperties();
  return runNaverBookingSync_({
    query: 'from:' + NAVER_BOOKING_SENDER,
    maxThreads: Number(props.getProperty('NAVER_BACKFILL_MAX_THREADS') || 1000),
    ignoreProcessed: true,
    mode: 'backfill'
  });
}

function runNaverBookingSync_(options) {
  const props = PropertiesService.getScriptProperties();
  const syncedLabel = getOrCreateLabel_(NAVER_SYNC_LABEL);
  const errorLabel = getOrCreateLabel_(NAVER_ERROR_LABEL);
  const messages = collectNaverMessages_(options.query, options.maxThreads);
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  messages.forEach(message => {
    const thread = message.getThread();
    const messageId = message.getId();
    const processedKey = 'naver_booking_processed_' + messageId;
    if (!options.ignoreProcessed && props.getProperty(processedKey)) {
      skipped += 1;
      return;
    }

    try {
      const parsed = parseNaverBookingMessage_(message);
      if (!parsed) throw new Error('Required fields were not found in Naver mail.');

      let bookingId = null;
      if (parsed.eventType === 'cancelled') {
        bookingId = cancelNaverBooking_(parsed, messageId);
      } else {
        const customerId = upsertNaverCustomer_(parsed);
        bookingId = upsertConfirmedNaverBooking_(customerId, parsed, messageId);
      }

      logNaverMailEvent_(parsed, message, bookingId, 'processed', '');
      props.setProperty(processedKey, new Date().toISOString());
      thread.addLabel(syncedLabel);
      processed += 1;
    } catch (error) {
      failed += 1;
      thread.addLabel(errorLabel);
      logNaverMailEvent_(
        fallbackEventFromMessage_(message),
        message,
        null,
        'failed',
        error && error.message ? error.message : String(error)
      );
      console.error('[Naver Gmail sync failed]', message.getSubject(), messageId, error);
    }
  });

  const result = { mode: options.mode, scanned: messages.length, processed, skipped, failed };
  console.log('[Naver Gmail sync]', result);
  return result;
}

function collectNaverMessages_(query, maxThreads) {
  const threads = [];
  const batchSize = 100;
  const limit = Math.max(1, Number(maxThreads || 100));

  for (let start = 0; start < limit; start += batchSize) {
    const found = GmailApp.search(query, start, Math.min(batchSize, limit - start));
    if (!found.length) break;
    threads.push.apply(threads, found);
    if (found.length < batchSize) break;
  }

  return threads
    .flatMap(thread => thread.getMessages())
    .filter(message => String(message.getFrom() || '').toLowerCase().includes(NAVER_BOOKING_SENDER))
    .sort((a, b) => a.getDate().getTime() - b.getDate().getTime());
}

function installNaverBookingTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'syncNaverBookingEmails')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('syncNaverBookingEmails')
    .timeBased()
    .everyMinutes(1)
    .create();
}

function installGoogleCalendarTrigger() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('GCAL_SYNC_STARTED_AT')) {
    props.setProperty('GCAL_SYNC_STARTED_AT', new Date().toISOString());
  }

  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'syncConfirmedBookingsToGoogleCalendar')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('syncConfirmedBookingsToGoogleCalendar')
    .timeBased()
    .everyMinutes(5)
    .create();
}

function syncConfirmedBookingsToGoogleCalendar() {
  const props = PropertiesService.getScriptProperties();
  const startedAt = new Date(props.getProperty('GCAL_SYNC_STARTED_AT') || new Date().toISOString()).getTime();
  const rows = sbGet_('bookings?select=' + encodeURIComponent(GCAL_BOOKING_SELECT) + '&status=eq.confirmed&order=updated_at.desc&limit=500');
  let created = 0;
  let skipped = 0;
  let failed = 0;

  (rows || []).forEach(booking => {
    try {
      const memo = String(booking.customer_memo || '');
      const confirmedAt = booking.confirmed_at ? new Date(booking.confirmed_at).getTime() : 0;
      if (SYSTEM_SERVICE_DETAILS.includes(String(booking.service_detail || ''))) { skipped += 1; return; }
      if (memo.includes(GCAL_EVENT_MARKER)) { skipped += 1; return; }
      if (confirmedAt && confirmedAt < startedAt) { skipped += 1; return; }

      const eventId = createGoogleCalendarEventForBooking_(booking);
      const nextMemo = appendUniqueLine_(memo, [
        GCAL_EVENT_MARKER + eventId,
        'GCAL_SYNCED_AT:' + new Date().toISOString()
      ].join('\n'));
      sbPatchById_('bookings', booking.id, { customer_memo: nextMemo });
      created += 1;
    } catch (error) {
      failed += 1;
      console.error('[Google Calendar booking sync failed]', booking && booking.id, error);
    }
  });

  const cancelledResult = syncCancelledBookingsFromGoogleCalendar_();
  const result = { created, skipped, failed, cancelled: cancelledResult };
  console.log('[Google Calendar sync]', result);
  return result;
}

function backfillConfirmedBookingsToGoogleCalendar() {
  PropertiesService.getScriptProperties().setProperty('GCAL_SYNC_STARTED_AT', '1970-01-01T00:00:00.000Z');
  return syncConfirmedBookingsToGoogleCalendar();
}

function syncCancelledBookingsFromGoogleCalendar_() {
  const rows = sbGet_('bookings?select=id,customer_memo,status&status=eq.cancelled&order=updated_at.desc&limit=200');
  let removed = 0;
  let skipped = 0;
  let failed = 0;

  (rows || []).forEach(booking => {
    try {
      const memo = String(booking.customer_memo || '');
      if (!memo.includes(GCAL_EVENT_MARKER) || memo.includes(GCAL_CANCELLED_MARKER)) { skipped += 1; return; }
      const eventId = extractMemoValue_(memo, GCAL_EVENT_MARKER);
      if (!eventId) { skipped += 1; return; }
      const event = CalendarApp.getDefaultCalendar().getEventById(eventId);
      if (event) event.deleteEvent();
      const nextMemo = appendUniqueLine_(memo, GCAL_CANCELLED_MARKER + new Date().toISOString());
      sbPatchById_('bookings', booking.id, { customer_memo: nextMemo });
      removed += 1;
    } catch (error) {
      failed += 1;
      console.error('[Google Calendar cancel sync failed]', booking && booking.id, error);
    }
  });

  return { removed, skipped, failed };
}

function createGoogleCalendarEventForBooking_(booking) {
  const svcMap = { hair: '헤어', makeup: '메이크업', both: '헤어+메이크업' };
  const name = (booking.customers && booking.customers.name) || '고객';
  const phone = (booking.customers && booking.customers.phone) || '';
  const service = booking.service_detail || svcMap[booking.service_type] || booking.service_type || '예약';
  const start = buildBookingDate_(booking.booking_date, booking.start_time);
  let end = buildBookingDate_(booking.booking_date, booking.end_time);
  if (!end || end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }

  const description = [
    '고객: ' + name + (phone ? ' (' + phone + ')' : ''),
    '시술: ' + service,
    booking.customer_memo ? '메모: ' + stripInternalMemo_(booking.customer_memo) : '',
    '누누아누 예약 앱에서 자동 등록'
  ].filter(Boolean).join('\n');

  const event = CalendarApp.getDefaultCalendar().createEvent(
    '[예약] ' + name + ' · ' + (svcMap[booking.service_type] || service),
    start,
    end,
    { description: description }
  );
  try { event.setColor(CalendarApp.EventColor.GREEN); } catch (e) {}
  return event.getId();
}

function parseNaverBookingMessage_(message) {
  const subject = message.getSubject() || '';
  const body = normalizeText_(message.getPlainBody() || message.getBody() || '');
  const text = normalizeText_(subject + '\n' + body);

  const eventType = detectNaverEventType_(text);
  if (!eventType) return null;

  const rawName = pickField_(text, ['예약자명', '예약자', '이름', '고객명', '신청자']);
  const rawProduct = pickField_(text, ['예약상품', '상품명', '이용상품', '예약 상품', '상품', '시술', '서비스']);
  const rawDateTime = pickField_(text, ['이용일시', '예약일시', '방문일시', '이용 일시', '예약 날짜', '방문 날짜']) || text;
  const reservationNo = pickField_(text, ['예약번호', '예약 번호', '예약ID', '예약 ID', '접수번호']);
  const rawPhone = pickField_(text, ['연락처', '휴대폰', '전화번호', '예약자 연락처']);
  const memoText = pickField_(text, ['요청사항', '요청 사항', '메모', '전달사항']) || '';
  const parsedTime = parseNaverDateTime_(rawDateTime);

  if (!rawName || !parsedTime || !rawProduct) return null;

  const cleanName = cleanField_(rawName);
  const productName = cleanField_(rawProduct);
  const cleanReservationNo = cleanField_(reservationNo);
  if (!cleanReservationNo) {
    throw new Error('Naver reservation number was not found. The mail was not synced to avoid matching customers by name.');
  }
  const sourceKey = 'reservation-' + cleanSourceKey_(cleanReservationNo);
  const phone = cleanPhone_(rawPhone) || ('naver-' + sourceKey).slice(0, 64);
  const serviceType = serviceTypeFromText_(productName);
  const duration = serviceType === 'both' ? 120 : NAVER_DEFAULT_DURATION_MINUTES;
  const endTime = parsedTime.endTime || addMinutesToTime_(parsedTime.startTime, duration);

  return {
    eventType,
    sourceKey,
    reservationNo: cleanReservationNo,
    customerName: cleanName,
    customerDisplayName: withNaverPrefix_(cleanName),
    phone,
    pin: pinFromPhone_(phone),
    bookingDate: parsedTime.date,
    startTime: parsedTime.startTime,
    endTime,
    productName,
    serviceType,
    serviceDetail: '네이버 예약 - ' + productName,
    memo: [
      'NAVER_BOOKING',
      'NAVER_SOURCE_KEY:' + sourceKey,
      '예약번호: ' + cleanReservationNo,
      memoText ? '요청사항: ' + memoText : '',
      '메일제목: ' + subject
    ].filter(Boolean).join('\n'),
    rawSubject: subject,
    rawBody: body.slice(0, 12000)
  };
}

function detectNaverEventType_(text) {
  const t = String(text || '');
  if (/취소|예약취소|예약 취소|cancel/i.test(t)) return 'cancelled';
  if (/확정|예약확정|예약 확정|confirmed|예약이 완료|예약 완료/i.test(t)) return 'confirmed';
  return null;
}

function upsertNaverCustomer_(booking) {
  const rows = sbGet_('customers?select=id,name,phone,pin,memo&phone=eq.' + encodeURIComponent(booking.phone));
  const existing = rows && rows[0];
  if (existing) {
    const nextName = withNaverPrefix_(existing.name || booking.customerName);
    const patch = {};
    if (existing.name !== nextName) patch.name = nextName;
    if (!existing.pin && booking.pin) patch.pin = booking.pin;
    if (Object.keys(patch).length) sbPatchById_('customers', existing.id, patch);
    return existing.id;
  }

  const created = sbPost_('customers', {
    name: booking.customerDisplayName,
    phone: booking.phone,
    pin: booking.pin,
    memo: '네이버 예약 고객'
  });
  if (!created || !created[0] || !created[0].id) {
    throw new Error('Failed to create Naver customer: ' + booking.customerDisplayName);
  }
  return created[0].id;
}

function upsertConfirmedNaverBooking_(customerId, booking, messageId) {
  const existingByKey = findNaverBookingBySourceKey_(booking.sourceKey);
  const payload = {
    customer_id: customerId,
    booking_date: booking.bookingDate,
    start_time: booking.startTime,
    end_time: booking.endTime,
    service_type: booking.serviceType,
    service_detail: booking.serviceDetail,
    customer_memo: booking.memo + '\nNAVER_MAIL_ID:' + messageId,
    status: 'confirmed',
    confirmed_at: new Date().toISOString()
  };

  if (existingByKey) {
    sbPatchById_('bookings', existingByKey.id, payload);
    upsertNaverBookingLink_(booking, existingByKey.id, customerId, 'confirmed', messageId);
    return existingByKey.id;
  }

  const created = sbPost_('bookings', payload);
  if (!created || !created[0] || !created[0].id) {
    throw new Error('Failed to create confirmed Naver booking: ' + booking.customerDisplayName);
  }
  upsertNaverBookingLink_(booking, created[0].id, customerId, 'confirmed', messageId);
  return created[0].id;
}

function cancelNaverBooking_(booking, messageId) {
  const existing = findNaverBookingBySourceKey_(booking.sourceKey);
  if (!existing) {
    logNaverMailEvent_(booking, { getId: () => messageId, getThread: () => ({ getId: () => '' }), getFrom: () => NAVER_BOOKING_SENDER, getSubject: () => booking.rawSubject }, null, 'cancel_missing_booking', '');
    throw new Error('Matching Naver booking was not found by reservation number. This message will be retried.');
  }

  const memo = appendUniqueLine_(existing.customer_memo || '', [
    'NAVER_CANCELLED_MAIL_ID:' + messageId,
    '네이버 예약 취소 메일 확인'
  ].join('\n'));

  sbPatchById_('bookings', existing.id, {
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    customer_memo: memo
  });
  upsertNaverBookingLink_(booking, existing.id, existing.customer_id || null, 'cancelled', messageId);
  return existing.id;
}

function findNaverBookingBySourceKey_(sourceKey) {
  if (!sourceKey) return null;
  try {
    const links = sbGet_('naver_booking_links?select=booking_id&source_key=eq.' + encodeURIComponent(sourceKey) + '&order=updated_at.desc&limit=1');
    const bookingId = links && links[0] && links[0].booking_id;
    if (bookingId) {
      const byId = sbGet_('bookings?select=' + encodeURIComponent(NAVER_BOOKING_SELECT) + '&id=eq.' + encodeURIComponent(bookingId) + '&limit=1');
      if (byId && byId[0]) return byId[0];
    }
  } catch (e) {
    console.warn('[Naver link lookup skipped]', e && e.message ? e.message : e);
  }

  const rows = sbGet_('bookings?select=' + encodeURIComponent(NAVER_BOOKING_SELECT) + '&customer_memo=ilike.' + encodeURIComponent('*NAVER_SOURCE_KEY:' + sourceKey + '*') + '&order=created_at.desc&limit=1');
  return rows && rows[0] ? rows[0] : null;
}

function upsertNaverBookingLink_(booking, bookingId, customerId, status, messageId) {
  try {
    sbPost_('naver_booking_links?on_conflict=source_key', {
      source_key: booking.sourceKey,
      reservation_no: booking.reservationNo || '',
      booking_id: bookingId,
      customer_id: customerId || null,
      customer_name: booking.customerName || '',
      customer_phone: booking.phone || '',
      booking_date: booking.bookingDate || null,
      start_time: booking.startTime || null,
      end_time: booking.endTime || null,
      product_name: booking.productName || '',
      service_type: booking.serviceType || '',
      status,
      first_message_id: messageId,
      last_message_id: messageId,
      last_event_type: booking.eventType || status,
      last_synced_at: new Date().toISOString()
    }, 'return=representation,resolution=merge-duplicates');
  } catch (e) {
    console.warn('[Naver booking link skipped]', e && e.message ? e.message : e);
  }
}

function logNaverMailEvent_(booking, message, bookingId, status, error) {
  try {
    sbPost_('naver_booking_mail_events', {
      message_id: message.getId(),
      thread_id: message.getThread ? message.getThread().getId() : '',
      gmail_account: NAVER_GMAIL_ACCOUNT,
      mail_from: message.getFrom ? message.getFrom() : NAVER_BOOKING_SENDER,
      subject: message.getSubject ? message.getSubject() : booking.rawSubject || '',
      event_type: booking.eventType || 'unknown',
      source_key: booking.sourceKey || '',
      booking_id: bookingId,
      customer_name: booking.customerName || '',
      booking_date: booking.bookingDate || null,
      start_time: booking.startTime || null,
      product_name: booking.productName || '',
      raw_body: booking.rawBody || '',
      processed_status: status,
      error_message: error || '',
      processed_at: new Date().toISOString()
    });
  } catch (e) {
    console.warn('[Naver mail event log skipped]', e && e.message ? e.message : e);
  }
}

function fallbackEventFromMessage_(message) {
  return {
    eventType: 'unknown',
    sourceKey: 'message-' + message.getId(),
    rawSubject: message.getSubject() || '',
    rawBody: normalizeText_(message.getPlainBody() || message.getBody() || '').slice(0, 12000)
  };
}

function sbGet_(path) {
  const res = UrlFetchApp.fetch(sbUrl_() + '/rest/v1/' + path, {
    method: 'get',
    headers: sbHeaders_(),
    muteHttpExceptions: true
  });
  assertOk_(res, 'GET ' + path);
  return JSON.parse(res.getContentText() || '[]');
}

function sbPost_(table, body, prefer) {
  const res = UrlFetchApp.fetch(sbUrl_() + '/rest/v1/' + table, {
    method: 'post',
    headers: Object.assign({}, sbHeaders_(), { Prefer: prefer || 'return=representation' }),
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  assertOk_(res, 'POST ' + table);
  return JSON.parse(res.getContentText() || '[]');
}

function sbPatchById_(table, id, body) {
  const res = UrlFetchApp.fetch(sbUrl_() + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), {
    method: 'patch',
    headers: Object.assign({}, sbHeaders_(), { Prefer: 'return=minimal' }),
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  assertOk_(res, 'PATCH ' + table + '/' + id);
  return true;
}

function assertOk_(res, label) {
  const code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(label + ' failed ' + code + ': ' + res.getContentText());
  }
}

function sbUrl_() {
  const url = PropertiesService.getScriptProperties().getProperty('SUPABASE_URL');
  if (!url) throw new Error('Script property SUPABASE_URL is missing.');
  return url.replace(/\/$/, '');
}

function sbHeaders_() {
  const key = PropertiesService.getScriptProperties().getProperty('SUPABASE_KEY');
  if (!key) throw new Error('Script property SUPABASE_KEY is missing.');
  return {
    apikey: key,
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
}

function normalizeText_(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function pickField_(text, labels) {
  const lines = String(text || '').split('\n').map(line => line.trim()).filter(Boolean);
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const inline = new RegExp(escaped + '\\s*[:：>\\-]?\\s*([^\\n]+)', 'i');
    const inlineMatch = String(text || '').match(inline);
    if (inlineMatch && cleanField_(inlineMatch[1])) {
      const value = cleanField_(inlineMatch[1]);
      if (!labels.some(other => other !== label && value === other)) return value;
    }

    const idx = lines.findIndex(line => line === label || line.startsWith(label + ' ') || line.startsWith(label + ':') || line.startsWith(label + '：'));
    if (idx >= 0) {
      const sameLine = cleanField_(lines[idx].replace(new RegExp('^' + escaped + '\\s*[:：>\\-]?\\s*', 'i'), ''));
      if (sameLine && sameLine !== label) return sameLine;
      if (lines[idx + 1]) return cleanField_(lines[idx + 1]);
    }
  }
  return '';
}

function cleanField_(value) {
  return String(value || '')
    .replace(/^[|:\-：>\s]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseNaverDateTime_(value) {
  const text = String(value || '').replace(/\s+/g, ' ');
  const patterns = [
    /(\d{4})[.\-\/년]\s*(\d{1,2})[.\-\/월]\s*(\d{1,2})[.\-\/일]?(?:\s*\([^)]+\))?.{0,20}?(오전|오후|AM|PM)?\s*(\d{1,2})\s*(?:[:시]\s*(\d{1,2})\s*분?)?/i,
    /(\d{1,2})[.\-\/월]\s*(\d{1,2})[.\-\/일]?(?:\s*\([^)]+\))?.{0,20}?(오전|오후|AM|PM)?\s*(\d{1,2})\s*(?:[:시]\s*(\d{1,2})\s*분?)?/i
  ];

  let m = text.match(patterns[0]);
  let year, month, day, ampm, hour, minute;
  if (m) {
    year = Number(m[1]);
    month = Number(m[2]);
    day = Number(m[3]);
    ampm = m[4] || '';
    hour = Number(m[5]);
    minute = Number(m[6] || 0);
  } else {
    m = text.match(patterns[1]);
    if (!m) return null;
    year = new Date().getFullYear();
    month = Number(m[1]);
    day = Number(m[2]);
    ampm = m[3] || '';
    hour = Number(m[4]);
    minute = Number(m[5] || 0);
  }

  hour = normalizeHour_(hour, ampm);
  let startDate = new Date(year, month - 1, day, hour, minute, 0);
  if (!String(value || '').match(/\d{4}/) && startDate.getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000) {
    startDate = new Date(year + 1, month - 1, day, hour, minute, 0);
  }
  const date = Utilities.formatDate(startDate, NAVER_TZ, 'yyyy-MM-dd');
  const startTime = Utilities.formatDate(startDate, NAVER_TZ, 'HH:mm');
  const endTime = parseNaverEndTime_(text, startDate, ampm);
  return { date, startTime, endTime };
}

function parseNaverEndTime_(text, startDate, startAmpm) {
  const m = String(text || '').match(/[~\-]\s*(오전|오후|AM|PM)?\s*(\d{1,2})\s*(?:[:시]\s*(\d{1,2})\s*분?)?/i);
  if (!m) return '';
  const hour = normalizeHour_(Number(m[2]), m[1] || startAmpm || '');
  const minute = Number(m[3] || 0);
  return Utilities.formatDate(new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), hour, minute, 0), NAVER_TZ, 'HH:mm');
}

function normalizeHour_(hour, ampm) {
  const marker = String(ampm || '').toUpperCase();
  if ((marker === '오후' || marker === 'PM') && hour < 12) return hour + 12;
  if ((marker === '오전' || marker === 'AM') && hour === 12) return 0;
  return hour;
}

function addMinutesToTime_(hhmm, minutes) {
  const parts = String(hhmm || '00:00').split(':').map(Number);
  const date = new Date(2000, 0, 1, parts[0] || 0, parts[1] || 0, 0);
  date.setMinutes(date.getMinutes() + minutes);
  return Utilities.formatDate(date, NAVER_TZ, 'HH:mm');
}

function cleanPhone_(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('82') && digits.length >= 11) return '0' + digits.slice(2);
  return digits;
}

function pinFromPhone_(phone) {
  const digits = cleanPhone_(phone);
  return (digits.slice(-4) || '0000').padStart(4, '0');
}

function withNaverPrefix_(name) {
  const clean = String(name || '').replace(/^네이버\s*/, '').trim() || '고객';
  return '네이버 ' + clean;
}

function normalizeName_(name) {
  return String(name || '').replace(/^네이버\s*/, '').replace(/\s+/g, '').trim();
}

function serviceTypeFromText_(text) {
  const t = String(text || '').toLowerCase();
  const hasHair = /헤어|hair/.test(t);
  const hasMakeup = /메이크업|makeup|make-up|메컵/.test(t);
  if (hasHair && hasMakeup) return 'both';
  if (hasMakeup) return 'makeup';
  return 'hair';
}

function cleanSourceKey_(value) {
  return String(value || '').replace(/[^\w가-힣.-]/g, '').slice(0, 120);
}

function buildBookingDate_(dateValue, timeValue) {
  const date = String(dateValue || '').slice(0, 10);
  const time = String(timeValue || '09:00').slice(0, 5);
  const parts = date.split('-').map(Number);
  const hm = time.split(':').map(Number);
  return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1, hm[0] || 0, hm[1] || 0, 0);
}

function extractMemoValue_(memo, marker) {
  const idx = String(memo || '').indexOf(marker);
  if (idx < 0) return '';
  return String(memo || '').slice(idx + marker.length).split(/\s+/)[0].trim();
}

function stripInternalMemo_(memo) {
  return String(memo || '')
    .split('\n')
    .filter(line => !/^GCAL_|^NAVER_SOURCE_KEY:|^NAVER_MAIL_ID:|^NAVER_CANCELLED_MAIL_ID:/.test(line.trim()))
    .join('\n')
    .trim();
}

function appendUniqueLine_(memo, line) {
  const current = String(memo || '');
  if (current.includes(line)) return current;
  return [current, line].filter(Boolean).join('\n');
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}
