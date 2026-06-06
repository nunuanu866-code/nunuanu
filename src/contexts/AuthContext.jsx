import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const GUEST_KEY = 'nununanu_guest'   // 고객 정보 (이름+전화)

// ─── 권한 레벨 ────────────────────────────────
// staff.permission_level: 'full' | 'view_only'
// 'full'      → 예약 확정/거절/수정 모두 가능
// 'view_only' → 스케줄 조회만 가능

export function AuthProvider({ children }) {
  // 고객 (비로그인)
  const [guest, setGuest] = useState(null)     // { name, phone }

  // 스텝/관리자 (로그인 필요)
  const [staffProfile, setStaffProfile] = useState(null)
  const [role, setRole] = useState(null)       // 'guest' | 'staff' | 'admin'
  const [permission, setPermission] = useState('view_only') // 'full' | 'view_only'
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 저장된 고객 정보 복원
    const savedGuest = localStorage.getItem(GUEST_KEY)
    if (savedGuest) {
      try { setGuest(JSON.parse(savedGuest)) } catch {}
    }

    // Supabase 세션 복원 (자동 로그인 유지)
    // - 이메일+비밀번호 로그인, 매직링크 모두 세션을 localStorage에 저장
    // - 페이지 재방문 시 자동으로 복원됨
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (session?.user) {
          loadStaffProfile(session.user)
        } else {
          setLoading(false)
        }
      })
      .catch(() => setLoading(false))

    // 인증 상태 변화 감지 (로그인/로그아웃/매직링크 콜백)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session?.user) {
        loadStaffProfile(session.user)
      } else {
        setStaffProfile(null)
        setRole(null)
        setLoading(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

// ─── 관리자 이메일 화이트리스트 ──────────────────────────────
const ADMIN_EMAILS = {
  'nunuaun866@gmail.com': {
    id: 'whitelist-admin-1', name: '원장', role: 'makeup', title: '원장',
    is_admin: true, permission_level: 'full', color: '#D4537E', is_active: true,
    email: 'nunuaun866@gmail.com',
  },
  'nunuanu866@gmail.com': {
    id: 'whitelist-admin-2', name: '원장', role: 'makeup', title: '원장',
    is_admin: true, permission_level: 'full', color: '#D4537E', is_active: true,
    email: 'nunuanu866@gmail.com',
  },
}

  async function loadStaffProfile(authUser) {
    try {
      // 1차: auth_user_id로 DB 매칭
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('auth_user_id', authUser.id)
        .maybeSingle()

      // 2차: 이메일로 DB 폴백 (첫 로그인)
      let staffData = data
      if (!staffData && !error && authUser.email) {
        const { data: byEmail } = await supabase
          .from('staff')
          .select('*')
          .eq('email', authUser.email)
          .maybeSingle()

        if (byEmail) {
          await supabase.from('staff').update({ auth_user_id: authUser.id }).eq('id', byEmail.id)
          staffData = { ...byEmail, auth_user_id: authUser.id }
        }
      }

      // DB에서 찾음
      if (staffData) {
        setStaffProfile(staffData)
        setPermission(staffData.permission_level || 'full')
        setRole(staffData.is_admin ? 'admin' : 'staff')
        return
      }

      // 3차: 이메일 화이트리스트 (DB 테이블 미설정 시 임시 대응)
      if (authUser.email && ADMIN_EMAILS[authUser.email]) {
        const wl = ADMIN_EMAILS[authUser.email]
        setStaffProfile({ ...wl, auth_user_id: authUser.id })
        setPermission(wl.permission_level)
        setRole(wl.is_admin ? 'admin' : 'staff')
        return
      }

      // 모두 실패 → 로그아웃
      await supabase.auth.signOut().catch(() => {})
    } catch (e) {
      console.error('스텝 프로필 로드 오류:', e)
      // 오류 발생 시에도 화이트리스트 확인
      if (authUser?.email && ADMIN_EMAILS[authUser.email]) {
        const wl = ADMIN_EMAILS[authUser.email]
        setStaffProfile({ ...wl, auth_user_id: authUser.id })
        setPermission(wl.permission_level)
        setRole('admin')
        return
      }
    } finally {
      setLoading(false)
    }
  }

  // 고객 정보 저장 (비로그인 예약용)
  function saveGuest(name, phone) {
    const g = { name, phone }
    localStorage.setItem(GUEST_KEY, JSON.stringify(g))
    setGuest(g)
    setRole('guest')
  }

  // 로그아웃
  async function signOut() {
    if (role === 'guest') {
      localStorage.removeItem(GUEST_KEY)
      setGuest(null)
      setRole(null)
    } else {
      await supabase.auth.signOut().catch(() => {})
      setStaffProfile(null)
      setRole(null)
    }
  }

  // 현재 활성 프로필 (고객이면 guest, 스텝이면 staffProfile)
  const profile = role === 'guest' ? guest : staffProfile
  const canEdit = permission === 'full'

  return (
    <AuthContext.Provider value={{
      guest, staffProfile, profile,
      role, permission, canEdit,
      loading,
      saveGuest, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
