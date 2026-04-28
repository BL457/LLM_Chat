import React, { useEffect, useRef, useState } from 'react'
import Overlay from './Overlay.jsx'
import { Avatar, ICONS } from '../shared.jsx'

const EMPTY_PROFILE = {
  name: '',
  age: '',
  description: '',
  avatarUrl: null,
  accent: '#7b8fff',
  charactersKnowMe: false,
  charactersCanSeeMe: true,
  useNameInDialogue: true,
}

export default function UserProfile({ profile, savedProfiles = [], onClose, onUpdate, onUpdateSavedProfiles }) {
  const initial = { ...EMPTY_PROFILE, ...(profile || {}) }
  const [draft, setDraft] = useState(initial)
  const [presetMenuOpen, setPresetMenuOpen] = useState(false)
  const [savePromptOpen, setSavePromptOpen] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const fileRef = useRef(null)
  const menuWrapRef = useRef(null)

  useEffect(() => { setDraft({ ...EMPTY_PROFILE, ...(profile || {}) }) }, [profile])

  // Close preset menu on outside click
  useEffect(() => {
    if (!presetMenuOpen) return
    const onDoc = (e) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target)) setPresetMenuOpen(false)
    }
    window.addEventListener('mousedown', onDoc)
    return () => window.removeEventListener('mousedown', onDoc)
  }, [presetMenuOpen])

  const savePreset = () => {
    const label = newPresetName.trim()
    if (!label) return
    const id = 'p' + Date.now()
    const next = [...savedProfiles, { id, label, profile: { ...draft } }]
    onUpdateSavedProfiles && onUpdateSavedProfiles(next)
    setSavePromptOpen(false)
    setNewPresetName('')
    setPresetMenuOpen(false)
  }
  const loadPreset = (preset) => {
    setDraft({ ...EMPTY_PROFILE, ...preset.profile })
    setPresetMenuOpen(false)
  }
  const deletePreset = (id) => {
    const next = savedProfiles.filter(p => p.id !== id)
    onUpdateSavedProfiles && onUpdateSavedProfiles(next)
  }

  const onPickAvatar = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setDraft(d => ({ ...d, avatarUrl: reader.result }))
    reader.readAsDataURL(f)
  }

  const save = () => { onUpdate(draft); onClose() }

  // Build a preview of what will be sent to characters on first message.
  const previewLines = []
  if (draft.name) previewLines.push(`NAME: ${draft.name}`)
  if (draft.age) previewLines.push(`AGE: ${draft.age}`)
  if (draft.description) previewLines.push(`DESCRIPTION: ${draft.description}`)
  previewLines.push(`PRIOR KNOWLEDGE: ${draft.charactersKnowMe ? 'You already know this person.' : 'You do not know this person yet — they are a stranger.'}`)
  previewLines.push(`PRESENCE: ${draft.charactersCanSeeMe ? 'They are physically present with you in the scene.' : 'They are communicating remotely (text, phone, message).'}`)
  if (draft.name) previewLines.push(`ADDRESS: ${draft.useNameInDialogue ? `You may use their name (${draft.name}) when addressing them.` : "Avoid using their name in dialogue unless they offer it."}`)

  const previewBlock = previewLines.length
    ? `[OOC — context only, not in-character speech]
The person you are speaking with:
${previewLines.join('\n')}
[/OOC]`
    : '(nothing will be injected — fill in at least a name or description)'

  return (
    <Overlay onClose={onClose} width={520}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--sl-border)', position: 'relative' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Your profile</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }} ref={menuWrapRef}>
          <button className="sl-icon-btn" aria-label="Saved profiles" title="Saved profiles" onClick={() => setPresetMenuOpen(o => !o)} data-active={presetMenuOpen ? 'true' : 'false'}>{ICONS.more}</button>
          <button className="sl-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="sl-btn" onClick={save}>Save</button>

          {presetMenuOpen && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', marginTop: 6,
              minWidth: 240, maxWidth: 320,
              background: '#1a1f30', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, padding: 6, zIndex: 50,
              boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
            }}>
              <button onClick={() => { setSavePromptOpen(true) }} style={menuItemStyle(false)}>
                <span style={{ display: 'inline-flex' }}>{ICONS.plus}</span>
                <span>Save current as preset…</span>
              </button>
              <button onClick={() => { setDraft({ ...EMPTY_PROFILE }); setPresetMenuOpen(false) }} style={menuItemStyle(false)}>
                <span style={{ display: 'inline-flex' }}>{ICONS.trash}</span>
                <span>Clear form</span>
              </button>

              {savePromptOpen && (
                <div style={{ padding: '6px 8px 4px', display: 'flex', gap: 4 }}>
                  <input
                    autoFocus
                    className="sl-input"
                    placeholder="Preset name"
                    value={newPresetName}
                    onChange={e => setNewPresetName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') savePreset()
                      if (e.key === 'Escape') { setSavePromptOpen(false); setNewPresetName('') }
                    }}
                    style={{ fontSize: 12.5 }}
                  />
                  <button className="sl-btn" onClick={savePreset} disabled={!newPresetName.trim()} style={{ padding: '6px 10px' }}>Save</button>
                </div>
              )}

              {savedProfiles.length > 0 && <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 6px' }} />}

              {savedProfiles.length === 0 && !savePromptOpen && (
                <div style={{ fontSize: 11.5, color: 'var(--sl-muted)', padding: '8px 10px', lineHeight: 1.45 }}>
                  No presets yet. Save the current form as a preset to switch between RP personas later.
                </div>
              )}

              {savedProfiles.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button onClick={() => loadPreset(p)} style={{ ...menuItemStyle(false), flex: 1 }}>
                    <span>{p.label}</span>
                  </button>
                  <button onClick={() => deletePreset(p.id)} aria-label={`Delete ${p.label}`} title="Delete" style={{
                    background: 'transparent', border: 'none', color: '#e07b7b',
                    width: 30, height: 30, borderRadius: 6, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(224,123,123,0.1)'}
                     onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{ICONS.trash}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="sl-scroll" style={{ overflowY: 'auto', padding: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 24px 16px' }}>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickAvatar} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} aria-label="Upload profile picture" style={{
            width: 108, height: 108, borderRadius: '50%', overflow: 'hidden',
            border: '2px dashed rgba(255,255,255,0.2)', cursor: 'pointer', padding: 0,
            background: 'transparent',
          }}>
            <Avatar char={{ ...draft, initial: (draft.name?.[0] || '?').toUpperCase() }} size={104} />
          </button>
          {draft.avatarUrl && (
            <button className="sl-btn-ghost" style={{ marginTop: 8 }} onClick={() => setDraft(d => ({ ...d, avatarUrl: null }))}>Remove image</button>
          )}
          <div style={{ fontSize: 11.5, color: 'var(--sl-muted)', marginTop: 8 }}>
            Picture is for the UI only — it isn't sent to characters.
          </div>
        </div>

        <Section>
          <Field label="Name">
            <input className="sl-input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="What characters should call you" />
          </Field>
          <Field label="Age (optional)">
            <input className="sl-input" value={draft.age} onChange={e => setDraft({ ...draft, age: e.target.value })} placeholder="e.g. 32, mid-thirties, ageless" />
          </Field>
          <Field label="Description">
            <textarea className="sl-textarea" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}
              rows={5} placeholder="What do you look like? How do you carry yourself? Anything a character would notice on first meeting." />
          </Field>
        </Section>

        <Section>
          <div style={{ padding: '14px 20px 4px' }}>
            <div className="sl-label">Relationship defaults</div>
            <div style={{ fontSize: 11.5, color: 'var(--sl-muted)', marginTop: 4, lineHeight: 1.45 }}>
              These get encoded into the OOC block sent on the first message of every conversation.
            </div>
          </div>
          <Toggle
            label="Characters already know me"
            sub="If off, every new conversation starts as if you've never met."
            value={draft.charactersKnowMe}
            onChange={v => setDraft({ ...draft, charactersKnowMe: v })}
          />
          <Toggle
            label="Characters can see me physically"
            sub="If off, the conversation is treated as text/remote — they can't describe what you're doing."
            value={draft.charactersCanSeeMe}
            onChange={v => setDraft({ ...draft, charactersCanSeeMe: v })}
          />
          <Toggle
            label="Characters can use my name in dialogue"
            sub="If off, characters won't address you by name unless you offer it."
            value={draft.useNameInDialogue}
            onChange={v => setDraft({ ...draft, useNameInDialogue: v })}
          />
        </Section>

        <Section>
          <div style={{ padding: '14px 20px' }}>
            <div className="sl-label" style={{ marginBottom: 8 }}>Preview — what gets sent on first message</div>
            <pre style={{
              fontSize: 11.5, fontFamily: 'ui-monospace, monospace', color: 'var(--sl-muted)',
              background: 'var(--sl-bg)', border: '1px solid var(--sl-border)',
              padding: 12, borderRadius: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              lineHeight: 1.45, margin: 0,
            }}>{previewBlock}</pre>
          </div>
        </Section>
      </div>
    </Overlay>
  )
}

function Section({ children }) {
  return <div style={{ borderTop: '8px solid var(--sl-bg)', padding: '4px 0 12px' }}>{children}</div>
}

function Field({ label, children }) {
  return (
    <div style={{ padding: '10px 20px' }}>
      <div className="sl-label" style={{ marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}

function menuItemStyle() {
  return {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    background: 'transparent', border: 'none', color: '#e8ecf5',
    padding: '8px 10px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
    textAlign: 'left', fontFamily: 'inherit',
  }
}

function Toggle({ label, sub, value, onChange }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, padding: '10px 20px' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5 }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: 'var(--sl-muted)', marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
      </div>
      <button onClick={() => onChange(!value)} aria-pressed={value} aria-label={label} style={{
        width: 38, height: 22, borderRadius: 999, background: value ? 'var(--sl-accent)' : 'var(--sl-surface-2)',
        border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute', top: 3, left: value ? 19 : 3,
          width: 16, height: 16, borderRadius: '50%', background: 'white',
          transition: 'left 0.15s',
        }} />
      </button>
    </div>
  )
}
