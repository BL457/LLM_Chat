import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Avatar, GroupAvatar, ICONS, renderRP } from './shared.jsx'
import { synthesizeSpeech } from './api.js'

// Prepare a message for TTS. We keep *actions* in the read-aloud text
// (they're meaningful narration, not noise), but wrap them with sentence
// boundaries so the TTS engine pauses around them and they don't blur
// into the surrounding speech. Punctuation is the lever Kokoro responds
// to most reliably — full stops give a meatier pause than commas, and
// the model handles them as expected.
function textForTTS(text) {
  if (!text) return ''
  let s = String(text)
  // Wrap *bracketed actions* with sentence-ending punctuation. The leading
  // period closes whatever speech preceded it; the trailing period opens
  // a clean break before the next bit of speech.
  s = s.replace(/\*\s*([^*]+?)\s*\*/g, (_, inner) => {
    // Don't double up punctuation if the action already ends with .!?
    const trimmed = inner.trim()
    const tail = /[.!?…]$/.test(trimmed) ? '' : '.'
    return `. ${trimmed}${tail} `
  })
  // Tidy whitespace and collapse runs of punctuation introduced by the
  // wrapping ('. .' / '! .' / '? .' etc.).
  s = s.replace(/\s+/g, ' ')
  // If a sentence already ends with .!?…, drop the leading period we just
  // injected — '! .' becomes '!', '. .' becomes '.', etc.
  s = s.replace(/([.!?…])\s+\./g, '$1')
  s = s.replace(/\s+([.,!?;:])/g, '$1')
  s = s.trim().replace(/^[.\s,]+/, '').replace(/[\s,]+$/, '')
  return s
}

export default function Conversation({
  char, userProfile, settings,
  onSend, onUpdateChar, onOpenProfile,
  isStreaming, onCancelStream,
  onRegenerate, onResendUser, onContinueFrom, onAttachImage,
  // Group-only:
  onGroupReplyAs,    // (charId) => void — voice this member next
  onGroupAutoStart,  // () => void — start round-robin loop
  onGroupAutoStop,   // () => void — pause loop
  isAutoLoopActive,  // bool — whether loop is currently going
  isMobile, onBack,
}) {
  const isGroup = char?.kind === 'group'
  const groupMembers = isGroup ? (char.members || []) : []
  const userAvatarChar = {
    name: userProfile?.name || 'You',
    initial: (userProfile?.name?.[0] || '?').toUpperCase(),
    avatarUrl: userProfile?.avatarUrl || null,
    accent: userProfile?.accent || '#7b8fff',
  }
  const [pendingImage, setPendingImage] = useState(null)  // data URL of attached image
  const [showScrollDown, setShowScrollDown] = useState(false)
  const [composerHeight, setComposerHeight] = useState(44)  // textarea pixel height
  const [playingMsgId, setPlayingMsgId] = useState(null)
  const [synthInflight, setSynthInflight] = useState({})  // msgId -> true while synthesising
  const fileRef = useRef(null)
  const textareaRef = useRef(null)
  const wasNearBottomRef = useRef(true)  // remember scroll state across renders
  // Audio queue state — stored in refs so updates don't cause renders mid-playback.
  const audioCacheRef = useRef({})           // msgId -> blob URL (cached after first synth)
  const audioQueueRef = useRef([])           // pending {msgId, url}
  const currentAudioRef = useRef(null)       // currently playing HTMLAudioElement
  const lastAutoPlayedRef = useRef(null)     // most recent msg id auto-play has handled

  const audioEnabled = settings?.audioEnabled === 'true' || settings?.audioEnabled === true
  const ttsProvider = settings?.ttsProvider || 'kokoro-local'

  const stopPlayback = () => {
    if (currentAudioRef.current) {
      try { currentAudioRef.current.pause() } catch {}
      currentAudioRef.current = null
    }
    audioQueueRef.current = []
    setPlayingMsgId(null)
  }

  const playNextInQueue = () => {
    if (currentAudioRef.current) return
    const next = audioQueueRef.current.shift()
    if (!next) {
      setPlayingMsgId(null)
      return
    }
    const audio = new Audio(next.url)
    currentAudioRef.current = audio
    setPlayingMsgId(next.msgId)
    const onDone = () => {
      currentAudioRef.current = null
      playNextInQueue()
    }
    audio.onended = onDone
    audio.onerror = onDone
    audio.play().catch(() => onDone())
  }

  const enqueueAndPlay = (msgId, url) => {
    audioQueueRef.current.push({ msgId, url })
    playNextInQueue()
  }

  // Synthesize a message's TTS audio (or hit the cache) and queue it for
  // sequential playback. Speaker is looked up by msg.from for groups, or
  // falls back to the active character.
  const playMessage = async (msg) => {
    if (!msg || msg.role !== 'assistant') return
    const text = textForTTS(msg.text)
    if (!text) return
    const speaker = (groupMembers && groupMembers.length > 0 && msg.from)
      ? (groupMembers.find(m => m?.id === msg.from) || char)
      : char
    const voice = speaker?.voice
    if (!voice) {
      console.warn('No voice configured for speaker; aborting playback')
      return
    }
    const cached = audioCacheRef.current[msg.id]
    if (cached) {
      enqueueAndPlay(msg.id, cached)
      return
    }
    if (synthInflight[msg.id]) return
    setSynthInflight(s => ({ ...s, [msg.id]: true }))
    try {
      const url = await synthesizeSpeech({ provider: ttsProvider, voice, text })
      audioCacheRef.current[msg.id] = url
      enqueueAndPlay(msg.id, url)
    } catch (e) {
      console.warn('TTS synth failed:', e)
    } finally {
      setSynthInflight(s => { const n = { ...s }; delete n[msg.id]; return n })
    }
  }

  // Auto-play: when a NEW assistant message finalises and the toggle is on,
  // queue it up. Tracks the last msg-id we've already handled so we don't
  // re-fire on unrelated re-renders.
  useEffect(() => {
    if (!audioEnabled || !char) return
    const list = (char.messages || []).filter(m => m.role !== 'narrator' && !m.hidden)
    let newest = null
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]
      if (m.role === 'assistant' && !m.streaming && m.text) { newest = m; break }
    }
    if (!newest) return
    if (lastAutoPlayedRef.current === newest.id) return
    lastAutoPlayedRef.current = newest.id
    playMessage(newest)
  }, [audioEnabled, char?.messages?.length, char?.messages?.[char?.messages?.length - 1]?.text, char?.messages?.[char?.messages?.length - 1]?.streaming])

  // Stop / clear queue when we switch chats. We also pre-mark the most
  // recent existing assistant message as 'already auto-played' so that
  // re-entering a chat doesn't trigger auto-play of the last reply
  // you've already heard.
  useEffect(() => {
    stopPlayback()
    let mostRecentId = null
    const list = (char?.messages || []).filter(m => m.role !== 'narrator' && !m.hidden)
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]
      if (m.role === 'assistant' && !m.streaming && m.text) { mostRecentId = m.id; break }
    }
    lastAutoPlayedRef.current = mostRecentId
  }, [char?.id])

  // Free Blob URLs on unmount.
  useEffect(() => () => {
    stopPlayback()
    Object.values(audioCacheRef.current).forEach(url => { try { URL.revokeObjectURL(url) } catch {} })
    audioCacheRef.current = {}
  }, [])

  // Drag the divider above the composer to resize the textarea. Desktop only.
  const onDividerDragStart = (e) => {
    if (isMobile) return
    e.preventDefault()
    const startY = e.clientY
    const startHeight = composerHeight
    const onMove = (ev) => {
      const dy = startY - ev.clientY  // dragging up grows the textarea
      const next = Math.max(44, Math.min(window.innerHeight * 0.6, startHeight + dy))
      setComposerHeight(next)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'ns-resize'
  }

  const onPickFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setPendingImage(reader.result)
    reader.readAsDataURL(f)
    e.target.value = ''  // reset so picking the same file again still fires change
  }
  const [draft, setDraft] = useState('')
  const [menu, setMenu] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const messagesRef = useRef(null)

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  // Auto-scroll only when the user was already near the bottom — otherwise
  // they're reading older messages and shouldn't be yanked. Switching chats
  // (char.id change) always snaps to bottom. We watch the last message's
  // image status too so the "Generating…" placeholder appearing — and the
  // final image landing — both trigger a re-scroll.
  const lastMsg = char?.messages?.[char?.messages?.length - 1]
  const lastImageStatus = lastMsg?.image?.status || ''
  // Track which speaker spoke last too — in group chats, alternating
  // members can finalize back-to-back without changing length or last
  // text-string identity (different objects but same content shape).
  const lastFrom = lastMsg?.from || ''
  useEffect(() => {
    const el = messagesRef.current
    if (!el) return
    if (!wasNearBottomRef.current) return
    // Multi-tick re-snap: layout for a freshly-grown bubble (typing dots
    // → full message) often settles across a frame or two, so a single
    // synchronous scrollTop assignment can land short. Same pattern as
    // the char.id effect.
    const snap = () => { if (el) el.scrollTop = el.scrollHeight }
    snap()
    const raf = requestAnimationFrame(snap)
    const t1 = setTimeout(snap, 80)
    const t2 = setTimeout(snap, 250)
    return () => { cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2) }
  }, [char?.messages?.length, lastMsg?.text, lastImageStatus, lastFrom])

  useEffect(() => {
    const el = messagesRef.current
    if (!el) return
    // Re-snap to bottom several times — once immediately, once after the
    // next layout pass, then a couple of delayed retries to catch images
    // (particularly large data: URL attachments) whose natural dimensions
    // only arrive once the browser finishes decoding them.
    const snap = () => { if (el) el.scrollTop = el.scrollHeight }
    snap()
    const raf = requestAnimationFrame(snap)
    const t1 = setTimeout(snap, 100)
    const t2 = setTimeout(snap, 350)

    wasNearBottomRef.current = true
    setShowScrollDown(false)
    if (textareaRef.current) textareaRef.current.focus()

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [char?.id])

  const onMessagesScroll = () => {
    const el = messagesRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const nearBottom = distFromBottom < 80
    wasNearBottomRef.current = nearBottom
    setShowScrollDown(!nearBottom)
  }

  const scrollToBottom = () => {
    const el = messagesRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  if (!char) return null

  const send = () => {
    const text = draft.trim()
    if ((!text && !pendingImage) || isStreaming) return
    const imgToSend = pendingImage
    setDraft('')
    setPendingImage(null)
    onSend(text, imgToSend)
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const visibleMessages = (char.messages || []).filter(m => m.role !== 'narrator' && !m.hidden)

  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--sl-bg)', minWidth: 0, height: '100%' }}>
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 24px', borderBottom: '1px solid var(--sl-border)',
        background: 'rgba(15,19,32,0.85)', backdropFilter: 'blur(8px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {isMobile && (
            <button className="sl-icon-btn" onClick={onBack} title="Back" style={{ marginLeft: -8 }}>{ICONS.back}</button>
          )}
          <button onClick={onOpenProfile} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontFamily: 'inherit', textAlign: 'left' }}>
            {isGroup
              ? <GroupAvatar participants={groupMembers} size={38} />
              : <Avatar char={char} size={38} />}
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.2 }}>{char.name}</div>
              <div style={{ fontSize: 12, color: 'var(--sl-muted)', marginTop: 2 }}>
                {char.typing
                  ? <span style={{ color: 'var(--sl-accent)', fontStyle: 'italic' }}>typing…</span>
                  : isGroup
                    ? groupMembers.map(m => m.name).join(', ')
                    : <><span style={{ color: 'var(--sl-online)' }}>●</span> ready</>}
              </div>
            </div>
          </button>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="sl-icon-btn" onClick={onOpenProfile} title="Profile">{ICONS.more}</button>
        </div>
      </header>

      <div className="sl-scroll" ref={messagesRef} onScroll={onMessagesScroll} style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 8px', display: 'flex', flexDirection: 'column' }}>
        {visibleMessages.map((m, i, arr) => (
          <MessageRow key={m.id} msg={m} char={char} userAvatarChar={userAvatarChar} groupMembers={groupMembers} prev={arr[i - 1]}
            onOpenMenu={(info) => setMenu(info)}
            onOpenImage={(img) => setLightbox({ ...img, charName: char.name, time: m.time })}
            onImageLoaded={() => {
              // Once the image actually decodes, layout may have shifted —
              // re-snap to bottom if the user was already there.
              const el = messagesRef.current
              if (el && wasNearBottomRef.current) el.scrollTop = el.scrollHeight
            }}
            editing={editingId === m.id}
            onCancelEdit={() => setEditingId(null)}
            onSaveEdit={(newText) => {
              onUpdateChar({ ...char, messages: char.messages.map(x => x.id === m.id ? { ...x, text: newText, edited: true } : x) })
              setEditingId(null)
            }}
          />
        ))}
        {visibleMessages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--sl-muted)', padding: 40, textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--sl-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, color: 'var(--sl-accent)' }}>{ICONS.message}</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--sl-text)' }}>No messages yet</div>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>Say hi to {char.name} to begin.</div>
          </div>
        )}
      </div>

      {isMobile ? (
        <div style={{ borderTop: '1px solid var(--sl-border)', flexShrink: 0 }} />
      ) : (
        <div
          onMouseDown={onDividerDragStart}
          aria-hidden="true"
          title="Drag to resize"
          style={{
            height: 7, marginBottom: -3,  // 4px hit area below the visible line
            cursor: 'ns-resize',
            borderTop: '1px solid var(--sl-border)',
            flexShrink: 0,
            position: 'relative', zIndex: 6,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderTopColor = 'var(--sl-accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderTopColor = 'var(--sl-border)' }}
        />
      )}
      {isGroup && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6,
          padding: '10px 24px 0',
        }}>
          {groupMembers.map(m => (
            <button key={m.id}
              onClick={() => onGroupReplyAs && onGroupReplyAs(m.id)}
              disabled={isStreaming || isAutoLoopActive}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'var(--sl-surface)', border: '1px solid var(--sl-border-strong)',
                color: 'var(--sl-text)', padding: '6px 10px 6px 6px', borderRadius: 999,
                fontSize: 12.5, cursor: (isStreaming || isAutoLoopActive) ? 'default' : 'pointer',
                fontFamily: 'inherit',
                opacity: (isStreaming || isAutoLoopActive) ? 0.5 : 1,
              }}>
              <Avatar char={m} size={20} />
              Reply as {m.name}
            </button>
          ))}
          {isAutoLoopActive
            ? <button onClick={onGroupAutoStop} style={{
                background: '#c75555', border: 'none', color: 'white',
                padding: '6px 14px', borderRadius: 999, fontSize: 12.5,
                cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>
                Pause
              </button>
            : <button onClick={onGroupAutoStart}
                disabled={isStreaming}
                style={{
                  background: 'var(--sl-accent)', border: 'none', color: 'white',
                  padding: '6px 14px', borderRadius: 999, fontSize: 12.5,
                  cursor: isStreaming ? 'default' : 'pointer', fontFamily: 'inherit',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  opacity: isStreaming ? 0.5 : 1,
                }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>
                Auto
              </button>}
        </div>
      )}
      <div style={{ position: 'relative', padding: '10px 24px 16px' }}>
        {showScrollDown && (
          <button onClick={scrollToBottom} aria-label="Scroll to latest" title="Scroll to latest" style={{
            position: 'absolute', right: 24, top: -50,
            width: 40, height: 40, borderRadius: '50%',
            background: 'var(--sl-surface)', border: '1px solid var(--sl-border-strong)',
            color: 'var(--sl-text)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            transition: 'transform 0.12s, background 0.15s',
            zIndex: 5,
          }} onMouseEnter={e => { e.currentTarget.style.background = 'var(--sl-surface-2)' }}
             onMouseLeave={e => { e.currentTarget.style.background = 'var(--sl-surface)' }}>
            {ICONS.chevronDown}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={{ display: 'none' }} />

        {pendingImage && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8,
            background: 'var(--sl-surface)', border: '1px solid var(--sl-border)',
            borderRadius: 12, padding: 8,
          }}>
            <img src={pendingImage} alt="attachment preview" style={{
              width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0,
            }} />
            <div style={{ flex: 1, fontSize: 12, color: 'var(--sl-muted)' }}>
              Image attached. Send to share with {char.name}.
            </div>
            <button onClick={() => setPendingImage(null)} aria-label="Remove attachment" title="Remove" style={{
              background: 'transparent', border: 'none', color: 'var(--sl-muted)',
              width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>{ICONS.close}</button>
          </div>
        )}

        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 6,
          background: 'var(--sl-surface)', border: '1px solid var(--sl-border)',
          borderRadius: 14, padding: '6px',
        }}>
          <button onClick={() => fileRef.current?.click()} aria-label="Attach image" title="Attach image" disabled={isStreaming} style={{
            background: 'transparent', border: 'none', color: 'var(--sl-muted)',
            width: 36, height: 36, borderRadius: 10, cursor: isStreaming ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            opacity: isStreaming ? 0.4 : 1,
          }}>{ICONS.attach}</button>
          <textarea ref={textareaRef} rows={1} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onKey}
            placeholder={`Message ${char.name}`}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--sl-text)', fontSize: 14, resize: 'none', fontFamily: 'inherit',
              padding: '10px 4px', lineHeight: 1.4, overflowY: 'auto',
              height: isMobile ? undefined : composerHeight,
              minHeight: 44, maxHeight: isMobile ? '40vh' : undefined,
            }} />
          {isStreaming ? (
            <button onClick={onCancelStream} aria-label="Stop streaming" title="Stop" style={{
              background: 'var(--sl-surface-2)', border: '1px solid var(--sl-border-strong)',
              color: 'var(--sl-text)', width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg></button>
          ) : (
            <button onClick={send} disabled={!draft.trim() && !pendingImage} aria-label="Send" style={{
              background: (draft.trim() || pendingImage) ? 'var(--sl-accent)' : 'var(--sl-surface-2)',
              border: 'none', color: (draft.trim() || pendingImage) ? 'white' : 'var(--sl-muted)',
              width: 36, height: 36, borderRadius: 10, cursor: (draft.trim() || pendingImage) ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              transition: 'background 0.15s',
            }}>{ICONS.send}</button>
          )}
        </div>
      </div>

      {lightbox && <ImageLightbox image={lightbox} onClose={() => setLightbox(null)} />}
      {menu && (
        <MessageContextMenu
          x={menu.x} y={menu.y} msg={menu.msg} char={char}
          onClose={() => setMenu(null)}
          onRegenerate={() => onRegenerate && onRegenerate(menu.msg)}
          onResend={() => onResendUser && onResendUser(menu.msg)}
          onContinueHere={() => onContinueFrom && onContinueFrom(menu.msg)}
          onEdit={() => setEditingId(menu.msg.id)}
          onDelete={() => onUpdateChar({ ...char, messages: char.messages.filter(x => x.id !== menu.msg.id) })}
          onAttachImage={() => onAttachImage && onAttachImage(menu.msg)}
          onPlayAudio={() => playingMsgId === menu.msg.id ? stopPlayback() : playMessage(menu.msg)}
          isAudioPlaying={playingMsgId === menu.msg.id}
          isSynthInflight={!!synthInflight[menu.msg.id]}
        />
      )}
    </main>
  )
}

function MessageContextMenu({ x, y, msg, char, onClose, onRegenerate, onResend, onAttachImage, onContinueHere, onDelete, onEdit, onPlayAudio, isAudioPlaying, isSynthInflight }) {
  const isAssistant = msg.role === 'assistant'
  const isUser = msg.role === 'user'
  const playIcon = (
    isSynthInflight
      ? <span className="sl-spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
      : isAudioPlaying
        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>
        : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>
  )
  const items = []
  if (isAssistant) {
    items.push({ icon: ICONS.refresh, label: 'Regenerate reply', onClick: onRegenerate })
    items.push({ icon: ICONS.spark, label: msg.image ? 'Re-generate scene image' : 'Generate scene image', onClick: onAttachImage })
    if (msg.text && onPlayAudio) {
      items.push({
        icon: playIcon,
        label: isSynthInflight ? 'Synthesising audio…' : (isAudioPlaying ? 'Stop audio' : 'Play audio'),
        onClick: isSynthInflight ? null : onPlayAudio,
      })
    }
  }
  if (isUser) {
    items.push({ icon: ICONS.refresh, label: 'Resend (re-roll reply)', onClick: onResend })
  }
  if (msg.image && msg.image.status === 'ready' && msg.image.src) {
    items.push({ icon: ICONS.download, label: 'Download image', onClick: () => {
      const a = document.createElement('a')
      a.href = msg.image.src
      a.download = `scene_${msg.id}.png`
      a.click()
    }})
  }
  items.push({ icon: ICONS.copy, label: 'Copy text', onClick: () => navigator.clipboard?.writeText(msg.text || '') })
  items.push({ icon: ICONS.edit, label: 'Edit message', onClick: onEdit })
  if (isAssistant) items.push({ icon: ICONS.user, label: 'Continue from here', onClick: onContinueHere })
  items.push({ divider: true })
  items.push({ icon: ICONS.trash, label: 'Delete message', danger: true, onClick: onDelete })

  const W = 220, H = items.length * 34 + 12
  const left = Math.min(x, window.innerWidth - W - 8)
  const top = Math.min(y, window.innerHeight - H - 8)

  return createPortal(
    <div onClick={(e) => e.stopPropagation()} onContextMenu={(e) => { e.preventDefault(); onClose() }} style={{
      position: 'fixed', left, top, width: W, zIndex: 1000,
      background: '#1a1f30', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10, padding: 6,
      boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.4)',
      fontFamily: "'Inter', system-ui, sans-serif",
      animation: 'slMenuIn 0.12s ease-out',
    }}>
      <style>{`@keyframes slMenuIn { from { opacity: 0; transform: scale(0.96) } to { opacity: 1; transform: scale(1) } }`}</style>
      {items.map((it, i) => it.divider
        ? <div key={i} style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 6px' }} />
        : <button key={i} onClick={() => { it.onClick && it.onClick(); onClose() }} style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            background: 'transparent', border: 'none', color: it.danger ? '#e07b7b' : '#e8ecf5',
            padding: '7px 10px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
            textAlign: 'left', fontFamily: 'inherit',
          }} onMouseEnter={(e) => e.currentTarget.style.background = it.danger ? 'rgba(224,123,123,0.1)' : 'rgba(255,255,255,0.05)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
            <span style={{ display: 'inline-flex', width: 16, justifyContent: 'center', opacity: 0.85 }}>{it.icon}</span>
            <span>{it.label}</span>
          </button>
      )}
    </div>,
    document.body
  )
}

function MessageRow({ msg, char, userAvatarChar, groupMembers, prev, onOpenMenu, onOpenImage, onImageLoaded, editing, onCancelEdit, onSaveEdit }) {
  // For group chats, the assistant's avatar/name comes from msg.from (the
  // member who voiced this turn). For individual chats, it's just `char`.
  const speaker = (groupMembers && groupMembers.length > 0 && msg?.from)
    ? (groupMembers.find(m => m?.id === msg.from) || char)
    : char
  const [editText, setEditText] = useState(msg.text)
  useEffect(() => { setEditText(msg.text) }, [msg.text, editing])

  if (msg.role === 'narrator') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '16px 0 8px', padding: '0 40px' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--sl-border)' }} />
        <div style={{ fontSize: 12, color: 'var(--sl-muted)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 8 }}>
          {msg.isCommand && <span style={{
            background: 'var(--sl-accent-soft)', color: 'var(--sl-accent)',
            padding: '2px 8px', borderRadius: 6, fontSize: 10, fontStyle: 'normal',
            fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase',
          }}>narrator</span>}
          <em>{msg.text}</em>
        </div>
        <div style={{ flex: 1, height: 1, background: 'var(--sl-border)' }} />
      </div>
    )
  }
  const isUser = msg.role === 'user'
  // Two consecutive bubbles count as "from the same speaker" only when
  // they're the same role AND, for group-chat assistant turns, the same
  // member voiced both. Without the from-check, alternating characters
  // looked like one long monologue with no attribution after the first.
  const sameAsPrev = prev && prev.role === msg.role && (
    msg.role !== 'assistant' || (prev.from || null) === (msg.from || null)
  )

  return (
    <div className="sl-msg" onContextMenu={(e) => { e.preventDefault(); onOpenMenu && onOpenMenu({ x: e.clientX, y: e.clientY, msg }) }}
      style={{ display: 'flex', gap: 10, alignItems: 'flex-end',
        justifyContent: isUser ? 'flex-end' : 'flex-start', marginTop: sameAsPrev ? 2 : 12, cursor: 'context-menu' }}>
      {!isUser && (
        <div style={{ width: 30, opacity: sameAsPrev ? 0 : 1 }}>
          {!sameAsPrev && <Avatar char={speaker} size={30} />}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: '70%', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
        {!sameAsPrev && !isUser && groupMembers && groupMembers.length > 0 && speaker?.name && (
          <div style={{ fontSize: 11.5, color: 'var(--sl-muted)', padding: '0 4px' }}>{speaker.name}</div>
        )}
        {!sameAsPrev && isUser && userAvatarChar?.name && userAvatarChar.name !== '?' && (
          <div style={{ fontSize: 11.5, color: 'var(--sl-muted)', padding: '0 4px' }}>{userAvatarChar.name}</div>
        )}
        <div style={{
          padding: editing ? 8 : '10px 14px', borderRadius: 18, fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word',
          background: isUser ? 'var(--sl-accent)' : 'var(--sl-surface)',
          color: isUser ? 'white' : 'var(--sl-text)',
          borderBottomLeftRadius: !isUser ? 6 : 18,
          borderBottomRightRadius: isUser ? 6 : 18,
          borderTopLeftRadius: sameAsPrev && !isUser ? 6 : 18,
          borderTopRightRadius: sameAsPrev && isUser ? 6 : 18,
          minWidth: editing ? 240 : undefined,
        }}>
          {editing ? (
            <div>
              <textarea autoFocus value={editText} onChange={e => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSaveEdit(editText.trim())
                  if (e.key === 'Escape') onCancelEdit()
                }}
                style={{
                  width: '100%', background: isUser ? 'rgba(255,255,255,0.12)' : 'var(--sl-bg)',
                  border: '1px solid ' + (isUser ? 'rgba(255,255,255,0.18)' : 'var(--sl-border)'),
                  borderRadius: 10, padding: 10, color: 'inherit', fontFamily: 'inherit',
                  fontSize: 14, lineHeight: 1.5, resize: 'vertical', minHeight: 70, outline: 'none',
                }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
                <button onClick={onCancelEdit} style={editBtnStyle(isUser, false)}>Cancel</button>
                <button onClick={() => onSaveEdit(editText.trim())} disabled={!editText.trim()} style={editBtnStyle(isUser, true)}>Save</button>
              </div>
            </div>
          ) : msg.streaming && !msg.text ? (
            <div style={{ padding: '4px 2px' }}>
              <span className="sl-typingdots"><span /><span /><span /></span>
            </div>
          ) : (
            <>
              <div style={{ whiteSpace: 'pre-wrap' }}>
                {isUser ? msg.text : renderRP(msg.text)}
              </div>
              <span style={{
                fontSize: 10.5, marginLeft: 8, float: 'right', marginTop: 6, marginBottom: -2,
                fontVariantNumeric: 'tabular-nums',
                color: isUser ? 'rgba(255,255,255,0.6)' : 'var(--sl-muted)',
              }}>{msg.edited ? 'edited · ' : ''}{msg.time}</span>
            </>
          )}
        </div>
        {msg.image && <ImageAttachment image={msg.image} onLoaded={onImageLoaded} onOpen={() => msg.image.status === 'ready' && onOpenImage && onOpenImage(msg.image)} />}
      </div>
      {isUser && (
        <div style={{ width: 30, opacity: sameAsPrev ? 0 : 1 }}>
          {!sameAsPrev && <Avatar char={userAvatarChar} size={30} />}
        </div>
      )}
    </div>
  )
}

function editBtnStyle(isUser, primary) {
  if (primary) {
    return {
      background: isUser ? 'white' : 'var(--sl-accent)',
      color: isUser ? 'var(--sl-accent)' : 'white',
      border: 'none', padding: '6px 14px', borderRadius: 8,
      fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
    }
  }
  return {
    background: 'transparent',
    color: isUser ? 'rgba(255,255,255,0.85)' : 'var(--sl-muted)',
    border: '1px solid ' + (isUser ? 'rgba(255,255,255,0.25)' : 'var(--sl-border-strong)'),
    padding: '5px 12px', borderRadius: 8,
    fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
  }
}

function ImageAttachment({ image, onOpen, onLoaded }) {
  if (image.status === 'downloading' || image.status === 'pending') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
        background: 'var(--sl-surface-2)', border: '1px solid var(--sl-border)', borderRadius: 12,
      }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--sl-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="sl-spinner" />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Generating scene…</div>
          <div style={{ fontSize: 11.5, color: 'var(--sl-muted)', marginTop: 2 }}>Stable Diffusion</div>
        </div>
      </div>
    )
  }
  if (image.status === 'error') {
    return (
      <div style={{
        padding: '8px 12px', background: 'rgba(224,123,123,0.08)', border: '1px solid rgba(224,123,123,0.2)',
        borderRadius: 10, fontSize: 12, color: '#e07b7b',
      }}>Image failed: {image.error || 'unknown error'}</div>
    )
  }
  if (!image.src) return null
  return (
    <button onClick={onOpen} style={{
      padding: 0, border: 'none', background: 'transparent', cursor: 'zoom-in',
      borderRadius: 14, overflow: 'hidden', maxWidth: 280, position: 'relative',
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    }}>
      <img src={image.src} alt="scene" onLoad={onLoaded} style={{ width: '100%', maxWidth: 280, maxHeight: 360, objectFit: 'cover', display: 'block' }} />
    </button>
  )
}

function ImageLightbox({ image, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const download = () => {
    const a = document.createElement('a')
    a.href = image.src
    a.download = `scene_${(image.tags || 'image').split(',')[0].trim().replace(/\s+/g, '_')}.png`
    a.click()
  }
  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(5,7,14,0.92)', backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 22px', color: '#e8ecf5',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{image.charName || 'Scene'}</div>
          <div style={{ fontSize: 12, color: 'rgba(232,236,245,0.5)' }}>{image.time}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="sl-icon-btn" onClick={download} title="Download" style={{ color: '#e8ecf5' }}>{ICONS.download}</button>
          <button className="sl-icon-btn" onClick={onClose} title="Close" style={{ color: '#e8ecf5' }}>{ICONS.close}</button>
        </div>
      </div>
      <div onClick={onClose} style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 40px 20px', minHeight: 0,
        cursor: 'zoom-out',
      }}>
        <img src={image.src} alt="scene" style={{
          maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
          borderRadius: 8, boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }} />
      </div>
      {image.tags && (
        <div onClick={(e) => e.stopPropagation()} style={{
          padding: '12px 22px 22px', color: 'rgba(232,236,245,0.7)',
          fontFamily: "ui-monospace,'SF Mono',monospace", fontSize: 12, textAlign: 'center',
        }}>{image.tags}</div>
      )}
    </div>,
    document.body
  )
}
