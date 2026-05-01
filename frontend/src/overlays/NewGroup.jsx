import React, { useEffect, useRef, useState } from 'react'
import Overlay, { ConfirmDialog } from './Overlay.jsx'
import { Avatar, GroupAvatar, ICONS } from '../shared.jsx'

const ACCENTS = [
  { value: '#7b8fff', label: 'Indigo' },
  { value: '#43d98e', label: 'Mint' },
  { value: '#d97a4a', label: 'Terracotta' },
  { value: '#e07ba1', label: 'Rose' },
  { value: '#7cc4d9', label: 'Sky' },
  { value: '#c4a87b', label: 'Sand' },
  { value: '#b07be0', label: 'Violet' },
]

const MAX_MEMBERS = 2  // hard-capped for now per the spec

export default function NewGroup({ characters = [], onCreate, onClose }) {
  const [name, setName] = useState('')
  const [accent, setAccent] = useState(ACCENTS[0].value)
  const [selected, setSelected] = useState([])  // array of charId
  const [search, setSearch] = useState('')
  const [confirmExit, setConfirmExit] = useState(false)
  const [overflowToast, setOverflowToast] = useState(false)
  const overflowTimerRef = useRef(null)

  // Auto-suggest a name once two members have been picked. The user can
  // freely override it; we only auto-fill while the field is empty.
  useEffect(() => {
    if (name.trim()) return
    const picked = selected.map(id => characters.find(c => c.id === id)).filter(Boolean)
    if (picked.length === 2) setName(`${picked[0].name} & ${picked[1].name}`)
  }, [selected, characters])

  const toggle = (id) => {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= MAX_MEMBERS) {
        // Show a small toast — can't add a third.
        setOverflowToast(true)
        clearTimeout(overflowTimerRef.current)
        overflowTimerRef.current = setTimeout(() => setOverflowToast(false), 2400)
        return prev
      }
      return [...prev, id]
    })
  }

  const filtered = search.trim()
    ? characters.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : characters

  const isDirty = name.trim() !== '' || selected.length > 0
  const canCreate = name.trim() !== '' && selected.length === MAX_MEMBERS

  const attemptClose = () => {
    if (isDirty) setConfirmExit(true)
    else onClose()
  }

  const submit = () => {
    if (!canCreate) return
    onCreate({
      name: name.trim(),
      accent,
      participants: selected,
      blurb: '',
    })
  }

  // Build the live composite-avatar preview from the picked characters.
  const previewMembers = selected
    .map(id => characters.find(c => c.id === id))
    .filter(Boolean)

  return (
    <Overlay onClose={attemptClose} width={560}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--sl-border)' }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>New group chat</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="sl-btn-ghost" onClick={attemptClose}>Cancel</button>
          <button className="sl-btn" onClick={submit} disabled={!canCreate}>Create</button>
        </div>
      </div>

      <div className="sl-scroll" style={{ overflowY: 'auto', padding: 0 }}>
        {/* Top: avatar preview + name + accent */}
        <div style={{ padding: '20px 24px', display: 'flex', gap: 16, alignItems: 'center', borderBottom: '1px solid var(--sl-border)' }}>
          <div style={{ flexShrink: 0 }}>
            {previewMembers.length > 0
              ? <GroupAvatar participants={previewMembers} size={64} />
              : <div style={{ width: 64, height: 64, borderRadius: '50%', background: accent, opacity: 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 24, fontWeight: 600 }}>?</div>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sl-label" style={{ marginBottom: 6 }}>Group name</div>
            <input
              className="sl-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={previewMembers.length === 2 ? `${previewMembers[0].name} & ${previewMembers[1].name}` : 'Two friends, working title…'}
              autoFocus
            />
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="sl-label" style={{ marginBottom: 0 }}>Accent</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ACCENTS.map(a => (
                  <button key={a.value} onClick={() => setAccent(a.value)} title={a.label} style={{
                    width: 24, height: 24, borderRadius: '50%', background: a.value,
                    border: accent === a.value ? '2px solid white' : '2px solid transparent',
                    boxShadow: accent === a.value ? '0 0 0 1.5px var(--sl-accent)' : 'none',
                    cursor: 'pointer', padding: 0,
                  }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Members */}
        <div style={{ padding: '14px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div className="sl-label" style={{ marginBottom: 0 }}>Members</div>
          <div style={{ fontSize: 11.5, color: 'var(--sl-muted)' }}>{selected.length} / {MAX_MEMBERS} selected</div>
        </div>

        <div style={{ padding: '8px 16px 0' }}>
          <input className="sl-input" placeholder="Search characters" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div style={{ padding: '8px 8px 16px' }}>
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--sl-muted)', fontSize: 13 }}>
              {characters.length === 0 ? 'You have no characters yet — create one first.' : `No characters match “${search}”.`}
            </div>
          )}
          {filtered.map(c => {
            const isSelected = selected.includes(c.id)
            return (
              <button key={c.id} onClick={() => toggle(c.id)} style={{
                display: 'flex', gap: 12, padding: '10px 12px', alignItems: 'center',
                width: '100%', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer',
                background: isSelected ? 'var(--sl-accent-soft)' : 'transparent',
                border: 'none', color: 'inherit', borderRadius: 10,
              }}>
                <Avatar char={c} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</div>
                  {c.blurb && <div style={{ fontSize: 12, color: 'var(--sl-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.blurb}</div>}
                </div>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  border: `2px solid ${isSelected ? 'var(--sl-accent)' : 'var(--sl-border-strong)'}`,
                  background: isSelected ? 'var(--sl-accent)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', flexShrink: 0,
                }}>
                  {isSelected ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> : null}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {overflowToast && (
        <div style={{
          position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)',
          background: '#1a1f30', border: '1px solid rgba(255,255,255,0.12)',
          color: '#e8ecf5', padding: '8px 14px', borderRadius: 10, fontSize: 12.5,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 50,
        }}>
          Only {MAX_MEMBERS} members allowed for now.
        </div>
      )}

      {confirmExit && (
        <ConfirmDialog
          title="Discard group?"
          body="You've started setting up a group but haven't created it yet. Closing now will lose what you've entered."
          confirmLabel="Discard"
          onCancel={() => setConfirmExit(false)}
          onConfirm={() => { setConfirmExit(false); onClose() }}
        />
      )}
    </Overlay>
  )
}
