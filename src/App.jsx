import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import AppLayout from './components/layout/AppLayout'
import LandingPage from './pages/LandingPage'
import AdminLoginPage from './pages/AdminLoginPage'
import GuestBookingFlow from './pages/customer/GuestBookingFlow'
import { GuestMyBookings } from './pages/customer/CustomerPages'
import { AdminInbox, AdminSchedule } from './pages/admin/AdminPages'
import { AdminCustomers } from './pages/admin/AdminCustomers'
import { AdminStaff } from './pages/admin/AdminStaff'
import { StaffSchedule } from './pages/staff/StaffPages'

function AppRoutes() {
  const { role, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-nunu border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">누누아누</p>
        </div>
      </div>
    )
  }

  // ── 고객 (비로그인) ─────────────────────────
  if (!role || role === 'guest') {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/booking" element={<GuestBookingFlow />} />
        <Route path="/my" element={<GuestMyBookings />} />
        <Route path="/admin-login" element={<AdminLoginPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  // ── 관리자 / 스텝 (로그인) ──────────────────
  return (
    <AppLayout>
      <Routes>
        {role === 'admin' && <>
          <Route path="/admin" element={<AdminInbox />} />
          <Route path="/admin/schedule" element={<AdminSchedule />} />
          <Route path="/admin/customers" element={<AdminCustomers />} />
          <Route path="/admin/staff" element={<AdminStaff />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </>}
        {role === 'staff' && <>
          <Route path="/staff" element={<StaffSchedule />} />
          <Route path="/staff/my" element={<StaffSchedule />} />
          <Route path="*" element={<Navigate to="/staff" replace />} />
        </>}
      </Routes>
    </AppLayout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster position="top-center" toastOptions={{ style: { borderRadius: '12px', fontSize: '14px' } }} />
      </AuthProvider>
    </BrowserRouter>
  )
}
