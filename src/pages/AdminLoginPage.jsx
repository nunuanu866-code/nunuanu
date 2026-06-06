import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button, Input } from '../components/ui/index'
import toast from 'react-hot-toast'

export default function AdminLoginPage() {
  const [mode, setMode] = useState('login')   // 'login' | 'magic'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [magicSent, setMagicSent] = useState(false)
  const navigate = useNavigate()

  // ── 이메일 + 비밀번호 로그인 ───────────────
  async function handleLogin() {
    if (!email.trim()) { toast.error('이메일을 입력해주세요'); return }
    if (!password)     { toast.error('비밀번호를 입력해주세요'); return }

    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })
      if (error) throw error

      toast.success('로그인 중...')
      // AuthContext의 onAuthStateChange → loadStaffProfile → 권한 확인 후 리다이렉트
    } catch (e) {
      console.error('로그인 오류:', e)
      toast.error(e.message || '로그인에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  // ── 이메일 매직링크 (최초 계정 확인용) ───────
  async function handleMagicLink() {
    if (!email.trim()) { toast.error('이메일을 입력해주세요'); return }

    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          shouldCreateUser: false, // 기존 계정만 허용
          emailRedirectTo: window.location.origin + '/admin-login',
        }
      })
      if (error) throw error
      setMagicSent(true)
      toast.success('로그인 링크를 이메일로 보냈습니다')
    } catch (e) {
      toast.error(e.message || '이메일 발송에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleLogin()
  }

  return (
    <div className="min-h-screen bg-white flex flex-col max-w-md mx-auto">
      <div className="flex-1 flex flex-col justify-center px-6 pb-10">

        {/* 뒤로 가기 */}
        <button
          onClick={() => navigate('/')}
          className="mb-8 flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 self-start transition-colors"
        >
          ← 돌아가기
        </button>

        {/* 브랜드 */}
        <div className="mb-8 text-center">
          <div className="w-16 h-16 bg-nunu rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-md">
            <span className="text-gold text-2xl font-bold">N</span>
          </div>
          <h1 className="text-2xl font-bold text-nunu mb-1">관리자 · 스텝 로그인</h1>
          <p className="text-gray-400 text-sm">등록된 이메일 계정으로 접속하세요</p>
        </div>

        {/* 보안 배너 */}
        <div className="bg-nunu/5 border border-nunu/20 rounded-2xl px-4 py-3 mb-6 flex items-start gap-2">
          <span className="text-lg mt-0.5">🔒</span>
          <div>
            <p className="text-xs font-semibold text-nunu">살롱 관계자 전용</p>
            <p className="text-xs text-gray-500 mt-0.5">
              한 번 로그인하면 <span className="font-medium text-gray-700">자동으로 로그인이 유지</span>됩니다
            </p>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
          <button
            onClick={() => { setMode('login'); setMagicSent(false) }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all
              ${mode === 'login' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            이메일 로그인
          </button>
          <button
            onClick={() => { setMode('magic'); setMagicSent(false) }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all
              ${mode === 'magic' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            링크로 로그인
          </button>
        </div>

        {/* ── 이메일 + 비밀번호 ────────────── */}
        {mode === 'login' && (
          <div className="flex flex-col gap-4">
            <Input
              id="input-email"
              label="이메일"
              placeholder="admin@nununanu.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              type="email"
              inputMode="email"
              onKeyDown={handleKeyDown}
            />
            <div className="relative">
              <Input
                id="input-password"
                label="비밀번호"
                placeholder="비밀번호 입력"
                value={password}
                onChange={e => setPassword(e.target.value)}
                type={showPw ? 'text' : 'password'}
                onKeyDown={handleKeyDown}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-4 bottom-3 text-xs text-gray-400 hover:text-gray-600"
              >
                {showPw ? '숨기기' : '보기'}
              </button>
            </div>

            <Button
              id="btn-login"
              size="lg"
              onClick={handleLogin}
              loading={loading}
            >
              로그인
            </Button>

            <button
              onClick={() => { setMode('magic'); setMagicSent(false) }}
              className="text-sm text-center text-gray-400 hover:text-gray-600 py-1 transition-colors"
            >
              비밀번호를 잊으셨나요? → 링크로 로그인
            </button>
          </div>
        )}

        {/* ── 이메일 매직링크 ───────────────── */}
        {mode === 'magic' && !magicSent && (
          <div className="flex flex-col gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
              이메일로 로그인 링크를 보내드립니다.<br />
              링크를 클릭하면 바로 접속됩니다.
            </div>
            <Input
              id="input-magic-email"
              label="이메일"
              placeholder="admin@nununanu.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              type="email"
              inputMode="email"
            />
            <Button
              id="btn-magic-link"
              size="lg"
              onClick={handleMagicLink}
              loading={loading}
            >
              로그인 링크 받기
            </Button>
          </div>
        )}

        {/* ── 매직링크 발송 완료 ────────────── */}
        {mode === 'magic' && magicSent && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-3xl">📧</span>
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-900">이메일을 확인하세요</p>
              <p className="text-sm text-gray-500 mt-1">
                <span className="font-medium text-nunu">{email}</span>로<br />
                로그인 링크를 발송했습니다
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-3 w-full text-sm text-gray-600">
              <p className="font-medium mb-1">📌 안내</p>
              <ul className="list-disc list-inside text-xs text-gray-500 space-y-1">
                <li>링크는 발송 후 1시간 동안 유효합니다</li>
                <li>클릭하면 자동으로 로그인됩니다</li>
                <li>이메일이 오지 않으면 스팸함을 확인해주세요</li>
              </ul>
            </div>
            <button
              onClick={() => { setMagicSent(false); setEmail('') }}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              이메일 다시 입력
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
