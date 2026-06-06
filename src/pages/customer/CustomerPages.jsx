import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, statusLabel, serviceLabel, SALON_PHONE } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Button, Badge, Card, EmptyState, LoadingSpinner } from '../../components/ui/index'
import { format, differenceInHours } from 'date-fns'
import { ko } from 'date-fns/locale'
import toast from 'react-hot-toast'

const statusColors = { pending: 'amber', confirmed: 'green', rejected: 'red', cancelled: 'gray' }

// ─────────────────────────────────────────
// 예약 카드 (공통)
// ─────────────────────────────────────────
export function BookingCard({ booking, onClick }) {
  const dateObj = new Date(booking.booking_date + 'T' + booking.start_time)
  return (
    <Card onClick={onClick} className="flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-gray-900">{serviceLabel[booking.service_type] || booking.service_type}</p>
          <p className="text-sm text-gray-500 mt-0.5">
            {format(dateObj, 'M월 d일 (E)', { locale: ko })} · {booking.start_time?.slice(0,5)} ~ {booking.end_time?.slice(0,5)}
          </p>
        </div>
        <Badge color={statusColors[booking.status]}>{statusLabel[booking.status]}</Badge>
      </div>
      {booking.service_detail && <p className="text-sm text-gray-400">{booking.service_detail}</p>}
    </Card>
  )
}

// ─────────────────────────────────────────
// 비로그인 고객: 내 예약 확인 (전화번호 조회)
// ─────────────────────────────────────────
export function GuestMyBookings() {
  const { guest } = useAuth()
  const navigate = useNavigate()

  // 2단계 인증 상태
  const [queryStep, setQueryStep] = useState('phone') // 'phone' | 'pin' | 'results'
  const [phone, setPhone] = useState('')
  const [pinInput, setPinInput] = useState('')
  const [foundCustomer, setFoundCustomer] = useState(null) // {id, name, pin}
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [pinError, setPinError] = useState(false)

  function formatPhone(raw) {
    const d = raw.replace(/\D/g, '').slice(0, 11)
    if (d.length <= 3) return d
    if (d.length <= 7) return `${d.slice(0,3)}-${d.slice(3)}`
    return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`
  }

  function normalizePhone(raw) {
    const d = raw.replace(/\D/g, '')
    return d.startsWith('0') ? '+82' + d.slice(1) : '+82' + d
  }

  // STEP 1: 전화번호로 고객 찾기
  async function findCustomer() {
    const p = normalizePhone(phone)
    setLoading(true)
    try {
      const { data: cust } = await supabase
        .from('customers').select('id, name, pin').eq('phone', p).maybeSingle()
      if (!cust) {
        toast.error('입력한 전화번호로 등록된 예약이 없습니다')
        return
      }
      setFoundCustomer(cust)
      setQueryStep('pin') // PIN 확인 단계로
    } catch {
      toast.error('조회에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  // STEP 2: PIN 검증 후 예약 목록 로드
  async function verifyPinAndLoad(enteredPin) {
    if (!foundCustomer) return
    setPinError(false)

    // PIN이 설정되어 있으면 검증
    if (foundCustomer.pin && enteredPin !== foundCustomer.pin) {
      setPinError(true)
      toast.error('비밀번호가 일치하지 않습니다')
      setPinInput('')
      return
    }

    // PIN 없는 고객(구버전)은 그냥 통과
    setLoading(true)
    try {
      const { data } = await supabase
        .from('bookings')
        .select('*, requested_staff:requested_staff_id(name, color, role)')
        .eq('customer_id', foundCustomer.id)
        .order('booking_date', { ascending: false })
        .limit(30)
      setBookings(data || [])
      setQueryStep('results')
    } catch {
      toast.error('예약 조회에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setQueryStep('phone')
    setPhone('')
    setPinInput('')
    setFoundCustomer(null)
    setBookings([])
    setPinError(false)
    setSelected(null)
  }

  async function cancelBooking(id) {
    const booking = bookings.find(b => b.id === id)
    if (!booking) return
    const bookingDateTime = new Date(`${booking.booking_date}T${booking.start_time}`)
    const diffHours = differenceInHours(bookingDateTime, new Date())
    if (diffHours < 24) {
      toast.error(`예약 24시간 이내는 직접 연락해 주세요\n📞 ${SALON_PHONE}`, { duration: 4000 })
      return
    }
    if (!window.confirm('예약을 취소하시겠습니까?')) return
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', id)
    if (!error) {
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'cancelled' } : b))
      setSelected(null)
      toast.success('예약이 취소되었습니다')
    }
  }

  // PIN 입력 처리 (자동 이동 + 4자리 완성 시 자동 검증)
  function handlePinChange(i, val) {
    const v = val.replace(/\D/g,'').slice(0,1)
    const arr = (pinInput + '    ').slice(0,4).split('')
    arr[i] = v
    const newPin = arr.join('').trimEnd()
    setPinInput(newPin)
    setPinError(false)
    if (v && i < 3) document.getElementById(`verify-pin-${i+1}`)?.focus()
    const full = arr.join('')
    if (full.replace(/ /g,'').length === 4 && full.trim().length === 4) {
      verifyPinAndLoad(full.trim())
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center gap-3 sticky top-0 z-30">
        <button onClick={() => queryStep === 'phone' ? navigate('/') : reset()}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors text-gray-600">
          ←
        </button>
        <p className="font-bold text-gray-900">내 예약 확인</p>
      </div>

      <div className="px-5 py-6 flex flex-col gap-5">

        {/* ── STEP 1: 전화번호 입력 ── */}
        {queryStep === 'phone' && (
          <div className="flex flex-col gap-4">
            <div className="text-center py-4">
              <span className="text-5xl">📱</span>
              <p className="font-bold text-lg text-gray-900 mt-3">예약 조회</p>
              <p className="text-sm text-gray-400 mt-1">예약 시 입력한 전화번호를 입력하세요</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-gray-700">전화번호</label>
                <input
                  type="tel" inputMode="numeric" maxLength={13}
                  value={phone} onChange={e => setPhone(formatPhone(e.target.value))}
                  onKeyDown={e => e.key === 'Enter' && phone.replace(/\D/g,'').length >= 10 && findCustomer()}
                  placeholder="010-0000-0000"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-nunu transition-colors"
                  autoFocus
                />
              </div>
              <button
                onClick={findCustomer}
                disabled={phone.replace(/\D/g,'').length < 10 || loading}
                className="w-full bg-nunu text-white py-4 rounded-2xl font-bold text-base disabled:opacity-40 transition-all hover:bg-nunu/90 active:scale-98"
              >
                {loading ? '확인 중...' : '다음'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: PIN 확인 ── */}
        {queryStep === 'pin' && (
          <div className="flex flex-col gap-4">
            <div className="text-center py-4">
              <span className="text-5xl">🔑</span>
              <p className="font-bold text-lg text-gray-900 mt-3">비밀번호 확인</p>
              <p className="text-sm text-gray-400 mt-1">
                예약 시 설정한 4자리 비밀번호를 입력하세요
              </p>
              {foundCustomer?.name && (
                <p className="text-nunu font-semibold text-sm mt-2">{foundCustomer.name}님</p>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col gap-5">
              {/* PIN 입력 */}
              <div className="flex gap-3 justify-center">
                {[0,1,2,3].map(i => (
                  <input
                    key={i}
                    id={`verify-pin-${i}`}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={pinInput[i] || ''}
                    onChange={e => handlePinChange(i, e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Backspace' && !pinInput[i] && i > 0) {
                        const arr = (pinInput + '    ').slice(0,4).split('')
                        arr[i-1] = ''
                        setPinInput(arr.join('').trimEnd())
                        document.getElementById(`verify-pin-${i-1}`)?.focus()
                      }
                    }}
                    className="w-16 h-16 text-center text-3xl font-bold border-2 rounded-2xl outline-none transition-all"
                    style={{
                      borderColor: pinError ? '#DC2626' : pinInput[i] ? '#1A1A2E' : '#e5e7eb',
                      background: pinError ? '#FEF2F2' : 'white'
                    }}
                    autoFocus={i === 0}
                  />
                ))}
              </div>
              {pinError && (
                <p className="text-red-500 text-sm font-semibold text-center">
                  ❌ 비밀번호가 일치하지 않습니다. 다시 입력해주세요.
                </p>
              )}
              {!foundCustomer?.pin && (
                <p className="text-amber-600 text-xs text-center bg-amber-50 rounded-xl py-2 px-3">
                  ⚠️ 비밀번호가 설정되지 않은 계정입니다. 아무 숫자나 4자리 입력 후 확인하세요.
                </p>
              )}
              <button
                onClick={() => verifyPinAndLoad(pinInput)}
                disabled={pinInput.replace(/ /g,'').length < 4 || loading}
                className="w-full bg-nunu text-white py-4 rounded-2xl font-bold text-base disabled:opacity-40 transition-all hover:bg-nunu/90"
              >
                {loading ? '확인 중...' : '예약 조회'}
              </button>
              <button onClick={reset} className="text-sm text-gray-400 hover:text-gray-600 text-center">
                다른 번호로 조회
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: 예약 목록 ── */}
        {queryStep === 'results' && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">
                {foundCustomer?.name}님의 예약 {bookings.length}건
              </p>
              <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 underline">
                다시 조회
              </button>
            </div>
            {loading ? (
              <LoadingSpinner />
            ) : bookings.length === 0 ? (
              <EmptyState icon="📋" title="예약 내역이 없습니다" description="아직 예약 내역이 없습니다" />
            ) : (
              <div className="flex flex-col gap-3">
                {bookings.map(b => (
                  <BookingCard key={b.id} booking={b} onClick={() => setSelected(b)} />
                ))}
              </div>
            )}
          </>
        )}

      </div>

      {/* 예약 상세 바텀시트 */}
      {selected && (() => {
        const bookingDateTime = new Date(`${selected.booking_date}T${selected.start_time}`)
        const diffHours = differenceInHours(bookingDateTime, new Date())
        const canCancel = ['pending', 'confirmed'].includes(selected.status) && diffHours >= 24

        return (
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/40" onClick={() => setSelected(null)} />
            <div className="relative bg-white rounded-t-3xl p-5 flex flex-col gap-4">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">{serviceLabel[selected.service_type]}</h3>
                <button onClick={() => setSelected(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500">✕</button>
              </div>
              <div className="flex flex-col gap-2.5 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">날짜</span><span className="font-medium">{selected.booking_date}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">시간</span><span className="font-medium">{selected.start_time?.slice(0,5)} ~ {selected.end_time?.slice(0,5)}</span></div>
                <div className="flex justify-between">
                  <span className="text-gray-500">상태</span>
                  <Badge color={statusColors[selected.status]}>{statusLabel[selected.status]}</Badge>
                </div>
                {selected.service_detail && <div className="flex justify-between"><span className="text-gray-500">시술 내용</span><span>{selected.service_detail}</span></div>}
                {selected.customer_memo && <div className="flex justify-between"><span className="text-gray-500">요청사항</span><span className="text-right max-w-[60%]">{selected.customer_memo}</span></div>}
                {selected.requested_staff && <div className="flex justify-between"><span className="text-gray-500">담당</span><span>{selected.requested_staff.name} {selected.requested_staff.title || ''}</span></div>}
              </div>
              {['pending', 'confirmed'].includes(selected.status) && diffHours < 24 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <p className="text-sm text-amber-800 font-medium">예약 24시간 이내입니다</p>
                  <a href={`tel:${SALON_PHONE}`} className="text-sm text-amber-700 font-bold underline mt-0.5 block">📞 {SALON_PHONE}</a>
                </div>
              )}
              {canCancel && (
                <Button variant="danger" onClick={() => cancelBooking(selected.id)}>예약 취소</Button>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
