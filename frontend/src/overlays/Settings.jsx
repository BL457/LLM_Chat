import React, { useState, useEffect, useRef } from 'react'
import Overlay, { ConfirmDialog } from './Overlay.jsx'
import { ICONS } from '../shared.jsx'
import { listLLMModels, listSdModels, listSdSamplers, setSdModel, testLLMConnection, testSdConnection } from '../api.js'
import { notificationPermission, requestNotificationPermission } from '../notifications.js'

const LLM_PROVIDERS = [
  { value: 'ollama',     label: 'Ollama',                 defaultEndpoint: 'http://localhost:11434', wantsApiKey: false },
  { value: 'llama.cpp',  label: 'llama.cpp',              defaultEndpoint: 'http://localhost:8080',  wantsApiKey: false },
  { value: 'openrouter', label: 'OpenRouter',             defaultEndpoint: 'https://openrouter.ai/api', wantsApiKey: true },
  { value: 'custom',     label: 'Custom (OpenAI-compat)', defaultEndpoint: 'http://localhost:8000',  wantsApiKey: true },
]

export default function Settings({ settings, onUpdate, onClose }) {
  // Local draft — committed to the parent only when Save is clicked.
  const [draft, setDraft] = useState(settings)
  const [advanced, setAdvanced] = useState(false)
  const [llmModels, setLlmModels] = useState([])
  const [sdModels, setSdModels] = useState([])
  const [sdSamplers, setSdSamplers] = useState([])

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }))

  const provider = draft.llmProvider || 'ollama'
  const llmEndpoint = draft.llmEndpoint || 'http://localhost:11434'
  const llmApiKey = draft.llmApiKey || ''
  const sdEndpoint = draft.sdEndpoint || 'http://localhost:7860'
  const providerInfo = LLM_PROVIDERS.find(p => p.value === provider) || LLM_PROVIDERS[0]

  // Re-fetch model lists whenever the draft connection settings change so the
  // dropdown reflects what the user is configuring, even before Save.
  useEffect(() => {
    listLLMModels({ provider, endpoint: llmEndpoint, apiKey: llmApiKey }).then(r => setLlmModels(r || []))
  }, [provider, llmEndpoint, llmApiKey])
  useEffect(() => {
    listSdModels(sdEndpoint).then(r => setSdModels(r || []))
    listSdSamplers(sdEndpoint).then(r => setSdSamplers(r || []))
  }, [sdEndpoint])

  const onProviderChange = (next) => {
    const info = LLM_PROVIDERS.find(p => p.value === next)
    const currentMatchesOldDefault = draft.llmEndpoint === providerInfo.defaultEndpoint || !draft.llmEndpoint
    setDraft(d => ({
      ...d,
      llmProvider: next,
      llmEndpoint: currentMatchesOldDefault && info ? info.defaultEndpoint : d.llmEndpoint,
    }))
  }

  // Cheap dirty check — JSON-stringify the relevant fields. Good enough for
  // a settings overlay; nothing here is huge.
  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings)

  const [confirmExit, setConfirmExit] = useState(false)

  const handleSave = () => {
    onUpdate(draft)
    // If the SD checkpoint was changed, tell Forge to switch.
    if (draft.sdModel && draft.sdModel !== settings.sdModel) {
      setSdModel(draft.sdModel, draft.sdEndpoint || sdEndpoint)
    }
    onClose()
  }
  // Any close-attempt — Cancel button or backdrop click — runs through this.
  // If there are unsaved edits we ask for confirmation before discarding.
  const attemptClose = () => {
    if (isDirty) setConfirmExit(true)
    else onClose()
  }

  return (
    <Overlay onClose={attemptClose} width={620}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--sl-border)' }}>
        <div style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
          Settings
          {isDirty && <span style={{ fontSize: 11, color: 'var(--sl-accent)', fontWeight: 500 }}>· unsaved</span>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="sl-btn-ghost" onClick={attemptClose}>Cancel</button>
          <button className="sl-btn" onClick={handleSave} disabled={!isDirty}>Save</button>
        </div>
      </div>
      <div className="sl-scroll" style={{ padding: 24, overflowY: 'auto' }}>
        <Group title="Connection">
          <Row label="LLM provider">
            <select className="sl-input" value={provider} onChange={e => onProviderChange(e.target.value)}>
              {LLM_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Row>
          <Row label="LLM endpoint">
            <input className="sl-input" value={llmEndpoint} onChange={e => set('llmEndpoint', e.target.value)} placeholder={providerInfo.defaultEndpoint} />
          </Row>
          {providerInfo.wantsApiKey && (
            <Row label="API key">
              <input className="sl-input" type="password" value={llmApiKey} onChange={e => set('llmApiKey', e.target.value)} placeholder="sk-..." autoComplete="off" />
            </Row>
          )}
          <TestButton run={() => testLLMConnection({ provider, endpoint: llmEndpoint, apiKey: llmApiKey })}
                      label="Test LLM connection"
                      resetKey={`${provider}|${llmEndpoint}|${llmApiKey}`}
                      okText={(n) => `Connected — ${n} model${n === 1 ? '' : 's'} available`} />

          <div style={{ height: 1, background: 'var(--sl-border)', margin: '4px 0' }} />

          <Row label="Image generation endpoint (Stable Diffusion)">
            <input className="sl-input" value={sdEndpoint} onChange={e => set('sdEndpoint', e.target.value)} placeholder="http://localhost:7860" />
          </Row>
          <TestButton run={() => testSdConnection({ endpoint: sdEndpoint })}
                      label="Test image generation connection"
                      resetKey={sdEndpoint}
                      okText={(n) => `Connected — ${n} checkpoint${n === 1 ? '' : 's'} loaded`} />
        </Group>

        <Group title="Model">
          <Row label="Language model">
            <ModelComboBox
              value={draft.ollamaModel || ''}
              options={llmModels}
              onChange={(v) => set('ollamaModel', v)}
              placeholder="Search or type a model name…"
            />
          </Row>
          <Row label="Context size">
            <select className="sl-input" value={draft.numCtx ?? 16384} onChange={e => set('numCtx', parseInt(e.target.value))}>
              <option value={4096}>4k tokens</option>
              <option value={8192}>8k tokens</option>
              <option value={16384}>16k tokens</option>
              <option value={32768}>32k tokens</option>
            </select>
          </Row>
          <Row label={`Temperature · ${(draft.temperature ?? 1).toFixed(2)}`}>
            <input type="range" min="0" max="1.5" step="0.05" value={draft.temperature ?? 1}
              onChange={e => set('temperature', parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--sl-accent)' }} />
          </Row>
        </Group>

        <Group title="Behavior">
          <Toggle label="Show thinking" sub="Stream the model's chain-of-thought (if the model supports it)." value={draft.think === 'true' || draft.think === true} onChange={v => set('think', v ? 'true' : 'false')} />
          <Toggle label="Characters are aware of the actual time of day" sub="Prepends each user message with its timestamp so the character knows roughly when you wrote it. Useful for natural greetings (good morning / late night) and for the model to feel time pass between exchanges." value={draft.awareOfTime === 'true' || draft.awareOfTime === true} onChange={v => set('awareOfTime', v ? 'true' : 'false')} />
          <Toggle label="Speak assistant messages aloud" sub="Plays each new reply through the local text-to-speech engine using the voice set in that character's profile. A play button on every message bubble works regardless of this toggle." value={draft.audioEnabled === 'true' || draft.audioEnabled === true} onChange={v => set('audioEnabled', v ? 'true' : 'false')} />
        </Group>

        <Group title="Notifications">
          <NotificationsRow />
        </Group>

        <Group title="Display">
          <Row label="Density">
            <Segmented value={draft.density || 'cozy'} onChange={v => set('density', v)} options={[
              { value: 'cozy', label: 'Cozy' },
              { value: 'compact', label: 'Compact' },
            ]} />
          </Row>
        </Group>

        <button onClick={() => setAdvanced(a => !a)} style={{
          width: '100%', textAlign: 'left', background: 'transparent', border: '1px solid var(--sl-border)',
          color: 'var(--sl-muted)', padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 12, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
        }}>
          <span>Advanced</span>
          <span style={{ transform: advanced ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>›</span>
        </button>

        {advanced && (
          <>
            <Group title="Sampling">
              <Slider label="top_k" min={1} max={200} step={1} value={draft.topK ?? 64} onChange={v => set('topK', v)} />
              <Slider label="top_p" min={0} max={1} step={0.01} value={draft.topP ?? 0.95} onChange={v => set('topP', v)} />
              <Slider label="min_p" min={0} max={0.5} step={0.005} value={draft.minP ?? 0.01} onChange={v => set('minP', v)} />
              <Slider label="repeat_penalty" min={1} max={1.5} step={0.01} value={draft.repeatPenalty ?? 1.05} onChange={v => set('repeatPenalty', v)} />
              <Slider label="repeat_last_n" min={64} max={4096} step={64} value={draft.repeatLastN ?? 1024} onChange={v => set('repeatLastN', v)} />
              <Slider label="num_predict" min={64} max={4096} step={64} value={draft.numPredict ?? 2048} onChange={v => set('numPredict', v)} />
            </Group>

            <Group title="Prompt">
              <Row label="Retry prompt (when format breaks)">
                <textarea className="sl-textarea" value={draft.retryPrompt || ''} onChange={e => set('retryPrompt', e.target.value)} rows={2} />
              </Row>
            </Group>

            <Group title="Image generation (Stable Diffusion)">
              <Row label="SD model">
                <select className="sl-input" value={draft.sdModel || ''} onChange={e => set('sdModel', e.target.value)}>
                  <option value="">(none)</option>
                  {sdModels.map(m => <option key={m.title || m} value={m.title || m}>{m.model_name || m.title || m}</option>)}
                </select>
              </Row>
              <Row label="Sampler">
                <select className="sl-input" value={draft.samplerName || ''} onChange={e => set('samplerName', e.target.value)}>
                  <option value="">(default)</option>
                  {sdSamplers.map(s => <option key={s.name || s} value={s.name || s}>{s.name || s}</option>)}
                </select>
              </Row>
              <Row label={`Steps · ${draft.steps ?? 40}`}>
                <input type="range" min="1" max="80" step="1" value={draft.steps ?? 40} onChange={e => set('steps', parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--sl-accent)' }} />
              </Row>
              <Row label={`CFG scale · ${(draft.cfgScale ?? 4).toFixed(1)}`}>
                <input type="range" min="1" max="20" step="0.5" value={draft.cfgScale ?? 4} onChange={e => set('cfgScale', parseFloat(e.target.value))} style={{ width: '100%', accentColor: 'var(--sl-accent)' }} />
              </Row>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Row label="Width">
                  <input className="sl-input" type="number" min="256" max="2048" step="64" value={draft.width ?? 1024} onChange={e => set('width', parseInt(e.target.value))} />
                </Row>
                <Row label="Height">
                  <input className="sl-input" type="number" min="256" max="2048" step="64" value={draft.height ?? 1024} onChange={e => set('height', parseInt(e.target.value))} />
                </Row>
              </div>
              <Row label="General positive tags">
                <textarea className="sl-textarea" value={draft.generalTags || ''} onChange={e => set('generalTags', e.target.value)} rows={3} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }} />
              </Row>
              <Row label="Negative prompt">
                <textarea className="sl-textarea" value={draft.negPrompt || ''} onChange={e => set('negPrompt', e.target.value)} rows={3} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }} />
              </Row>
            </Group>

            <Group title="System prompt template">
              <Row label="Wraps every character's persona. Placeholders: {CHARACTER_NAME}, {CHARACTER_PROMPT}, {SCENE_STATE}.">
                <textarea className="sl-textarea" value={draft.rpProtocol || ''} onChange={e => set('rpProtocol', e.target.value)} rows={8} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }} />
              </Row>
            </Group>
          </>
        )}
      </div>
      {confirmExit && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          body="Settings have been edited but not saved. Closing now will lose those changes."
          confirmLabel="Discard"
          onCancel={() => setConfirmExit(false)}
          onConfirm={() => { setConfirmExit(false); onClose() }}
        />
      )}
    </Overlay>
  )
}

// Connection-test button. Clicking runs the supplied async `run` function;
// shows ✓ green / ✗ red inline once it completes. The `resetKey` prop wipes
// any stale result when the inputs being tested have changed — so a green
// "Connected" doesn't linger after you've edited the endpoint.
function TestButton({ run, label, okText, resetKey }) {
  const [state, setState] = useState({ status: 'idle' })

  useEffect(() => { setState({ status: 'idle' }) }, [resetKey])

  const click = async () => {
    setState({ status: 'testing' })
    try {
      const value = await run()
      setState({ status: 'ok', value })
    } catch (e) {
      setState({ status: 'fail', error: e?.message || String(e) })
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingTop: 4 }}>
      <button className="sl-btn-ghost" onClick={click} disabled={state.status === 'testing'}>
        {state.status === 'testing' ? 'Testing…' : label}
      </button>
      {state.status === 'ok' && (
        <span style={{ fontSize: 12, color: 'var(--sl-online)' }}>
          ✓ {okText ? okText(state.value) : 'Connected'}
        </span>
      )}
      {state.status === 'fail' && (
        <span style={{ fontSize: 12, color: '#e07b7b', wordBreak: 'break-word', flex: 1, minWidth: 200 }}>
          ✗ {state.error}
        </span>
      )}
    </div>
  )
}

// Filterable combobox for picking a model from a (potentially huge) list.
// Falls back to free-text entry if Enter is pressed with no list match —
// useful for OpenRouter where the catalogue may not include a brand-new model
// you want to try.
function ModelComboBox({ value, options, onChange, placeholder }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    window.addEventListener('mousedown', onDoc)
    return () => window.removeEventListener('mousedown', onDoc)
  }, [open])

  // Keep the highlighted item in view.
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector(`[data-idx="${highlight}"]`)
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  const filtered = query.trim()
    ? options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
    : options
  const VISIBLE_LIMIT = 100
  const shown = filtered.slice(0, VISIBLE_LIMIT)

  const select = (v) => {
    onChange(v)
    setOpen(false)
    setQuery('')
    if (inputRef.current) inputRef.current.blur()
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      setHighlight(h => Math.min(h + 1, shown.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && shown[highlight]) {
        select(shown[highlight])
      } else if (query.trim()) {
        // Free-text entry — commit whatever was typed
        select(query.trim())
      } else {
        setOpen(false)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      setQuery('')
      if (inputRef.current) inputRef.current.blur()
    }
  }

  const displayedInputValue = open ? query : (value || '')

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        className="sl-input"
        value={displayedInputValue}
        placeholder={placeholder || 'Type to search…'}
        onFocus={() => { setOpen(true); setHighlight(0) }}
        onChange={e => { setQuery(e.target.value); setOpen(true); setHighlight(0) }}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {value && !open && (
        <button
          aria-label="Clear model"
          title="Clear"
          onClick={() => onChange('')}
          style={{
            position: 'absolute', right: 6, top: 6,
            background: 'transparent', border: 'none', color: 'var(--sl-muted)',
            width: 26, height: 26, borderRadius: 6, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--sl-surface-2)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >×</button>
      )}
      {open && (
        <div ref={listRef} style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          marginTop: 4, maxHeight: 280, overflowY: 'auto',
          background: '#1a1f30', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10, padding: 4, zIndex: 60,
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        }}>
          {shown.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--sl-muted)' }}>
              No models match. Press Enter to use “{query}” as a custom model name.
            </div>
          )}
          {shown.map((opt, i) => (
            <button
              key={opt}
              data-idx={i}
              onClick={() => select(opt)}
              onMouseEnter={() => setHighlight(i)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '7px 10px', borderRadius: 6,
                background: i === highlight
                  ? 'rgba(255,255,255,0.07)'
                  : (opt === value ? 'var(--sl-accent-soft)' : 'transparent'),
                color: opt === value ? 'var(--sl-accent)' : '#e8ecf5',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
                fontVariantNumeric: 'tabular-nums',
              }}>
              {opt}
            </button>
          ))}
          {filtered.length > VISIBLE_LIMIT && (
            <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--sl-muted)' }}>
              +{filtered.length - VISIBLE_LIMIT} more — keep typing to narrow.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function NotificationsRow() {
  const [perm, setPerm] = useState(notificationPermission())
  useEffect(() => {
    const t = setInterval(() => setPerm(notificationPermission()), 1500)
    return () => clearInterval(t)
  }, [])

  if (perm === 'unsupported') {
    return (
      <div style={{ fontSize: 12.5, color: 'var(--sl-muted)' }}>
        This browser doesn't support system notifications.
      </div>
    )
  }

  const labels = {
    granted: { text: "Enabled — you'll get a system alert when a reply arrives and the tab isn't focused.", tone: 'var(--sl-online)' },
    denied: { text: 'Blocked. Re-enable them in your browser site settings (lock icon → Notifications).', tone: '#e07b7b' },
    default: { text: "Get a system alert when a reply arrives and the tab isn't focused.", tone: 'var(--sl-muted)' },
  }
  const info = labels[perm] || labels.default

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5 }}>System notifications</div>
        <div style={{ fontSize: 11.5, color: info.tone, marginTop: 2, lineHeight: 1.45 }}>{info.text}</div>
      </div>
      {perm === 'default' && (
        <button className="sl-btn" onClick={async () => { const r = await requestNotificationPermission(); setPerm(r) }}>
          Enable
        </button>
      )}
      {perm === 'granted' && (
        <span className="sl-pill" data-tone="accent">on</span>
      )}
    </div>
  )
}

function Group({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div className="sl-label" style={{ marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 13, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}

function Slider({ label, min, max, step, value, onChange }) {
  return (
    <Row label={`${label} · ${typeof value === 'number' ? (step < 1 ? value.toFixed(3).replace(/\.?0+$/, '') : value) : value}`}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} style={{ width: '100%', accentColor: 'var(--sl-accent)' }} />
    </Row>
  )
}

function Toggle({ label, sub, value, onChange }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
      <div>
        <div style={{ fontSize: 13.5 }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: 'var(--sl-muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      <button onClick={() => onChange(!value)} style={{
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

function Segmented({ value, onChange, options }) {
  return (
    <div style={{ display: 'inline-flex', background: 'var(--sl-surface-2)', borderRadius: 10, padding: 3, gap: 2 }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          background: value === o.value ? 'var(--sl-accent)' : 'transparent',
          color: value === o.value ? 'white' : 'var(--sl-muted)',
          border: 'none', padding: '6px 14px', borderRadius: 8,
          fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
        }}>{o.label}</button>
      ))}
    </div>
  )
}
