/**
 * NUNUANU - Naver Place booking Gmail sync
 *
 * Gmail is read in Google Apps Script. The booking parser and database writes
 * run on the deployed Vercel API so Korean mail templates do not depend on
 * Apps Script file encoding or Supabase anon/RLS permissions.
 *
 * Required Script Properties:
 * - NAVER_GMAIL_SYNC_URL: https://nununanu-app.vercel.app/api/naver-gmail-sync
 *
 * Optional Script Properties:
 * - NAVER_GMAIL_SYNC_SECRET: must match Vercel NAVER_GMAIL_SYNC_SECRET if set
 * - NAVER_LOOKBACK_DAYS: default 30
 * - NAVER_SYNC_MAX_THREADS: default 100
 * - NAVER_BACKFILL_MAX_THREADS: default 1000
 *
 * Google Calendar sync still uses:
 * - SUPABASE_URL
 * - SUPABASE_KEY
 */

const NAVER_GMAIL_ACCOUNT = 'nunuanu866@gmail.com';
const NAVER_BOOKING_SENDER = 'naverbooking_noreply@navercorp.com';
const NAVER_SYNC_LABEL = 'nununanu_naver_booking_synced';
const NAVER_ERROR_LABEL = 'nununanu_naver_booking_error';
const NAVER_DEFAULT_LOOKBACK_DAYS = 30;
const NAVER_DEFAULT_SYNC_MAX_THREADS = 30;
const NAVER_DEFAULT_SYNC_MAX_MESSAGES = 12;
const NAVER_DEFAULT_BACKFILL_MAX_THREADS = 50;
const NAVER_DEFAULT_BACKFILL_MAX_MESSAGES = 12;
const NAVER_MAX_GMAIL_API_MESSAGE_GETS = 20;
const NAVER_SCRIPT_LOCK_WAIT_MS = 1000;
const NAVER_DEFAULT_SYNC_URL = 'https://nununanu-app.vercel.app/api/naver-gmail-sync';
const NAVER_TZ = 'Asia/Seoul';
const NAVER_BACKFILL_PAGE_TOKEN_PROP = 'naver_booking_backfill_page_token';

const GCAL_BOOKING_SELECT = '*,customers(name,phone)';
const GCAL_EVENT_MARKER = 'GCAL_EVENT_ID:';
const GCAL_CANCELLED_MARKER = 'GCAL_CANCELLED_AT:';
const SYSTEM_SERVICE_DETAILS = [
  'STAFF_AUTH',
  'STAFF_ATTENDANCE',
  'STAFF_VISIBILITY',
  'STAFF_PROFILE',
  'CUSTOMER_META',
  'AUDIT_LOG',
  'STAFF_DAY_OFF',
  'SCHEDULE_NOTICE'
];

function runNaverBookingSyncLocked_(runner) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(NAVER_SCRIPT_LOCK_WAIT_MS)) {
    const skipped = { skipped: true, reason: 'already_running' };
    console.log('[Naver Gmail sync]', skipped);
    return { naver: skipped, googleCalendar: null };
  }
  try {
    return runner();
  } finally {
    lock.releaseLock();
  }
}

function buildRecentNaverQuery_(lookbackDays) {
  // Do not exclude NAVER_SYNC_LABEL here. Gmail labels are thread-scoped in search,
  // so a synced confirmation can hide a later cancellation/update in the same thread.
  return 'in:anywhere from:' + NAVER_BOOKING_SENDER + ' newer_than:' + lookbackDays + 'd';
}
function syncNaverBookingEmails() {
  return runNaverBookingSyncLocked_(function() {
    const props = PropertiesService.getScriptProperties();
    const lookbackDays = Number(props.getProperty('NAVER_LOOKBACK_DAYS') || NAVER_DEFAULT_LOOKBACK_DAYS);
    const naverResult = runNaverBookingSync_({
      query: buildRecentNaverQuery_(lookbackDays),
      maxThreads: clampNaverLimit_(props.getProperty('NAVER_SYNC_MAX_THREADS'), NAVER_DEFAULT_SYNC_MAX_THREADS, 100),
      maxMessages: clampNaverLimit_(props.getProperty('NAVER_SYNC_MAX_MESSAGES'), NAVER_DEFAULT_SYNC_MAX_MESSAGES, NAVER_MAX_GMAIL_API_MESSAGE_GETS),
      ignoreProcessed: false,
      mode: 'recent'
    });

    const runGoogleCalendar = props.getProperty('NAVER_SYNC_RUN_GCAL') === 'true';
    let calendarResult = { skipped: true, reason: 'separate_google_calendar_trigger' };
    if (runGoogleCalendar) {
      try {
        calendarResult = syncConfirmedBookingsToGoogleCalendar();
      } catch (error) {
        calendarResult = { failed: true, message: String(error && error.message ? error.message : error) };
        console.error('[Google Calendar sync from Gmail trigger failed]', calendarResult);
      }
    }

    return { naver: naverResult, googleCalendar: calendarResult };
  });
}

function resyncRecentNaverBookingEmails() {
  return runNaverBookingSyncLocked_(function() {
    const props = PropertiesService.getScriptProperties();
    const lookbackDays = Number(props.getProperty('NAVER_LOOKBACK_DAYS') || NAVER_DEFAULT_LOOKBACK_DAYS);
    return runNaverBookingSync_({
      query: buildRecentNaverQuery_(lookbackDays),
      maxThreads: clampNaverLimit_(props.getProperty('NAVER_SYNC_MAX_THREADS'), NAVER_DEFAULT_SYNC_MAX_THREADS, 100),
      maxMessages: clampNaverLimit_(props.getProperty('NAVER_SYNC_MAX_MESSAGES'), NAVER_DEFAULT_SYNC_MAX_MESSAGES, NAVER_MAX_GMAIL_API_MESSAGE_GETS),
      ignoreProcessed: true,
      payloadOverrides: { forceReprocess: true, suppressPush: true },
      mode: 'recent_resync'
    });
  });
}
function resyncErroredNaverBookingEmails() {
  return runNaverBookingSyncLocked_(function() {
    const props = PropertiesService.getScriptProperties();
    return runNaverBookingSync_({
      query: 'in:anywhere from:' + NAVER_BOOKING_SENDER + ' label:' + NAVER_ERROR_LABEL,
      maxThreads: clampNaverLimit_(props.getProperty('NAVER_ERROR_RESYNC_MAX_THREADS'), NAVER_DEFAULT_BACKFILL_MAX_THREADS, 100),
      maxMessages: clampNaverLimit_(props.getProperty('NAVER_ERROR_RESYNC_MAX_MESSAGES'), NAVER_DEFAULT_BACKFILL_MAX_MESSAGES, NAVER_MAX_GMAIL_API_MESSAGE_GETS),
      ignoreProcessed: true,
      payloadOverrides: { forceReprocess: true, suppressPush: true },
      mode: 'error_resync'
    });
  });
}
function backfillAllCurrentNaverBookingEmails() {
  const props = PropertiesService.getScriptProperties();
  return runNaverBookingSync_({
    query: 'in:anywhere from:' + NAVER_BOOKING_SENDER,
    maxThreads: clampNaverLimit_(props.getProperty('NAVER_BACKFILL_MAX_THREADS'), NAVER_DEFAULT_BACKFILL_MAX_THREADS, 100),
    maxMessages: clampNaverLimit_(props.getProperty('NAVER_BACKFILL_MAX_MESSAGES'), NAVER_DEFAULT_BACKFILL_MAX_MESSAGES, NAVER_MAX_GMAIL_API_MESSAGE_GETS),
    ignoreProcessed: true,
    payloadOverrides: { forceReprocess: true, suppressPush: true },
    pageTokenProp: NAVER_BACKFILL_PAGE_TOKEN_PROP,
    mode: 'backfill'
  });
}

function runNaverBookingSync_(options) {
  const props = PropertiesService.getScriptProperties();
  const syncedLabel = getOrCreateLabel_(NAVER_SYNC_LABEL);
  const errorLabel = getOrCreateLabel_(NAVER_ERROR_LABEL);
  const messages = collectNaverMessages_(options, props);
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
      const payload = buildNaverPayload_(message);
      if (options.payloadOverrides) Object.assign(payload, options.payloadOverrides);
      const result = postNaverBookingMessage_(payload);
      if (!result || result.ok !== true) {
        throw new Error('Unexpected sync API response: ' + JSON.stringify(result || {}));
      }
      props.setProperty(processedKey, new Date().toISOString());
      markNaverMessageSynced_(message, syncedLabel, errorLabel);
      processed += 1;
    } catch (error) {
      failed += 1;
      markNaverMessageFailed_(message, errorLabel);
      console.error('[Naver Gmail sync failed]', message.getSubject(), messageId, error);
    }
  });

  const result = { mode: options.mode, scanned: messages.length, processed, skipped, failed };
  console.log('[Naver Gmail sync]', result);
  return result;
}

function collectNaverMessages_(options, props) {
  if (isGmailApiAvailable_()) {
    try {
      return collectNaverMessagesViaGmailApi_(options, props);
    } catch (error) {
      console.error('[Naver Gmail API collection failed]', error);
      throw error;
    }
  }
  return collectNaverMessagesViaGmailApp_(options, props);
}

function collectNaverMessagesViaGmailApp_(options, props) {
  const threads = [];
  const limit = Math.max(1, Number(options.maxThreads || NAVER_DEFAULT_SYNC_MAX_THREADS));
  const batchSize = Math.min(100, limit);

  for (let start = 0; start < limit; start += batchSize) {
    const found = GmailApp.search(options.query, start, Math.min(batchSize, limit - start));
    if (!found.length) break;
    threads.push.apply(threads, found);
    if (found.length < batchSize) break;
  }

  return threads
    .flatMap(thread => thread.getMessages())
    .filter(message => !shouldSkipNaverMessage_(message.getId(), options, props))
    .filter(message => String(message.getFrom() || '').toLowerCase().indexOf(NAVER_BOOKING_SENDER) >= 0)
    .slice(0, Math.max(1, Number(options.maxMessages || NAVER_DEFAULT_SYNC_MAX_MESSAGES)))
    .sort((a, b) => a.getDate().getTime() - b.getDate().getTime());
}

function collectNaverMessagesViaGmailApi_(options, props) {
  const limit = Math.max(1, Number(options.maxThreads || NAVER_DEFAULT_SYNC_MAX_THREADS));
  const maxMessages = Math.max(1, Math.min(
    NAVER_MAX_GMAIL_API_MESSAGE_GETS,
    Number(options.maxMessages || NAVER_DEFAULT_SYNC_MAX_MESSAGES)
  ));
  const summaries = [];
  let pageToken = options.pageTokenProp ? String(props.getProperty(options.pageTokenProp) || '') : '';

  while (summaries.length < limit) {
    const res = Gmail.Users.Messages.list('me', {
      q: options.query,
      includeSpamTrash: true,
      maxResults: Math.min(100, limit - summaries.length),
      pageToken: pageToken || undefined,
      fields: 'messages(id,threadId),nextPageToken'
    });
    (res.messages || []).forEach(message => summaries.push(message));
    pageToken = res.nextPageToken || '';
    if (!pageToken || !(res.messages || []).length) break;
  }

  if (options.pageTokenProp) {
    if (pageToken) props.setProperty(options.pageTokenProp, pageToken);
    else props.deleteProperty(options.pageTokenProp);
  }

  const candidates = summaries
    .filter(message => !shouldSkipNaverMessage_(message.id, options, props))
    .slice(0, maxMessages);

  return candidates
    .map(message => Gmail.Users.Messages.get('me', message.id, { format: 'full' }))
    .map(gmailApiMessageWrapper_)
    .filter(message => String(message.getFrom() || '').toLowerCase().indexOf(NAVER_BOOKING_SENDER) >= 0)
    .sort((a, b) => a.getDate().getTime() - b.getDate().getTime());
}

function shouldSkipNaverMessage_(messageId, options, props) {
  const id = String(messageId || '').trim();
  if (!id || options.ignoreProcessed) return false;
  return Boolean(props.getProperty('naver_booking_processed_' + id));
}

function clampNaverLimit_(value, fallback, max) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

function gmailApiMessageWrapper_(message) {
  const headers = (message.payload && message.payload.headers) || [];
  const header = function(name) {
    const found = headers.find(item => String(item.name || '').toLowerCase() === String(name).toLowerCase());
    return found ? String(found.value || '') : '';
  };
  const fallbackSnippet = String(message.snippet || '');
  const plainBody = extractGmailMimeBody_(message.payload, 'text/plain') || fallbackSnippet;
  const htmlBody = extractGmailMimeBody_(message.payload, 'text/html') || plainBody || fallbackSnippet;
  const dateMs = Number(message.internalDate || 0) || Date.parse(header('Date')) || Date.now();

  return {
    __gmailApi: true,
    getId: function() { return message.id || ''; },
    getThread: function() {
      return { getId: function() { return message.threadId || ''; } };
    },
    getDate: function() { return new Date(dateMs); },
    getFrom: function() { return header('From'); },
    getSubject: function() { return header('Subject'); },
    getPlainBody: function() { return plainBody || fallbackSnippet || ''; },
    getBody: function() { return htmlBody || plainBody || fallbackSnippet || ''; }
  };
}

function extractGmailMimeBody_(part, targetMimeType) {
  if (!part) return '';
  const chunks = [];
  collectGmailMimeBodyParts_(part, targetMimeType, chunks);
  return chunks.join('\n').trim();
}

function collectGmailMimeBodyParts_(part, targetMimeType, chunks) {
  if (!part) return;
  if (part.mimeType === targetMimeType && part.body && part.body.data) {
    chunks.push(decodeGmailBody_(part.body.data));
  }
  (part.parts || []).forEach(child => collectGmailMimeBodyParts_(child, targetMimeType, chunks));
}

function decodeGmailBody_(data) {
  const raw = String(data || '').replace(/\s/g, '');
  if (!raw) return '';
  const padded = raw + '='.repeat((4 - (raw.length % 4)) % 4);
  try {
    const bytes = Utilities.base64DecodeWebSafe(padded);
    return Utilities.newBlob(bytes).getDataAsString('UTF-8');
  } catch (error) {
    try {
      const standard = padded.replace(/-/g, '+').replace(/_/g, '/');
      const bytes = Utilities.base64Decode(standard);
      return Utilities.newBlob(bytes).getDataAsString('UTF-8');
    } catch (fallbackError) {
      return '';
    }
  }
}

function buildNaverPayload_(message) {
  const plainBody = message.getPlainBody() || '';
  const htmlBody = message.getBody() || '';
  return {
    gmailAccount: NAVER_GMAIL_ACCOUNT,
    messageId: message.getId(),
    threadId: message.getThread().getId(),
    receivedAt: message.getDate().toISOString(),
    from: message.getFrom() || NAVER_BOOKING_SENDER,
    subject: message.getSubject() || '',
    plainBody: plainBody,
    htmlBody: htmlBody,
    snippet: (plainBody || htmlBody).slice(0, 500)
  };
}

function postNaverBookingMessage_(payload) {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('NAVER_GMAIL_SYNC_URL') || NAVER_DEFAULT_SYNC_URL;
  const secret = props.getProperty('NAVER_GMAIL_SYNC_SECRET') || '';
  const headers = { Accept: 'application/json' };
  if (secret) headers.Authorization = 'Bearer ' + secret;

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const text = res.getContentText() || '{}';
  let body = {};
  try { body = JSON.parse(text); } catch (e) { body = { raw: text }; }
  if (code < 200 || code >= 300) {
    throw new Error('Naver Gmail sync API failed ' + code + ': ' + text);
  }
  return body;
}

function testNaverGmailSyncEndpoint() {
  return postNaverBookingMessage_({
    gmailAccount: NAVER_GMAIL_ACCOUNT,
    messageId: 'test-' + Date.now(),
    threadId: 'test',
    receivedAt: new Date().toISOString(),
    from: NAVER_BOOKING_SENDER,
    subject: 'NUNUANU endpoint test',
    plainBody: 'endpoint test',
    htmlBody: ''
  });
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
  const rows = sbGet_('bookings?select=' + encodeURIComponent(GCAL_BOOKING_SELECT) + '&status=eq.confirmed&order=created_at.desc&limit=500');
  let created = 0;
  let skipped = 0;
  let failed = 0;

  (rows || []).forEach(booking => {
    try {
      const memo = String(booking.customer_memo || '');
      const confirmedAt = booking.confirmed_at ? new Date(booking.confirmed_at).getTime() : 0;
      const isNaverBooking = isNaverLinkedBooking_(booking);
      const naverGcalKey = isNaverBooking ? naverGcalPropertyKey_(booking.id) : '';
      if (SYSTEM_SERVICE_DETAILS.indexOf(String(booking.service_detail || '')) >= 0) { skipped += 1; return; }
      if (memo.indexOf(GCAL_EVENT_MARKER) >= 0) { skipped += 1; return; }
      if (naverGcalKey && props.getProperty(naverGcalKey)) { skipped += 1; return; }
      if (confirmedAt && confirmedAt < startedAt) { skipped += 1; return; }

      const eventId = createGoogleCalendarEventForBooking_(booking);
      if (naverGcalKey) {
        props.setProperty(naverGcalKey, eventId);
      } else {
        const nextMemo = appendUniqueLine_(memo, [
          GCAL_EVENT_MARKER + eventId,
          'GCAL_SYNCED_AT:' + new Date().toISOString()
        ].join('\n'));
        sbPatchById_('bookings', booking.id, { customer_memo: nextMemo });
      }
      created += 1;
    } catch (error) {
      failed += 1;
      console.error('[Google Calendar booking sync failed]', booking && booking.id, error);
    }
  });

  const cancelledResult = syncCancelledBookingsFromGoogleCalendar_();
  const result = { created: created, skipped: skipped, failed: failed, cancelled: cancelledResult };
  console.log('[Google Calendar sync]', result);
  return result;
}

function backfillConfirmedBookingsToGoogleCalendar() {
  PropertiesService.getScriptProperties().setProperty('GCAL_SYNC_STARTED_AT', '1970-01-01T00:00:00.000Z');
  return syncConfirmedBookingsToGoogleCalendar();
}

function naverGcalPropertyKey_(bookingId) {
  return bookingId ? 'GCAL_NAVER_BOOKING_EVENT_' + bookingId : '';
}

function isNaverLinkedBooking_(booking) {
  if (!booking || !booking.id) return false;
  try {
    const links = sbGet_('naver_booking_links?select=booking_id&booking_id=eq.' + encodeURIComponent(booking.id) + '&limit=1');
    return !!(links && links[0]);
  } catch (e) {
    console.warn('[Naver booking link check skipped]', e && e.message ? e.message : e);
    return false;
  }
}

function syncCancelledBookingsFromGoogleCalendar_() {
  const props = PropertiesService.getScriptProperties();
  const rows = sbGet_('bookings?select=id,customer_memo,status&status=eq.cancelled&order=created_at.desc&limit=200');
  let removed = 0;
  let skipped = 0;
  let failed = 0;

  (rows || []).forEach(booking => {
    try {
      const memo = String(booking.customer_memo || '');
      const naverGcalKey = naverGcalPropertyKey_(booking.id);
      const storedEventId = props.getProperty(naverGcalKey);
      if (!storedEventId && (memo.indexOf(GCAL_EVENT_MARKER) < 0 || memo.indexOf(GCAL_CANCELLED_MARKER) >= 0)) { skipped += 1; return; }
      const eventId = storedEventId || extractMemoValue_(memo, GCAL_EVENT_MARKER);
      if (!eventId) { skipped += 1; return; }
      const event = CalendarApp.getDefaultCalendar().getEventById(eventId);
      if (event) event.deleteEvent();
      if (storedEventId) {
        props.deleteProperty(naverGcalKey);
      } else {
        const nextMemo = appendUniqueLine_(memo, GCAL_CANCELLED_MARKER + new Date().toISOString());
        sbPatchById_('bookings', booking.id, { customer_memo: nextMemo });
      }
      removed += 1;
    } catch (error) {
      failed += 1;
      console.error('[Google Calendar cancel sync failed]', booking && booking.id, error);
    }
  });

  return { removed: removed, skipped: skipped, failed: failed };
}

function createGoogleCalendarEventForBooking_(booking) {
  const customer = booking.customers || {};
  const name = customer.name || 'Customer';
  const phone = customer.phone || '';
  const service = booking.service_detail || booking.service_type || 'Booking';
  const start = buildBookingDate_(booking.booking_date, booking.start_time);
  let end = buildBookingDate_(booking.booking_date, booking.end_time);
  if (!end || end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }

  const description = [
    'Customer: ' + name + (phone ? ' (' + phone + ')' : ''),
    'Service: ' + service,
    booking.customer_memo ? 'Memo: ' + stripInternalMemo_(booking.customer_memo) : '',
    'Synced automatically from NUNUANU booking app.'
  ].filter(Boolean).join('\n');

  const event = CalendarApp.getDefaultCalendar().createEvent(
    '[Booking] ' + name + ' - ' + service,
    start,
    end,
    { description: description }
  );
  try { event.setColor(CalendarApp.EventColor.GREEN); } catch (e) {}
  return event.getId();
}

function sbUrl_() {
  const url = PropertiesService.getScriptProperties().getProperty('SUPABASE_URL');
  if (!url) throw new Error('Script property SUPABASE_URL is missing.');
  return url.replace(/\/$/, '');
}

function sbHeaders_() {
  const key = PropertiesService.getScriptProperties().getProperty('SUPABASE_KEY');
  if (!key) throw new Error('Script property SUPABASE_KEY is missing.');
  const headers = {
    apikey: key,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
  if (String(key).indexOf('sb_secret_') !== 0) {
    headers.Authorization = 'Bearer ' + key;
  }
  return headers;
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
  if (current.indexOf(line) >= 0) return current;
  return [current, line].filter(Boolean).join('\n');
}

function getOrCreateLabel_(name) {
  if (isGmailApiAvailable_()) {
    try {
      return getOrCreateGmailApiLabel_(name);
    } catch (error) {
      console.warn('[Gmail API label fallback]', error);
    }
  }
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function isGmailApiAvailable_() {
  return typeof Gmail !== 'undefined' && Gmail.Users && Gmail.Users.Messages && Gmail.Users.Labels;
}

function getOrCreateGmailApiLabel_(name) {
  const labels = (Gmail.Users.Labels.list('me').labels || []);
  const existing = labels.find(label => label.name === name);
  if (existing) {
    return { __gmailApi: true, id: existing.id, name: existing.name };
  }
  const created = Gmail.Users.Labels.create({
    name: name,
    labelListVisibility: 'labelShow',
    messageListVisibility: 'show'
  }, 'me');
  return { __gmailApi: true, id: created.id, name: created.name || name };
}

function markNaverMessageSynced_(message, syncedLabel, errorLabel) {
  if (message && message.__gmailApi && syncedLabel && syncedLabel.__gmailApi) {
    const request = { addLabelIds: [syncedLabel.id] };
    if (errorLabel && errorLabel.__gmailApi && errorLabel.id) request.removeLabelIds = [errorLabel.id];
    Gmail.Users.Messages.modify(request, 'me', message.getId());
    return;
  }

  const thread = message.getThread();
  thread.addLabel(syncedLabel);
  try { thread.removeLabel(errorLabel); } catch (e) {}
}

function markNaverMessageFailed_(message, errorLabel) {
  if (message && message.__gmailApi && errorLabel && errorLabel.__gmailApi) {
    Gmail.Users.Messages.modify({ addLabelIds: [errorLabel.id] }, 'me', message.getId());
    return;
  }
  message.getThread().addLabel(errorLabel);
}
