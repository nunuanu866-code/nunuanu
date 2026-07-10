import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, statusLabel, serviceLabel, SALON_PHONE } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Button, Badge, Card, EmptyState, LoadingSpinner } from '../../components/ui/index'
import { format, differenceInHours } from 'date-fns'
import { ko } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { adminDeletedOf, cancelRequestOf, plainBookingMemo, withCancelRequest } from '../../lib/bookingMeta'
import { createAppNotification } from '../../lib/notifications'
import { disableCustomerPush, enableCustomerPush, getCustomerPushDevice } from '../../lib/customerPush'

const statusColors = { pending: 'amber', confirmed: 'green', rejected: 'red', cancelled: 'gray', cancel_requested: 'amber' }

// ─────────────────────────────────────────
// 예약 카드 (공통)
// ─────────────────────────────────────────
export function BookingCard({ booking, onClick }) {
  const dateObj = new Date(booking.booking_date + 'T' + booking.start_time)
  const cancelRequest = cancelRequestOf(booking)
  const memo = plainBookingMemo(booking)
  return (
    <Card onClick={onClick} className="flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-gray-900">{serviceLabel[booking.service_type] || booking.service_type}</p>
          <p className="text-sm text-gray-500 mt-0.5">
            {format(dateObj, 'M월 d일 (E)', { locale: ko })} · {booking.start_time?.slice(0,5)} ~ {booking.end_time?.slice(0,5)}
          </p>
        </div>
        <Badge color={statusColors[cancelRequest ? 'cancel_requested' : booking.status]}>
          {cancelRequest ? '취소 요청중' : statusLabel[booking.status]}
        </Badge>
      </div>
      {booking.service_detail && <p className="text-sm text-gray-400">{booking.service_detail}</p>}
      {memo && <p className="text-sm text-gray-400">{memo}</p>}
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
  const [selectedMonth, setSelectedMonth] = useState('')
  const [pushBusy, setPushBusy] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const seenBookingStateRef = useRef(new Map())
  const didInitBookingStateRef = useRef(false)

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

  useEffect(() => {
    setPushEnabled(!!getCustomerPushDevice(phone))
  }, [phone, queryStep])

  async function toggleReservationPush() {
    if (pushBusy) return
    setPushBusy(true)
    try {
      if (pushEnabled) {
        await disableCustomerPush(phone)
        setPushEnabled(false)
        toast.success('예약 알림이 꺼졌습니다')
      } else {
        await enableCustomerPush(phone)
        setPushEnabled(true)
        toast.success('예약 확정/거절 알림이 켜졌습니다')
      }
    } catch (error) {
      toast.error(error?.message || '알림 설정에 실패했습니다')
    } finally {
      setPushBusy(false)
    }
  }

  function monthKey(date) {
    return String(date || '').slice(0, 7)
  }

  function monthLabel(key) {
    if (!key || key === 'all') return '전체'
    const [year, month] = key.split('-')
    return `${year}년 ${Number(month)}월`
  }

  async function loadBookingsForCustomer(customerId, showLoading = false) {
    if (!customerId) return false
    if (showLoading) setLoading(true)
    try {
      const { data } = await supabase
        .from('bookings')
        .select('*, requested_staff:requested_staff_id(name, color, role)')
        .eq('customer_id', customerId)
        .order('booking_date', { ascending: false })
        .limit(500)
      const rows = (data || []).filter(b => !adminDeletedOf(b))
      if (queryStep === 'results') {
        const nextState = new Map()
        rows.forEach(b => {
          const state = `${b.status}:${cancelRequestOf(b)?.status || ''}`
          nextState.set(b.id, state)
          const prev = seenBookingStateRef.current.get(b.id)
          if (didInitBookingStateRef.current && prev && prev !== state) {
            if (b.status === 'confirmed') toast.success('예약이 확정되었습니다')
            if (b.status === 'cancelled') toast.success('취소가 확정되었습니다')
          }
        })
        seenBookingStateRef.current = nextState
        didInitBookingStateRef.current = true
      }
      setBookings(rows)
      setSelectedMonth(prev => {
        const months = [...new Set(rows.map(b => monthKey(b.booking_date)).filter(Boolean))]
        if (!months.length) return ''
        return prev && (prev === 'all' || months.includes(prev)) ? prev : months[0]
      })
      setSelected(prev => prev ? rows.find(b => b.id === prev.id) || null : prev)
      return true
    } catch {
      if (showLoading) toast.error('예약 조회에 실패했습니다')
      return false
    } finally {
      if (showLoading) setLoading(false)
    }
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
    const ok = await loadBookingsForCustomer(foundCustomer.id, true)
    if (ok) {
      setQueryStep('results')
    }
  }

  useEffect(() => {
    if (queryStep !== 'results' || !foundCustomer?.id) return
    const reload = () => loadBookingsForCustomer(foundCustomer.id, false)
    const channel = supabase
      .channel(`guest-my-bookings-live-${foundCustomer.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `customer_id=eq.${foundCustomer.id}` }, reload)
      .subscribe()
    const timer = setInterval(reload, 5000)
    return () => {
      clearInterval(timer)
      supabase.removeChannel(channel)
    }
  }, [queryStep, foundCustomer?.id])

  function reset() {
    setQueryStep('phone')
    setPhone('')
    setPinInput('')
    setFoundCustomer(null)
    setBookings([])
    setSelectedMonth('')
    setPinError(false)
    setSelected(null)
    seenBookingStateRef.current = new Map()
    didInitBookingStateRef.current = false
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
    if (booking.status === 'confirmed') {
      if (cancelRequestOf(booking)) {
        toast('이미 취소 요청이 접수되었습니다')
        return
      }
      if (!window.confirm('관리자에게 취소 요청을 보내시겠습니까?')) return
      const nextMemo = withCancelRequest(booking.customer_memo, {
        requested_by: 'customer',
        phone: normalizePhone(phone),
      })
      const { error } = await supabase
        .from('bookings')
        .update({ customer_memo: nextMemo })
        .eq('id', id)
      if (!error) {
        await createAppNotification({
          bookingId: id,
          phone: normalizePhone(phone),
          type: 'booking_cancel_requested',
        })
        const updated = { ...booking, customer_memo: nextMemo }
        setBookings(prev => prev.map(b => b.id === id ? updated : b))
        setSelected(updated)
        toast.success('취소 요청이 관리자에게 전송되었습니다')
      } else {
        toast.error('취소 요청에 실패했습니다. 다시 시도해주세요')
      }
      return
    }

    if (!window.confirm('예약 요청을 취소하시겠습니까?')) return
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', id)
    if (!error) {
      await createAppNotification({
        bookingId: id,
        phone: normalizePhone(phone),
        type: 'booking_cancelled',
      })
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'cancelled' } : b))
      setSelected(null)
      toast.success('예약 요청이 취소되었습니다')
    } else {
      toast.error('취소에 실패했습니다. 다시 시도해주세요')
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

  const monthOptions = useMemo(() => {
    return [...new Set(bookings.map(b => monthKey(b.booking_date)).filter(Boolean))]
  }, [bookings])

  const filteredBookings = useMemo(() => {
    if (!selectedMonth || selectedMonth === 'all') return bookings
    return bookings.filter(b => monthKey(b.booking_date) === selectedMonth)
  }, [bookings, selectedMonth])

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
                      borderColor: pinError ? '#DC2626' : pinInput[i] ? '#0066cc' : '#e0e0e0',
                      background: pinError ? '#FEF2F2' : pinInput[i] ? '#f5f5f7' : 'white'
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
            <button
              type="button"
              onClick={toggleReservationPush}
              disabled={pushBusy}
              className={`w-full rounded-2xl py-3 font-bold text-sm transition-all ${
                pushEnabled
                  ? 'bg-white text-gray-700 border border-gray-300 active:bg-gray-50'
                  : 'bg-gray-900 text-white active:scale-98 shadow-sm shadow-gray-900/10'
              } disabled:opacity-80`}
            >
              {pushBusy ? (pushEnabled ? '알림 끄는 중...' : '알림 설정 중...') : pushEnabled ? '예약 알림 끄기' : '예약 확정/거절 알림 켜기'}
            </button>
            {loading ? (
              <LoadingSpinner />
            ) : bookings.length === 0 ? (
              <EmptyState icon="📋" title="예약 내역이 없습니다" description="아직 예약 내역이 없습니다" />
            ) : (
              <div className="flex flex-col gap-3">
                <div className="bg-white border border-gray-100 rounded-2xl p-3 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-500">월별 보기</p>
                    <p className="text-xs text-gray-400">
                      {selectedMonth && selectedMonth !== 'all'
                        ? `${monthLabel(selectedMonth)} ${filteredBookings.length}건`
                        : `전체 ${filteredBookings.length}건`}
                    </p>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1">
                    <button
                      type="button"
                      onClick={() => setSelectedMonth('all')}
                      className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                        selectedMonth === 'all'
                          ? 'bg-nunu text-white border-nunu'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      전체
                    </button>
                    {monthOptions.map(month => (
                      <button
                        key={month}
                        type="button"
                        onClick={() => setSelectedMonth(month)}
                        className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                          selectedMonth === month
                            ? 'bg-nunu text-white border-nunu'
                            : 'bg-white text-gray-600 border-gray-200'
                        }`}
                      >
                        {monthLabel(month)}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredBookings.length === 0 ? (
                  <EmptyState icon="📋" title="해당 월 예약 내역이 없습니다" description="다른 월을 선택해 주세요" />
                ) : (
                  filteredBookings.map(b => (
                    <BookingCard key={b.id} booking={b} onClick={() => setSelected(b)} />
                  ))
                )}
              </div>
            )}
          </>
        )}

      </div>

      {/* 예약 상세 바텀시트 */}
      {selected && (() => {
        const bookingDateTime = new Date(`${selected.booking_date}T${selected.start_time}`)
        const diffHours = differenceInHours(bookingDateTime, new Date())
        const cancelRequest = cancelRequestOf(selected)
        const selectedMemo = plainBookingMemo(selected)
        const canCancel = ['pending', 'confirmed'].includes(selected.status) && !cancelRequest && diffHours >= 24

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
                  <Badge color={statusColors[cancelRequest ? 'cancel_requested' : selected.status]}>
                    {cancelRequest ? '취소 요청중' : statusLabel[selected.status]}
                  </Badge>
                </div>
                {selected.service_detail && <div className="flex justify-between"><span className="text-gray-500">시술 내용</span><span>{selected.service_detail}</span></div>}
                {selectedMemo && <div className="flex justify-between"><span className="text-gray-500">요청사항</span><span className="text-right max-w-[60%]">{selectedMemo}</span></div>}
                {selected.requested_staff && <div className="flex justify-between"><span className="text-gray-500">담당</span><span>{selected.requested_staff.name} {selected.requested_staff.title || ''}</span></div>}
              </div>
              {cancelRequest && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <p className="text-sm text-amber-800 font-medium">관리자 취소 승인 대기 중입니다</p>
                  <p className="text-xs text-amber-700 mt-1">승인되면 예약 상태가 취소로 변경됩니다.</p>
                </div>
              )}
              {['pending', 'confirmed'].includes(selected.status) && diffHours < 24 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <p className="text-sm text-amber-800 font-medium">예약 24시간 이내입니다</p>
                  <a href={`tel:${SALON_PHONE}`} className="text-sm text-amber-700 font-bold underline mt-0.5 block">📞 {SALON_PHONE}</a>
                </div>
              )}
              {canCancel && (
                <Button variant="danger" onClick={() => cancelBooking(selected.id)}>
                  {selected.status === 'confirmed' ? '취소 요청' : '예약 요청 취소'}
                </Button>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
