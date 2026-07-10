export const BOOKING_META_MARKER = '\n\n__NUNU_BOOKING_META__'

export function splitBookingMemo(memo) {
  const raw = String(memo || '')
  const idx = raw.indexOf(BOOKING_META_MARKER)
  if (idx < 0) return { text: raw, meta: {} }
  const text = raw.slice(0, idx).trim()
  const json = raw.slice(idx + BOOKING_META_MARKER.length).trim()
  try {
    return { text, meta: JSON.parse(json) || {} }
  } catch {
    return { text: raw, meta: {} }
  }
}

export function buildBookingMemo(text, meta = {}) {
  const cleanText = String(text || '').trim()
  const cleanMeta = Object.fromEntries(
    Object.entries(meta || {}).filter(([, value]) => value !== undefined && value !== null)
  )
  if (Object.keys(cleanMeta).length === 0) return cleanText
  return `${cleanText}${BOOKING_META_MARKER}${JSON.stringify(cleanMeta)}`
}

export function plainBookingMemo(bookingOrMemo) {
  const memo = typeof bookingOrMemo === 'string' ? bookingOrMemo : bookingOrMemo?.customer_memo
  return splitBookingMemo(memo).text
}

export function cancelRequestOf(bookingOrMemo) {
  const memo = typeof bookingOrMemo === 'string' ? bookingOrMemo : bookingOrMemo?.customer_memo
  const request = splitBookingMemo(memo).meta?.cancel_request
  return request?.status === 'requested' ? request : null
}

export function adminDeletedOf(bookingOrMemo) {
  const memo = typeof bookingOrMemo === 'string' ? bookingOrMemo : bookingOrMemo?.customer_memo
  const deleted = splitBookingMemo(memo).meta?.admin_deleted
  return deleted?.status === 'deleted' || deleted?.deleted === true
}

export function withCancelRequest(memo, extra = {}) {
  const { text, meta } = splitBookingMemo(memo)
  return buildBookingMemo(text, {
    ...meta,
    cancel_request: {
      status: 'requested',
      requested_at: new Date().toISOString(),
      ...extra,
    },
  })
}

export function withoutCancelRequest(memo, extra = {}) {
  const { text, meta } = splitBookingMemo(memo)
  const next = { ...meta }
  if (next.cancel_request) {
    next.cancel_request = {
      ...next.cancel_request,
      status: extra.status || 'resolved',
      resolved_at: new Date().toISOString(),
      ...extra,
    }
  }
  return buildBookingMemo(text, next)
}
