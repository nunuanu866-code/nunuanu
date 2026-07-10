import { useAuth } from '../../contexts/AuthContext'
import { useLocation, useNavigate } from 'react-router-dom'

const customerNav = [
  { path: '/customer', label: '홈' },
  { path: '/customer/booking', label: '예약' },
  { path: '/customer/my', label: '조회' },
]

const adminNav = [
  { path: '/admin',           label: '요청함' },
  { path: '/admin/schedule',  label: '스케줄' },
  { path: '/admin/customers', label: '고객' },
  { path: '/admin/staff',     label: '스텝' },
]

const staffNav = [
  { path: '/staff', label: '스케줄' },
  { path: '/staff/my', label: '내 담당' },
]

export default function AppLayout({ children }) {
  const { role, profile, signOut, canEdit } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const navItems = role === 'admin' ? adminNav : role === 'staff' ? staffNav : customerNav

  return (
    <div className="min-h-screen bg-apple-parchment flex flex-col max-w-md mx-auto relative text-apple-ink">
      <header className="bg-apple-black text-white safe-top sticky top-0 z-40">
        <div className="h-11 px-5 flex items-center justify-between text-xs tracking-[-.12px]">
          <span className="font-semibold">NUNU A NU</span>
          <span className="text-white/70 truncate max-w-[120px]">{profile?.name}</span>
          <button onClick={signOut} className="text-white/70">로그아웃</button>
        </div>
        <div className="h-[52px] bg-apple-parchment/85 text-apple-ink backdrop-blur-xl border-b border-black/5 px-5 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[21px] font-semibold tracking-[.231px]">
              {role === 'admin' ? '관리자' : role === 'staff' ? '스텝' : '예약'}
            </span>
            {!canEdit && <span className="text-xs text-apple-muted">열람</span>}
          </div>
          <button className="bg-apple-blue text-white rounded-full px-3 py-1 text-sm">
            {role === 'admin' ? 'Admin' : role === 'staff' ? 'Staff' : 'Book'}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24 bg-apple-parchment">
        {children}
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-apple-parchment/88 backdrop-blur-xl border-t border-black/5 safe-bottom z-40">
        <div className="flex min-h-[64px]">
          {navItems.map(item => {
            const active = location.pathname === item.path || (item.path !== '/customer' && item.path !== '/admin' && item.path !== '/staff' && location.pathname.startsWith(item.path))
            return (
              <button key={item.path} onClick={() => navigate(item.path)}
                className={`flex-1 flex items-center justify-center text-[14px] transition-colors
                  ${active ? 'text-apple-blue font-semibold' : 'text-apple-muted'}`}>
                {item.label}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
