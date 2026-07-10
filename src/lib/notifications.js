import { supabase } from './supabase'

const TYPE_FALLBACK = {
  booking_cancel_requested: 'booking_cancelled',
  staff_approval_requested: 'booking_request',
  staff_approval_confirmed: 'booking_confirmed',
}

export async function createAppNotification({ bookingId, phone, type, fallbackType }) {
  if (!bookingId || !phone || !type) return false
  const payload = {
    booking_id: bookingId,
    recipient_phone: phone,
    type,
    status: 'pending',
  }

  try {
    const { error } = await supabase.from('notifications').insert(payload)
    if (!error) return true
    const fallback = fallbackType || TYPE_FALLBACK[type]
    if (!fallback || fallback === type) return false
    const { error: fallbackError } = await supabase
      .from('notifications')
      .insert({ ...payload, type: fallback })
    return !fallbackError
  } catch {
    return false
  }
}

export async function createAdminPushEvent({ bookingId, phone, type }) {
  if (!bookingId || !type) return false
  try {
    const r = await fetch('/api/admin-push-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ bookingId, phone, type }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok || data.ok === false) {
      console.warn('[admin-push-event] failed', r.status, data)
      return false
    }
    return true
  } catch (error) {
    console.warn('[admin-push-event] exception', error)
    return false
  }
}
