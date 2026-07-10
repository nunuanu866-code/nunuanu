import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, serviceDuration, SALON_PHONE } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Button, Input } from '../../components/ui/index'
import {
  format, addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  isBefore, isAfter, isToday, addMonths, subMonths,
  getDay, startOfDay
} from 'date-fns'
import { ko } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { createAdminPushEvent, createAppNotification } from '../../lib/notifications'
import { disableCustomerPush, enableCustomerPush, getCustomerPushDevice } from '../../lib/customerPush'

const OPEN_HOUR = 0
const CLOSE_HOUR = 24
const CHECKOUT_START_HOUR = 4
const CHECKOUT_END_HOUR = 21
const SLOT_MIN = 10
const MAX_CONCURRENT = 2
const TODAY = startOfDay(new Date())
const BOOKING_START_DATE = addDays(TODAY, 1)
const MAX_DATE = addDays(TODAY, 60)
const STAFF_VISIBILITY_SERVICE = 'STAFF_VISIBILITY'
const STAFF_PROFILE_SERVICE = 'STAFF_PROFILE'

function generateSlots(startHour = OPEN_HOUR, endHour = CLOSE_HOUR, includeEnd = false) {
  const slots = []
  const startMin = startHour * 60
  const endMin = endHour * 60 - (includeEnd ? 0 : SLOT_MIN)
  for (let total = startMin; total <= endMin; total += SLOT_MIN) {
    const h = Math.floor(total / 60)
    const m = total % 60
    slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`)
  }
  return slots
}
const ALL_SLOTS = generateSlots()
const CHECKOUT_SLOTS = generateSlots(CHECKOUT_START_HOUR, CHECKOUT_END_HOUR, true)

function timeToMinutes(time, fallback = '00:00') {
  const [h, m] = String(time || fallback).slice(0, 5).split(':').map(Number)
  return (Number(h) || 0) * 60 + (Number(m) || 0)
}

function minutesToTime(total) {
  const dayMinutes = 24 * 60
  const normalized = ((Math.round(total) % dayMinutes) + dayMinutes) % dayMinutes
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function addTimeMinutes(time, delta) {
  return minutesToTime(timeToMinutes(time) + Number(delta || 0))
}

function normalizeStaffRole(role) {
  const r = String(role || '').toLowerCase()
  if (r === 'makeup' || r.includes('메이크업') || r.includes('make')) return 'makeup'
  return 'hair'
}

function isStaffBookingVisible(staff) {
  return staff?.is_active !== false && staff?.booking_visible !== false
}

function parseStaffVisibilityRow(row) {
  if (row?.service_detail !== STAFF_VISIBILITY_SERVICE || row.status === 'cancelled') return null
  try {
    const meta = JSON.parse(row.customer_memo || '{}') || {}
    if (meta.type !== 'staff_visibility' || !meta.staff_id) return null
    return {
      staffId: meta.staff_id,
      bookingVisible: meta.booking_visible !== false,
      updatedAt: meta.updated_at || row.created_at
    }
  } catch {
    return null
  }
}

function staffVisibilityMap(rows) {
  const sorted = (rows || [])
    .map(parseStaffVisibilityRow)
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
  const map = new Map()
  sorted.forEach(v => {
    if (!map.has(v.staffId)) map.set(v.staffId, v.bookingVisible)
  })
  return map
}

function parseStaffProfileRow(row) {
  if (row?.service_detail !== STAFF_PROFILE_SERVICE || row.status === 'cancelled') return null
  try {
    const meta = JSON.parse(row.customer_memo || '{}') || {}
    if (meta.type !== 'staff_profile' || !meta.staff_id) return null
    return {
      staffId: meta.staff_id,
      profile: {
        name: meta.name || '',
        role: normalizeStaffRole(meta.role || 'hair'),
        title: meta.title || staffTitleFallback(meta.role || 'hair'),
        color: meta.color || '',
        phone: meta.phone || '',
        is_active: meta.is_active !== false
      },
      updatedAt: meta.updated_at || row.created_at
    }
  } catch {
    return null
  }
}

function staffProfileMap(rows) {
  const sorted = (rows || [])
    .map(parseStaffProfileRow)
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
  const map = new Map()
  sorted.forEach(v => {
    if (!map.has(v.staffId)) map.set(v.staffId, v.profile)
  })
  return map
}

function staffTitleFallback(role) {
  return normalizeStaffRole(role) === 'makeup' ? '메이크업 스텝' : '헤어 스텝'
}

function virtualStaffRow(staffId, profile = {}, bookingVisible = true) {
  const role = normalizeStaffRole(profile.role || 'hair')
  return {
    id: staffId,
    name: profile.name || '스텝',
    role,
    title: profile.title || staffTitleFallback(role),
    color: profile.color || '#6b7280',
    phone: profile.phone || '',
    is_active: profile.is_active !== false,
    booking_visible: bookingVisible,
    _virtual: true
  }
}

function sortStaffForBooking(a, b) {
  const titleDiff = staffTitleRank(a.title) - staffTitleRank(b.title)
  if (titleDiff) return titleDiff
  const order = { makeup: 0, hair: 1 }
  const roleDiff = (order[normalizeStaffRole(a.role)] ?? 9) - (order[normalizeStaffRole(b.role)] ?? 9)
  if (roleDiff) return roleDiff
  return String(a.name || '').localeCompare(String(b.name || ''), 'ko')
}

function staffTitleRank(title) {
  const t = String(title || '')
  if (t.includes('원장')) return t.includes('부원장') ? 1 : 0
  if (t.includes('실장')) return 2
  if (t.includes('디자이너')) return 3
  return 9
}

// ── 달력 컴포넌트 ────────────────────────────────────────────────
function MonthCalendar({ selectedDate, onSelect, confirmedFullDates = [] }) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(BOOKING_START_DATE))
  const monthStart = startOfMonth(viewMonth)
  const monthEnd = endOfMonth(viewMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

  const days = []
  let d = calStart
  while (!isAfter(d, calEnd)) { days.push(new Date(d)); d = addDays(d, 1) }

  const canGoPrev = isAfter(viewMonth, startOfMonth(BOOKING_START_DATE))
  const canGoNext = isBefore(viewMonth, startOfMonth(addMonths(TODAY, 2)))
  const weekDays = ['일','월','화','수','목','금','토']

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <button onClick={() => setViewMonth(subMonths(viewMonth, 1))} disabled={!canGoPrev}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 disabled:opacity-30 transition-colors">‹</button>
        <span className="font-semibold text-gray-900">{format(viewMonth, 'yyyy년 M월', { locale: ko })}</span>
        <button onClick={() => setViewMonth(addMonths(viewMonth, 1))} disabled={!canGoNext}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 disabled:opacity-30 transition-colors">›</button>
      </div>
      <div className="grid grid-cols-7 px-3 pt-2">
        {weekDays.map((wd, i) => (
          <div key={wd} className={`text-center text-xs font-medium py-1.5
            ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>{wd}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 px-3 pb-4 gap-y-1">
        {days.map((day, idx) => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const isCurrentMonth = day.getMonth() === viewMonth.getMonth()
          const isPast = isBefore(day, BOOKING_START_DATE)
          const isTooFar = isAfter(day, MAX_DATE)
          const isFull = false
          const disabled = !isCurrentMonth || isPast || isTooFar
          const isSelected = selectedDate === dateStr
          const isSun = getDay(day) === 0
          const isSat = getDay(day) === 6
          return (
            <button key={idx} disabled={disabled} onClick={() => !disabled && onSelect(dateStr)}
              className={`relative flex flex-col items-center justify-center py-2 rounded-xl text-sm transition-all
                ${!isCurrentMonth ? 'opacity-0 pointer-events-none' : ''}
                ${disabled && isCurrentMonth ? 'text-gray-300 cursor-not-allowed' : ''}
                ${isSelected ? 'bg-nunu text-white font-bold shadow-md scale-105' : ''}
                ${!isSelected && !disabled ? 'hover:bg-gray-50 active:scale-95' : ''}
                ${!isSelected && !disabled && isSun ? 'text-red-500' : ''}
                ${!isSelected && !disabled && isSat ? 'text-blue-500' : ''}
                ${!isSelected && !disabled && !isSun && !isSat ? 'text-gray-800' : ''}`}>
              <span className="leading-none">{format(day, 'd')}</span>
              {isFull && isCurrentMonth && !isPast && !isTooFar && (
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

// ── 시간 롤링 휠 ──────────────────────────────────────────────────
function TimeWheel({ value, onChange, availableSlots }) {
  const ROW = 52
  const HALF = 2
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current || !value) return
    const idx = availableSlots.indexOf(value)
    if (idx >= 0) {
      ref.current.scrollTop = idx * ROW
    }
  }, [availableSlots]) // only on mount / slot change

  const onScroll = useCallback(e => {
    const idx = Math.round(e.target.scrollTop / ROW)
    const t = availableSlots[Math.max(0, Math.min(availableSlots.length - 1, idx))]
    if (t && t !== value) onChange(t)
  }, [value, onChange, availableSlots])

  if (availableSlots.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 rounded-2xl border border-gray-200 bg-gray-50">
        <p className="text-sm text-gray-400">선택 가능한 시간이 없습니다</p>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', height: ROW * 5, borderRadius: 20, overflow: 'hidden', border: '1.5px solid #e5e5e2', background: '#fff' }}>
      {/* 중앙 선택 하이라이트 */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: HALF * ROW, height: ROW,
        background: '#f5f5f7', borderTop: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0',
        zIndex: 1, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <span style={{ fontSize: 22, fontWeight: 600, color: '#1d1d1f', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.224px' }}>
          {value || '선택'}
        </span>
      </div>
      {/* 위 페이드 */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: HALF * ROW, background: 'rgba(255,255,255,.88)', zIndex: 2, pointerEvents: 'none' }} />
      {/* 아래 페이드 */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: HALF * ROW, background: 'rgba(255,255,255,.88)', zIndex: 2, pointerEvents: 'none' }} />
      {/* 스크롤 리스트 */}
      <div ref={ref} onScroll={onScroll}
        style={{ height: '100%', overflowY: 'scroll', scrollSnapType: 'y mandatory', paddingTop: HALF * ROW, paddingBottom: HALF * ROW }}>
        {availableSlots.map((t, i) => {
          const curIdx = availableSlots.indexOf(value)
          const dist = Math.abs(i - curIdx)
          return (
            <div key={t}
              onClick={() => { ref.current.scrollTop = i * ROW; onChange(t) }}
              style={{
                height: ROW, scrollSnapAlign: 'center',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: dist === 0 ? 22 : dist === 1 ? 16 : 12,
                fontWeight: dist === 0 ? 800 : dist === 1 ? 600 : 400,
                color: dist === 0 ? 'transparent' : dist <= 1 ? '#18181b' : '#a1a1aa',
                fontVariantNumeric: 'tabular-nums',
                cursor: 'pointer', transition: 'font-size .1s, color .1s'
              }}>
              {t}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 메인 예약 플로우 ──────────────────────────────────────────────
export default function GuestBookingFlow() {
  const { saveGuest, guest } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(1) // 1:고객정보 2:날짜 3:시간+시술 4:스텝+메모 5:완료

  // 고객 정보
  const [name, setName] = useState(guest?.name || '')
  const [phone, setPhone] = useState(guest?.phone || '')
  const [pin, setPin] = useState('')       // 4자리 예약 조회 비밀번호

  // 예약 정보
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [serviceType, setServiceType] = useState('')
  const [serviceDetail, setServiceDetail] = useState('')
  // 스텝 선택 (헤어/메이크업 단독: selectedStaff, 헤어+메이크업: 각각)
  const [selectedStaff, setSelectedStaff] = useState(null)      // 단독 서비스 스텝
  const [selectedHairStaff, setSelectedHairStaff] = useState(null)   // 헤어+메이크업 시 헤어 스텝
  const [selectedMakeupStaff, setSelectedMakeupStaff] = useState(null) // 헤어+메이크업 시 메이크업 스텝
  const [customerMemo, setCustomerMemo] = useState('')

  const [staffList, setStaffList] = useState([])
  const [takenSlots, setTakenSlots] = useState([])
  const [confirmedFullDates, setConfirmedFullDates] = useState([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)

  // 서비스 기본 설명 자동 기입
  const serviceDetailDefaults = {
    hair: '헤어 (커트/펌/염색 등)',
    makeup: '메이크업 (웨딩/일상/행사 등)',
    both: '헤어+메이크업 토탈케어'
  }

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
  }, [phone])

  async function toggleBookingResultPush() {
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

  // 스텝 목록 로드
  useEffect(() => {
    let mounted = true
    async function loadStaff() {
      const [{ data }, { data: visibilityRows }, { data: profileRows }] = await Promise.all([
        supabase.from('staff').select('*').eq('is_active', true),
        supabase
          .from('bookings')
          .select('id, status, service_detail, customer_memo, created_at')
          .eq('service_detail', STAFF_VISIBILITY_SERVICE)
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase
          .from('bookings')
          .select('id, status, service_detail, customer_memo, created_at')
          .eq('service_detail', STAFF_PROFILE_SERVICE)
          .order('created_at', { ascending: false })
          .limit(1000)
      ])
      if (!mounted) return
      const visibilityByStaff = staffVisibilityMap(visibilityRows)
      const profileByStaff = staffProfileMap(profileRows)
      const realRows = (data || [])
        .map(s => {
          const profile = profileByStaff.get(s.id) || {}
          const role = normalizeStaffRole(profile.role || s.role)
          return {
            ...s,
            ...profile,
            name: profile.name || s.name,
            role,
            title: profile.title || s.title || staffTitleFallback(role),
            color: profile.color || s.color,
            is_active: profile.is_active !== false && s.is_active !== false,
            booking_visible: visibilityByStaff.has(s.id) ? visibilityByStaff.get(s.id) : true,
            _virtual: false
          }
        })
      const realIds = new Set(realRows.map(s => s.id))
      const virtualRows = Array.from(profileByStaff.entries())
        .filter(([staffId, profile]) => !realIds.has(staffId) && profile?.is_active !== false)
        .map(([staffId, profile]) => virtualStaffRow(staffId, profile, visibilityByStaff.has(staffId) ? visibilityByStaff.get(staffId) : true))
      const rows = [...realRows, ...virtualRows]
        .filter(isStaffBookingVisible)
        .sort(sortStaffForBooking)
      setStaffList(rows)
    }
    loadStaff()
    const channel = supabase
      .channel('customer-staff-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, loadStaff)
      .subscribe()
    const visibilityChannel = supabase
      .channel('customer-staff-visibility-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `service_detail=eq.${STAFF_VISIBILITY_SERVICE}` }, loadStaff)
      .subscribe()
    const profileChannel = supabase
      .channel('customer-staff-profile-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `service_detail=eq.${STAFF_PROFILE_SERVICE}` }, loadStaff)
      .subscribe()
    const timer = setInterval(loadStaff, 5000)
    return () => {
      mounted = false
      clearInterval(timer)
      supabase.removeChannel(channel)
      supabase.removeChannel(visibilityChannel)
      supabase.removeChannel(profileChannel)
    }
  }, [])

  useEffect(() => {
    if (selectedStaff && !staffList.some(s => s.id === selectedStaff.id)) setSelectedStaff(null)
    if (selectedHairStaff && !staffList.some(s => s.id === selectedHairStaff.id)) setSelectedHairStaff(null)
    if (selectedMakeupStaff && !staffList.some(s => s.id === selectedMakeupStaff.id)) setSelectedMakeupStaff(null)
  }, [staffList, selectedStaff, selectedHairStaff, selectedMakeupStaff])

  // 달력용: 확정 예약으로 꽉 찬 날짜 계산
  useEffect(() => {
    let mounted = true
    async function loadFullDates() {
      const from = format(BOOKING_START_DATE, 'yyyy-MM-dd')
      const to = format(MAX_DATE, 'yyyy-MM-dd')
      const { data } = await supabase
        .from('bookings')
        .select('booking_date, start_time, end_time')
        .gte('booking_date', from)
        .lte('booking_date', to)
        .eq('status', 'confirmed')

      const dateSlotCount = {}
      ;(data || []).forEach(b => {
        const date = b.booking_date
        if (!dateSlotCount[date]) {
          dateSlotCount[date] = {}
          ALL_SLOTS.forEach(s => { dateSlotCount[date][s] = 0 })
        }
        let t = b.start_time.slice(0, 5)
        while (t < b.end_time.slice(0, 5)) {
          if (dateSlotCount[date][t] !== undefined) dateSlotCount[date][t]++
          t = addTimeMinutes(t, SLOT_MIN)
        }
      })
      const full = Object.entries(dateSlotCount)
        .filter(([, slots]) => Object.values(slots).every(c => c >= MAX_CONCURRENT))
        .map(([date]) => date)
      if (mounted) setConfirmedFullDates(full)
    }
    loadFullDates()
    const channel = supabase
      .channel('customer-full-dates-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, loadFullDates)
      .subscribe()
    const timer = setInterval(loadFullDates, 10000)
    return () => {
      mounted = false
      clearInterval(timer)
      supabase.removeChannel(channel)
    }
  }, [])

  // 날짜 선택 시 해당 날 예약 슬롯 로드
  useEffect(() => {
    if (!selectedDate) return
    setTakenSlots([])
    setSlotsLoading(false)
    setSelectedTime('')
  }, [selectedDate])

  // 서비스 타입 변경 시 → 시술 내용 자동 기입 + 스텝 초기화
  function handleServiceTypeChange(type) {
    setServiceType(type)
    setServiceDetail(serviceDetailDefaults[type] || '')
    setSelectedTime('')
    setSelectedStaff(null)
    setSelectedHairStaff(null)
    setSelectedMakeupStaff(null)
  }

  const duration = serviceType ? serviceDuration[serviceType] : 0

  // selectedTime = 고객이 선택한 "나가는 시간 (체크아웃)" = end_time
  // startTime    = 체크아웃 - 시술시간 = 자동 계산된 시작 시간
  const startTime = selectedTime && duration
    ? addTimeMinutes(selectedTime, -duration)
    : ''

  // 체크아웃 슬롯이 유효한지 확인 (시작 시간부터 체크아웃까지 모두 여유 있어야 함)
  function isCheckoutSlotAvailable(checkoutSlot) {
    return ALL_SLOTS.includes(checkoutSlot)
  }

  // 선택 가능한 체크아웃 시간 목록
  const availableCheckoutSlots = CHECKOUT_SLOTS

  // 서비스 선택 시 첫 번째 가능한 체크아웃 시간으로 자동 선택
  useEffect(() => {
    if (selectedTime && !availableCheckoutSlots.includes(selectedTime)) {
      setSelectedTime('')
    }
  }, [selectedTime])

  const selectedDateLabel = selectedDate
    ? format(new Date(selectedDate), 'M월 d일 (E)', { locale: ko }) : ''

  // 스텝 - 카테고리별 필터
  const hairStaff = staffList.filter(s => normalizeStaffRole(s.role) === 'hair')
  const makeupStaff = staffList.filter(s => normalizeStaffRole(s.role) === 'makeup')

  // 담당 스텝 표시 라벨 (요약용)
  function getStaffLabel() {
    if (serviceType === 'hair') {
      return selectedStaff ? `${selectedStaff.name} ${selectedStaff.title}` : '랜덤 배정'
    }
    if (serviceType === 'makeup') {
      return selectedStaff ? `${selectedStaff.name} ${selectedStaff.title}` : '랜덤 배정'
    }
    if (serviceType === 'both') {
      const hair = selectedHairStaff ? `${selectedHairStaff.name} ${selectedHairStaff.title}` : '랜덤'
      const makeup = selectedMakeupStaff ? `${selectedMakeupStaff.name} ${selectedMakeupStaff.title}` : '랜덤'
      return { hair, makeup }
    }
    return '랜덤 배정'
  }

  // STEP 1 검증
  function proceedFromStep1() {
    if (!name.trim()) { toast.error('이름을 입력해주세요'); return }
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) { toast.error('전화번호를 올바르게 입력해주세요'); return }
    if (!/^\d{4}$/.test(pin)) { toast.error('예약 조회 비밀번호 4자리를 입력해주세요'); return }
    saveGuest(name.trim(), phone)
    setStep(2)
  }

  async function submit() {
    setSubmitting(true)
    try {
      const phoneFull = normalizePhone(phone)
      let customerId = null
      const { data: existing } = await supabase
        .from('customers').select('id, pin').eq('phone', phoneFull).maybeSingle()
      if (existing) {
        customerId = existing.id
        // PIN이 없거나 다르면 업데이트
        if (pin && existing.pin !== pin) {
          await supabase.from('customers').update({ pin }).eq('id', existing.id)
        }
      } else {
        const { data: created } = await supabase
          .from('customers').insert({ name: name.trim(), phone: phoneFull, pin }).select('id').single()
        customerId = created?.id
      }

      // 헤어+메이크업 시 두 스텝을 assigned_staff JSONB에 요청 형태로 저장
      const assignedStaffData = serviceType === 'both'
        ? [
            { staff_id: selectedHairStaff?.id || null, role: 'hair', label: '헤어' },
            { staff_id: selectedMakeupStaff?.id || null, role: 'makeup', label: '메이크업' }
          ]
        : (selectedStaff ? [{ staff_id: selectedStaff.id, role: normalizeStaffRole(selectedStaff.role || serviceType), label: serviceType === 'makeup' ? '메이크업' : '헤어' }] : null)

      const { data: inserted, error } = await supabase.from('bookings').insert({
        customer_id: customerId,
        booking_date: selectedDate,
        start_time: startTime,
        end_time: selectedTime,
        service_type: serviceType,
        service_detail: serviceDetail,
        requested_staff_id: serviceType !== 'both' && selectedStaff?._virtual !== true ? (selectedStaff?.id || null) : null,
        assigned_staff: assignedStaffData,
        customer_memo: customerMemo,
        status: 'pending'
      }).select('id').single()
      if (error) throw error
      await createAppNotification({
        bookingId: inserted?.id,
        phone: phoneFull,
        type: 'booking_request',
      })
      await createAdminPushEvent({
        bookingId: inserted?.id,
        phone: phoneFull,
        type: 'booking_request',
      })
      setShowConfirm(false)
      setStep(5) // 완료 페이지
    } catch (e) {
      console.error(e)
      toast.error('예약 요청에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  const stepLabels = ['고객 정보', '날짜', '시간·시술', '스텝·메모', '완료']

  // ── 완료 페이지 ────────────────────────────────────────────────
  if (step === 5) {
    return (
      <div className="min-h-screen bg-white flex flex-col max-w-md mx-auto">
        {/* 상단 홈 버튼 */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
          <button onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <span className="text-lg">🏠</span>
            <span className="font-medium">홈으로</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-sm font-bold text-nunu px-2 py-1 rounded-lg hover:bg-nunu/5 active:bg-nunu/10 transition-colors"
            aria-label="홈으로 이동"
          >
            누누아누
          </button>
        </div>

        {/* 완료 내용 */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mb-6">
            <span className="text-5xl">✅</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            요청이 완료되었습니다.
          </h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-2">
            관리자 확인 후 빠른 시간 내에<br/>
            연락드리겠습니다.
          </p>
          <p className="text-nunu font-semibold text-sm mb-2">{phone}</p>
          <div className="bg-nunu/5 border border-nunu/20 rounded-xl px-4 py-3 mb-8 flex items-center gap-3">
            <span className="text-xl">🔑</span>
            <div className="text-left">
              <p className="text-xs text-gray-500">예약 조회 비밀번호</p>
              <p className="text-2xl font-bold text-nunu tracking-widest">{pin}</p>
            </div>
          </div>

          {/* 예약 요약 */}
          <button
            type="button"
            onClick={toggleBookingResultPush}
            disabled={pushBusy}
            className={`w-full rounded-2xl py-3.5 font-bold text-sm mb-4 transition-all ${
              pushEnabled
                ? 'bg-white text-gray-700 border border-gray-300 active:bg-gray-50'
                : 'bg-gray-900 text-white active:scale-98 shadow-md shadow-gray-900/10'
            } disabled:opacity-80`}
          >
            {pushBusy ? (pushEnabled ? '알림 끄는 중...' : '알림 설정 중...') : pushEnabled ? '예약 알림 끄기' : '예약 확정/거절 알림 켜기'}
          </button>

          <div className="w-full bg-gray-50 rounded-2xl p-5 text-sm text-left mb-8 flex flex-col gap-2.5">
            <div className="flex justify-between">
              <span className="text-gray-500">날짜</span>
              <span className="font-semibold text-gray-900">{selectedDateLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">시술 시작</span>
              <span className="font-semibold text-gray-900">{startTime}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">나가시는 시간</span>
              <span className="font-semibold text-gray-900">{selectedTime}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">시술</span>
              <span className="font-semibold text-gray-900">
                {serviceType === 'hair' ? '✂️ 헤어' : serviceType === 'makeup' ? '💄 메이크업' : '✨ 헤어+메이크업'}
              </span>
            </div>
            {serviceType === 'both' ? (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-500">💄 메이크업</span>
                  <span className="font-semibold text-gray-900">{selectedMakeupStaff ? `${selectedMakeupStaff.name} ${selectedMakeupStaff.title}` : '랜덤 배정'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">✂️ 헤어</span>
                  <span className="font-semibold text-gray-900">{selectedHairStaff ? `${selectedHairStaff.name} ${selectedHairStaff.title}` : '랜덤 배정'}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <span className="text-gray-500">담당</span>
                <span className="font-semibold text-gray-900">{selectedStaff ? `${selectedStaff.name} ${selectedStaff.title}` : '랜덤 배정'}</span>
              </div>
            )}
          </div>

          <button onClick={() => navigate('/')}
            className="w-full bg-nunu text-white rounded-2xl py-4 font-bold text-base hover:bg-nunu/90 active:scale-98 transition-all shadow-lg shadow-nunu/20">
            🏠 홈으로 이동
          </button>
          <button onClick={() => navigate('/my')}
            className="mt-3 w-full border-2 border-gray-200 text-gray-600 rounded-2xl py-3.5 font-semibold text-sm hover:bg-gray-50 transition-all">
            내 예약 확인
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center gap-3 sticky top-0 z-30">
        <button onClick={() => step === 1 ? navigate('/') : setStep(step - 1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors text-gray-600">
          ←
        </button>
        <div className="flex-1">
          <p className="text-xs text-gray-400">STEP {step}/4</p>
          <p className="font-bold text-gray-900">{stepLabels[step - 1]}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-sm font-bold text-nunu px-2 py-1 rounded-lg hover:bg-nunu/5 active:bg-nunu/10 transition-colors"
          aria-label="홈으로 이동"
        >
          누누아누
        </button>
      </div>

      {/* 진행바 */}
      <div className="bg-white h-1">
        <div className="h-full bg-nunu transition-all duration-500"
          style={{ width: `${(step / 4) * 100}%` }} />
      </div>

      <div className="px-5 py-6 flex flex-col gap-6 pb-20">

        {/* ─── STEP 1: 고객 정보 ─── */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="font-bold text-lg text-gray-900">예약자 정보 입력</h2>
              <p className="text-sm text-gray-400 mt-0.5">로그인 없이 바로 예약하실 수 있습니다</p>
            </div>
            <div className="bg-nunu/5 border border-nunu/20 rounded-2xl px-4 py-3 flex items-start gap-2">
              <span className="text-lg mt-0.5">💬</span>
              <p className="text-sm text-nunu/80">예약 요청 후 관리자가 예약 확정을 하면 알림이 울립니다</p>
            </div>
            <Input
              label="이름"
              placeholder="홍길동"
              value={name}
              onChange={e => setName(e.target.value)}
            />
            <Input
              label="전화번호"
              placeholder="010-0000-0000"
              value={phone}
              onChange={e => setPhone(formatPhone(e.target.value))}
              type="tel"
              inputMode="numeric"
              maxLength={13}
            />

            {/* PIN 설정 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                예약 조회 비밀번호
                <span className="text-xs text-gray-400 font-normal ml-1">(숫자 4자리)</span>
              </label>
              <div className="flex gap-3 justify-center">
                {[0,1,2,3].map(i => (
                  <input
                    key={i}
                    id={`pin-${i}`}
                    type="tel"
                    inputMode="numeric"
                    maxLength={1}
                    value={pin[i] || ''}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g,'').slice(0,1)
                      const arr = pin.split('')
                      arr[i] = v
                      setPin(arr.join(''))
                      if (v && i < 3) document.getElementById(`pin-${i+1}`)?.focus()
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Backspace' && !pin[i] && i > 0) {
                        document.getElementById(`pin-${i-1}`)?.focus()
                      }
                    }}
                    className="w-14 h-14 text-center text-2xl font-bold border-2 rounded-2xl outline-none transition-colors focus:border-nunu"
                    style={{ borderColor: pin[i] ? '#0066cc' : '#e0e0e0', background: pin[i] ? '#f5f5f7' : '#fff' }}
                  />
                ))}
              </div>
              <p className="text-xs text-gray-400 text-center mt-1">
                📋 예약 조회 시 이 번호로 확인합니다. 꼭 기억해주세요!
              </p>
            </div>

            <Button size="lg" onClick={proceedFromStep1}>
              다음 단계
            </Button>
          </div>
        )}

        {/* ─── STEP 2: 날짜 선택 ─── */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="font-bold text-lg text-gray-900">날짜를 선택하세요</h2>
              <p className="text-sm text-gray-400 mt-0.5">내일부터 60일 이내 선택 가능</p>
            </div>
            <MonthCalendar
              selectedDate={selectedDate}
              onSelect={setSelectedDate}
              confirmedFullDates={confirmedFullDates}
            />
            {selectedDate && (
              <div className="bg-nunu/5 border border-nunu/20 rounded-xl px-4 py-3 flex items-center gap-2">
                <span className="text-nunu text-lg">📅</span>
                <span className="text-sm font-medium text-nunu">{selectedDateLabel} 선택됨</span>
              </div>
            )}
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-200 inline-block"/>선택 불가</span>
              <span className="flex items-center gap-1 text-red-400">마감</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-nunu inline-block"/>선택됨</span>
            </div>
            <Button size="lg" disabled={!selectedDate} onClick={() => setStep(3)}>
              다음 단계
            </Button>
          </div>
        )}

        {/* ─── STEP 3: 시술 + 시간(롤링 휠) ─── */}
        {step === 3 && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="font-bold text-lg text-gray-900">{selectedDateLabel}</h2>
              <p className="text-sm text-gray-400 mt-0.5">시술 종류와 시작 시간을 선택하세요</p>
            </div>

            {/* 시술 선택 */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">시술 종류</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'hair',   label: '헤어',        icon: '✂️', time: '40분' },
                  { id: 'makeup', label: '메이크업',    icon: '💄', time: '60분' },
                  { id: 'both',   label: '헤어+메이크업', icon: '✨', time: '100분' }
                ].map(s => (
                  <button key={s.id} onClick={() => handleServiceTypeChange(s.id)}
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

            {/* 시술 내용 (자동 기입, 수정 가능) */}
            {serviceType && (
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1.5">
                  시술 내용 <span className="text-gray-400 font-normal text-xs">(수정 가능)</span>
                </label>
                <input
                  value={serviceDetail}
                  onChange={e => setServiceDetail(e.target.value)}
                  placeholder="시술 내용을 입력하세요"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-nunu transition-colors"
                />
              </div>
            )}

            {/* 시간 선택 - 롤링 휠 (체크아웃 기준) */}
            {serviceType && (
              <div>
                <div className="mb-3">
                  <p className="text-2xl font-extrabold text-gray-900">나가셔야 하는 시간</p>
                  <p className="text-xs text-gray-400 mt-0.5">살롱을 나가실 시간을 선택하시면 시술 시작 시간이 자동 계산됩니다</p>
                </div>
                {slotsLoading ? (
                  <div className="flex items-center justify-center h-48 rounded-2xl border border-gray-100 bg-gray-50">
                    <p className="text-sm text-gray-400">가능한 시간 확인 중...</p>
                  </div>
                ) : (
                  <>
                    <TimeWheel
                      value={selectedTime}
                      onChange={setSelectedTime}
                      availableSlots={availableCheckoutSlots}
                    />
                    {selectedTime && startTime && (
                      <div className="mt-4 bg-nunu/10 border-2 border-nunu/30 rounded-2xl px-5 py-5 shadow-sm">
                        <div className="text-[21px] leading-snug font-black text-nunu text-center tabular-nums">
                          <p>스타트 시간 {startTime}</p>
                          <p className="mt-1">아웃 시간 {selectedTime}</p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <Button size="lg"
              disabled={!selectedDate || !selectedTime || !serviceType}
              onClick={() => setStep(4)}>
              다음 단계
            </Button>
          </div>
        )}

        {/* ─── STEP 4: 스텝 선택 + 메모 ─── */}
        {step === 4 && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="font-bold text-lg text-gray-900">담당 스텝 선택</h2>
              <p className="text-sm text-gray-400 mt-0.5">
                {serviceType === 'both'
                  ? '헤어 스텝과 메이크업 스텝을 각각 선택해주세요'
                  : '원하시는 스텝을 선택하거나 랜덤 배정을 선택해주세요'}
              </p>
            </div>

            {/* ── 헤어 단독 / 메이크업 단독 ── */}
            {serviceType !== 'both' && (() => {
              const list = serviceType === 'hair' ? hairStaff : makeupStaff
              const label = serviceType === 'hair' ? '✂️ 헤어 스텝' : '💄 메이크업 스텝'
              return (
                <div className="flex flex-col gap-2" style={{ order: 3 }}>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{label}</p>
                  {/* 랜덤 */}
                  <button onClick={() => setSelectedStaff(null)}
                    className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all
                      ${!selectedStaff ? 'bg-nunu text-white border-nunu shadow-md' : 'bg-white text-gray-700 border-gray-200'}`}>
                    <span className="text-2xl">🎲</span>
                    <div className="text-left">
                      <p className="font-semibold text-sm">상관없음 (랜덤 배정)</p>
                      <p className={`text-xs ${!selectedStaff ? 'text-white/70' : 'text-gray-400'}`}>관리자가 최적의 스텝을 배정합니다</p>
                    </div>
                  </button>
                  {!selectedStaff && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
                      <span className="text-amber-500 text-sm">💡</span>
                      <div className="text-xs text-amber-800 font-medium">
                        <p>랜덤 배정 시 <span className="font-bold">지정비 추가요금 없습니다.</span></p>
                        <p className="mt-1 text-amber-700">담당 스텝 지정 시 추가비가 발생됩니다.</p>
                      </div>
                    </div>
                  )}
                  {list.map(s => (
                    <button key={s.id} onClick={() => setSelectedStaff(s)}
                      className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all
                        ${selectedStaff?.id === s.id ? 'border-nunu bg-nunu/5 shadow-sm' : 'bg-white text-gray-700 border-gray-200'}`}>
                      <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                        style={{ backgroundColor: s.color }}>{s.name[0]}</div>
                      <div className="text-left flex-1">
                        <p className={`font-semibold text-sm ${selectedStaff?.id === s.id ? 'text-nunu' : 'text-gray-900'}`}>
                          {s.name} {s.title}
                        </p>
                      </div>
                      {selectedStaff?.id === s.id && <span className="text-nunu text-lg">✓</span>}
                    </button>
                  ))}
                </div>
              )
            })()}

            {/* ── 헤어+메이크업: 두 섹션 동시 표시 ── */}
            {serviceType === 'both' && (
              <div className="flex flex-col gap-5">
                {/* 헤어 스텝 섹션 */}
                <div className="flex flex-col gap-2" style={{ order: 3 }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">✂️ 헤어 스텝</span>
                    {selectedHairStaff && (
                      <span className="text-xs bg-nunu/10 text-nunu px-2 py-0.5 rounded-full font-semibold">
                        {selectedHairStaff.name} 선택됨
                      </span>
                    )}
                  </div>
                  <button onClick={() => setSelectedHairStaff(null)}
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all
                      ${!selectedHairStaff ? 'bg-nunu text-white border-nunu shadow-md' : 'bg-white text-gray-700 border-gray-200'}`}>
                    <span className="text-xl">🎲</span>
                    <p className="font-semibold text-sm">랜덤 배정</p>
                  </button>
                  {hairStaff.map(s => (
                    <button key={s.id} onClick={() => setSelectedHairStaff(s)}
                      className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all
                        ${selectedHairStaff?.id === s.id ? 'border-nunu bg-nunu/5 shadow-sm' : 'bg-white text-gray-700 border-gray-200'}`}>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                        style={{ backgroundColor: s.color }}>{s.name[0]}</div>
                      <div className="text-left flex-1">
                        <p className={`font-semibold text-sm ${selectedHairStaff?.id === s.id ? 'text-nunu' : 'text-gray-900'}`}>
                          {s.name} {s.title}
                        </p>
                      </div>
                      {selectedHairStaff?.id === s.id && <span className="text-nunu text-lg">✓</span>}
                    </button>
                  ))}
                </div>

                {/* 구분선 */}
                <div className="border-t border-gray-100" style={{ order: 2 }} />

                {/* 메이크업 스텝 섹션 */}
                <div className="flex flex-col gap-2" style={{ order: 1 }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">💄 메이크업 스텝</span>
                    {selectedMakeupStaff && (
                      <span className="text-xs bg-nunu/10 text-nunu px-2 py-0.5 rounded-full font-semibold">
                        {selectedMakeupStaff.name} 선택됨
                      </span>
                    )}
                  </div>
                  <button onClick={() => setSelectedMakeupStaff(null)}
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all
                      ${!selectedMakeupStaff ? 'bg-nunu text-white border-nunu shadow-md' : 'bg-white text-gray-700 border-gray-200'}`}>
                    <span className="text-xl">🎲</span>
                    <p className="font-semibold text-sm">랜덤 배정</p>
                  </button>
                  {makeupStaff.map(s => (
                    <button key={s.id} onClick={() => setSelectedMakeupStaff(s)}
                      className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all
                        ${selectedMakeupStaff?.id === s.id ? 'border-nunu bg-nunu/5 shadow-sm' : 'bg-white text-gray-700 border-gray-200'}`}>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                        style={{ backgroundColor: s.color }}>{s.name[0]}</div>
                      <div className="text-left flex-1">
                        <p className={`font-semibold text-sm ${selectedMakeupStaff?.id === s.id ? 'text-nunu' : 'text-gray-900'}`}>
                          {s.name} {s.title}
                        </p>
                      </div>
                      {selectedMakeupStaff?.id === s.id && <span className="text-nunu text-lg">✓</span>}
                    </button>
                  ))}
                </div>

                {/* 랜덤 안내 (둘 다 랜덤일 때) */}
                {!selectedHairStaff && !selectedMakeupStaff && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2" style={{ order: 4 }}>
                    <span className="text-amber-500 text-sm">💡</span>
                    <div className="text-xs text-amber-800 font-medium">
                      <p>랜덤 배정 시 <span className="font-bold">지정비 추가요금 없습니다.</span></p>
                      <p className="mt-1 text-amber-700">담당 스텝 지정 시 추가비가 발생됩니다.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 요청사항 메모 */}
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
              <div className="flex justify-between"><span className="text-gray-500">예약자</span><span className="font-medium">{name} ({phone})</span></div>
              <div className="flex justify-between"><span className="text-gray-500">날짜</span><span className="font-medium">{selectedDateLabel}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">시술 시작</span><span className="font-medium">{startTime}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">나가시는 시간</span><span className="font-medium">{selectedTime}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">시술</span><span className="font-medium">
                {serviceType === 'hair' ? '✂️ 헤어' : serviceType === 'makeup' ? '💄 메이크업' : '✨ 헤어+메이크업'}
              </span></div>
              {serviceType === 'both' ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">💄 메이크업 스텝</span>
                    <span className="font-medium">{selectedMakeupStaff ? `${selectedMakeupStaff.name} ${selectedMakeupStaff.title}` : '랜덤 배정'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">✂️ 헤어 스텝</span>
                    <span className="font-medium">{selectedHairStaff ? `${selectedHairStaff.name} ${selectedHairStaff.title}` : '랜덤 배정'}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between">
                  <span className="text-gray-500">담당 스텝</span>
                  <span className="font-medium">{selectedStaff ? `${selectedStaff.name} ${selectedStaff.title}` : '랜덤 배정'}</span>
                </div>
              )}
            </div>

            <Button size="lg" variant="gold" onClick={() => setShowConfirm(true)}>
              예약 요청하기
            </Button>
            <p className="text-xs text-center text-gray-400">
              관리자 확정 후 연락드립니다 · {SALON_PHONE}
            </p>
          </div>
        )}
      </div>

      {/* 확인 모달 */}
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
                관리자 확인 후 {phone}으로 연락드립니다
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-sm flex flex-col gap-2">
              <div className="flex justify-between"><span className="text-gray-500">날짜</span><span className="font-medium">{selectedDateLabel}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">시술 시작</span><span className="font-medium">{startTime}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">나가시는 시간</span><span className="font-medium">{selectedTime}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">시술</span><span className="font-medium">
                {serviceType === 'hair' ? '헤어' : serviceType === 'makeup' ? '메이크업' : '헤어+메이크업'}
              </span></div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowConfirm(false)}>취소</Button>
              <Button variant="gold" className="flex-1" loading={submitting} onClick={submit}>요청하기</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
