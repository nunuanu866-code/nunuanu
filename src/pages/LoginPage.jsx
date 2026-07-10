import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Button, Input } from '../components/ui/index'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [mode, setMode] = useState('main') // 'main' | 'phone' | 'otp' | 'register'
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const { createCustomerProfile, role, enterDemo } = useAuth()
  const navigate = useNavigate()

  function normalizePhone(raw) {
    const digits = raw.replace(/\D/g, '')
    if (digits.startsWith('0')) return '+82' + digits.slice(1)
    return '+82' + digits
  }

  function formatDisplay(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, 11)
    if (digits.length <= 3) return digits
    if (digits.length <= 7) return `${digits.slice(0,3)}-${digits.slice(3)}`
    return `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`
  }

  async function handleSendOtp() {
    if (phone.replace(/\D/g, '').length < 10) {
      toast.error('전화번호를 올바르게 입력해주세요'); return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: normalizePhone(phone) })
      if (error) throw error
      setMode('otp')
      toast.success('인증번호가 발송되었습니다')
    } catch (e) {
      toast.error(e.message || '인증번호 발송에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6) { toast.error('6자리 인증번호를 입력해주세요'); return }
    setLoading(true)
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: normalizePhone(phone), token: otp, type: 'sms'
      })
      if (error) throw error
      await new Promise(r => setTimeout(r, 800))
    } catch (e) {
      toast.error(e.message || '인증번호가 올바르지 않습니다')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister() {
    if (!name.trim()) { toast.error('이름을 입력해주세요'); return }
    setLoading(true)
    try {
      await createCustomerProfile(name.trim(), normalizePhone(phone))
      toast.success(`환영합니다, ${name}님!`)
    } catch (e) {
      toast.error('프로필 생성에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  // 이미 로그인된 경우
  if (role === 'customer') { navigate('/customer', { replace: true }); return null }
  if (role === 'admin') { navigate('/admin', { replace: true }); return null }
  if (role === 'staff') { navigate('/staff', { replace: true }); return null }

  // 신규 고객 이름 입력
  if (role === 'new_customer') {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="flex-1 flex flex-col justify-center px-6 pb-10">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-nunu mb-1">누누아누</h1>
            <p className="text-gray-400 text-sm">NUNUNANU · CHEONGDAM</p>
          </div>
          <div className="bg-gold/10 rounded-2xl p-4 mb-6">
            <p className="text-sm text-amber-800 font-medium">처음 방문하셨군요 👋</p>
            <p className="text-sm text-amber-700 mt-1">예약에 사용할 이름을 입력해주세요.</p>
          </div>
          <div className="flex flex-col gap-4">
            <Input label="이름" placeholder="홍길동" value={name} onChange={e => setName(e.target.value)} />
            <Button size="lg" onClick={handleRegister} loading={loading}>시작하기</Button>
          </div>
        </div>
      </div>
    )
  }

  // ─── 메인 화면 ─────────────────────────────
  if (mode === 'main') {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="flex-1 flex flex-col justify-center px-6 pb-6">
          {/* 브랜드 */}
          <div className="mb-10 text-center">
            <div className="w-20 h-20 bg-apple-black rounded-3xl flex items-center justify-center mx-auto mb-5">
              <span className="text-white text-3xl font-semibold tracking-[-.374px]">N</span>
            </div>
            <h1 className="text-3xl font-bold text-nunu mb-1">누누아누</h1>
            <p className="text-gray-400 text-sm">NUNUNANU · CHEONGDAM</p>
            <p className="text-xs text-gray-300 mt-1">청담 여성 전용 헤어·메이크업 살롱</p>
          </div>

          {/* 전화번호 로그인 버튼 */}
          <Button size="lg" onClick={() => setMode('phone')} className="mb-3">
            📱 전화번호로 로그인
          </Button>

          {/* 구분선 */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-300 font-medium">또는</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* 데모 모드 — 역할 선택 */}
          <div className="flex flex-col gap-2">
            <p className="text-xs text-center text-gray-400 mb-1 font-medium">로그인 없이 둘러보기</p>

            <button
              onClick={() => enterDemo('customer')}
              className="flex items-center gap-4 p-4 rounded-2xl border border-gray-100 bg-gray-50 hover:border-nunu/30 hover:bg-white transition-all active:scale-98"
            >
              <div className="w-11 h-11 rounded-full bg-apple-black flex items-center justify-center text-white text-lg flex-shrink-0">
                👩
              </div>
              <div className="text-left">
                <p className="font-semibold text-gray-900 text-sm">고객으로 시작</p>
                <p className="text-xs text-gray-400 mt-0.5">예약 요청·조회·취소</p>
              </div>
              <span className="ml-auto text-gray-300 text-sm">›</span>
            </button>

            <button
              onClick={() => enterDemo('admin')}
              className="flex items-center gap-4 p-4 rounded-2xl border border-gray-100 bg-gray-50 hover:border-nunu/30 hover:bg-white transition-all active:scale-98"
            >
              <div className="w-11 h-11 rounded-full bg-apple-black flex items-center justify-center text-white text-lg flex-shrink-0">
                👑
              </div>
              <div className="text-left">
                <p className="font-semibold text-gray-900 text-sm">관리자로 시작</p>
                <p className="text-xs text-gray-400 mt-0.5">예약 확정·타임라인·고객 관리</p>
              </div>
              <span className="ml-auto text-gray-300 text-sm">›</span>
            </button>

            <button
              onClick={() => enterDemo('staff')}
              className="flex items-center gap-4 p-4 rounded-2xl border border-gray-100 bg-gray-50 hover:border-nunu/30 hover:bg-white transition-all active:scale-98"
            >
              <div className="w-11 h-11 rounded-full bg-apple-black flex items-center justify-center text-white text-lg flex-shrink-0">
                ✂️
              </div>
              <div className="text-left">
                <p className="font-semibold text-gray-900 text-sm">스텝으로 시작</p>
                <p className="text-xs text-gray-400 mt-0.5">스케줄 조회·메모 입력</p>
              </div>
              <span className="ml-auto text-gray-300 text-sm">›</span>
            </button>
          </div>
        </div>

        <div className="pb-8 text-center">
          <p className="text-xs text-gray-300">데모 모드에서는 일부 기능이 제한될 수 있습니다</p>
        </div>
      </div>
    )
  }

  // ─── 전화번호 입력 ───────────────────────────
  if (mode === 'phone') {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="flex-1 flex flex-col justify-center px-6 pb-10">
          {/* 뒤로 가기 */}
          <button onClick={() => setMode('main')}
            className="mb-8 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 self-start">
            ← 뒤로
          </button>

          <div className="mb-8 text-center">
            <div className="w-16 h-16 bg-nunu rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-white text-2xl font-semibold tracking-[-.374px]">N</span>
            </div>
            <h1 className="text-2xl font-bold text-nunu mb-1">누누아누</h1>
            <p className="text-gray-400 text-sm">전화번호로 간편하게 시작하세요</p>
          </div>

          <div className="flex flex-col gap-4">
            <Input
              label="전화번호"
              placeholder="010-0000-0000"
              value={phone}
              onChange={e => setPhone(formatDisplay(e.target.value))}
              type="tel"
              inputMode="numeric"
              maxLength={13}
            />
            <Button size="lg" onClick={handleSendOtp} loading={loading}>
              인증번호 받기
            </Button>
            <button onClick={() => setMode('main')}
              className="text-sm text-center text-gray-400 hover:text-gray-600 py-2">
              다른 방법으로 시작
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── OTP 입력 ─────────────────────────────
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 flex flex-col justify-center px-6 pb-10">
        <button onClick={() => { setMode('phone'); setOtp('') }}
          className="mb-8 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 self-start">
          ← 뒤로
        </button>

        <div className="mb-8 text-center">
          <p className="text-sm text-gray-600">{phone}으로</p>
          <p className="text-sm text-gray-600">인증번호 6자리를 보내드렸습니다</p>
        </div>
        <div className="flex flex-col gap-4">
          <Input
            label="인증번호"
            placeholder="000000"
            value={otp}
            onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            type="text"
            inputMode="numeric"
            maxLength={6}
          />
          <Button size="lg" onClick={handleVerifyOtp} loading={loading}>확인</Button>
        </div>
      </div>
    </div>
  )
}
