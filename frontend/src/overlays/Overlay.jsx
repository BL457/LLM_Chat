import React from 'react'

export default function Overlay({ children, onClose, width = 880 }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div onClick={e => e.stopPropagation()} className="sl-screen-enter" style={{
        width: `min(${width}px, 92%)`, maxHeight: '88%',
        background: 'var(--sl-surface)', border: '1px solid var(--sl-border)',
        borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        position: 'relative',
      }}>{children}</div>
    </div>
  )
}

export function ConfirmDialog({ title, body, confirmLabel, onCancel, onConfirm }) {
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 2100,
      background: 'rgba(5,7,14,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#161c2c', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14, width: 360, padding: 22,
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13.5, color: 'var(--sl-muted)', lineHeight: 1.5, marginBottom: 18 }}>{body}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="sl-btn-ghost" onClick={onCancel}>Cancel</button>
          <button onClick={onConfirm} style={{
            background: '#c75555', border: 'none', color: 'white',
            padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
