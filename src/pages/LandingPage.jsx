import { useNavigate } from 'react-router-dom'
import logoImg from '/logo.jpg'

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto" style={{ backgroundColor: '#EEECEA' }}>

      {/* 로고 영역 */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 pt-16 pb-6">
        <img
          src={logoImg}
          alt="NUNU A NU"
          className="w-full max-w-xs object-contain mb-8"
          style={{ maxHeight: '260px' }}
        />

        {/* 주소 */}
        <p className="text-sm text-gray-500 tracking-wide text-center mb-16">
          청담동 86-6 BK청담빌딩 5층
        </p>

        {/* CTA 버튼 */}
        <div className="w-full flex flex-col gap-4">
          <button
            id="btn-start-booking"
            onClick={() => navigate('/booking')}
            className="w-full text-white rounded-2xl py-6 px-6 font-bold text-xl
              flex items-center justify-between shadow-xl active:scale-98 transition-all"
            style={{ backgroundColor: '#2B2B2B' }}
          >
            <span>예약 요청하기</span>
            <span className="text-2xl">✂️</span>
          </button>

          <button
            id="btn-my-bookings"
            onClick={() => navigate('/my')}
            className="w-full rounded-2xl py-6 px-6 font-bold text-xl
              flex items-center justify-between transition-all active:scale-98"
            style={{
              backgroundColor: 'transparent',
              border: '2px solid #2B2B2B',
              color: '#2B2B2B',
            }}
          >
            <span>내 예약 확인</span>
            <span className="text-2xl">📋</span>
          </button>
        </div>
      </div>

      {/* 하단 관리자 링크 */}
      <div className="pb-10 text-center px-6">
        <div className="pt-4">
          <a
            id="btn-admin-login"
            href="/admin.html"
            className="text-xs underline underline-offset-2 transition-colors"
            style={{ color: '#999' }}
          >
            관리자·스텝 로그인 →
          </a>
        </div>
      </div>
    </div>
  )
}
