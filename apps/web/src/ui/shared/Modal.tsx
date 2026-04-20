import { ReactNode, useEffect } from 'react'

export default function Modal(props: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const { open, title, children, onClose } = props

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="modalOverlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div className="modalTitle">{title}</div>
          <button className="iconBtn" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <div className="modalBody">{children}</div>
      </div>
    </div>
  )
}

