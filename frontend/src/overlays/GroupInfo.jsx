import React, { useEffect, useState } from 'react'
import Overlay, { ConfirmDialog } from './Overlay.jsx'
import { Avatar, GroupAvatar, ICONS } from '../shared.jsx'

const EMPTY_GROUP_SCENE = { location: '', atmosphere: '', characters: {} }
const EMPTY_PER_CHAR = { clothing: '', appearance: '', objects: '', mood: '' }

const ACCENTS = ['#7b8fff', '#43d98e', '#d97a4a', '#e07ba1', '#7cc4d9', '#c4a87b', '#b07be0']

export default function GroupInfo({ group, members = [], scene, onClose, onUpdate, onUpdateScene, onClearHistory, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draftGroup, setDraftGroup] = useState(group)
  const [draftScene, setDraftScene] = useState(() => ({ ...EMPTY_GROUP_SCENE, ...(scene || {}) }))
  const [confirm, setConfirm] = useState(null)
  const [confirmExit, setConfirmExit] = useState(false)
  const [openMember, setOpenMember] = useState(null)  // charId of expanded member card

  useEffect(() => {
    setDraftGroup(group)
    setDraftScene({ ...EMPTY_GROUP_SCENE, ...(scene || {}) })
    setEditing(false)
  }, [group?.id])
  useEffect(() => {
    if (!editing) setDraftScene({ ...EMPTY_GROUP_SCENE, ...(scene || {}) })
  }, [scene, editing])

  const isDirty = editing && (
    JSON.stringify(draftGroup) !== JSON.stringify(group) ||
    JSON.stringify(draftScene) !== JSON.stringify({ ...EMPTY_GROUP_SCENE, ...(scene || {}) })
  )

  const save = () => {
    onUpdate && onUpdate(draftGroup)
    onUpdateScene && onUpdateScene(draftScene)
    setEditing(false)
  }
  const cancel = () => {
    setDraftGroup(group)
    setDraftScene({ ...EMPTY_GROUP_SCENE, ...(scene || {}) })
    setEditing(false)
  }
  const attemptClose = () => {
    if (isDirty) setConfirmExit(true)
    else onClose()
  }

  const messageCount = (group?.messages || []).filter(m => m.role !== 'narrator' && !m.hidden).length

  const setMemberSceneField = (charId, field, value) => {
    setDraftScene(s => ({
      ...s,
      characters: {
        ...(s.characters || {}),
        [charId]: { ...EMPTY_PER_CHAR, ...((s.characters || {})[charId] || {}), [field]: value },
      }
    }))
  }

  return (
    <Overlay onClose={attemptClose} width={560}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--sl-muted)' }}>Group info</div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {!editing
            ? <button className="sl-icon-btn" onClick={() => setEditing(true)} title="Edit">{ICONS.edit}</button>
            : <>
                <button className="sl-btn-ghost" onClick={cancel}>Cancel</button>
                <button className="sl-btn" onClick={save}>Save</button>
              </>}
          <button className="sl-icon-btn" onClick={attemptClose}>{ICONS.close}</button>
        </div>
      </div>

      <div className="sl-scroll" style={{ overflowY: 'auto', padding: '0 0 24px' }}>
        {/* Header — composite avatar + name */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 24px 22px' }}>
          <GroupAvatar participants={members} size={108} />
          {editing
            ? <input className="sl-input" style={{ marginTop: 16, fontSize: 18, fontWeight: 600, textAlign: 'center', maxWidth: 320 }}
                value={draftGroup.name || ''} onChange={e => setDraftGroup({ ...draftGroup, name: e.target.value })} />
            : <div style={{ fontSize: 22, fontWeight: 600, marginTop: 16 }}>{group.name}</div>}
          <div style={{ fontSize: 13, color: 'var(--sl-muted)', marginTop: 4 }}>
            {members.map(m => m?.name).filter(Boolean).join(', ')}
          </div>
        </div>

        <Section>
          <InfoRow label="Bio / blurb" value={editing
            ? <input className="sl-input" value={draftGroup.blurb || ''} onChange={e => setDraftGroup({ ...draftGroup, blurb: e.target.value })} placeholder="One-line description of this group's setup" />
            : (group.blurb || '—')} />
          <InfoRow label="Accent" value={editing
            ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ACCENTS.map(a => (
                  <button key={a} onClick={() => setDraftGroup({ ...draftGroup, accent: a })} style={{
                    width: 28, height: 28, borderRadius: '50%', background: a,
                    border: draftGroup.accent === a ? '2px solid white' : '2px solid transparent',
                    boxShadow: draftGroup.accent === a ? '0 0 0 2px var(--sl-accent)' : 'none',
                    cursor: 'pointer', padding: 0,
                  }} />
                ))}
              </div>
            : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: group.accent }} />
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{group.accent}</span>
              </span>} />
        </Section>

        {/* Group-level scene */}
        <Section>
          <div style={{ padding: '12px 20px' }}>
            <div className="sl-label" style={{ marginBottom: 10 }}>Group scene</div>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '8px 14px', fontSize: 13, alignItems: 'center' }}>
              <SceneRow label="Location" value={editing ? draftScene.location : scene?.location} editing={editing}
                onChange={v => setDraftScene({ ...draftScene, location: v })} placeholder="The kitchen, mid-morning" />
              <SceneRow label="Atmosphere" value={editing ? draftScene.atmosphere : scene?.atmosphere} editing={editing}
                onChange={v => setDraftScene({ ...draftScene, atmosphere: v })} placeholder="warm and chatty" multiline />
            </div>
            {!editing && (
              <div style={{ fontSize: 11.5, color: 'var(--sl-muted)', marginTop: 12, lineHeight: 1.45 }}>
                Updates as the conversation moves. Click <em>Edit</em> at the top to nudge the scene by hand.
              </div>
            )}
          </div>
        </Section>

        {/* Per-member scene cards */}
        <Section>
          <div style={{ padding: '12px 20px 4px' }}>
            <div className="sl-label">Each character in this scene</div>
            <div style={{ fontSize: 11.5, color: 'var(--sl-muted)', marginTop: 4, lineHeight: 1.45 }}>
              Their per-group state (clothing, appearance, etc.) is separate from their state in their individual chats.
            </div>
          </div>
          {members.map(m => {
            if (!m) return null
            const isOpen = openMember === m.id
            const memberScene = (editing ? draftScene : scene)?.characters?.[m.id] || {}
            return (
              <div key={m.id} style={{ borderTop: '1px solid var(--sl-border)' }}>
                <button onClick={() => setOpenMember(o => o === m.id ? null : m.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  textAlign: 'left', background: 'transparent', border: 'none',
                  color: 'inherit', padding: '12px 20px', cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <Avatar char={m} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{m.name}</div>
                    {m.blurb && <div style={{ fontSize: 12, color: 'var(--sl-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.blurb}</div>}
                  </div>
                  <span style={{ color: 'var(--sl-muted)', fontSize: 18, transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>›</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 20px 14px 68px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '8px 14px', fontSize: 13, alignItems: 'center' }}>
                      <SceneRow label="Clothing" value={memberScene.clothing} editing={editing}
                        onChange={v => setMemberSceneField(m.id, 'clothing', v)} placeholder="dark blue jacket, yellow trousers" />
                      <SceneRow label="Appearance" value={memberScene.appearance} editing={editing}
                        onChange={v => setMemberSceneField(m.id, 'appearance', v)} placeholder="ears perked, tail wagging" multiline />
                      <SceneRow label="Objects" value={memberScene.objects} editing={editing}
                        onChange={v => setMemberSceneField(m.id, 'objects', v)} placeholder="holding a coffee mug" />
                      <SceneRow label="Mood" value={memberScene.mood} editing={editing}
                        onChange={v => setMemberSceneField(m.id, 'mood', v)} placeholder="excited, slightly nervous" />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </Section>

        <Section>
          <div style={{ padding: '12px 20px', fontSize: 13, color: 'var(--sl-muted)' }}>
            {messageCount} messages
          </div>
        </Section>

        <Section>
          <DestructiveRow icon={ICONS.edit} label="Edit group" onClick={() => setEditing(true)} />
          <DestructiveRow icon={ICONS.trash} label="Clear chat history" tone="warn" onClick={() => setConfirm('clear')} />
          <DestructiveRow icon={ICONS.trash} label="Delete group" tone="danger" onClick={() => setConfirm('delete')} />
        </Section>
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm === 'clear' ? `Clear chat with ${group.name}?` : `Delete group ${group.name}?`}
          body={confirm === 'clear'
            ? "All messages, generated images, and the current scene state for this group will be wiped. The participating characters and their individual chats are unaffected."
            : "This will remove the group and all its messages permanently. The participating characters themselves are kept."}
          confirmLabel={confirm === 'clear' ? 'Clear history' : 'Delete'}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm === 'clear') onClearHistory && onClearHistory()
            else if (confirm === 'delete') { onDelete && onDelete(); onClose() }
            setConfirm(null)
          }}
        />
      )}
      {confirmExit && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          body="The group has been edited but not saved. Closing now will lose those changes."
          confirmLabel="Discard"
          onCancel={() => setConfirmExit(false)}
          onConfirm={() => { setConfirmExit(false); onClose() }}
        />
      )}
    </Overlay>
  )
}

function Section({ children }) {
  return <div style={{ borderTop: '8px solid var(--sl-bg)', padding: '4px 0' }}>{children}</div>
}

function InfoRow({ label, value }) {
  return (
    <div style={{ padding: '12px 20px' }}>
      <div style={{ fontSize: 14, color: 'var(--sl-text)', wordBreak: 'break-word' }}>{value || '—'}</div>
      <div style={{ fontSize: 12, color: 'var(--sl-muted)', marginTop: 3 }}>{label}</div>
    </div>
  )
}

function SceneRow({ label, value, editing, onChange, placeholder, multiline }) {
  return (
    <>
      <div style={{ color: 'var(--sl-muted)' }}>{label}</div>
      {editing ? (
        multiline
          ? <textarea className="sl-textarea" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ minHeight: 56, fontSize: 12.5 }} />
          : <input className="sl-input" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      ) : (
        <div style={{ wordBreak: 'break-word' }}>{value || '—'}</div>
      )}
    </>
  )
}

function DestructiveRow({ icon, label, tone, onClick }) {
  const color = tone === 'danger' ? '#e07b7b' : tone === 'warn' ? '#e5b15a' : 'var(--sl-text)'
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 16, padding: '12px 20px',
      width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
      color, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14,
    }}
      onMouseEnter={(e) => e.currentTarget.style.background = tone ? 'rgba(224,123,123,0.06)' : 'var(--sl-bg)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
      <span style={{ display: 'inline-flex', flexShrink: 0, opacity: 0.85 }}>{icon}</span>
      <span>{label}</span>
    </button>
  )
}
