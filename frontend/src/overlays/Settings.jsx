import React, { useState, useEffect } from 'react'
import Overlay from './Overlay.jsx'
import { ICONS } from '../shared.jsx'
import { listOllamaModels, listSdModels, listSdSamplers, setSdModel } from '../api.js'
import { notificationPermission, requestNotificationPermission } from '../notifications.js'

export default function Settings({ settings, onUpdate, onClose }) {
  const [advanced, setAdvanced] = useState(false)
  const [ollamaModels, setOllamaModels] = useState([])
  const [sdModels, setSdModels] = useState([])
  const [sdSamplers, setSdSamplers] = useState([])
  const set = (k, v) => onUpdate({ ...settings, [k]: v })

  useEffect(() => {
    listOllamaModels().then(r => setOllamaModels(r || []))
    listSdModels().then(r => setSdModels(r || []))
    listSdSamplers().then(r => setSdSamplers(r || []))
  }, [])

  return (
    <Overlay onClose={onClose} width={620}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--sl-border)' }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Settings</div>
        <button className="sl-icon-btn" onClick={onClose}>{ICONS.close}</button>
      </div>
      <div className="sl-scroll" style={{ padding: 24, overflowY: 'auto' }}>
        <Group title="Model">
          <Row label="Language model">
            <select className="sl-input" value={settings.ollamaModel || ''} onChange={e => set('ollamaModel', e.target.value)}>
              {ollamaModels.length === 0 && <option value={settings.ollamaModel || ''}>{settings.ollamaModel || '(none)'}</option>}
              {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Row>
          <Row label="Context size">
            <select className="sl-input" value={settings.numCtx ?? 16384} onChange={e => set('numCtx', parseInt(e.target.value))}>
              <option value={4096}>4k tokens</option>
              <option value={8192}>8k tokens</option>
              <option value={16384}>16k tokens</option>
              <option value={32768}>32k tokens</option>
            </select>
          </Row>
          <Row label={`Temperature · ${(settings.temperature ?? 1).toFixed(2)}`}>
            <input type="range" min="0" max="1.5" step="0.05" value={settings.temperature ?? 1}
              onChange={e => set('temperature', parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--sl-accent)' }} />
          </Row>
        </Group>

        <Group title="Behavior">
          <Toggle label="Show thinking" sub="Stream the model's chain-of-thought (if the model supports it)." value={settings.think === 'true' || settings.think === true} onChange={v => set('think', v ? 'true' : 'false')} />
        </Group>

        <Group title="Notifications">
          <NotificationsRow />
        </Group>

        <Group title="Display">
          <Row label="Density">
            <Segmented value={settings.density || 'cozy'} onChange={v => set('density', v)} options={[
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
              <Slider label="top_k" min={1} max={200} step={1} value={settings.topK ?? 64} onChange={v => set('topK', v)} />
              <Slider label="top_p" min={0} max={1} step={0.01} value={settings.topP ?? 0.95} onChange={v => set('topP', v)} />
              <Slider label="min_p" min={0} max={0.5} step={0.005} value={settings.minP ?? 0.01} onChange={v => set('minP', v)} />
              <Slider label="repeat_penalty" min={1} max={1.5} step={0.01} value={settings.repeatPenalty ?? 1.05} onChange={v => set('repeatPenalty', v)} />
              <Slider label="repeat_last_n" min={64} max={4096} step={64} value={settings.repeatLastN ?? 1024} onChange={v => set('repeatLastN', v)} />
              <Slider label="num_predict" min={64} max={4096} step={64} value={settings.numPredict ?? 2048} onChange={v => set('numPredict', v)} />
            </Group>

            <Group title="Prompt">
              <Row label="Retry prompt (when format breaks)">
                <textarea className="sl-textarea" value={settings.retryPrompt || ''} onChange={e => set('retryPrompt', e.target.value)} rows={2} />
              </Row>
            </Group>

            <Group title="Image generation (Stable Diffusion)">
              <Row label="SD model">
                <select className="sl-input" value={settings.sdModel || ''} onChange={e => { const v = e.target.value; set('sdModel', v); if (v) setSdModel(v) }}>
                  <option value="">(none)</option>
                  {sdModels.map(m => <option key={m.title || m} value={m.title || m}>{m.model_name || m.title || m}</option>)}
                </select>
              </Row>
              <Row label="Sampler">
                <select className="sl-input" value={settings.samplerName || ''} onChange={e => set('samplerName', e.target.value)}>
                  <option value="">(default)</option>
                  {sdSamplers.map(s => <option key={s.name || s} value={s.name || s}>{s.name || s}</option>)}
                </select>
              </Row>
              <Row label={`Steps · ${settings.steps ?? 40}`}>
                <input type="range" min="1" max="80" step="1" value={settings.steps ?? 40} onChange={e => set('steps', parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--sl-accent)' }} />
              </Row>
              <Row label={`CFG scale · ${(settings.cfgScale ?? 4).toFixed(1)}`}>
                <input type="range" min="1" max="20" step="0.5" value={settings.cfgScale ?? 4} onChange={e => set('cfgScale', parseFloat(e.target.value))} style={{ width: '100%', accentColor: 'var(--sl-accent)' }} />
              </Row>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Row label="Width">
                  <input className="sl-input" type="number" min="256" max="2048" step="64" value={settings.width ?? 1024} onChange={e => set('width', parseInt(e.target.value))} />
                </Row>
                <Row label="Height">
                  <input className="sl-input" type="number" min="256" max="2048" step="64" value={settings.height ?? 1024} onChange={e => set('height', parseInt(e.target.value))} />
                </Row>
              </div>
              <Row label="General positive tags">
                <textarea className="sl-textarea" value={settings.generalTags || ''} onChange={e => set('generalTags', e.target.value)} rows={3} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }} />
              </Row>
              <Row label="Negative prompt">
                <textarea className="sl-textarea" value={settings.negPrompt || ''} onChange={e => set('negPrompt', e.target.value)} rows={3} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }} />
              </Row>
            </Group>

            <Group title="System prompt template">
              <Row label="Wraps every character's persona. Placeholders: {CHARACTER_NAME}, {CHARACTER_PROMPT}, {SCENE_STATE}.">
                <textarea className="sl-textarea" value={settings.rpProtocol || ''} onChange={e => set('rpProtocol', e.target.value)} rows={8} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }} />
              </Row>
            </Group>
          </>
        )}
      </div>
    </Overlay>
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
