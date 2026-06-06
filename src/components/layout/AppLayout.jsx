import { useAuth } from '../../contexts/AuthContext'
import { useLocation, useNavigate } from 'react-router-dom'

const customerNav = [
  { path: '/customer', icon: '🏠', label: '홈' },
  { path: '/customer/booking', icon: '✂️', label: '예약하기' },
  { path: '/customer/my', icon: '📋', label: '내 예약' },
]

const adminNav = [
  { path: '/admin',           icon: '📬', label: '요청함' },
  { path: '/admin/schedule',  icon: '📅', label: '스케줄' },
  { path: '/admin/customers', icon: '👥', label: '고객' },
  { path: '/admin/staff',     icon: '💇', label: '스텝' },
]

const staffNav = [
  { path: '/staff', icon: '📅', label: '스케줄' },
  { path: '/staff/my', icon: '👤', label: '내 담당' },
]

export default function AppLayout({ children }) {
  const { role, profile, signOut, permission, canEdit } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const navItems = role === 'admin' ? adminNav : role === 'staff' ? staffNav : customerNav

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto relative">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between safe-top sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-nunu tracking-tight">누누아누</span>
          {role === 'admin' && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">관리자</span>}
          {role === 'staff' && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">스텝</span>}
          {!canEdit && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">조회전용</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{profile?.name}</span>
          <button onClick={signOut} className="text-xs text-gray-400 hover:text-gray-600">로그아웃</button>
        </div>
      </header>

      {/* 본문 */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* 하단 내비게이션 */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-gray-100 safe-bottom z-40">
        <div className="flex">
          {navItems.map(item => {
            const active = location.pathname === item.path || (item.path !== '/customer' && item.path !== '/admin' && item.path !== '/staff' && location.pathname.startsWith(item.path))
            return (
              <button key={item.path} onClick={() => navigate(item.path)}
                className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 transition-colors
                  ${active ? 'text-nunu' : 'text-gray-400 hover:text-gray-600'}`}>
                <span className="text-xl">{item.icon}</span>
                <span className={`text-xs ${active ? 'font-medium' : ''}`}>{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
