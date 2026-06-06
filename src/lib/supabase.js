import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 개발 환경 연결 확인
console.log('[Supabase] URL:', supabaseUrl)
console.log('[Supabase] Key 앞 20자:', supabaseAnonKey?.substring(0, 20))

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
})

export const statusLabel = { pending: '확인중', confirmed: '확정', rejected: '거절됨', cancelled: '취소됨' }
export const statusColor = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600'
}
export const serviceLabel = { hair: '헤어', makeup: '메이크업', both: '헤어+메이크업' }
export const serviceDuration = { hair: 40, makeup: 60, both: 100 }
export const SALON_PHONE = '010-6441-8666'
