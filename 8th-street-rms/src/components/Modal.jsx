import { useEffect, useState } from 'react'
import './Modal.css'

function Modal({ isOpen, title, children, onClose }) {
  const [shouldRender, setShouldRender] = useState(isOpen)
  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true)
      setIsClosing(false)
      document.body.style.overflow = 'hidden'
      return
    }

    if (shouldRender) {
      setIsClosing(true)
      const timer = setTimeout(() => {
        setShouldRender(false)
        setIsClosing(false)
        document.body.style.overflow = ''
      }, 180)

      return () => clearTimeout(timer)
    }
  }, [isOpen, shouldRender])

  useEffect(() => {
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  if (!shouldRender) return null

  return (
    <div
      className={`modal-overlay ${isClosing ? 'closing' : ''}`}
      onMouseDown={onClose}
      role="presentation"
    >
      <section
        className={`modal-card ${isClosing ? 'closing' : ''}`}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button className="modal-close" type="button" onClick={onClose}>
            &times;
          </button>
        </div>

        {children}
      </section>
    </div>
  )
}

export default Modal
