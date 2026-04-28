import React from 'react'

export const SLATE_CSS = `
  :root { color-scheme: dark; }
  html, body, #root { height: 100%; }
  body { margin: 0; background: #0a0d18; }

  .sl-root { --sl-bg: #0f1320; --sl-surface: #181d2e; --sl-surface-2: #1f253a; --sl-border: rgba(255,255,255,0.06); --sl-border-strong: rgba(255,255,255,0.12); --sl-text: #e8ecf5; --sl-muted: #8590a8; --sl-accent: #7b8fff; --sl-accent-soft: rgba(123,143,255,0.12); --sl-online: #43d98e; }
  .sl-root[data-density="compact"] { --sl-row-pad: 8px 12px; --sl-msg-gap: 8px; }
  .sl-root[data-density="cozy"] { --sl-row-pad: 10px 12px; --sl-msg-gap: 12px; }
  .sl-root, .sl-root * { box-sizing: border-box; }
  .sl-root { font-family: 'Inter', system-ui, sans-serif; color: var(--sl-text); background: var(--sl-bg); display: flex; overflow: hidden; width: 100%; height: 100dvh; }

  .sl-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
  .sl-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 4px; }
  .sl-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.12); }

  .sl-cursor { display: inline-block; width: 2px; height: 1em; background: currentColor; margin-left: 2px; vertical-align: -2px; animation: slBlink 1s infinite; }
  @keyframes slBlink { 0%, 50% { opacity: 1 } 50.01%, 100% { opacity: 0 } }
  .sl-spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.15); border-top-color: var(--sl-accent); border-radius: 50%; animation: slSpin 0.8s linear infinite; display: inline-block; }
  @keyframes slSpin { to { transform: rotate(360deg) } }

  .sl-typingdots { display: inline-flex; gap: 3px; align-items: center; }
  .sl-typingdots span { width: 5px; height: 5px; background: var(--sl-accent); border-radius: 50%; animation: slBounce 1.2s infinite; }
  .sl-typingdots span:nth-child(2) { animation-delay: 0.15s }
  .sl-typingdots span:nth-child(3) { animation-delay: 0.3s }
  @keyframes slBounce { 0%, 60%, 100% { opacity: 0.3; transform: translateY(0) } 30% { opacity: 1; transform: translateY(-3px) } }

  .sl-action { color: #b6c0e0; font-style: italic; opacity: 0.85; }
  .sl-icon-btn { background: transparent; border: none; color: var(--sl-muted); width: 36px; height: 36px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-family: inherit; transition: background 0.15s, color 0.15s; }
  .sl-icon-btn:hover { background: var(--sl-surface); color: var(--sl-text); }
  .sl-icon-btn[data-active="true"] { color: var(--sl-accent); background: var(--sl-accent-soft); }
  .sl-btn { background: var(--sl-accent); color: white; border: none; padding: 9px 16px; border-radius: 10px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; }
  .sl-btn:disabled { opacity: 0.5; cursor: default; }
  .sl-btn-ghost { background: transparent; color: var(--sl-text); border: 1px solid var(--sl-border-strong); padding: 8px 14px; border-radius: 10px; font-size: 13px; cursor: pointer; font-family: inherit; }
  .sl-btn-ghost:hover { background: var(--sl-surface); }
  .sl-input { background: var(--sl-surface); border: 1px solid var(--sl-border); color: var(--sl-text); padding: 9px 12px; border-radius: 10px; font-size: 13px; outline: none; font-family: inherit; width: 100%; }
  .sl-input:focus { border-color: var(--sl-accent); }
  .sl-textarea { background: var(--sl-surface); border: 1px solid var(--sl-border); color: var(--sl-text); padding: 10px 12px; border-radius: 10px; font-size: 13px; outline: none; font-family: inherit; width: 100%; resize: vertical; min-height: 80px; line-height: 1.5; }
  .sl-textarea:focus { border-color: var(--sl-accent); }
  .sl-label { font-size: 11px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: var(--sl-muted); margin-bottom: 6px; }

  .sl-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 11px; background: var(--sl-surface); border: 1px solid var(--sl-border); color: var(--sl-muted); }
  .sl-pill[data-tone="accent"] { background: var(--sl-accent-soft); color: var(--sl-accent); border-color: transparent; }

  .sl-screen-enter { animation: slSlide 0.22s ease-out; }
  @keyframes slSlide { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }

  /* Mobile only: long-press on a message bubble should open the context menu,
     not begin a text selection. On desktop we leave selection enabled so the
     user can highlight + Ctrl+C as normal — the right-click custom menu still
     offers "Copy text" for the whole message. */
  .sl-root[data-mobile="true"] .sl-msg,
  .sl-root[data-mobile="true"] .sl-msg * {
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
  }
  /* Editable inputs inside the bubble (when editing) always need normal selection. */
  .sl-msg textarea, .sl-msg input {
    -webkit-user-select: text;
    user-select: text;
    -webkit-touch-callout: default;
  }
`

export const ICONS = {
  send: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>,
  attach: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>,
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  settings: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  gallery: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  back: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  close: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  more: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>,
  pin: <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 6 6 1-4.5 4 1 6.5L12 16l-5.5 3.5 1-6.5L3 9l6-1z"/></svg>,
  plus: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  user: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  edit: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
  refresh: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  copy: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  message: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  trash: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>,
  download: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  spark: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/></svg>,
  chevronDown: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
}

// Render assistant text. *actions* are styled italic.
export function renderRP(text) {
  if (!text) return null
  const parts = []
  let last = 0
  const re = /\*([^*]+)\*/g
  let m, key = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={key++}>{text.slice(last, m.index)}</span>)
    parts.push(<em className="sl-action" key={key++}>*{m[1]}*</em>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(<span key={key++}>{text.slice(last)}</span>)
  return parts
}

export function Avatar({ char, size = 38, showOnline = false }) {
  const dotSize = Math.max(9, size * 0.26)
  const onlineDot = showOnline && char.online ? (
    <span style={{
      position: 'absolute', bottom: -1, right: -1,
      width: dotSize, height: dotSize,
      background: 'var(--sl-online)', border: '2px solid #0c1020', borderRadius: '50%',
    }} />
  ) : null

  if (char.avatarUrl) {
    // Outer wrapper does NOT clip — the online dot lives here so it can sit
    // proud of the circle's edge. Inner wrapper clips the image into a circle.
    return (
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden' }}>
          <img src={char.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
        {onlineDot}
      </div>
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: char.accent || '#7b8fff', color: 'white',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 600, fontSize: size * 0.42, flexShrink: 0, position: 'relative',
    }}>
      {char.initial || (char.name?.[0] || '?').toUpperCase()}
      {onlineDot}
    </div>
  )
}

export function nowTime() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Auto-pick a stable accent color from a string id.
const ACCENT_PALETTE = ['#7b8fff', '#43d98e', '#d97a4a', '#e07ba1', '#7cc4d9', '#c4a87b', '#b07be0']
export function autoAccent(id) {
  if (!id) return ACCENT_PALETTE[0]
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return ACCENT_PALETTE[h % ACCENT_PALETTE.length]
}
