import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

const ROLE_LABEL  = { hair: '헤어', makeup: '메이크업' }
const PERM_LABEL  = { full: '전체 권한', view_only: '조회만' }
const COLOR_OPTIONS = [
  '#D4537E','#7F77DD','#4FAFCE','#52B788','#F4A261','#E76F51','#A8DADC','#E9C46A','#9B5DE5','#00BBF9'
]

const EMPTY_FORM = {
  name: '', role: 'hair', title: '', email: '',
  permission_level: 'view_only', color: '#7F77DD', is_admin: false, is_active: true,
}

// ── 스텝 카드 ──────────────────────────────────────────────
function StaffCard({ member, onEdit, onToggle, onPermission, canEdit }) {
  const hasFullPermission = member.permission_level === 'full' || member.is_admin
  return (
    <div className={`bg-white rounded-2xl p-4 shadow-sm border transition-all
      ${member.is_active ? 'border-gray-100' : 'border-gray-200 opacity-60'}`}>
      <div className="flex items-start gap-3">
        {/* 컬러 아바타 */}
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
          style={{ backgroundColor: member.color || '#888' }}>
          {member.name?.[0] || '?'}
        </div>

        {/* 정보 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{member.name}</span>
            {member.title && <span className="text-xs text-gray-400">{member.title}</span>}
            {member.is_admin && (
              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">관리자</span>
            )}
            {!member.is_active && (
              <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">비활성</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-gray-500">{ROLE_LABEL[member.role] || member.role}</span>
            <span className="text-gray-200">·</span>
            <span className="text-xs text-gray-500">{PERM_LABEL[member.permission_level] || member.permission_level}</span>
            {member.email && <>
              <span className="text-gray-200">·</span>
              <span className="text-xs text-gray-400 truncate">{member.email}</span>
            </>}
          </div>
        </div>

        {/* 액션 버튼 */}
        {canEdit && (
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={() => onEdit(member)}
              className="w-8 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-500 flex items-center justify-center transition-colors">
              ✏️
            </button>
            <button onClick={() => onPermission(member)}
              className={`h-8 px-2 rounded-lg text-[11px] font-semibold transition-colors
                ${hasFullPermission ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-nunu text-white hover:opacity-90'}`}>
              {hasFullPermission ? '해제' : '권한'}
            </button>
            <button onClick={() => onToggle(member)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors
                ${member.is_active ? 'bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-400' : 'bg-green-50 hover:bg-green-100 text-green-500'}`}>
              {member.is_active ? '🚫' : '✅'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 스텝 추가/수정 모달 ────────────────────────────────────
function StaffModal({ member, onClose, onSaved }) {
  const [form, setForm] = useState(member ? { ...member } : EMPTY_FORM)
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.name.trim()) { toast.error('이름을 입력해주세요'); return }
    if (!form.role)        { toast.error('직종을 선택해주세요'); return }

    setLoading(true)
    try {
      const permissionLevel = form.is_admin || form.permission_level === 'full' ? 'full' : 'view_only'
      const payload = {
        name: form.name.trim(),
        role: form.role,
        title: form.title.trim() || null,
        email: form.email.trim().toLowerCase() || null,
        permission_level: permissionLevel,
        color: form.color,
        is_admin: permissionLevel === 'full',
        is_active: form.is_active,
      }

      let savedData = null
      if (member?.id && !member.id.startsWith('whitelist')) {
        // 수정 — .select().single()으로 수정된 행 즉시 반환
        const { data, error } = await supabase
          .from('staff').update(payload).eq('id', member.id)
          .select().single()
        if (error) throw error
        savedData = data
      } else {
        // 신규 — .select().single()으로 삽입된 행 즉시 반환
        const { data, error } = await supabase
          .from('staff').insert(payload)
          .select().single()
        if (error) throw error
        savedData = data
      }

      toast.success(member ? '스텝 정보가 수정됐습니다' : '스텝이 추가됐습니다')
      onSaved(savedData)
    } catch (e) {
      toast.error(e.message || '저장 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-md p-6 pb-10 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        {/* 핸들 */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

        <h2 className="text-lg font-bold text-gray-900 mb-5">
          {member ? '스텝 정보 수정' : '새 스텝 추가'}
        </h2>

        <div className="flex flex-col gap-4">
          {/* 이름 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">이름 *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-nunu"
              placeholder="예: 지현" />
          </div>

          {/* 직함 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">직함</label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-nunu"
              placeholder="예: 원장, 디자이너" />
          </div>

          {/* 직종 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">직종 *</label>
            <div className="flex gap-2">
              {['hair', 'makeup'].map(r => (
                <button key={r} onClick={() => set('role', r)}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-all
                    ${form.role === r ? 'bg-nunu text-white border-nunu' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </div>

          {/* 권한 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">권한</label>
            <div className="flex gap-2">
              {[['full', '전체 권한'], ['view_only', '조회만']].map(([v, l]) => (
                <button key={v} onClick={() => setForm(f => ({ ...f, permission_level: v, is_admin: v === 'full' }))}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-all
                    ${form.permission_level === v ? 'bg-nunu text-white border-nunu' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* 이메일 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">로그인 이메일</label>
            <input value={form.email} onChange={e => set('email', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-nunu"
              placeholder="이메일 (로그인용)" type="email" />
            <p className="text-xs text-gray-400 mt-1">Supabase Auth에 등록된 이메일과 일치해야 합니다</p>
          </div>

          {/* 컬러 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">대표 색상</label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map(c => (
                <button key={c} onClick={() => set('color', c)}
                  className={`w-9 h-9 rounded-xl transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          {/* 관리자 여부 */}
          <div className="flex items-center justify-between py-3 border-t border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-700">관리자 권한</p>
              <p className="text-xs text-gray-400">예약 확정·거절·스텝 관리 가능</p>
            </div>
            <button onClick={() => setForm(f => {
              const next = !f.is_admin
              return { ...f, is_admin: next, permission_level: next ? 'full' : 'view_only' }
            })}
              className={`w-12 h-6 rounded-full transition-all ${form.is_admin ? 'bg-nunu' : 'bg-gray-200'}`}>
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-all mx-0.5 ${form.is_admin ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* 저장 버튼 */}
          <button onClick={handleSave} disabled={loading}
            className="w-full py-4 bg-nunu text-white rounded-xl font-semibold text-sm disabled:opacity-50 mt-1 transition-opacity">
            {loading ? '저장 중...' : member ? '수정 완료' : '스텝 추가'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 메인 스텝 관리 페이지 ──────────────────────────────────
export function AdminStaff() {
  const { canEdit, staffProfile } = useAuth()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [showInactive, setShowInactive] = useState(false)

  useEffect(() => { fetchStaff() }, [])

  async function fetchStaff() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .order('is_admin', { ascending: false })
        .order('created_at')

      if (error) throw error
      setMembers(data || [])
    } catch (e) {
      // 오류 시 기존 목록 유지 (setMembers([]) 제거 — 전체 목록이 사라지는 버그 방지)
      toast.error('스텝 목록을 불러올 수 없습니다')
    } finally {
      setLoading(false)
    }
  }

  async function handleToggle(member) {
    if (!canEdit) { toast.error('권한이 없습니다'); return }
    try {
      const { error } = await supabase
        .from('staff')
        .update({ is_active: !member.is_active })
        .eq('id', member.id)
      if (error) throw error
      toast.success(member.is_active ? '비활성화 됐습니다' : '활성화 됐습니다')
      fetchStaff()
    } catch (e) {
      toast.error(e.message || '변경 실패')
    }
  }

  async function handlePermission(member) {
    if (!canEdit) { toast.error('권한이 없습니다'); return }
    const hasFullPermission = member.permission_level === 'full' || member.is_admin
    const next = hasFullPermission ? 'view_only' : 'full'
    try {
      const { error } = await supabase
        .from('staff')
        .update({ permission_level: next, is_admin: next === 'full' })
        .eq('id', member.id)
      if (error) throw error
      toast.success(next === 'full' ? '전체 권한을 부여했습니다' : '조회 권한으로 변경했습니다')
      setMembers(prev => prev.map(m => m.id === member.id ? { ...m, permission_level: next, is_admin: next === 'full' } : m))
    } catch (e) {
      toast.error(e.message || '권한 변경 실패')
    }
  }

  function handleEdit(member) {
    setEditTarget(member)
    setShowModal(true)
  }

  function handleAdd() {
    setEditTarget(null)
    setShowModal(true)
  }

  function handleClose() {
    setShowModal(false)
    setEditTarget(null)
  }

  function handleSaved(savedMember) {
    handleClose()
    if (savedMember) {
      // insert/update 응답 데이터로 로컬 state 직접 업데이트
      // → fetchStaff 재조회 없이 즉시 반영, RLS 필터링 문제 원천 차단
      setMembers(prev => {
        const exists = prev.some(m => m.id === savedMember.id)
        if (exists) {
          return prev.map(m => m.id === savedMember.id ? savedMember : m)
        }
        return [...prev, savedMember]
      })
    } else {
      fetchStaff()
    }
  }

  const visible = members.filter(m => showInactive ? true : m.is_active)
  const active   = members.filter(m => m.is_active).length
  const inactive = members.filter(m => !m.is_active).length

  return (
    <div className="p-4 pb-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900">스텝 관리</h2>
          <p className="text-sm text-gray-400 mt-0.5">활성 {active}명 · 비활성 {inactive}명</p>
        </div>
        {canEdit && (
          <button onClick={handleAdd}
            className="flex items-center gap-1.5 bg-nunu text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm active:scale-95 transition-transform">
            <span className="text-base">+</span> 추가
          </button>
        )}
      </div>

      {/* 비활성 토글 */}
      {inactive > 0 && (
        <button onClick={() => setShowInactive(v => !v)}
          className="text-xs text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
          {showInactive ? '👁 비활성 숨기기' : `👁 비활성 ${inactive}명 보기`}
        </button>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-nunu border-t-transparent rounded-full animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-3">👤</p>
          <p className="text-sm font-medium">등록된 스텝이 없습니다</p>
          {canEdit && (
            <button onClick={handleAdd}
              className="mt-4 text-sm text-nunu font-medium hover:underline">
              + 첫 스텝 추가하기
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map(m => (
            <StaffCard key={m.id} member={m}
              onEdit={handleEdit} onToggle={handleToggle} onPermission={handlePermission} canEdit={canEdit} />
          ))}
        </div>
      )}

      {/* 모달 */}
      {showModal && (
        <StaffModal member={editTarget} onClose={handleClose} onSaved={handleSaved} />
      )}
    </div>
  )
}
