import { useNavigate } from 'react-router-dom'
import mainUiImage from '../../예약 앱 메인3.jpg'

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#efeee9]">
      <section className="flex min-h-screen items-start justify-center overflow-x-hidden bg-[#efeee9]">
        <div
          className="relative w-screen overflow-hidden bg-[#efeee9]"
          style={{
            aspectRatio: '1292 / 2796',
            width: '100vw',
          }}
        >
        <img
          src={mainUiImage}
          alt="NUNU A NU reservation home"
          className="absolute inset-0 h-full w-full select-none object-fill object-center"
          draggable={false}
        />

        <h1 className="sr-only">누누아누 예약</h1>
        <p className="sr-only">
          서울특별시 강남구 선릉로152길 6 BK청담빌딩 5층, 지번 청담동 86-6
        </p>

        <button
          id="btn-start-booking"
          type="button"
          aria-label="예약 요청 하기"
          onClick={() => navigate('/booking')}
          className="landing-hit absolute rounded-[44px] focus-visible:outline focus-visible:outline-4 focus-visible:outline-black/70"
          style={{
            left: '26.1%',
            top: '54.5%',
            width: '47.9%',
            height: '5.4%',
            '--landing-press': 'rgba(255,255,255,.26)',
          }}
        >
          <span className="sr-only">예약 요청 하기</span>
        </button>

        <button
          id="btn-my-bookings"
          type="button"
          aria-label="내 예약 확인"
          onClick={() => navigate('/my')}
          className="landing-hit absolute rounded-[44px] focus-visible:outline focus-visible:outline-4 focus-visible:outline-black/70"
          style={{
            left: '26.1%',
            top: '62.1%',
            width: '47.9%',
            height: '5.4%',
            '--landing-press': 'rgba(74,31,12,.14)',
          }}
        >
          <span className="sr-only">내 예약 확인</span>
        </button>

        <a
          id="btn-admin-login"
          href="/admin.html"
          aria-label="관리자 페이지"
          className="landing-hit absolute rounded-full focus-visible:outline focus-visible:outline-4 focus-visible:outline-black/70"
          style={{
            left: '38.9%',
            top: '84.7%',
            width: '22.1%',
            height: '4.7%',
            '--landing-press': 'rgba(0,0,0,.10)',
          }}
        >
          <span className="sr-only">관리자 페이지</span>
        </a>
        </div>
      </section>
    </main>
  )
}
