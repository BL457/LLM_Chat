import React, { useState, useRef } from 'react'
import Overlay from './Overlay.jsx'
import { Avatar, ICONS } from '../shared.jsx'

const ACCENTS = [
  { value: '#7b8fff', label: 'Indigo' },
  { value: '#43d98e', label: 'Mint' },
  { value: '#d97a4a', label: 'Terracotta' },
  { value: '#e07ba1', label: 'Rose' },
  { value: '#7cc4d9', label: 'Sky' },
  { value: '#c4a87b', label: 'Sand' },
  { value: '#b07be0', label: 'Violet' },
]

export default function NewChar({ onClose, onCreate }) {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState({
    name: '', accent: ACCENTS[0].value, avatarUrl: null,
    blurb: '', systemPrompt: '', imageTags: '',
  })
  const fileRef = useRef(null)

  const onPickAvatar = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => update({ avatarUrl: reader.result })
    reader.readAsDataURL(f)
  }
  const update = (patch) => setDraft(d => ({ ...d, ...patch }))

  const canNext = (step === 0 && draft.name.trim())
    || (step === 1 && draft.systemPrompt.trim())

  const submit = () => {
    onCreate({
      id: cryptoId(),
      name: draft.name.trim(),
      systemPrompt: draft.systemPrompt,
      imageTags: draft.imageTags,
      blurb: draft.blurb,
      accent: draft.accent,
      avatarUrl: draft.avatarUrl,
    })
  }

  return (
    <Overlay onClose={onClose} width={580}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--sl-border)' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Add new character</div>
          <div style={{ fontSize: 12, color: 'var(--sl-muted)', marginTop: 2 }}>
            Step {step + 1} of 2 · {['Identity', 'Persona & image tags'][step]}
          </div>
        </div>
        <button className="sl-icon-btn" onClick={onClose}>{ICONS.close}</button>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '12px 20px 0' }}>
        {[0, 1].map(i => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? 'var(--sl-accent)' : 'var(--sl-surface-2)' }} />
        ))}
      </div>

      <div className="sl-scroll" style={{ padding: 24, overflowY: 'auto', minHeight: 320, maxHeight: '60vh' }}>
        {step === 0 && (
          <div className="sl-screen-enter">
            <Field label="Profile picture">
              <input ref={fileRef} type="file" accept="image/*" onChange={onPickAvatar} style={{ display: 'none' }} />
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <button type="button" onClick={() => fileRef.current?.click()} style={{
                  width: 72, height: 72, borderRadius: '50%', overflow: 'hidden',
                  background: draft.avatarUrl ? 'transparent' : draft.accent,
                  color: 'white', border: '2px dashed rgba(255,255,255,0.18)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, fontWeight: 600, padding: 0, position: 'relative', flexShrink: 0,
                }}>
                  {draft.avatarUrl
                    ? <img src={draft.avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (draft.name[0]?.toUpperCase() || '+')}
                </button>
                <div style={{ flex: 1 }}>
                  <button className="sl-btn-ghost" type="button" onClick={() => fileRef.current?.click()}>{draft.avatarUrl ? 'Change' : 'Upload image'}</button>
                  {draft.avatarUrl && <button className="sl-btn-ghost" type="button" style={{ marginLeft: 6 }} onClick={() => update({ avatarUrl: null })}>Remove</button>}
                  <div style={{ fontSize: 11.5, color: 'var(--sl-muted)', marginTop: 8 }}>Optional. Falls back to a coloured monogram.</div>
                </div>
              </div>
            </Field>
            <Field label="Name">
              <input className="sl-input" value={draft.name} onChange={e => update({ name: e.target.value })} placeholder="e.g. Ash" />
            </Field>
            <Field label="One-line blurb">
              <input className="sl-input" value={draft.blurb} onChange={e => update({ blurb: e.target.value })} placeholder="e.g. Anthro fox · indie singer" />
            </Field>
            <Field label="Accent colour">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ACCENTS.map(a => (
                  <button key={a.value} onClick={() => update({ accent: a.value })} title={a.label} style={{
                    width: 36, height: 36, borderRadius: '50%', background: a.value,
                    border: draft.accent === a.value ? '3px solid white' : '3px solid transparent',
                    boxShadow: draft.accent === a.value ? '0 0 0 2px var(--sl-accent)' : 'none',
                    cursor: 'pointer',
                  }} />
                ))}
              </div>
            </Field>
            <div style={{ marginTop: 24, padding: 16, background: 'var(--sl-bg)', borderRadius: 10, border: '1px solid var(--sl-border)', display: 'flex', gap: 14, alignItems: 'center' }}>
              <Avatar char={{ ...draft, initial: draft.name[0]?.toUpperCase() || '?', online: true }} size={48} showOnline />
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{draft.name || 'Unnamed'}</div>
                <div style={{ fontSize: 12, color: 'var(--sl-muted)' }}>{draft.blurb || 'no blurb yet'}</div>
              </div>
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="sl-screen-enter">
            <Field label="Persona / system prompt">
              <textarea className="sl-textarea" autoFocus rows={10} value={draft.systemPrompt} onChange={e => update({ systemPrompt: e.target.value })}
                placeholder="A 24-year-old anthro red fox singer-songwriter on the night of her first sold-out headline show. Confident on stage, anxious off it. Loyal to her small circle. Drinks black coffee, fidgets with her jacket cuffs." />
            </Field>
            <Field label="Image tags (booru / LoRA)">
              <textarea className="sl-textarea" rows={4} value={draft.imageTags} onChange={e => update({ imageTags: e.target.value })}
                placeholder="anthro, fox, red fur, denim jacket, <lora:CharLoRA:1>"
                style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
            </Field>
            <div style={{ fontSize: 12, color: 'var(--sl-muted)', lineHeight: 1.5 }}>
              The persona is the system prompt — voice, mannerisms, history, anything important. <em>*Asterisks*</em> in replies render as actions. Image tags are appended to every generated scene image, so put their visual identifiers and any LoRA references here.
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid var(--sl-border)' }}>
        <button className="sl-btn-ghost" onClick={() => step === 0 ? onClose() : setStep(step - 1)}>
          {step === 0 ? 'Cancel' : 'Back'}
        </button>
        {step < 1
          ? <button className="sl-btn" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</button>
          : <button className="sl-btn" disabled={!canNext} onClick={submit}>Create character</button>}
      </div>
    </Overlay>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="sl-label">{label}</div>
      {children}
    </div>
  )
}

function cryptoId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  return 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}
