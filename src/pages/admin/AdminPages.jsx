import { useState, useEffect } from 'react'
import { supabase, statusLabel, serviceLabel } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Button, Badge, Card, EmptyState, LoadingSpinner } from '../../components/ui/index'
import { format, addDays, subDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import toast from 'react-hot-toast'

// ─────────────────────────────────────────
// 관리자 예약 요청 수신함
// ─────────────────────────────────────────
export function AdminInbox() {
  const { canEdit } = useAuth()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [staffList, setStaffList] = useState([])
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    loadBookings()
    supabase.from('staff').select('*').then(({ data }) => setStaffList(data || []))

    // 실시간 구독
    const channel = supabase.channel('bookings_inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => loadBookings())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function loadBookings() {
    const { data } = await supabase
      .from('bookings')
      .select('*, customers(name, phone)')
      .in('status', ['pending', 'confirmed'])
      .order('status', { ascending: true }) // pending 먼저
      .order('booking_date', { ascending: true })
      .order('start_time', { ascending: true })
    setBookings(data || [])
    setLoading(false)
  }

  async function confirm(booking, adjustedTime = null, assignedStaffId = null) {
    setProcessing(true)
    try {
      const updates = {
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        assigned_staff: assignedStaffId ? [{ staff_id: assignedStaffId }] : booking.assigned_staff
      }
      if (adjustedTime) {
        updates.start_time = adjustedTime.start
        updates.end_time = adjustedTime.end
      }
      const { error } = await supabase.from('bookings').update(updates).eq('id', booking.id)
      if (error) throw error
      toast.success('예약이 확정되었습니다')
      setSelected(null)
      loadBookings()
    } catch (e) {
      toast.error('처리에 실패했습니다')
    } finally {
      setProcessing(false)
    }
  }

  async function reject(booking, reason = '') {
    setProcessing(true)
    try {
      const { error } = await supabase.from('bookings').update({
        status: 'rejected', reject_reason: reason
      }).eq('id', booking.id)
      if (error) throw error
      toast.success('예약을 거절했습니다')
      setSelected(null)
      loadBookings()
    } catch (e) {
      toast.error('처리에 실패했습니다')
    } finally {
      setProcessing(false)
    }
  }

  const pending = bookings.filter(b => b.status === 'pending')
  const confirmed = bookings.filter(b => b.status === 'confirmed')

  if (loading) return <LoadingSpinner />

  return (
    <div className="px-5 py-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">예약 요청함</h2>
        {pending.length > 0 && (
          <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">{pending.length}건 대기</span>
        )}
      </div>

      {/* 미처리 요청 */}
      {pending.length > 0 && (
        <div>
          <p className="text-sm font-medium text-amber-700 mb-2">⏳ 확인 필요</p>
          <div className="flex flex-col gap-2">
            {pending.map(b => <AdminBookingCard key={b.id} booking={b} onClick={() => setSelected(b)} />)}
          </div>
        </div>
      )}

      {/* 확정된 예약 */}
      {confirmed.length > 0 && (
        <div>
          <p className="text-sm font-medium text-green-700 mb-2">✅ 확정됨</p>
          <div className="flex flex-col gap-2">
            {confirmed.map(b => <AdminBookingCard key={b.id} booking={b} onClick={() => setSelected(b)} />)}
          </div>
        </div>
      )}

      {bookings.length === 0 && <EmptyState icon="✅" title="처리할 예약이 없습니다" />}

      {/* 수정 권한 없음 배너 */}
      {!canEdit && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <span className="text-amber-600">👁</span>
          <p className="text-sm text-amber-800 font-medium">조회 전용 권한입니다. 예약 확정·거절은 수정 권한이 필요합니다.</p>
        </div>
      )}

      {/* 상세 & 처리 패널 */}
      {selected && (
        <AdminBookingDetail
          booking={selected}
          staffList={staffList}
          onConfirm={canEdit ? confirm : null}
          onReject={canEdit ? reject : null}
          onClose={() => setSelected(null)}
          processing={processing}
          readOnly={!canEdit}
        />
      )}
    </div>
  )
}

function AdminBookingCard({ booking, onClick }) {
  const isPending = booking.status === 'pending'
  return (
    <Card onClick={onClick} className={`flex flex-col gap-2 ${isPending ? 'border-amber-200 bg-amber-50/30' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-gray-900">{booking.customers?.name}</p>
          <p className="text-xs text-gray-400">{booking.customers?.phone}</p>
        </div>
        <Badge color={isPending ? 'amber' : 'green'}>{statusLabel[booking.status]}</Badge>
      </div>
      <div className="text-sm text-gray-600">
        {booking.booking_date} · {booking.start_time?.slice(0,5)} ~ {booking.end_time?.slice(0,5)}
      </div>
      <div className="text-sm text-gray-500">{serviceLabel[booking.service_type]}</div>
    </Card>
  )
}

function AdminBookingDetail({ booking, staffList, onConfirm, onReject, onClose, processing, readOnly = false }) {
  const [assignedStaffId, setAssignedStaffId] = useState(booking.requested_staff_id || '')
  const [startTime, setStartTime] = useState(booking.start_time?.slice(0,5) || '')
  const [endTime, setEndTime] = useState(booking.end_time?.slice(0,5) || '')
  const [rejectReason, setRejectReason] = useState('')
  const [altDate, setAltDate] = useState('')
  const [altTime, setAltTime] = useState('')
  const [showReject, setShowReject] = useState(false)

  const relevantStaff = staffList.filter(s =>
    booking.service_type === 'both' ? true :
    booking.service_type === 'hair' ? s.role === 'hair' : s.role === 'makeup'
  )

  function buildRejectReason() {
    let reason = rejectReason
    if (altDate || altTime) {
      reason += `\n대안 제안: ${altDate || booking.booking_date} ${altTime || ''}`
    }
    return reason
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl p-5 flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto -mt-1 mb-1" />
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">{booking.customers?.name} 고객</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500">✕</button>
        </div>

        {/* 예약 정보 */}
        <div className="bg-gray-50 rounded-xl p-4 text-sm flex flex-col gap-2">
          <div className="flex justify-between"><span className="text-gray-500">날짜</span><span className="font-medium">{booking.booking_date}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">시간</span><span className="font-medium">{booking.start_time?.slice(0,5)} ~ {booking.end_time?.slice(0,5)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">시술</span><span className="font-medium">{serviceLabel[booking.service_type]}</span></div>
          {booking.service_detail && <div className="flex justify-between"><span className="text-gray-500">내용</span><span>{booking.service_detail}</span></div>}
          {booking.customer_memo && <div className="flex justify-between"><span className="text-gray-500">요청사항</span><span className="text-right max-w-[60%]">{booking.customer_memo}</span></div>}
          {booking.requested_staff_id && <div className="flex justify-between"><span className="text-gray-500">희망 스텝</span><span>{staffList.find(s=>s.id===booking.requested_staff_id)?.name || '미지정'}</span></div>}
        </div>

        {!showReject ? (
          <>
            {/* 시간 조정 */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">시간 조정</p>
              <div className="flex gap-3">
                <div className="flex-1">
                  <p className="text-xs text-gray-400 mb-1">시작</p>
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-nunu" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-400 mb-1">종료</p>
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-nunu" />
                </div>
              </div>
            </div>

            {/* 스텝 배정 */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">담당 스텝 배정</p>
              <div className="flex flex-col gap-2">
                <button onClick={() => setAssignedStaffId('')}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-sm transition-colors
                    ${!assignedStaffId ? 'border-nunu bg-nunu/5 font-medium text-nunu' : 'border-gray-200 text-gray-700'}`}>
                  🎲 랜덤 배정
                </button>
                {relevantStaff.map(s => (
                  <button key={s.id} onClick={() => setAssignedStaffId(s.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-sm transition-colors
                      ${assignedStaffId === s.id ? 'border-nunu bg-nunu/5 font-medium' : 'border-gray-200 text-gray-700'}`}>
                    <div className="w-7 h-7 rounded-full text-white text-xs flex items-center justify-center font-bold"
                      style={{backgroundColor: s.color}}>{s.name[0]}</div>
                    <span className={assignedStaffId === s.id ? 'text-nunu' : ''}>{s.name} {s.title}</span>
                    {assignedStaffId === s.id && <span className="ml-auto text-nunu">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* 액션 버튼 */}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowReject(true)}>거절</Button>
              <Button variant="gold" className="flex-1" loading={processing}
                onClick={() => onConfirm(
                  booking,
                  startTime !== booking.start_time?.slice(0,5) ? {start: startTime, end: endTime} : null,
                  assignedStaffId || null
                )}>
                확정
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* 거절 사유 */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">거절 사유 선택</p>
              <div className="flex flex-col gap-2">
                {['해당 시간 마감', '스텝 부재', '기타'].map(r => (
                  <button key={r} onClick={() => setRejectReason(r)}
                    className={`py-3 px-4 rounded-xl border text-sm font-medium transition-colors text-left
                      ${rejectReason === r ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                    {rejectReason === r ? '✓ ' : ''}{r}
                  </button>
                ))}
              </div>
            </div>

            {/* 대안 시간 제안 (선택) */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1">대안 시간 제안 <span className="text-gray-400 font-normal">(선택)</span></p>
              <p className="text-xs text-gray-400 mb-2">대안을 제안하면 고객에게 함께 안내됩니다</p>
              <div className="flex gap-2">
                <input type="date" value={altDate} onChange={e => setAltDate(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-nunu" />
                <input type="time" value={altTime} onChange={e => setAltTime(e.target.value)}
                  className="w-28 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-nunu" />
              </div>
            </div>

            {/* 거절 액션 버튼 */}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowReject(false)}>취소</Button>
              <Button variant="danger" className="flex-1" loading={processing} disabled={!rejectReason}
                onClick={() => onReject(booking, buildRejectReason())}>
                거절 확정
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}


// ─────────────────────────────────────────
// 관리자 데일리 타임라인 (04:00 ~ 22:00, 10분 단위)
// ─────────────────────────────────────────
export function AdminSchedule() {
  const { canEdit } = useAuth()
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [bookings, setBookings] = useState([])
  const [staffList, setStaffList] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editMemo, setEditMemo] = useState('')
  const [saving, setSaving] = useState(false)

  const OPEN = 4
  const CLOSE = 22
  const SLOT_MIN = 10
  const TOTAL_MINS = (CLOSE - OPEN) * 60  // 1080분
  const PX_PER_MIN = 2.5
  const LANE_W = 100  // 스텝 컬럼 너비(px)

  useEffect(() => {
    supabase.from('staff').select('*').eq('is_active', true)
      .then(({ data }) => setStaffList(data || []))
  }, [])

  useEffect(() => {
    setLoading(true)
    supabase.from('bookings')
      .select('*, customers(name, phone), requested_staff:requested_staff_id(name, color)')
      .eq('booking_date', date)
      .in('status', ['pending', 'confirmed'])
      .then(({ data }) => { setBookings(data || []); setLoading(false) })
  }, [date])

  function timeToRelMin(t) {
    const [h, m] = (t || '04:00').split(':').map(Number)
    return (h - OPEN) * 60 + m
  }

  // 동시 2명 초과 감지
  const slotCount = {}
  bookings.forEach(b => {
    const [sh, sm] = b.start_time.split(':').map(Number)
    const [eh, em] = b.end_time.split(':').map(Number)
    for (let m = sh * 60 + sm; m < eh * 60 + em; m += SLOT_MIN) {
      slotCount[m] = (slotCount[m] || 0) + 1
    }
  })
  const overloaded = Object.entries(slotCount).filter(([, c]) => c > 2).map(([m]) => parseInt(m))

  // 시간 tick 목록
  const ticks = []
  for (let h = OPEN; h <= CLOSE; h++) {
    for (let m = 0; m < 60; m += SLOT_MIN) {
      if (h === CLOSE && m > 0) break
      ticks.push({ absMin: h * 60 + m, relMin: (h - OPEN) * 60 + m, h, m })
    }
  }

  function openDetail(b) {
    setSelected(b)
    setEditMode(false)
    setEditStart(b.start_time?.slice(0, 5) || '')
    setEditEnd(b.end_time?.slice(0, 5) || '')
    setEditMemo(b.admin_memo || '')
  }

  async function saveEdit() {
    if (!selected) return
    setSaving(true)
    try {
      const { error } = await supabase.from('bookings').update({
        start_time: editStart,
        end_time: editEnd,
        admin_memo: editMemo,
      }).eq('id', selected.id)
      if (error) throw error
      toast.success('예약이 수정됐습니다')
      setSelected(null)
      setEditMode(false)
      // 목록 새로고침
      const { data } = await supabase.from('bookings')
        .select('*, customers(name, phone), requested_staff:requested_staff_id(name, color)')
        .eq('booking_date', date)
        .in('status', ['pending', 'confirmed'])
      setBookings(data || [])
    } catch {
      toast.error('수정에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  const totalW = staffList.length * LANE_W + 56

  return (
    <div className="flex flex-col bg-gray-50 min-h-screen">
      {/* 날짜 네비게이션 */}
      <div className="px-4 py-3 bg-white border-b border-gray-100 flex items-center justify-between sticky top-0 z-30">
        <button onClick={() => setDate(format(subDays(new Date(date), 1), 'yyyy-MM-dd'))}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors">←</button>
        <div className="text-center">
          <p className="font-semibold text-gray-900">{format(new Date(date), 'M월 d일 (E)', { locale: ko })}</p>
          <div className="flex items-center justify-center gap-2 mt-0.5">
            <p className="text-xs text-gray-400">{bookings.length}건</p>
            {!canEdit && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">조회 전용</span>}
          </div>
        </div>
        <button onClick={() => setDate(format(addDays(new Date(date), 1), 'yyyy-MM-dd'))}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors">→</button>
      </div>

      {/* 범례 + 오늘 이동 */}
      <div className="flex items-center px-4 py-2 bg-white border-b border-gray-50 gap-3">
        <button onClick={() => setDate(format(new Date(), 'yyyy-MM-dd'))}
          className="text-xs text-nunu font-semibold hover:underline">오늘</button>
        <div className="flex items-center gap-3 ml-auto text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block"/>대기</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block"/>확정</span>
          {overloaded.length > 0 && (
            <span className="flex items-center gap-1 text-red-500 font-medium">
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block"/>2명 초과!
            </span>
          )}
        </div>
      </div>

      {loading ? <LoadingSpinner /> : (
        /* 타임라인 — 가로 스크롤 */
        <div className="overflow-x-auto">
          <div style={{ minWidth: totalW }}>

            {/* 스텝 헤더 행 */}
            <div className="flex bg-white border-b border-gray-200 sticky top-[97px] z-20">
              <div className="flex-shrink-0 bg-white" style={{ width: 56 }} />
              {staffList.map(s => (
                <div key={s.id}
                  className="flex items-center justify-center gap-1.5 px-2 py-2 border-l border-gray-100"
                  style={{ width: LANE_W, minWidth: LANE_W }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                    style={{ backgroundColor: s.color }}>{s.name[0]}</div>
                  <div>
                    <p className="text-[11px] font-semibold text-gray-800 leading-none">{s.name}</p>
                    <p className="text-[9px] text-gray-400 leading-none mt-0.5">{s.role === 'hair' ? '✂️헤어' : '💄메이크업'}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* 타임라인 바디 */}
            <div className="flex" style={{ height: TOTAL_MINS * PX_PER_MIN }}>

              {/* 시간 라벨 컬럼 */}
              <div className="flex-shrink-0 bg-white border-r border-gray-200 relative" style={{ width: 56 }}>
                {ticks.map(({ relMin, h, m }) => {
                  const isHour = m === 0
                  const isHalf = m === 30
                  if (!isHour && !isHalf) return null
                  return (
                    <div key={relMin} className="absolute left-0 right-0 flex items-center"
                      style={{ top: relMin * PX_PER_MIN }}>
                      <div className={`bg-gray-300 flex-shrink-0 ${isHour ? 'w-3 h-px' : 'w-2 h-px opacity-50'}`} />
                      {isHour && (
                        <span className="text-[10px] text-gray-500 font-medium ml-1 leading-none whitespace-nowrap">
                          {String(h).padStart(2, '0')}:00
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* 스텝별 컬럼 */}
              {staffList.map(staff => {
                const staffBookings = bookings.filter(b =>
                  (b.assigned_staff && Array.isArray(b.assigned_staff) && b.assigned_staff.some(a => a.staff_id === staff.id)) ||
                  b.requested_staff_id === staff.id
                )
                return (
                  <div key={staff.id}
                    className="relative border-l border-gray-100 bg-white"
                    style={{ width: LANE_W, minWidth: LANE_W, height: TOTAL_MINS * PX_PER_MIN }}>

                    {/* 격자선 */}
                    {ticks.map(({ relMin, m }) => (
                      <div key={relMin}
                        className={`absolute left-0 right-0 border-t pointer-events-none
                          ${m === 0 ? 'border-gray-200' : m === 30 ? 'border-gray-100' : 'border-gray-50'}`}
                        style={{ top: relMin * PX_PER_MIN }} />
                    ))}

                    {/* 동시 2명 초과 경고 */}
                    {overloaded.map(absMin => {
                      const relMin = absMin - OPEN * 60
                      if (relMin < 0 || relMin >= TOTAL_MINS) return null
                      return (
                        <div key={absMin}
                          className="absolute left-0 right-0 pointer-events-none"
                          style={{
                            top: relMin * PX_PER_MIN,
                            height: SLOT_MIN * PX_PER_MIN,
                            backgroundColor: 'rgba(239,68,68,0.12)',
                            borderLeft: '2px solid rgba(239,68,68,0.5)',
                          }} />
                      )
                    })}

                    {/* 예약 블록 */}
                    {staffBookings.map(b => {
                      const topMin = timeToRelMin(b.start_time)
                      const [sh, sm] = b.start_time.split(':').map(Number)
                      const [eh, em] = b.end_time.split(':').map(Number)
                      const durMin = (eh * 60 + em) - (sh * 60 + sm)
                      const blockH = Math.max(durMin * PX_PER_MIN, 22)
                      const isPending = b.status === 'pending'
                      return (
                        <button key={b.id} onClick={() => openDetail(b)}
                          className="absolute left-1 right-1 rounded-lg px-1.5 py-1 text-left overflow-hidden hover:brightness-95 transition-all active:scale-95"
                          style={{
                            top: topMin * PX_PER_MIN,
                            height: blockH,
                            backgroundColor: staff.color + (isPending ? '28' : '40'),
                            borderLeft: `3px solid ${staff.color}`,
                            border: isPending ? `1px dashed ${staff.color}88` : undefined,
                            borderLeftWidth: 3,
                            borderLeftColor: staff.color,
                            borderLeftStyle: 'solid',
                          }}>
                          <p className="text-[11px] font-bold leading-tight truncate"
                            style={{ color: staff.color }}>{b.customers?.name}</p>
                          {durMin >= 20 && (
                            <p className="text-[9px] text-gray-500 leading-tight">
                              {b.start_time?.slice(0,5)}~{b.end_time?.slice(0,5)}
                            </p>
                          )}
                          {isPending && <p className="text-[8px] text-amber-600 font-semibold">대기</p>}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* 예약 상세 바텀시트 */}
      {selected && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => { setSelected(null); setEditMode(false) }} />
          <div className="relative bg-white rounded-t-3xl p-5 flex flex-col gap-3 max-h-[80vh] overflow-y-auto">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900">{selected.customers?.name}</h3>
              <div className="flex items-center gap-2">
                {canEdit && !editMode && (
                  <button onClick={() => setEditMode(true)}
                    className="text-xs text-nunu font-semibold border border-nunu/30 px-3 py-1.5 rounded-xl hover:bg-nunu/5">
                    편집
                  </button>
                )}
                <button onClick={() => { setSelected(null); setEditMode(false) }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500">✕</button>
              </div>
            </div>

            {!editMode ? (
              <div className="text-sm flex flex-col gap-2">
                <div className="flex justify-between"><span className="text-gray-500">시간</span><span className="font-medium">{selected.start_time?.slice(0,5)} ~ {selected.end_time?.slice(0,5)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">시술</span><span className="font-medium">{serviceLabel[selected.service_type]}</span></div>
                {selected.service_detail && <div className="flex justify-between"><span className="text-gray-500">내용</span><span>{selected.service_detail}</span></div>}
                {selected.customer_memo && <div className="flex justify-between"><span className="text-gray-500">고객 메모</span><span className="text-right max-w-[55%]">{selected.customer_memo}</span></div>}
                {selected.admin_memo && <div className="flex justify-between"><span className="text-gray-500">관리자 메모</span><span className="text-right max-w-[55%]">{selected.admin_memo}</span></div>}
                <div className="flex justify-between"><span className="text-gray-500">상태</span>
                  <Badge color={selected.status === 'confirmed' ? 'green' : 'amber'}>{statusLabel[selected.status]}</Badge>
                </div>
                {selected.customers?.phone && (
                  <a href={`tel:${selected.customers.phone}`}
                    className="flex items-center gap-2 mt-1 text-nunu font-medium text-sm hover:underline">
                    📞 {selected.customers.phone}
                  </a>
                )}
                {!canEdit && <p className="text-xs text-gray-400 text-center mt-1">조회 전용 — 수정 권한이 없습니다</p>}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 mb-1">시작 시간</p>
                    <input type="time" value={editStart} onChange={e => setEditStart(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-nunu" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 mb-1">종료 시간</p>
                    <input type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-nunu" />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">관리자 메모</p>
                  <textarea value={editMemo} onChange={e => setEditMemo(e.target.value)}
                    rows={2} placeholder="메모 입력..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none outline-none focus:border-nunu" />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setEditMode(false)}>취소</Button>
                  <Button variant="gold" className="flex-1" loading={saving} onClick={saveEdit}>저장</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
