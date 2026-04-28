import React, { useState, useMemo } from 'react'
import Overlay from './Overlay.jsx'
import { ICONS } from '../shared.jsx'

export default function Gallery({ char, onClose }) {
  const [focusIdx, setFocusIdx] = useState(null)

  // Derive gallery from messages with images.
  const items = useMemo(() => {
    const out = []
    for (const m of (char.messages || [])) {
      if (m.image && m.image.status === 'ready' && m.image.src) {
        out.push({ id: m.id, src: m.image.src, time: m.time, caption: (m.image.tags || '').split(',').slice(0, 4).join(', ') })
      }
    }
    return out.reverse()
  }, [char.messages])

  return (
    <Overlay onClose={onClose} width={760}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--sl-border)' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Scene gallery</div>
          <div style={{ fontSize: 12, color: 'var(--sl-muted)', marginTop: 2 }}>{items.length} image{items.length === 1 ? '' : 's'} · {char.name}</div>
        </div>
        <button className="sl-icon-btn" onClick={onClose}>{ICONS.close}</button>
      </div>
      <div className="sl-scroll" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: 16, overflowY: 'auto' }}>
        {items.map((g, i) => (
          <button key={g.id} onClick={() => setFocusIdx(i)} style={{
            background: 'var(--sl-bg)', borderRadius: 10, overflow: 'hidden',
            cursor: 'pointer', border: '1px solid var(--sl-border)', padding: 0, fontFamily: 'inherit', color: 'inherit', textAlign: 'left',
          }}>
            <img src={g.src} alt={g.caption} style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }} />
            <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--sl-muted)' }}>
              <div style={{ color: 'var(--sl-text)', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.caption || '—'}</div>
              <div style={{ marginTop: 2 }}>{g.time}</div>
            </div>
          </button>
        ))}
        {items.length === 0 && (
          <div style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', color: 'var(--sl-muted)', fontSize: 13 }}>
            No images yet. Generate one from a message's right-click menu.
          </div>
        )}
      </div>
      {focusIdx != null && (
        <div onClick={() => setFocusIdx(null)} style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20,
        }}>
          <img src={items[focusIdx].src} style={{ maxWidth: '90%', maxHeight: '90%', borderRadius: 8 }} />
        </div>
      )}
    </Overlay>
  )
}
