import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, serviceDuration } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Button, Input } from '../../components/ui/index'
import {
  format, addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  isBefore, isAfter, isSameDay, isToday, addMonths, subMonths,
  addMinutes, parse, getDaysInMonth, getDay
} from 'date-fns'
import { ko } from 'date-fns/locale'
import toast from 'react-hot-toast'

const OPEN_HOUR = 4   // 04:00
const CLOSE_HOUR = 20 // 20:00
const SLOT_MIN = 10   // 10분 단위
const MAX_CONCURRENT = 2
const TODAY = new Date()
const MAX_DATE = addDays(TODAY, 60)

function generateSlots(openH = OPEN_HOUR, closeH = CLOSE_HOUR, step = SLOT_MIN) {
  const slots = []
  for (let h = openH; h < closeH; h++) {
    for (let m = 0; m < 60; m += step) {
      slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`)
    }
  }
  return slots
}

// ─────────────────────────────────────────
// 달력 컴포넌트
// ─────────────────────────────────────────
function MonthCalendar({ selectedDate, onSelect, fullyBookedDates = [] }) {
  const [viewMonth, setViewMonth] = useState(() => {
    // 오늘 이후 첫 날짜가 있는 달로 시작
    return startOfMonth(addDays(TODAY, 1))
  })

  const monthStart = startOfMonth(viewMonth)
  const monthEnd = endOfMonth(viewMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

  const days = []
  let d = calStart
  while (!isAfter(d, calEnd)) {
    days.push(new Date(d))
    d = addDays(d, 1)
  }

  const canGoPrev = isAfter(viewMonth, startOfMonth(addDays(TODAY, 1)))
  const canGoNext = isBefore(viewMonth, startOfMonth(addMonths(TODAY, 2)))

  const weekDays = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <button
          onClick={() => setViewMonth(subMonths(viewMonth, 1))}
          disabled={!canGoPrev}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ‹
        </button>
        <span className="font-semibold text-gray-900">
          {format(viewMonth, 'yyyy년 M월', { locale: ko })}
        </span>
        <button
          onClick={() => setViewMonth(addMonths(viewMonth, 1))}
          disabled={!canGoNext}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ›
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 px-3 pt-2">
        {weekDays.map((wd, i) => (
          <div key={wd} className={`text-center text-xs font-medium py-1.5
            ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
            {wd}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 px-3 pb-4 gap-y-1">
        {days.map((day, idx) => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const isCurrentMonth = day.getMonth() === viewMonth.getMonth()
          const isPast = isBefore(day, addDays(TODAY, 1)) // 내일부터 선택 가능
          const isFutureTooFar = isAfter(day, MAX_DATE)
          const isFullyBooked = fullyBookedDates.includes(dateStr)
          const isDisabled = !isCurrentMonth || isPast || isFutureTooFar || isFullyBooked
          const isSelected = selectedDate === dateStr
          const isSun = getDay(day) === 0
          const isSat = getDay(day) === 6

          return (
            <button
              key={idx}
              disabled={isDisabled}
              onClick={() => !isDisabled && onSelect(dateStr)}
              className={`
                relative flex flex-col items-center justify-center py-2 rounded-xl text-sm transition-all
                ${!isCurrentMonth ? 'opacity-0 pointer-events-none' : ''}
                ${isDisabled && isCurrentMonth ? 'text-gray-300 cursor-not-allowed' : ''}
                ${isSelected ? 'bg-nunu text-white font-bold shadow-md scale-105' : ''}
                ${!isSelected && !isDisabled ? 'hover:bg-gray-50 active:scale-95' : ''}
                ${!isSelected && !isDisabled && isSun ? 'text-red-500' : ''}
                ${!isSelected && !isDisabled && isSat ? 'text-blue-500' : ''}
                ${!isSelected && !isDisabled && !isSun && !isSat ? 'text-gray-800' : ''}
              `}
            >
              <span className="leading-none">{format(day, 'd')}</span>
              {isFullyBooked && isCurrentMonth && !isPast && !isFutureTooFar && (
                <span className="text-[8px] text-red-400 mt-0.5 leading-none">마감</span>
              )}
              {isToday(day) && !isSelected && isCurrentMonth && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-nunu" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 메인 예약 요청 컴포넌트
// ─────────────────────────────────────────
export default function BookingRequest() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)

  // 폼 상태
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [serviceType, setServiceType] = useState('')
  const [serviceDetail, setServiceDetail] = useState('')
  const [selectedStaff, setSelectedStaff] = useState(null)
  const [customerMemo, setCustomerMemo] = useState('')

  const [staffList, setStaffList] = useState([])
  const [takenSlots, setTakenSlots] = useState([])     // 해당 날짜의 꽉 찬 슬롯
  const [fullyBookedDates, setFullyBookedDates] = useState([]) // 달력에서 마감 표시할 날짜
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // 스텝 목록 로드
  useEffect(() => {
    supabase.from('staff').select('*').eq('is_active', true)
      .then(({ data }) => setStaffList(data || []))
  }, [])

  // 마감된 날짜 목록 로드 (60일 범위)
  useEffect(() => {
    async function loadFullyBooked() {
      const from = format(addDays(TODAY, 1), 'yyyy-MM-dd')
      const to = format(MAX_DATE, 'yyyy-MM-dd')
      const { data } = await supabase
        .from('bookings')
        .select('booking_date, start_time, end_time')
        .gte('booking_date', from)
        .lte('booking_date', to)
        .in('status', ['pending', 'confirmed'])

      // 날짜별로 모든 슬롯이 꽉 찼는지 확인
      const allSlots = generateSlots()
      const dateSlotCount = {}
      ;(data || []).forEach(b => {
        const date = b.booking_date
        if (!dateSlotCount[date]) {
          dateSlotCount[date] = {}
          allSlots.forEach(s => { dateSlotCount[date][s] = 0 })
        }
        let t = b.start_time.slice(0, 5)
        while (t < b.end_time.slice(0, 5)) {
          if (dateSlotCount[date][t] !== undefined) dateSlotCount[date][t]++
          const [h, m] = t.split(':').map(Number)
          const next = addMinutes(new Date(2000, 0, 1, h, m), SLOT_MIN)
          t = format(next, 'HH:mm')
        }
      })

      const booked = Object.entries(dateSlotCount)
        .filter(([, slots]) => Object.values(slots).every(c => c >= MAX_CONCURRENT))
        .map(([date]) => date)
      setFullyBookedDates(booked)
    }
    loadFullyBooked()
  }, [])

  // 날짜 변경 시 해당 날짜 예약된 슬롯 로드
  useEffect(() => {
    if (!selectedDate) return
    async function loadTaken() {
      setLoading(true)
      const { data } = await supabase
        .from('bookings')
        .select('start_time, end_time')
        .eq('booking_date', selectedDate)
        .in('status', ['pending', 'confirmed'])
      const slotCount = {}
      const allSlots = generateSlots()
      allSlots.forEach(slot => { slotCount[slot] = 0 })
      ;(data || []).forEach(b => {
        let t = b.start_time.slice(0, 5)
        while (t < b.end_time.slice(0, 5)) {
          if (slotCount[t] !== undefined) slotCount[t]++
          const [h, m] = t.split(':').map(Number)
          const next = addMinutes(new Date(2000, 0, 1, h, m), SLOT_MIN)
          t = format(next, 'HH:mm')
        }
      })
      setTakenSlots(Object.entries(slotCount).filter(([, c]) => c >= MAX_CONCURRENT).map(([s]) => s))
      setLoading(false)
    }
    loadTaken()
    setSelectedTime('')
  }, [selectedDate])

  const duration = serviceType ? serviceDuration[serviceType] : 0
  const endTime = selectedTime && duration
    ? format(addMinutes(parse(selectedTime, 'HH:mm', new Date()), duration), 'HH:mm')
    : ''

  function isSlotAvailable(slot) {
    if (!duration) return true
    const steps = duration / SLOT_MIN
    const allSlots = generateSlots()
    const idx = allSlots.indexOf(slot)
    for (let i = 0; i < steps; i++) {
      const s = allSlots[idx + i]
      if (!s || takenSlots.includes(s)) return false
    }
    return true
  }

  const availableStaff = staffList.filter(s =>
    serviceType === 'both' ? true :
    serviceType === 'hair' ? s.role === 'hair' :
    serviceType === 'makeup' ? s.role === 'makeup' : true
  )

  const selectedDateLabel = selectedDate
    ? format(new Date(selectedDate), 'M월 d일 (E)', { locale: ko })
    : ''

  async function submit() {
    if (!selectedDate || !selectedTime || !serviceType) {
      toast.error('모든 항목을 입력해주세요'); return
    }
    setSubmitting(true)
    try {
      const { error } = await supabase.from('bookings').insert({
        customer_id: profile.id,
        booking_date: selectedDate,
        start_time: selectedTime,
        end_time: endTime,
        service_type: serviceType,
        service_detail: serviceDetail,
        requested_staff_id: selectedStaff?.id || null,
        customer_memo: customerMemo,
        status: 'pending'
      })
      if (error) throw error
      toast.success('예약 요청이 완료되었습니다!')
      navigate('/customer/my')
    } catch (e) {
      toast.error('예약 요청에 실패했습니다')
    } finally {
      setSubmitting(false)
      setShowConfirm(false)
    }
  }

  const allSlots = generateSlots()

  return (
    <div className="px-5 py-6 flex flex-col gap-6 max-w-md mx-auto pb-10">
      {/* 진행 단계 */}
      <div className="flex items-center gap-1">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-1 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all
              ${step > s ? 'bg-nunu text-white' :
                step === s ? 'bg-nunu text-white ring-4 ring-nunu/20' :
                'bg-gray-100 text-gray-400'}`}>
              {step > s ? '✓' : s}
            </div>
            {s < 3 && (
              <div className={`h-0.5 flex-1 transition-colors ${step > s ? 'bg-nunu' : 'bg-gray-100'}`} />
            )}
          </div>
        ))}
        <span className="text-sm text-gray-500 ml-2 font-medium">
          {step === 1 ? '날짜' : step === 2 ? '시간·시술' : '스텝·메모'}
        </span>
      </div>

      {/* ─── STEP 1: 달력 날짜 선택 ─── */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="font-bold text-lg text-gray-900">날짜를 선택하세요</h2>
            <p className="text-sm text-gray-400 mt-0.5">내일부터 60일 이내에서 선택 가능합니다</p>
          </div>
          <MonthCalendar
            selectedDate={selectedDate}
            onSelect={setSelectedDate}
            fullyBookedDates={fullyBookedDates}
          />
          {selectedDate && (
            <div className="bg-nunu/5 border border-nunu/20 rounded-xl px-4 py-3 flex items-center gap-2">
              <span className="text-nunu text-lg">📅</span>
              <span className="text-sm font-medium text-nunu">{selectedDateLabel} 선택됨</span>
            </div>
          )}
          <Button size="lg" disabled={!selectedDate} onClick={() => setStep(2)}>
            다음 단계
          </Button>
        </div>
      )}

      {/* ─── STEP 2: 시간 + 시술 선택 ─── */}
      {step === 2 && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep(1)}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors">
              ‹
            </button>
            <div>
              <h2 className="font-bold text-lg text-gray-900">{selectedDateLabel}</h2>
              <p className="text-xs text-gray-400">시술과 시간을 선택해주세요</p>
            </div>
          </div>

          {/* 시술 선택 */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">시술 종류</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'hair', label: '헤어', icon: '✂️', time: '40분' },
                { id: 'makeup', label: '메이크업', icon: '💄', time: '60분' },
                { id: 'both', label: '헤어+메이크업', icon: '✨', time: '100분' }
              ].map(s => (
                <button key={s.id}
                  onClick={() => { setServiceType(s.id); setSelectedTime('') }}
                  className={`flex flex-col items-center p-3 rounded-2xl border-2 text-xs font-medium transition-all
                    ${serviceType === s.id
                      ? 'bg-nunu text-white border-nunu shadow-md scale-105'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'}`}>
                  <span className="text-2xl mb-1">{s.icon}</span>
                  <span className="font-semibold">{s.label}</span>
                  <span className={`text-[10px] mt-0.5 ${serviceType === s.id ? 'text-white/70' : 'text-gray-400'}`}>
                    {s.time}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 시간 선택 */}
          {serviceType && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">시작 시간</p>
              {loading ? (
                <p className="text-sm text-gray-400 text-center py-4">가능한 시간 확인 중...</p>
              ) : (
                <>
                  <div className="grid grid-cols-5 gap-1.5 max-h-52 overflow-y-auto pr-1">
                    {allSlots.map(slot => {
                      const avail = isSlotAvailable(slot)
                      return (
                        <button key={slot} disabled={!avail}
                          onClick={() => setSelectedTime(slot)}
                          className={`py-2 rounded-xl text-xs font-medium transition-all
                            ${selectedTime === slot
                              ? 'bg-nunu text-white shadow-md'
                              : avail
                              ? 'bg-white text-gray-700 border border-gray-200 hover:border-nunu/50 hover:bg-nunu/5'
                              : 'bg-gray-50 text-gray-300 cursor-not-allowed border border-gray-100'}`}>
                          {slot}
                        </button>
                      )
                    })}
                  </div>
                  {selectedTime && endTime && (
                    <div className="mt-3 bg-nunu/5 border border-nunu/20 rounded-xl px-4 py-2.5 flex items-center gap-2">
                      <span className="text-nunu text-sm">🕐</span>
                      <span className="text-sm font-semibold text-nunu">
                        {selectedTime} ~ {endTime}
                        <span className="text-xs font-normal text-nunu/60 ml-1">({duration}분)</span>
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <Input label="시술 내용 (선택)" placeholder="예: 커트+레이어드, 웨딩 메이크업"
            value={serviceDetail} onChange={e => setServiceDetail(e.target.value)} />

          <Button size="lg" disabled={!selectedDate || !selectedTime || !serviceType}
            onClick={() => setStep(3)}>
            다음 단계
          </Button>
        </div>
      )}

      {/* ─── STEP 3: 스텝 + 메모 + 확인 ─── */}
      {step === 3 && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep(2)}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors">
              ‹
            </button>
            <div>
              <h2 className="font-bold text-lg text-gray-900">담당 스텝 선택</h2>
              <p className="text-xs text-gray-400">원하는 스텝을 선택하거나 랜덤 배정을 선택하세요</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button onClick={() => setSelectedStaff(null)}
              className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all
                ${!selectedStaff ? 'bg-nunu text-white border-nunu shadow-md' : 'bg-white text-gray-700 border-gray-200'}`}>
              <span className="text-2xl">🎲</span>
              <div className="text-left">
                <p className="font-semibold text-sm">상관없음 (랜덤 배정)</p>
                <p className={`text-xs ${!selectedStaff ? 'text-white/70' : 'text-gray-400'}`}>
                  관리자가 최적의 스텝을 배정합니다
                </p>
              </div>
            </button>
            {availableStaff.map(s => (
              <button key={s.id} onClick={() => setSelectedStaff(s)}
                className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all
                  ${selectedStaff?.id === s.id ? 'border-nunu bg-nunu/5 shadow-sm' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'}`}>
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm"
                  style={{ backgroundColor: s.color }}>
                  {s.name[0]}
                </div>
                <div className="text-left">
                  <p className={`font-semibold text-sm ${selectedStaff?.id === s.id ? 'text-nunu' : 'text-gray-900'}`}>
                    {s.name} {s.title}
                  </p>
                  <p className="text-xs text-gray-400">{s.role === 'hair' ? '✂️ 헤어' : '💄 메이크업'}</p>
                </div>
                {selectedStaff?.id === s.id && (
                  <span className="ml-auto text-nunu text-lg">✓</span>
                )}
              </button>
            ))}
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">
              요청사항 <span className="text-gray-400 font-normal">(선택, 최대 200자)</span>
            </label>
            <textarea
              value={customerMemo}
              onChange={e => setCustomerMemo(e.target.value.slice(0, 200))}
              rows={3}
              placeholder="특이사항이나 원하시는 스타일을 적어주세요"
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm resize-none outline-none focus:border-nunu transition-colors"
            />
            <p className="text-xs text-gray-400 text-right mt-1">{customerMemo.length}/200</p>
          </div>

          {/* 예약 요약 */}
          <div className="bg-gray-50 rounded-2xl p-4 text-sm flex flex-col gap-2.5">
            <p className="font-semibold text-gray-800 mb-1">예약 요약</p>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">날짜</span>
              <span className="font-medium text-gray-900">{selectedDateLabel}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">시간</span>
              <span className="font-medium text-gray-900">{selectedTime} ~ {endTime}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">시술</span>
              <span className="font-medium text-gray-900">
                {serviceType === 'hair' ? '✂️ 헤어' : serviceType === 'makeup' ? '💄 메이크업' : '✨ 헤어+메이크업'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">담당</span>
              <span className="font-medium text-gray-900">
                {selectedStaff ? `${selectedStaff.name} ${selectedStaff.title}` : '랜덤 배정'}
              </span>
            </div>
          </div>

          <Button size="lg" variant="gold" onClick={() => setShowConfirm(true)}>
            예약 요청하기
          </Button>
          <p className="text-xs text-center text-gray-400">확정 후 연락처로 안내드립니다</p>
        </div>
      )}

      {/* ─── 확인 모달 ─── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowConfirm(false)} />
          <div className="relative bg-white rounded-t-3xl w-full max-w-md p-6 flex flex-col gap-4">
            <div className="text-center">
              <div className="w-14 h-14 bg-gold/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">📋</span>
              </div>
              <h3 className="font-bold text-lg text-gray-900">예약을 요청할까요?</h3>
              <p className="text-sm text-gray-500 mt-1">
                관리자 확정 후 연락드립니다
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-sm flex flex-col gap-2">
              <div className="flex justify-between">
                <span className="text-gray-500">날짜</span>
                <span className="font-medium">{selectedDateLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">시간</span>
                <span className="font-medium">{selectedTime} ~ {endTime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">시술</span>
                <span className="font-medium">
                  {serviceType === 'hair' ? '헤어' : serviceType === 'makeup' ? '메이크업' : '헤어+메이크업'}
                </span>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowConfirm(false)}>
                취소
              </Button>
              <Button variant="gold" className="flex-1" loading={submitting} onClick={submit}>
                요청하기
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
