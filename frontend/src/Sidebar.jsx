import React, { useEffect, useRef, useState } from 'react'
import { Avatar, GroupAvatar, ICONS } from './shared.jsx'

export default function Sidebar({ characters, activeId, onSelect, onNewChar, onNewGroup, onImportChar, onOpenSettings, onOpenUserProfile, userProfile, isMobile }) {
  const [search, setSearch] = useState('')
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const importRef = useRef(null)
  const addMenuRef = useRef(null)
  const filtered = characters.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))

  // Close the + Add popover on outside click.
  useEffect(() => {
    if (!addMenuOpen) return
    const onDoc = (e) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) setAddMenuOpen(false)
    }
    window.addEventListener('mousedown', onDoc)
    return () => window.removeEventListener('mousedown', onDoc)
  }, [addMenuOpen])

  const onPickImport = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    onImportChar && onImportChar(f)
    e.target.value = ''  // reset so the same file can be re-imported later
  }

  // Render the user's avatar — uses their picture, the first letter of their
  // name, or "?" if neither is set.
  const userInitial = (userProfile?.name?.[0] || '?').toUpperCase()
  const userAvatarChar = {
    name: userProfile?.name || '?',
    initial: userInitial,
    avatarUrl: userProfile?.avatarUrl || null,
    accent: userProfile?.accent || '#7b8fff',
  }

  return (
    <aside style={{
      width: isMobile ? '100%' : 320, flexShrink: 0, background: '#0c1020',
      borderRight: isMobile ? 'none' : '1px solid var(--sl-border)',
      display: 'flex', flexDirection: 'column', height: '100%',
    }}>
      <div style={{ padding: '20px 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.2 }}>Characters</div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button onClick={onOpenUserProfile} aria-label="My profile" title="My profile" style={{
            background: 'transparent', border: 'none', padding: 4, cursor: 'pointer',
            borderRadius: '50%', display: 'inline-flex',
          }}>
            <Avatar char={userAvatarChar} size={28} />
          </button>
          <button className="sl-icon-btn" onClick={onOpenSettings} aria-label="Settings" title="Settings">{ICONS.settings}</button>
        </div>
      </div>
      <div style={{ padding: '0 16px 12px', position: 'relative' }}>
        <span style={{ position: 'absolute', left: 28, top: 9, color: 'var(--sl-muted)', pointerEvents: 'none' }}>{ICONS.search}</span>
        <input className="sl-input" style={{ paddingLeft: 34 }} placeholder="Search characters" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="sl-scroll" style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
        {filtered.map(c => (
          <ChatRow key={c.id} char={c} active={c.id === activeId} onClick={() => onSelect(c.id)} />
        ))}
        {filtered.length === 0 && characters.length > 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--sl-muted)', fontSize: 13 }}>
            No characters match “{search}”.
          </div>
        )}
        {characters.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--sl-muted)', fontSize: 13 }}>
            No characters yet. Create one below to begin.
          </div>
        )}
      </div>
      <div ref={addMenuRef} style={{ padding: 12, borderTop: '1px solid var(--sl-border)', position: 'relative' }}>
        <input ref={importRef} type="file" accept=".llmchar,.json,application/json" onChange={onPickImport} style={{ display: 'none' }} />
        <button onClick={() => setAddMenuOpen(o => !o)} style={{
          width: '100%', background: 'var(--sl-surface)', color: 'var(--sl-text)',
          border: '1px dashed var(--sl-border-strong)', padding: '11px', borderRadius: 10,
          fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {ICONS.plus} Add
        </button>

        {addMenuOpen && (
          <div style={{
            position: 'absolute', left: 12, right: 12, bottom: 'calc(100% - 6px)',
            background: '#1a1f30', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10, padding: 6, zIndex: 30,
            boxShadow: '0 -8px 24px rgba(0,0,0,0.5)',
          }}>
            <AddMenuItem icon={ICONS.user} label="New character" onClick={() => { setAddMenuOpen(false); onNewChar && onNewChar() }} />
            <AddMenuItem icon={ICONS.message} label="New group chat" onClick={() => { setAddMenuOpen(false); onNewGroup && onNewGroup() }} />
            <AddMenuItem icon={ICONS.download} label="Import character file" onClick={() => { setAddMenuOpen(false); importRef.current?.click() }} />
          </div>
        )}
      </div>
    </aside>
  )
}

function AddMenuItem({ icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, width: '100%',
      background: 'transparent', border: 'none', color: '#e8ecf5',
      padding: '9px 12px', borderRadius: 6, fontSize: 13,
      cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <span style={{ display: 'inline-flex', color: 'var(--sl-muted)' }}>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function ChatRow({ char, active, onClick }) {
  const isGroup = char.kind === 'group'
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', gap: 12, padding: '10px 12px',
      background: active ? 'var(--sl-surface)' : 'transparent',
      border: 'none', color: 'inherit', textAlign: 'left', cursor: 'pointer',
      borderRadius: 10, fontFamily: 'inherit',
    }}>
      {isGroup
        ? <GroupAvatar participants={char.members || []} size={42} showOnline />
        : <Avatar char={char} size={42} showOnline />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            {char.pinned && <span style={{ color: 'var(--sl-accent)', display: 'inline-flex' }}>{ICONS.pin}</span>}
            {char.name}
          </span>
          <span style={{ fontSize: 11, color: 'var(--sl-muted)', flexShrink: 0 }}>{char.lastTime || ''}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3, gap: 8 }}>
          <span style={{ fontSize: 12.5, color: 'var(--sl-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
            {char.typing
              ? (
                <span style={{ color: 'var(--sl-accent)', fontStyle: 'italic', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {/* For groups, the actively speaking member is on
                      char.typingSpeaker so we name THEM, not the group. */}
                  {(char.typingSpeaker?.name || char.name)} is typing
                  <span className="sl-typingdots" style={{ paddingBottom: 1 }}><span /><span /><span /></span>
                </span>
              )
              : (char.lastMessage || char.blurb || '—')}
          </span>
        </div>
      </div>
    </button>
  )
}
