import React, { useState, useEffect, useRef } from 'react'
import Overlay, { ConfirmDialog } from './Overlay.jsx'
import { Avatar, ICONS } from '../shared.jsx'
import { listTtsVoices, synthesizeSpeech } from '../api.js'

const EMPTY_SCENE = { location: '', clothing: '', appearance: '', objects: '', mood: '' }

export default function Profile({ char, scene, onClose, onUpdate, onUpdateScene, onClearHistory, onDelete, onOpenGallery, onExport }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(char)
  const [draftScene, setDraftScene] = useState({ ...EMPTY_SCENE, ...(scene || {}) })
  const [confirm, setConfirm] = useState(null)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [voices, setVoices] = useState([])
  const [previewing, setPreviewing] = useState(false)
  const fileRef = useRef(null)
  const previewAudioRef = useRef(null)

  // Lazy-fetch the voice catalogue once the profile opens. Default the
  // character's voice to the first available if it isn't already set.
  useEffect(() => {
    let alive = true
    listTtsVoices().then(v => {
      if (!alive) return
      const list = Array.isArray(v) ? v : []
      setVoices(list)
      // If the loaded character has no voice set yet and we have a list,
      // fill the draft with the first voice — only when not actively
      // editing, so we don't clobber the user's choice mid-edit.
      if (list.length > 0 && !char.voice && !editing) {
        setDraft(d => ({ ...d, voice: list[0] }))
      }
    })
    return () => { alive = false }
  }, [char.id])

  const playPreview = async () => {
    const v = (editing ? draft.voice : char.voice) || voices[0]
    if (!v) return
    try {
      setPreviewing(true)
      const url = await synthesizeSpeech({
        provider: 'kokoro-local',
        voice: v,
        text: `Hello, I'm ${char.name || 'a character'}. This is what I sound like.`,
      })
      const audio = new Audio(url)
      previewAudioRef.current = audio
      audio.onended = () => { setPreviewing(false); URL.revokeObjectURL(url) }
      audio.onerror = () => { setPreviewing(false); URL.revokeObjectURL(url) }
      await audio.play()
    } catch (e) {
      console.warn('preview failed:', e)
      setPreviewing(false)
    }
  }
  // Cancel any in-flight preview when the overlay closes / char changes.
  useEffect(() => () => { if (previewAudioRef.current) previewAudioRef.current.pause() }, [char.id])

  useEffect(() => {
    setDraft(char)
    setDraftScene({ ...EMPTY_SCENE, ...(scene || {}) })
    setEditing(false)
    setPersonaOpen(false)
  }, [char.id])
  // Keep draftScene in sync when the parent scene prop changes (e.g. a new
  // assistant message just updated it) and we're not currently editing.
  useEffect(() => {
    if (!editing) setDraftScene({ ...EMPTY_SCENE, ...(scene || {}) })
  }, [scene, editing])
  // Auto-expand the persona section while editing so the user can actually edit it.
  useEffect(() => { if (editing) setPersonaOpen(true) }, [editing])

  const save = () => {
    onUpdate(draft)
    onUpdateScene && onUpdateScene(draftScene)
    setEditing(false)
  }
  const cancel = () => {
    setDraft(char)
    setDraftScene({ ...EMPTY_SCENE, ...(scene || {}) })
    setEditing(false)
  }

  // Dirty when in edit mode and the draft (char fields or scene) differs.
  const isDirty = editing && (
    JSON.stringify(draft) !== JSON.stringify(char) ||
    JSON.stringify(draftScene) !== JSON.stringify({ ...EMPTY_SCENE, ...(scene || {}) })
  )
  const [confirmExit, setConfirmExit] = useState(false)
  const attemptClose = () => {
    if (isDirty) setConfirmExit(true)
    else onClose()
  }

  const messageCount = (char.messages || []).filter(m => m.role !== 'narrator').length
  const imageCount = (char.messages || []).filter(m => m.image && m.image.status === 'ready').length

  const onPickAvatar = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setDraft(d => ({ ...d, avatarUrl: reader.result }))
    reader.readAsDataURL(f)
  }

  return (
    <Overlay onClose={attemptClose} width={520}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--sl-muted)' }}>Profile</div>
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 24px 22px' }}>
          {editing ? (
            <>
              <input ref={fileRef} type="file" accept="image/*" onChange={onPickAvatar} style={{ display: 'none' }} />
              <button onClick={() => fileRef.current?.click()} style={{
                width: 108, height: 108, borderRadius: '50%', overflow: 'hidden',
                border: '2px dashed rgba(255,255,255,0.2)', cursor: 'pointer', padding: 0,
                background: 'transparent',
              }}>
                <Avatar char={draft} size={104} />
              </button>
              {draft.avatarUrl && (
                <button className="sl-btn-ghost" style={{ marginTop: 8 }} onClick={() => setDraft({ ...draft, avatarUrl: null })}>Remove image</button>
              )}
            </>
          ) : (
            <Avatar char={char} size={108} />
          )}
          {editing
            ? <input className="sl-input" style={{ marginTop: 16, fontSize: 18, fontWeight: 600, textAlign: 'center', maxWidth: 260 }}
                value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value, initial: (e.target.value[0] || '?').toUpperCase() })} />
            : <div style={{ fontSize: 22, fontWeight: 600, marginTop: 16 }}>{char.name}</div>}
          <div style={{ fontSize: 13, color: 'var(--sl-muted)', marginTop: 4 }}>{char.lastTime ? `last seen ${char.lastTime}` : 'ready'}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '0 16px 8px' }}>
          <ActionTile icon={ICONS.message} label="Message" onClick={onClose} />
          <ActionTile icon={ICONS.gallery} label={`Gallery (${imageCount})`} onClick={onOpenGallery} />
          <ActionTile icon={ICONS.spark} label={`${messageCount} msgs`} />
        </div>

        <Section>
          <InfoRow label="Bio" value={editing
            ? <input className="sl-input" value={draft.blurb || ''} onChange={e => setDraft({ ...draft, blurb: e.target.value })} placeholder="One-line description" />
            : (char.blurb || '—')} />
          <InfoRow label="Accent" value={editing
            ? <AccentPicker value={draft.accent} onChange={v => setDraft({ ...draft, accent: v })} />
            : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: char.accent }} />
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{char.accent}</span>
              </span>} />
        </Section>

        <Section>
          <button onClick={() => setPersonaOpen(o => !o)} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
            color: 'inherit', padding: '12px 20px', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <span>
              <div className="sl-label" style={{ marginBottom: 2 }}>Persona / system prompt</div>
              {!personaOpen && (
                <div style={{ fontSize: 12.5, color: 'var(--sl-muted)', marginTop: 4, lineHeight: 1.4, maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {char.systemPrompt ? char.systemPrompt.slice(0, 80) + (char.systemPrompt.length > 80 ? '…' : '') : '—'}
                </div>
              )}
            </span>
            <span style={{ color: 'var(--sl-muted)', fontSize: 18, transform: personaOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }}>›</span>
          </button>
          {personaOpen && (
            <>
              <div style={{ padding: '0 20px 12px' }}>
                {editing
                  ? <textarea className="sl-textarea" value={draft.systemPrompt || ''} onChange={e => setDraft({ ...draft, systemPrompt: e.target.value })} style={{ minHeight: 220 }} />
                  : <div style={{ fontSize: 13.5, color: 'var(--sl-text)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{char.systemPrompt || '—'}</div>}
              </div>
              <div style={{ padding: '4px 20px 16px' }}>
                <div className="sl-label" style={{ marginBottom: 8 }}>Image tags (booru / LoRA)</div>
                {editing
                  ? <textarea className="sl-textarea" value={draft.imageTags || ''} onChange={e => setDraft({ ...draft, imageTags: e.target.value })} placeholder="anthro, fox, red fur, <lora:CharacterLoRA:1>, ..." style={{ minHeight: 80, fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
                  : <div style={{ fontSize: 12, color: 'var(--sl-muted)', lineHeight: 1.55, fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap' }}>{char.imageTags || '—'}</div>}
              </div>
            </>
          )}
        </Section>

        <Section>
          <div style={{ padding: '12px 20px' }}>
            <div className="sl-label" style={{ marginBottom: 8 }}>Voice (text-to-speech)</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {editing ? (
                <select
                  className="sl-input"
                  value={draft.voice || (voices[0] || '')}
                  onChange={e => setDraft({ ...draft, voice: e.target.value })}
                  style={{ flex: 1 }}
                >
                  {voices.length === 0 && <option value="">(loading voices…)</option>}
                  {voices.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : (
                <div style={{ flex: 1, fontSize: 13, fontFamily: 'ui-monospace, monospace' }}>
                  {char.voice || (voices[0] || '—')}
                </div>
              )}
              <button
                className="sl-btn-ghost"
                onClick={playPreview}
                disabled={previewing || (voices.length === 0)}
                style={{ flexShrink: 0 }}
              >{previewing ? 'Playing…' : 'Preview'}</button>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--sl-muted)', marginTop: 6, lineHeight: 1.4 }}>
              Used when "Speak assistant messages aloud" is on, or when you click the play button on a message bubble.
            </div>
          </div>
        </Section>

        <Section>
          <div style={{ padding: '12px 20px' }}>
            <div className="sl-label" style={{ marginBottom: 10 }}>Current scene</div>
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '8px 14px', fontSize: 13, alignItems: 'center' }}>
              <SceneRow label="Location" value={editing ? draftScene.location : scene?.location} editing={editing}
                onChange={v => setDraftScene(s => ({ ...s, location: v }))} placeholder="Crystal Tower backstage" />
              <SceneRow label="Clothing" value={editing ? draftScene.clothing : scene?.clothing} editing={editing}
                onChange={v => setDraftScene(s => ({ ...s, clothing: v }))} placeholder="denim jacket, white tee" />
              <SceneRow label="Appearance" value={editing ? draftScene.appearance : scene?.appearance} editing={editing}
                onChange={v => setDraftScene(s => ({ ...s, appearance: v }))} placeholder="tail wagging, ears perked, wide smile" multiline />
              <SceneRow label="Objects" value={editing ? draftScene.objects : scene?.objects} editing={editing}
                onChange={v => setDraftScene(s => ({ ...s, objects: v }))} placeholder="vanity mirror, microphone stand" />
              <SceneRow label="Mood" value={editing ? draftScene.mood : scene?.mood} editing={editing}
                onChange={v => setDraftScene(s => ({ ...s, mood: v }))} placeholder="excited, nervous energy" />
            </div>
            {!editing && (
              <div style={{ fontSize: 11.5, color: 'var(--sl-muted)', marginTop: 12, lineHeight: 1.45 }}>
                The character updates these as the scene moves. Click <em>Edit</em> at the top to change them by hand — useful for nudging the scene back on track.
              </div>
            )}
          </div>
        </Section>

        <Section>
          <DestructiveRow icon={ICONS.edit} label="Edit contact" onClick={() => setEditing(true)} />
          <DestructiveRow icon={ICONS.download} label="Export character (.llmchar)" onClick={onExport} />
          <DestructiveRow icon={ICONS.trash} label="Clear chat history" tone="warn" onClick={() => setConfirm('clear')} />
          <DestructiveRow icon={ICONS.trash} label="Delete contact" tone="danger" onClick={() => setConfirm('delete')} />
        </Section>
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm === 'clear' ? `Clear chat with ${char.name}?` : `Delete contact ${char.name}?`}
          body={confirm === 'clear'
            ? "All messages, generated images, and the current scene will be wiped. Persona is kept."
            : "This will remove the contact and all their messages permanently. This cannot be undone."}
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
          body="The profile has been edited but not saved. Closing now will lose those changes."
          confirmLabel="Discard"
          onCancel={() => setConfirmExit(false)}
          onConfirm={() => { setConfirmExit(false); onClose() }}
        />
      )}
    </Overlay>
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

function ActionTile({ icon, label, onClick, active }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
      padding: '12px 4px', borderRadius: 10,
      background: active ? 'var(--sl-accent-soft)' : 'var(--sl-bg)',
      color: active ? 'var(--sl-accent)' : 'var(--sl-text)',
      border: '1px solid var(--sl-border)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
    }}>
      <span style={{ display: 'inline-flex' }}>{icon}</span>
      <span>{label}</span>
    </button>
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

const ACCENTS = ['#7b8fff', '#43d98e', '#d97a4a', '#e07ba1', '#7cc4d9', '#c4a87b', '#b07be0']
function AccentPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {ACCENTS.map(a => (
        <button key={a} onClick={() => onChange(a)} style={{
          width: 28, height: 28, borderRadius: '50%', background: a,
          border: value === a ? '2px solid white' : '2px solid transparent',
          boxShadow: value === a ? '0 0 0 2px var(--sl-accent)' : 'none',
          cursor: 'pointer',
        }} />
      ))}
    </div>
  )
}
