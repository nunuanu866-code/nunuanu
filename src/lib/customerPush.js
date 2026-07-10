const CUSTOMER_PUSH_KEY_PREFIX = 'nunu_customer_push_'

function normalizeRecipientPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('82')) return digits
  if (digits.startsWith('0')) return `82${digits.slice(1)}`
  return digits
}

function storageKey(phone) {
  return `${CUSTOMER_PUSH_KEY_PREFIX}${normalizeRecipientPhone(phone)}`
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

function pushPlatformLabel() {
  const ua = navigator.userAgent || ''
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone
  if (/iPhone|iPad|iPod/i.test(ua)) return standalone ? 'iOS 홈화면 앱' : 'iOS Safari'
  if (/Android/i.test(ua)) return 'Android'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS'
  return 'Web'
}

async function loadPushConfig() {
  const r = await fetch('/api/firebase-config', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok || data.enabled === false) {
    throw new Error(`알림 설정이 아직 완료되지 않았습니다. ${(data.missing || []).join(', ')}`)
  }
  if (!data.webPushPublicKey) throw new Error('Web Push 공개키가 설정되지 않았습니다.')
  return data
}

async function saveCustomerPushSubscription(payload) {
  const r = await fetch('/api/push-subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok || data.ok === false) throw new Error(data.error || '알림 기기 저장에 실패했습니다.')
  return data
}

export function getCustomerPushDevice(phone) {
  if (typeof window === 'undefined') return null
  const normalized = normalizeRecipientPhone(phone)
  if (!normalized) return null
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(normalized)) || 'null')
    return saved?.phone === normalized && saved?.token ? saved : null
  } catch {
    return null
  }
}

export async function disableCustomerPush(phone) {
  const normalized = normalizeRecipientPhone(phone)
  if (!normalized) throw new Error('알림을 끌 전화번호를 확인해주세요.')
  const saved = getCustomerPushDevice(normalized)

  if (saved?.token) {
    await saveCustomerPushSubscription({
      action: 'disable',
      token: saved.token,
    })
  }

  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration('/')
        || await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')
      const subscription = await registration?.pushManager?.getSubscription()
      if (subscription) await subscription.unsubscribe()
    } catch (error) {
      console.warn('[customer-push] unsubscribe skipped', error)
    }
  }

  localStorage.removeItem(storageKey(normalized))
  return true
}

export async function enableCustomerPush(phone) {
  const normalized = normalizeRecipientPhone(phone)
  if (!normalized) throw new Error('알림을 받을 전화번호를 확인해주세요.')
  if (!window.isSecureContext) throw new Error('알림은 HTTPS 배포 URL에서만 켤 수 있습니다.')
  if (!('serviceWorker' in navigator)) throw new Error('이 브라우저는 알림을 지원하지 않습니다.')
  if (!('Notification' in window)) throw new Error('이 브라우저는 알림 권한을 지원하지 않습니다.')

  const config = await loadPushConfig()
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('알림 권한이 허용되지 않았습니다. 브라우저 설정에서 알림을 허용해주세요.')
  }

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
    scope: '/',
    updateViaCache: 'none',
  })
  try { await registration.update() } catch (error) { console.warn('[customer-push] service worker update skipped', error) }
  await navigator.serviceWorker.ready

  if (!registration.pushManager) throw new Error('이 브라우저는 Web Push 구독을 지원하지 않습니다.')
  const existing = await registration.pushManager.getSubscription()
  if (existing) {
    try { await existing.unsubscribe() } catch (error) { console.warn('[customer-push] old subscription unsubscribe skipped', error) }
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(config.webPushPublicKey),
  })
  const token = `webpush:${JSON.stringify(subscription.toJSON())}`
  const platform = pushPlatformLabel()
  const savedAt = new Date().toISOString()

  await saveCustomerPushSubscription({
    token,
    user_role: 'customer',
    recipient_phone: normalized,
    platform: `${platform} · webpush`,
    device_label: `고객 알림 · ${normalized.slice(-4)}`,
    enabled: true,
    last_seen_at: savedAt,
    last_error: null,
  })

  const device = { token, phone: normalized, platform, enabledAt: savedAt }
  localStorage.setItem(storageKey(normalized), JSON.stringify(device))
  return device
}
