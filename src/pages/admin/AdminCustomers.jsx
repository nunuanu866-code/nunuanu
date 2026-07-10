import { useState, useEffect } from 'react'
import { supabase, serviceLabel, SALON_PHONE } from '../../lib/supabase'
import { Card, EmptyState, LoadingSpinner, Badge } from '../../components/ui/index'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

// ─────────────────────────────────────────
// 관리자 고객 관리 (화면 F)
// ─────────────────────────────────────────
const SYSTEM_CUSTOMER_PHONE_PREFIXES = ['staff_auth:', 'staff_att:', 'staff_vis:', 'staff_profile:', 'audit_log', 'system:']
const SYSTEM_CUSTOMER_NAME_PREFIXES = ['[스텝승인]', '[출퇴근]', '[노출설정]', '[스텝정보]', '[시스템]']
const SYSTEM_CUSTOMER_MEMOS = [
  'staff attendance system row',
  'staff visibility system row',
  'staff profile system row',
  'audit log system row',
  'system internal records anchor'
]
const SYSTEM_BOOKING_SERVICES = new Set([
  'STAFF_AUTH',
  'CUSTOMER_META',
  'STAFF_ATTENDANCE',
  'STAFF_VISIBILITY',
  'STAFF_PROFILE',
  'AUDIT_LOG'
])

function isSystemCustomer(customer) {
  const phone = String(customer?.phone || '')
  const name = String(customer?.name || '').trim()
  const memo = String(customer?.memo || '').trim()
  return SYSTEM_CUSTOMER_PHONE_PREFIXES.some(prefix => phone.startsWith(prefix)) ||
    SYSTEM_CUSTOMER_NAME_PREFIXES.some(prefix => name.startsWith(prefix)) ||
    SYSTEM_CUSTOMER_MEMOS.includes(memo)
}

function isSystemBooking(booking) {
  return SYSTEM_BOOKING_SERVICES.has(booking?.service_detail)
}

export function AdminCustomers() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [customerBookings, setCustomerBookings] = useState([])
  const [bookingsLoading, setBookingsLoading] = useState(false)

  useEffect(() => {
    loadCustomers()
  }, [])

  async function loadCustomers() {
    setLoading(true)
    // 고객 목록 + 각 고객의 예약 수, 최근 방문일 집계
    const { data: customerData } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false })

    if (!customerData) { setLoading(false); return }
    const visibleCustomerData = customerData.filter(c => !isSystemCustomer(c))

    // 예약 통계 조회
    const { data: bookingStats } = await supabase
      .from('bookings')
      .select('customer_id, booking_date, status, service_detail')
      .in('status', ['confirmed', 'cancelled', 'rejected'])
      .order('booking_date', { ascending: false })

    // 고객별 통계 계산
    const statsMap = {}
    ;(bookingStats || []).filter(b => !isSystemBooking(b)).forEach(b => {
      if (!statsMap[b.customer_id]) {
        statsMap[b.customer_id] = { total: 0, confirmed: 0, lastVisit: null }
      }
      statsMap[b.customer_id].total++
      if (b.status === 'confirmed') {
        statsMap[b.customer_id].confirmed++
        if (!statsMap[b.customer_id].lastVisit || b.booking_date > statsMap[b.customer_id].lastVisit) {
          statsMap[b.customer_id].lastVisit = b.booking_date
        }
      }
    })

    const enriched = visibleCustomerData.map(c => ({
      ...c,
      stats: statsMap[c.id] || { total: 0, confirmed: 0, lastVisit: null }
    }))
    setCustomers(enriched)
    setLoading(false)
  }

  async function loadCustomerBookings(customerId) {
    setBookingsLoading(true)
    const { data } = await supabase
      .from('bookings')
      .select('*, requested_staff:requested_staff_id(name, color, role)')
      .eq('customer_id', customerId)
      .order('booking_date', { ascending: false })
      .limit(20)
    setCustomerBookings((data || []).filter(b => !isSystemBooking(b)))
    setBookingsLoading(false)
  }

  function handleSelectCustomer(customer) {
    setSelected(customer)
    loadCustomerBookings(customer.id)
  }

  // 전화번호 마스킹 (PRD 8.2)
  function maskPhone(phone) {
    if (!phone) return ''
    // +82로 시작하는 경우 변환
    const local = phone.startsWith('+82') ? '0' + phone.slice(3) : phone
    return local.replace(/(\d{3})-?(\d{4})-?(\d{4})/, '$1-****-$3')
  }

  const filtered = customers.filter(c => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return c.name?.toLowerCase().includes(q) ||
           c.phone?.includes(q.replace(/-/g, ''))
  })

  const statusColors = { pending: 'amber', confirmed: 'green', rejected: 'red', cancelled: 'gray' }
  const statusLabels = { pending: '확인중', confirmed: '확정', rejected: '거절됨', cancelled: '취소됨' }

  if (loading) return <LoadingSpinner />

  return (
    <div className="flex flex-col min-h-full">
      {/* 헤더 */}
      <div className="px-5 pt-5 pb-3 bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900">고객 관리</h2>
          <span className="text-sm text-gray-400">{customers.length}명</span>
        </div>
        {/* 검색 */}
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="이름 또는 전화번호로 검색"
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-nunu transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 고객 목록 */}
      <div className="px-5 py-4 flex flex-col gap-2">
        {filtered.length === 0 ? (
          <EmptyState icon="👥" title={search ? '검색 결과가 없습니다' : '등록된 고객이 없습니다'} />
        ) : (
          filtered.map(c => (
            <button key={c.id} onClick={() => handleSelectCustomer(c)}
              className="w-full bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 text-left hover:border-nunu/30 transition-all active:scale-98">
              {/* 아바타 */}
              <div className="w-11 h-11 rounded-full bg-apple-black flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                {c.name?.[0] || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900">{c.name}</p>
                  {c.stats.confirmed > 0 && (
                    <span className="text-xs bg-apple-parchment text-apple-blue px-1.5 py-0.5 rounded-full font-medium">
                      {c.stats.confirmed}회 방문
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400 mt-0.5">{maskPhone(c.phone)}</p>
              </div>
              <div className="text-right flex-shrink-0">
                {c.stats.lastVisit ? (
                  <>
                    <p className="text-xs text-gray-400">최근 방문</p>
                    <p className="text-xs font-medium text-gray-700">
                      {format(new Date(c.stats.lastVisit), 'M/d', { locale: ko })}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-gray-300">방문 없음</p>
                )}
              </div>
              <span className="text-gray-300 text-sm">›</span>
            </button>
          ))
        )}
      </div>

      {/* 고객 상세 바텀시트 */}
      {selected && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setSelected(null); setCustomerBookings([]) }} />
          <div className="relative bg-white rounded-t-3xl flex flex-col max-h-[85vh]">
            {/* 드래그 핸들 */}
            <div className="flex-shrink-0 pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* 고객 정보 헤더 */}
            <div className="flex-shrink-0 px-5 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-apple-black flex items-center justify-center text-white font-semibold">
                    {selected.name?.[0]}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">{selected.name}</h3>
                    <a href={`tel:${selected.phone}`}
                      className="text-sm text-nunu font-medium">
                      📞 {selected.phone?.startsWith('+82')
                        ? '0' + selected.phone.slice(3)
                        : selected.phone}
                    </a>
                  </div>
                </div>
                <button onClick={() => { setSelected(null); setCustomerBookings([]) }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500">
                  ✕
                </button>
              </div>
              {/* 통계 */}
              <div className="flex gap-3 mt-3">
                <div className="flex-1 bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-nunu">{selected.stats.confirmed}</p>
                  <p className="text-xs text-gray-500 mt-0.5">방문 횟수</p>
                </div>
                <div className="flex-1 bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-gray-800">{selected.stats.total}</p>
                  <p className="text-xs text-gray-500 mt-0.5">전체 예약</p>
                </div>
                <div className="flex-1 bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-sm font-bold text-gray-800">
                    {selected.stats.lastVisit
                      ? format(new Date(selected.stats.lastVisit), 'M/d', { locale: ko })
                      : '-'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">최근 방문</p>
                </div>
              </div>
            </div>

            {/* 예약 이력 */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">예약 이력</p>
              {bookingsLoading ? (
                <LoadingSpinner text="이력 불러오는 중..." />
              ) : customerBookings.length === 0 ? (
                <EmptyState icon="📋" title="예약 이력이 없습니다" />
              ) : (
                <div className="flex flex-col gap-2">
                  {customerBookings.map(b => (
                    <div key={b.id} className="bg-gray-50 rounded-xl p-3.5 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-900">
                          {format(new Date(b.booking_date), 'yyyy.M.d (E)', { locale: ko })}
                          <span className="text-gray-400 font-normal ml-1">
                            {b.start_time?.slice(0,5)} ~ {b.end_time?.slice(0,5)}
                          </span>
                        </p>
                        <Badge color={statusColors[b.status]}>{statusLabels[b.status]}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{serviceLabel[b.service_type]}</span>
                        {b.requested_staff && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full inline-block"
                                style={{ backgroundColor: b.requested_staff.color }} />
                              {b.requested_staff.name}
                            </span>
                          </>
                        )}
                      </div>
                      {b.service_detail && (
                        <p className="text-xs text-gray-400">{b.service_detail}</p>
                      )}
                      {b.customer_memo && (
                        <p className="text-xs text-gray-500 bg-white rounded-lg px-2.5 py-1.5 border border-gray-200">
                          💬 {b.customer_memo}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
