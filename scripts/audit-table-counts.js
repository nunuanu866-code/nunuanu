import { readFile } from 'node:fs/promises'

const envText = await readFile(new URL('../.env', import.meta.url), 'utf8')
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, '')]
    }),
)

const url = env.VITE_SUPABASE_URL?.replace(/\/$/, '')
const key = env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required in .env')
}

const tables = [
  'customers',
  'bookings',
  'staff',
  'time_blocks',
  'notifications',
  'admin_data',
  'naver_booking_mail_events',
  'naver_booking_links',
  'push_subscriptions',
  'push_notification_events',
]

for (const table of tables) {
  const response = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, {
    method: 'HEAD',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  })
  const contentRange = response.headers.get('content-range') || ''
  const count = contentRange.includes('/') ? contentRange.split('/').pop() : 'unknown'
  console.log(`${table.padEnd(28)} status=${response.status} visible_rows=${count}`)
}
