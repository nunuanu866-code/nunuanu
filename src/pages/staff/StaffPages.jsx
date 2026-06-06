import { useState, useEffect } from 'react'
import { supabase, serviceLabel } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Card, EmptyState, LoadingSpinner, Button } from '../../components/ui/index'
import { format, addDays, subDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import toast from 'react-hot-toast'

export function StaffSchedule() {
  const { profile } = useAuth()
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [myOnly, setMyOnly] = useState(false)
  const [selected, setSelected] = useState(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSchedule()
  }, [date])

  async function loadSchedule() {
    setLoading(true)
    const { data } = await supabase
      .from('bookings')
      .select('*, customers(name, phone), assigned_staff_detail:assigned_staff')
      .eq('booking_date', date)
      .eq('status', 'confirmed')
      .order('start_time', { ascending: true })
    setBookings(data || [])
    setLoading(false)
  }

  const displayed = myOnly
    ? bookings.filter(b => b.assigned_staff?.some(a => a.staff_id === profile?.id))
    : bookings

  async function saveNote(bookingId) {
    setSaving(true)
    try {
      const booking = bookings.find(b => b.id === bookingId)
      const updatedNotes = { ...(booking.staff_notes || {}), [profile.id]: note }
      const { error } = await supabase
        .from('bookings').update({ staff_notes: updatedNotes }).eq('id', bookingId)
      if (error) throw error
      toast.success('메모가 저장되었습니다')
      setSelected(null)
      loadSchedule()
    } catch {
      toast.error('저장에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col">
      {/* 날짜 + 필터 */}
      <div className="px-5 py-3 bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => setDate(format(subDays(new Date(date), 1), 'yyyy-MM-dd'))}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100">←</button>
          <div className="text-center">
            <p className="font-semibold">{format(new Date(date), 'M월 d일 (E)', { locale: ko })}</p>
            <p className="text-xs text-gray-400">{displayed.length}건</p>
          </div>
          <button onClick={() => setDate(format(addDays(new Date(date), 1), 'yyyy-MM-dd'))}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100">→</button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setMyOnly(false)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${!myOnly ? 'bg-nunu text-white' : 'bg-gray-100 text-gray-600'}`}>
            전체 스케줄
          </button>
          <button onClick={() => setMyOnly(true)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${myOnly ? 'bg-nunu text-white' : 'bg-gray-100 text-gray-600'}`}>
            내 담당만
          </button>
        </div>
      </div>

      <div className="px-5 py-4">
        {loading ? <LoadingSpinner /> :
         displayed.length === 0 ? <EmptyState icon="📅" title="확정된 예약이 없습니다" /> : (
          <div className="flex flex-col gap-3">
            {displayed.map(b => {
              const isMyBooking = b.assigned_staff?.some(a => a.staff_id === profile?.id)
              return (
                <div key={b.id}
                  className={`bg-white rounded-2xl border p-4 flex flex-col gap-2 cursor-pointer active:scale-98 transition-transform
                    ${isMyBooking ? 'border-nunu/30 bg-nunu/5' : 'border-gray-100'}`}
                  onClick={() => {
                    setSelected(b)
                    setNote(b.staff_notes?.[profile?.id] || '')
                  }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{b.customers?.name}</p>
                      <p className="text-sm text-gray-500">{b.start_time?.slice(0,5)} ~ {b.end_time?.slice(0,5)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">확정</span>
                      {isMyBooking && <span className="text-xs bg-nunu/10 text-nunu px-2 py-0.5 rounded-full font-medium">내 담당</span>}
                    </div>
                  </div>
                  <p className="text-sm text-gray-500">{serviceLabel[b.service_type]}</p>
                  {b.service_detail && <p className="text-sm text-gray-400">{b.service_detail}</p>}
                  {b.staff_notes?.[profile?.id] && (
                    <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">📝 {b.staff_notes[profile.id]}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 메모 입력 바텀시트 */}
      {selected && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelected(null)} />
          <div className="relative bg-white rounded-t-3xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">{selected.customers?.name} — 메모</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400">✕</button>
            </div>
            <div className="text-sm text-gray-500">
              {selected.start_time?.slice(0,5)} ~ {selected.end_time?.slice(0,5)} · {serviceLabel[selected.service_type]}
            </div>
            {selected.customer_memo && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">고객 요청사항</p>
                <p className="text-sm text-gray-700">{selected.customer_memo}</p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">특이사항 / 메모</p>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
                placeholder="시술 중 특이사항을 기록하세요..."
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none outline-none focus:border-nunu"
              />
            </div>
            <Button variant="gold" loading={saving} onClick={() => saveNote(selected.id)}>저장</Button>
          </div>
        </div>
      )}
    </div>
  )
}
