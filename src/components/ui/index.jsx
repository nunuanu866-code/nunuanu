// Button
export function Button({ children, onClick, variant = 'primary', size = 'md', disabled, loading, className = '', type = 'button', ...props }) {
  const base = 'inline-flex items-center justify-center font-normal transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes = { sm: 'px-4 py-2 text-sm', md: 'px-5 py-3 text-[15px]', lg: 'px-6 py-4 text-[17px] w-full' }
  const variants = {
    primary: 'bg-apple-blue text-white rounded-full',
    gold: 'bg-apple-blue text-white rounded-full',
    cream: 'bg-apple-pearl text-apple-ink border border-apple-hairline rounded-full',
    outline: 'bg-white text-apple-blue border border-apple-blue rounded-full',
    ghost: 'bg-transparent text-apple-blue rounded-full',
    danger: 'bg-red-500 text-white rounded-full'
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading}
      className={`${base} ${sizes[size]} ${variants[variant] || variants.primary} ${className}`} {...props}>
      {loading ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" /> : null}
      {children}
    </button>
  )
}

// Input
export function Input({ label, error, helper, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-2">
      {label && <label className="text-[14px] font-semibold text-apple-ink tracking-[-.224px]">{label}</label>}
      <input
        className={`w-full px-5 py-3 rounded-full border text-[17px] leading-[1.47] transition-colors outline-none bg-white
          ${error ? 'border-red-400 bg-red-50' : 'border-apple-hairline focus:border-apple-focus'}
          ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {helper && !error && <p className="text-xs text-apple-muted">{helper}</p>}
    </div>
  )
}

// Badge
export function Badge({ children, color = 'gray', className = '' }) {
  const colors = {
    gray: 'bg-apple-parchment text-apple-ink',
    green: 'bg-green-100 text-green-800',
    amber: 'bg-apple-parchment text-apple-ink',
    red: 'bg-red-100 text-red-800',
    blue: 'bg-blue-50 text-apple-blue',
    purple: 'bg-apple-pearl text-apple-ink',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[color]} ${className}`}>
      {children}
    </span>
  )
}

// Card
export function Card({ children, className = '', onClick }) {
  return (
    <div onClick={onClick}
      className={`bg-white rounded-2xl border border-apple-hairline p-4 ${onClick ? 'cursor-pointer active:scale-[.98] transition-transform' : ''} ${className}`}>
      {children}
    </div>
  )
}

// BottomSheet
export function BottomSheet({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl max-h-[90vh] flex flex-col shadow-modal">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-apple-hairline">
          <h3 className="text-[17px] font-semibold text-apple-ink tracking-[-.374px]">{title}</h3>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-[#d2d2d7]/70 text-apple-ink">×</button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
      </div>
    </div>
  )
}

// LoadingSpinner
export function LoadingSpinner({ text = '로딩 중...' }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] gap-3">
      <div className="w-8 h-8 border-2 border-apple-hairline border-t-apple-blue rounded-full animate-spin" />
      <p className="text-sm text-apple-muted">{text}</p>
    </div>
  )
}

// EmptyState
export function EmptyState({ icon = '예약', title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <span className="text-[34px] font-semibold tracking-[-.374px] text-apple-ink">{icon}</span>
      <p className="font-semibold text-apple-ink">{title}</p>
      {description && <p className="text-sm text-apple-muted max-w-xs">{description}</p>}
    </div>
  )
}
