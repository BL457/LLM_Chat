import React, { useEffect, useState, useRef, useCallback } from 'react'
import Sidebar from './Sidebar.jsx'
import Conversation from './Conversation.jsx'
import Profile from './overlays/Profile.jsx'
import Settings from './overlays/Settings.jsx'
import Gallery from './overlays/Gallery.jsx'
import NewChar from './overlays/NewChar.jsx'
import NewGroup from './overlays/NewGroup.jsx'
import GroupInfo from './overlays/GroupInfo.jsx'
import UserProfile from './overlays/UserProfile.jsx'
import { ICONS, SLATE_CSS, autoAccent, nowTime } from './shared.jsx'
import { loadState, saveState, streamNarrative, extractImageTags, generateImage } from './api.js'
import { notifyIfBackgrounded, stripForPreview } from './notifications.js'
import { useIsMobile } from './useViewport.js'

const EMPTY_SCENE = { location: '', clothing: '', appearance: '', objects: '', mood: '' }
// Group scene state: shared (location, atmosphere) + per-character
// individual fields (clothing, appearance, objects, mood). The speaking
// character's [/SCENE] block updates THEIR per-char fields plus the
// shared location.
const EMPTY_GROUP_SCENE = { location: '', atmosphere: '', characters: {} }
const EMPTY_PER_CHAR_GROUP_SCENE = { clothing: '', appearance: '', objects: '', mood: '' }

// Build a "view-shaped" object for a group, suitable for use in the same
// places we render character views (sidebar row, conversation header).
function viewGroup(group, members, messages, scene) {
  const visible = (messages || []).filter(m => m.role !== 'narrator' && !m.hidden)
  const last = visible[visible.length - 1]
  let lastMessage = group.blurb || ''
  if (last) {
    if (last.role === 'user') {
      lastMessage = `You: ${truncate(last.text, 50)}`
    } else if (last.role === 'assistant') {
      const speaker = members.find(m => m?.id === last.from)
      lastMessage = speaker ? `${speaker.name}: ${truncate(last.text, 50)}` : truncate(last.text, 60)
    } else {
      lastMessage = truncate(last.text, 60)
    }
  }
  return {
    ...group,
    kind: 'group',
    members,
    messages: messages || [],
    scene: scene || EMPTY_GROUP_SCENE,
    lastTime: last?.time || '',
    lastMessage,
    typing: false,
    initial: (group.name?.[0] || '?').toUpperCase(),
    online: true,
  }
}
const EMPTY_USER_PROFILE = {
  name: '', age: '', description: '', avatarUrl: null, accent: '#7b8fff',
  charactersKnowMe: false, charactersCanSeeMe: true, useNameInDialogue: true,
}

// Build the [OOC] context block sent as a hidden message on the first turn
// of any conversation. Returns null if there's nothing meaningful to say.
function buildUserContextOOC(profile) {
  if (!profile) return null
  const lines = []
  if (profile.name) lines.push(`NAME: ${profile.name}`)
  if (profile.age) lines.push(`AGE: ${profile.age}`)
  if (profile.description) lines.push(`DESCRIPTION: ${profile.description}`)
  lines.push(`PRIOR KNOWLEDGE: ${profile.charactersKnowMe ? 'You already know this person.' : 'You do not know this person yet — they are a stranger.'}`)
  lines.push(`PRESENCE: ${profile.charactersCanSeeMe ? 'They are physically present with you in the scene.' : 'They are communicating remotely (text, phone, message).'}`)
  if (profile.name) lines.push(`ADDRESS: ${profile.useNameInDialogue ? `You may use their name (${profile.name}) when addressing them.` : "Avoid using their name in dialogue unless they offer it."}`)
  // Need at least one substantive field beyond the always-present three lines.
  const hasSubstance = profile.name || profile.age || profile.description
  if (!hasSubstance) return null
  return `[OOC — context only, not in-character speech]
The person you are speaking with:
${lines.join('\n')}
[/OOC]`
}

const DEFAULT_SETTINGS = {
  // Connection — where to talk to the LLM and the image generator.
  llmProvider: 'ollama',                       // 'ollama' | 'llama.cpp' | 'openrouter' | 'custom'
  llmEndpoint: 'http://localhost:11434',
  llmApiKey: '',
  sdEndpoint: 'http://localhost:7860',

  ollamaModel: 'gemma4:26b',
  temperature: 1.0,
  topK: 64,
  topP: 0.95,
  minP: 0.01,
  repeatPenalty: 1.05,
  repeatLastN: 1024,
  numCtx: 16384,
  numPredict: 2048,
  think: 'false',
  awareOfTime: 'false',
  imgEnabled: 'true',
  density: 'cozy',
  retryPrompt: 'please repeat that response in the correct format',
  generalTags: '',
  negPrompt: '',
  steps: 40,
  cfgScale: 4,
  samplerName: '',
  sdModel: '',
  width: 1024,
  height: 1024,
  rpProtocol: '',
}

function buildNarrativeSystemPrompt(char, sceneStateStr, { timeAware = false } = {}) {
  const name = char?.name || 'the character'
  const timeBlock = timeAware ? `

=== TIME AWARENESS ===
Every user message you receive is prefixed with the timestamp it was sent at, in the format [YYYY-MM-DD HH:MM] (24-hour clock, local time). Use this naturally — for time-of-day greetings, awareness of how much time has elapsed between exchanges, and to colour your character's mood and energy where appropriate (sleepy in the small hours, hungry around mealtimes, weary by late evening). Treat the bracketed prefix as out-of-character context: do NOT echo the timestamp in your reply, do NOT repeat the date back, and do NOT include timestamps in your own messages. The user already knows what time it is — you just have access to the same information.` : ''
  return `You are ${name}. Stay in character. No disclaimers. No breaking the fourth wall.

=== RESPONSE FORMAT (MANDATORY) ===
Every reply MUST begin with a scene state block, followed by the marker [/SCENE], then your in-character narrative. The scene block lets the system track continuity — the user will not see it.

The exact format is:

LOCATION: <where the scene is taking place right now>
CLOTHING: <full description of every garment the character is currently wearing>
APPEARANCE: <character's current physical state — expression, posture, fur/hair state>
OBJECTS: <notable items or props in the scene>
MOOD: <emotional atmosphere of the scene>
[/SCENE]
<your in-character reply>

Rules for the scene block:
- All 5 fields are REQUIRED, in order
- Update each field based on what just happened
- Keep values consistent with the previous scene state — only change fields the narrative actually changes
- Concise but specific
- No markdown, no asterisks, no quotation marks, no extra blank lines

Rules for the in-character reply (after [/SCENE]):
- Plain text = speech. NEVER use quotation marks around speech.
- *asterisks* = actions, ALWAYS present tense. One brief action per reply is usually enough.
- DEFAULT TO SHORT REPLIES — 1 to 3 sentences. Most chat exchanges are quick: a greeting, a quip, a single reaction, a brief thought. Match the cadence of casual messaging — not the cadence of prose fiction.
- Go longer ONLY when the user has clearly asked you to describe, explain, narrate, or reflect, and the question genuinely needs a paragraph to answer. A long question doesn't necessarily warrant a long reply. When in doubt, stay short.
- Avoid filling space with extra physical detail when the moment doesn't call for it. Don't pile on actions, posture descriptions, or environmental beats just because you can — that turns a chat into a monologue.

The examples below show only the structure and length — IGNORE the placeholder voice. Speak in YOUR character's own voice, vocabulary, and mannerisms as defined in the CHARACTER section.

Default short reply (this is what almost every reply should look like):
LOCATION: <specific place the scene is happening>
CLOTHING: <every garment currently worn>
APPEARANCE: <current expression, posture, body-language details>
OBJECTS: <items or props in view>
MOOD: <emotional atmosphere>
[/SCENE]
<one or two lines of in-character speech> *<brief present-tense action>*

Longer reply — RARE, only when the user explicitly asks for description / reflection / a story beat:
LOCATION: <specific place>
CLOTHING: <full current outfit>
APPEARANCE: <current physical state, posture, distinctive details>
OBJECTS: <items in view>
MOOD: <atmosphere>
[/SCENE]
<a paragraph in your character's own voice, weaving speech with *bracketed present-tense actions* — gestures, glances, posture shifts. Use this length sparingly — only when explicitly invited.>

=== CURRENT SCENE ===
${sceneStateStr}

=== NARRATOR COMMANDS ===
Messages beginning with [NARRATOR COMMAND] are absolute directives. Comply fully.

=== OUT-OF-CHARACTER CONTEXT ===
Messages or sections wrapped in [OOC ... ] ... [/OOC] are out-of-character context, not speech. They establish facts about the user, the world, or the scene — for example, what the user looks like or whether you've met before. Treat the contents as setup information you have already internalised. Do NOT respond to an [OOC] block directly, do NOT acknowledge it as a message, and do NOT quote or repeat it. Just absorb the information and use it to inform your in-character reply to whatever the user says next.${timeBlock}

=== CHARACTER ===
${char?.systemPrompt || ''}`.trim()
}

function sceneStateToString(scene) {
  if (!scene) return 'No scene established yet.'
  const hasAny = Object.values(scene).some(v => v && String(v).trim())
  if (!hasAny) return 'No scene established yet.'
  return JSON.stringify(scene, null, 2)
}

// Build the system prompt sent when a specific character is voicing a reply
// inside a group chat. They get their own persona PLUS context about the
// group: where it's set, who else is here, and what state every participant
// is currently in (theirs to update, others' for awareness).
function buildGroupSystemPrompt(speaker, group, members, groupScene, { timeAware = false } = {}) {
  const sceneLines = []
  sceneLines.push(`You are speaking in a group conversation called "${group.name || 'Group'}".`)
  if (group.blurb) sceneLines.push(group.blurb)
  if (groupScene?.location) sceneLines.push(`Shared location: ${groupScene.location}`)
  if (groupScene?.atmosphere) sceneLines.push(`Atmosphere of the scene: ${groupScene.atmosphere}`)
  sceneLines.push('')
  sceneLines.push('Other participants in the room:')
  for (const m of members) {
    if (!m || m.id === speaker.id) continue
    const peerScene = (groupScene?.characters || {})[m.id] || {}
    const peerLines = []
    if (peerScene.clothing) peerLines.push(`wearing ${peerScene.clothing}`)
    if (peerScene.appearance) peerLines.push(peerScene.appearance)
    if (peerScene.objects) peerLines.push(`with ${peerScene.objects}`)
    if (peerScene.mood) peerLines.push(`mood: ${peerScene.mood}`)
    sceneLines.push(`- ${m.name}${peerLines.length ? ' — ' + peerLines.join(', ') : ''}${m.blurb ? ' (' + m.blurb + ')' : ''}`)
  }
  sceneLines.push('')
  const myScene = (groupScene?.characters || {})[speaker.id] || {}
  sceneLines.push(`Your own current state in this scene:`)
  sceneLines.push(`  clothing: ${myScene.clothing || '—'}`)
  sceneLines.push(`  appearance: ${myScene.appearance || '—'}`)
  sceneLines.push(`  objects: ${myScene.objects || '—'}`)
  sceneLines.push(`  mood: ${myScene.mood || '—'}`)
  sceneLines.push('')
  sceneLines.push('In the chat history, lines that begin with [Name]: are messages spoken by other participants. Lines without a prefix are spoken by the user (the human you are roleplaying with).')
  sceneLines.push('Reply only as yourself. Do NOT speak for, narrate the actions of, or generate dialogue for any other named participant. Stay focused on your character.')
  sceneLines.push('When you write your [/SCENE] block, the LOCATION field updates the SHARED scene location for everyone, while CLOTHING / APPEARANCE / OBJECTS / MOOD apply ONLY to you — your own state in the scene right now.')

  const sceneStateStr = sceneLines.join('\n')
  return buildNarrativeSystemPrompt(speaker, sceneStateStr, { timeAware })
}

// Convert a group's chat history into the perspective of one specific
// character — their own assistant turns stay 'assistant', everyone else's
// (other characters AND the user) become 'user' messages with name prefixes
// so the recipient can track who said what.
function groupApiPayload(messages, speakerId, members, { prefixTimestamps = false } = {}) {
  return messages.filter(m => m.role !== 'narrator' && !m.streaming).map(m => {
    let role
    let prefix = ''
    if (m.role === 'assistant') {
      if (m.from === speakerId) {
        // This is one of MY past replies — keep as 'assistant', no prefix.
        role = 'assistant'
      } else {
        // A peer's reply — flatten into a 'user' message with their name.
        role = 'user'
        const peer = members.find(x => x?.id === m.from)
        prefix = `[${peer?.name || 'Other'}]: `
      }
    } else {
      role = 'user'
      // Hidden OOC blocks (user-context injection) keep no prefix — they're
      // already wrapped in [OOC]...[/OOC]. Plain user lines get no prefix
      // either — the system prompt explains "no prefix = the user".
    }
    let content = m.text || ''
    if (prefixTimestamps && m.role === 'user' && !m.hidden) {
      const ts = messageTimestamp(m)
      if (ts) content = `[${formatLLMTimestamp(ts)}] ${content}`
    }
    const out = { role, content: prefix + content }
    if (m.role === 'user' && m.image?.src) {
      const b64 = m.image.src.replace(/^data:image\/[^;]+;base64,/, '')
      if (b64) out.images = [b64]
    }
    return out
  })
}

function viewChar(char, messages, scene) {
  const visible = (messages || []).filter(m => m.role !== 'narrator')
  const last = visible[visible.length - 1]
  return {
    ...char,
    accent: char.accent || autoAccent(char.id),
    initial: (char.name?.[0] || '?').toUpperCase(),
    online: true,
    messages: messages || [],
    lastTime: last?.time || '',
    lastMessage: last?.text ? truncate(last.text, 60) : (char.blurb || ''),
    typing: false,
    pinned: char.pinned || false,
    scene: scene || EMPTY_SCENE,
  }
}

function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s }

// Approximate "when did this conversation last move" by mining the trailing
// Date.now() out of the latest visible message's id (we generate ids as
// 'u'+Date.now(), 'a'+Date.now(), 'legacy-N-'+Date.now() — all end in a
// numeric timestamp). Returns 0 for empty conversations so they sort to the
// bottom of the sidebar.
function lastActivityTs(messages) {
  if (!Array.isArray(messages)) return 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (!m || m.role === 'narrator' || m.hidden) continue
    const match = String(m.id || '').match(/(\d{10,})/)
    if (match) return parseInt(match[1], 10)
    return 0
  }
  return 0
}

// Pull a JS timestamp out of a message: prefer an explicit `ts` field if we
// added one, otherwise mine the trailing Date.now() out of the id (we
// generate ids as 'u'+Date.now() / 'a'+Date.now() / 'legacy-N-'+Date.now()).
function messageTimestamp(msg) {
  if (typeof msg?.ts === 'number' && msg.ts > 0) return msg.ts
  const match = String(msg?.id || '').match(/(\d{10,})/)
  return match ? parseInt(match[1], 10) : null
}

function formatLLMTimestamp(ms) {
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function apiPayload(messages, { prefixTimestamps = false } = {}) {
  return messages.filter(m => m.role !== 'narrator' && !m.streaming).map(m => {
    const out = {
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.text || '',
    }
    // If "characters are aware of the time of day" is enabled, prepend an
    // ISO-ish timestamp to each visible user message. The system prompt
    // explains the format so the model doesn't echo it back.
    if (prefixTimestamps && m.role === 'user' && !m.hidden) {
      const ts = messageTimestamp(m)
      if (ts) out.content = `[${formatLLMTimestamp(ts)}] ${out.content}`
    }
    // Pass user-attached images to Ollama (its format: base64 strings without
    // the "data:image/...;base64," prefix). Only do this for user messages —
    // assistant `image` is generated scene art and shouldn't be fed back in.
    if (m.role === 'user' && m.image?.src) {
      const b64 = m.image.src.replace(/^data:image\/[^;]+;base64,/, '')
      if (b64) out.images = [b64]
    }
    return out
  })
}

function settingsToApi(s, systemPrompt) {
  return {
    model: s.ollamaModel,
    system_prompt: systemPrompt,
    temperature: s.temperature,
    top_k: s.topK,
    top_p: s.topP,
    min_p: s.minP,
    repeat_penalty: s.repeatPenalty,
    repeat_last_n: s.repeatLastN,
    num_ctx: s.numCtx,
    num_predict: s.numPredict,
    think: s.think === 'true' || s.think === true,
    // Provider routing — server uses these to pick Ollama vs OpenAI-compat
    // and which URL to call.
    llm_provider: s.llmProvider || 'ollama',
    llm_endpoint: s.llmEndpoint || 'http://localhost:11434',
    llm_api_key: s.llmApiKey || '',
  }
}

export default function App() {
  const [characters, setCharacters] = useState([])
  const [groups, setGroups] = useState([])  // [{id, name, blurb, accent, participants:[charId,...]}]
  const [chatHistory, setChatHistory] = useState({})  // { (charId|groupId): messages[] }
  const [sceneStates, setSceneStates] = useState({})  // { (charId|groupId): scene-or-group-scene }
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [userProfile, setUserProfile] = useState(EMPTY_USER_PROFILE)
  const [savedProfiles, setSavedProfiles] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [overlay, setOverlay] = useState(null)
  const [streamingId, setStreamingId] = useState(null)  // assistant message id being streamed
  const [streamingCharId, setStreamingCharId] = useState(null)  // which character is voicing the reply
  const [streamingChatId, setStreamingChatId] = useState(null)  // which chat (char or group) it lands in

  // Mirror chatHistory in a ref so long-running async work (the auto-loop)
  // can always read the latest value rather than a stale closure capture.
  const chatHistoryRef = useRef({})
  const [loaded, setLoaded] = useState(false)
  const [mobileScreen, setMobileScreen] = useState('list')  // 'list' | 'conv' — only applied on mobile
  const isMobile = useIsMobile()
  const abortRef = useRef(null)

  // Load all state on mount
  useEffect(() => {
    loadState().then(s => {
      const chars = Array.isArray(s.characters) ? s.characters : []
      setCharacters(chars)

      // chatHistory: support legacy flat array (old format) or new {charId:[...]} dict
      let ch = s.chatHistory
      if (Array.isArray(ch)) {
        // Old format — assume it belongs to the activeCharacterId in settings
        const aId = s.settings?.activeCharacterId
        ch = aId ? { [aId]: convertLegacyMessages(ch) } : {}
      } else if (!ch || typeof ch !== 'object') {
        ch = {}
      }
      setChatHistory(ch)

      // sceneState: support legacy flat dict or new {charId:{...}} dict
      let ss = s.sceneState
      const isLegacyScene = ss && typeof ss === 'object' && ('location' in ss || 'clothing' in ss || 'mood' in ss)
      if (isLegacyScene) {
        const aId = s.settings?.activeCharacterId
        ss = aId ? { [aId]: ss } : {}
      } else if (!ss || typeof ss !== 'object') {
        ss = {}
      }
      setSceneStates(ss)

      const sett = { ...DEFAULT_SETTINGS, ...(s.settings || {}) }
      setSettings(sett)
      setUserProfile({ ...EMPTY_USER_PROFILE, ...(s.userProfile || {}) })
      setSavedProfiles(Array.isArray(s.savedProfiles) ? s.savedProfiles : [])
      setGroups(Array.isArray(s.groups) ? s.groups : [])
      setActiveId(sett.activeCharacterId || chars[0]?.id || null)
      setLoaded(true)
    }).catch(err => {
      console.error('Failed to load state:', err)
      setLoaded(true)
    })
  }, [])

  // Persist active id
  useEffect(() => {
    if (!loaded) return
    if (activeId !== settings.activeCharacterId) {
      const next = { ...settings, activeCharacterId: activeId }
      setSettings(next)
      saveState('settings', next).catch(() => {})
    }
  }, [activeId])

  // Keep the ref in sync with the latest chatHistory state — this lets the
  // auto-loop and any other long-lived async work read the current value
  // without being tripped up by stale closure captures.
  useEffect(() => { chatHistoryRef.current = chatHistory }, [chatHistory])

  // Helpers to persist
  const persistCharacters = useCallback((next) => {
    setCharacters(next)
    saveState('characters', next).catch(() => {})
  }, [])
  const persistChatHistory = useCallback((next) => {
    setChatHistory(next)
    saveState('chatHistory', next).catch(() => {})
  }, [])
  const persistSceneStates = useCallback((next) => {
    setSceneStates(next)
    saveState('sceneState', next).catch(() => {})
  }, [])
  const persistSettings = useCallback((next) => {
    setSettings(next)
    saveState('settings', next).catch(() => {})
  }, [])
  const persistUserProfile = useCallback((next) => {
    setUserProfile(next)
    saveState('userProfile', next).catch(() => {})
  }, [])
  const persistSavedProfiles = useCallback((next) => {
    setSavedProfiles(next)
    saveState('savedProfiles', next).catch(() => {})
  }, [])
  const persistGroups = useCallback((next) => {
    setGroups(next)
    saveState('groups', next).catch(() => {})
  }, [])

  // Build view shapes for both individual characters and groups, mixed.
  // - "typing" propagates to the active group when the streaming character
  //    is one of its members
  // - sorted by most recent activity, regardless of kind
  const charViews = characters.map(c => ({
    ...viewChar(c, chatHistory[c.id], sceneStates[c.id]),
    kind: 'char',
    typing: streamingCharId === c.id && (!streamingChatId || streamingChatId === c.id),
  }))
  const groupViews = groups.map(g => {
    const members = (g.participants || []).map(pid => characters.find(c => c.id === pid)).filter(Boolean)
    return {
      ...viewGroup(g, members, chatHistory[g.id], sceneStates[g.id]),
      typing: streamingChatId === g.id && streamingCharId != null,
    }
  })
  const views = [...charViews, ...groupViews]
    .sort((a, b) => lastActivityTs(b.messages) - lastActivityTs(a.messages))
  const active = views.find(v => v.id === activeId)

  // ─── Send / regenerate / streaming ─────────────────────────────────────
  const runAssistantTurn = useCallback(async (charId, builtMessages, replaceFromId = null) => {
    const char = characters.find(c => c.id === charId)
    if (!char) return
    const scene = sceneStates[charId] || EMPTY_SCENE
    const timeAware = settings.awareOfTime === 'true' || settings.awareOfTime === true
    const sysPrompt = buildNarrativeSystemPrompt(char, sceneStateToString(scene), { timeAware })

    const assistantId = 'a' + Date.now()
    setStreamingId(assistantId)
    setStreamingCharId(charId)
    setStreamingChatId(charId)
    abortRef.current = new AbortController()

    // Insert (or replace) the streaming assistant message — empty text + streaming flag
    // (the bubble shows typing dots until the stream completes, then the full
    // message appears in one render — feels like a real messenger).
    setChatHistory(prev => {
      const cur = prev[charId] || []
      let next
      if (replaceFromId) {
        const idx = cur.findIndex(m => m.id === replaceFromId)
        next = idx >= 0 ? [...cur.slice(0, idx)] : [...cur]
      } else {
        next = [...cur]
      }
      next.push({ id: assistantId, role: 'assistant', text: '', time: nowTime(), streaming: true })
      return { ...prev, [charId]: next }
    })

    let fullText = ''
    let aborted = false
    try {
      await streamNarrative({
        messages: builtMessages,
        settings: settingsToApi(settings, sysPrompt),
        signal: abortRef.current.signal,
        // Buffer the stream locally — don't update the bubble per token.
        onText: (_tok, full) => { fullText = full },
        onScene: (sceneDict) => {
          if (!sceneDict || typeof sceneDict !== 'object') return
          setSceneStates(prev => {
            const cur = { ...EMPTY_SCENE, ...(prev[charId] || {}) }
            for (const k of Object.keys(EMPTY_SCENE)) {
              if (typeof sceneDict[k] === 'string' && sceneDict[k]) cur[k] = sceneDict[k]
            }
            const next = { ...prev, [charId]: cur }
            saveState('sceneState', next).catch(() => {})
            return next
          })
        },
      })
    } catch (e) {
      if (e.name === 'AbortError') {
        aborted = true
      } else {
        console.error('stream failed:', e)
        fullText = (fullText || '') + `\n[Error: ${e.message || e}]`
      }
    }

    // Finalise — or, on user-cancel, remove the partial bubble entirely so
    // it doesn't leave a half-message in the feed.
    const cleanText = (fullText || '').trim()
    let finalMsg
    setChatHistory(prev => {
      const cur = prev[charId] || []
      const idx = cur.findIndex(m => m.id === assistantId)
      if (idx < 0) return prev
      let next
      if (aborted) {
        next = [...cur.slice(0, idx), ...cur.slice(idx + 1)]
      } else {
        next = [...cur]
        next[idx] = { ...next[idx], text: cleanText, streaming: false }
        finalMsg = next[idx]
      }
      const result = { ...prev, [charId]: next }
      saveState('chatHistory', result).catch(() => {})
      return result
    })

    setStreamingId(null)
    setStreamingCharId(null)
    setStreamingChatId(null)
    abortRef.current = null

    // Push a system notification if the user has the tab backgrounded —
    // suppressed when the turn was cancelled (no useful content arrived).
    if (!aborted && fullText && char) {
      notifyIfBackgrounded({
        title: char.name,
        body: stripForPreview(fullText),
        tag: `rp:${char.id}`,
        icon: char.avatarUrl || undefined,
        onClick: () => setActiveId(char.id),
      })
    }
    // Image generation is on-demand only — right-click the message and pick
    // "Generate scene image" to fire it.
  }, [characters, sceneStates, settings])

  // Group-mode parallel: voice character `voiceCharId` inside group `groupId`.
  // System prompt + message-perspective conversion both differ from the
  // individual flow, and scene updates split into shared (location) + per-
  // character (clothing/appearance/objects/mood).
  const runGroupAssistantTurn = useCallback(async (groupId, voiceCharId, opts = {}) => {
    const { replaceFromId = null, sourceMessages = null } = opts
    const group = groups.find(g => g.id === groupId)
    if (!group) return
    const speaker = characters.find(c => c.id === voiceCharId)
    if (!speaker) return
    const members = (group.participants || []).map(pid => characters.find(c => c.id === pid)).filter(Boolean)
    const groupScene = sceneStates[groupId] || EMPTY_GROUP_SCENE
    const timeAware = settings.awareOfTime === 'true' || settings.awareOfTime === true
    const sysPrompt = buildGroupSystemPrompt(speaker, group, members, groupScene, { timeAware })

    // Caller can pass `sourceMessages` explicitly — useful right after a
    // setChatHistory when our closure's chatHistory is still the old value.
    const cur = sourceMessages ?? (chatHistory[groupId] || [])
    const builtMessages = groupApiPayload(
      replaceFromId ? cur.slice(0, cur.findIndex(m => m.id === replaceFromId)) : cur,
      voiceCharId,
      members,
      { prefixTimestamps: timeAware },
    )

    const assistantId = 'a' + Date.now()
    setStreamingId(assistantId)
    setStreamingCharId(voiceCharId)
    setStreamingChatId(groupId)
    abortRef.current = new AbortController()

    setChatHistory(prev => {
      const cur = prev[groupId] || []
      let next
      if (replaceFromId) {
        const idx = cur.findIndex(m => m.id === replaceFromId)
        next = idx >= 0 ? [...cur.slice(0, idx)] : [...cur]
      } else {
        next = [...cur]
      }
      next.push({ id: assistantId, role: 'assistant', from: voiceCharId, text: '', time: nowTime(), streaming: true })
      return { ...prev, [groupId]: next }
    })

    let fullText = ''
    let aborted = false
    try {
      await streamNarrative({
        messages: builtMessages,
        settings: settingsToApi(settings, sysPrompt),
        signal: abortRef.current.signal,
        onText: (_tok, full) => { fullText = full },
        onScene: (sceneDict) => {
          if (!sceneDict || typeof sceneDict !== 'object') return
          setSceneStates(prev => {
            const cur = { ...EMPTY_GROUP_SCENE, ...(prev[groupId] || {}) }
            cur.characters = { ...(cur.characters || {}) }
            // LOCATION is shared (any speaker can move the group)
            if (typeof sceneDict.location === 'string' && sceneDict.location) {
              cur.location = sceneDict.location
            }
            // The other 4 fields are this speaker's own state.
            const mine = { ...(cur.characters[voiceCharId] || EMPTY_PER_CHAR_GROUP_SCENE) }
            for (const k of ['clothing', 'appearance', 'objects', 'mood']) {
              if (typeof sceneDict[k] === 'string' && sceneDict[k]) mine[k] = sceneDict[k]
            }
            cur.characters[voiceCharId] = mine
            const next = { ...prev, [groupId]: cur }
            saveState('sceneState', next).catch(() => {})
            return next
          })
        },
      })
    } catch (e) {
      if (e.name === 'AbortError') {
        aborted = true
      } else {
        console.error('group stream failed:', e)
        fullText = (fullText || '') + `\n[Error: ${e.message || e}]`
      }
    }

    const cleanText = (fullText || '').trim()
    setChatHistory(prev => {
      const cur = prev[groupId] || []
      const idx = cur.findIndex(m => m.id === assistantId)
      if (idx < 0) return prev
      let next
      if (aborted) {
        // Drop the partial bubble entirely on user-cancel — leaves a clean
        // history with no half-finished thoughts.
        next = [...cur.slice(0, idx), ...cur.slice(idx + 1)]
      } else {
        next = [...cur]
        next[idx] = { ...next[idx], text: cleanText, streaming: false }
      }
      const result = { ...prev, [groupId]: next }
      saveState('chatHistory', result).catch(() => {})
      return result
    })

    setStreamingId(null)
    setStreamingCharId(null)
    setStreamingChatId(null)
    abortRef.current = null

    if (!aborted && fullText && speaker) {
      notifyIfBackgrounded({
        title: `${speaker.name} (${group.name})`,
        body: stripForPreview(fullText),
        tag: `rp:${groupId}`,
        icon: speaker.avatarUrl || undefined,
        onClick: () => setActiveId(groupId),
      })
    }
  }, [groups, characters, chatHistory, sceneStates, settings])

  const generateImageForMessage = useCallback(async (charId, msgId, narrative) => {
    const char = characters.find(c => c.id === charId)
    if (!char) return
    const scene = sceneStates[charId] || EMPTY_SCENE

    // Mark message as image-pending
    setChatHistory(prev => {
      const cur = prev[charId] || []
      const idx = cur.findIndex(m => m.id === msgId)
      if (idx < 0) return prev
      const next = [...cur]
      next[idx] = { ...next[idx], image: { status: 'pending' } }
      return { ...prev, [charId]: next }
    })

    try {
      const tagsResult = await extractImageTags({
        narrative,
        characterName: char.name,
        sceneState: scene,
        model: settings.ollamaModel,
        llm: {
          provider: settings.llmProvider,
          endpoint: settings.llmEndpoint,
          apiKey: settings.llmApiKey,
        },
      })
      const llmTags = (tagsResult?.tags) || ''

      const sceneTags = [scene.location, scene.clothing, scene.appearance, scene.objects, scene.mood]
        .filter(Boolean).join(', ')

      const imgResult = await generateImage({
        llmTags,
        sceneTags,
        generalTags: settings.generalTags || '',
        characterTags: char.imageTags || '',
        sdEndpoint: settings.sdEndpoint,
        sd: {
          width: settings.width,
          height: settings.height,
          steps: settings.steps,
          cfgScale: settings.cfgScale,
          samplerName: settings.samplerName,
          negativePrompt: settings.negPrompt,
        },
      })

      if (imgResult?.error) throw new Error(imgResult.error)
      const src = imgResult?.image ? `data:image/png;base64,${imgResult.image}` : ''
      const tagsString = imgResult?.final_prompt || llmTags

      setChatHistory(prev => {
        const cur = prev[charId] || []
        const idx = cur.findIndex(m => m.id === msgId)
        if (idx < 0) return prev
        const next = [...cur]
        next[idx] = { ...next[idx], image: { status: 'ready', src, tags: tagsString } }
        const result = { ...prev, [charId]: next }
        saveState('chatHistory', result).catch(() => {})
        return result
      })
    } catch (e) {
      console.error('image generation failed:', e)
      setChatHistory(prev => {
        const cur = prev[charId] || []
        const idx = cur.findIndex(m => m.id === msgId)
        if (idx < 0) return prev
        const next = [...cur]
        next[idx] = { ...next[idx], image: { status: 'error', error: e.message || 'failed' } }
        const result = { ...prev, [charId]: next }
        saveState('chatHistory', result).catch(() => {})
        return result
      })
    }
  }, [characters, sceneStates, settings])

  // Group-aware: pushes the user message into the group's history and (if
  // a default speaker is supplied) immediately voices their reply.
  const handleGroupSend = useCallback((groupId, text, imageDataUrl, defaultSpeakerId = null) => {
    const group = groups.find(g => g.id === groupId)
    if (!group) return
    const userMsg = { id: 'u' + Date.now(), role: 'user', text, time: nowTime() }
    if (imageDataUrl) userMsg.image = { status: 'ready', src: imageDataUrl }
    const cur = chatHistory[groupId] || []
    const updated = [...cur, userMsg]
    setChatHistory(prev => {
      const next = { ...prev, [groupId]: updated }
      saveState('chatHistory', next).catch(() => {})
      return next
    })
    if (defaultSpeakerId) {
      // Pass the freshly-built message list explicitly — our closure's
      // chatHistory hasn't seen the new user message yet at this microtask.
      setTimeout(() => runGroupAssistantTurn(groupId, defaultSpeakerId, { sourceMessages: updated }), 0)
    }
  }, [groups, chatHistory, runGroupAssistantTurn])

  // Pick the next character to speak in a group, by default the participant
  // who DIDN'T speak most recently. With 2 members this is just the alternation.
  const pickNextGroupSpeaker = useCallback((group, currentMessages) => {
    const members = (group.participants || [])
    if (members.length === 0) return null
    // Find last assistant message; pick the OTHER participant.
    for (let i = currentMessages.length - 1; i >= 0; i--) {
      const m = currentMessages[i]
      if (m.role === 'assistant' && !m.streaming && m.from) {
        const other = members.find(pid => pid !== m.from)
        if (other) return other
        break
      }
    }
    // No prior assistant message — start with the first participant.
    return members[0]
  }, [])

  const handleSend = useCallback((text, imageDataUrl) => {
    if (!activeId) return
    // If the active chat is a group, route to the group flow.
    const group = groups.find(g => g.id === activeId)
    if (group) {
      const next = pickNextGroupSpeaker(group, chatHistory[activeId] || [])
      handleGroupSend(activeId, text, imageDataUrl, next)
      return
    }
    const cur = chatHistory[activeId] || []
    const isFirstUserMessage = !cur.some(m => m.role === 'user' && !m.hidden)

    const newMessages = []
    // On the very first user turn, prepend a hidden OOC context block
    // describing who the user is. Hidden messages aren't rendered in the UI
    // but ARE included in the API payload, so the LLM sees the context once
    // and treats it as scene-setting (per system prompt rules).
    if (isFirstUserMessage) {
      const ooc = buildUserContextOOC(userProfile)
      if (ooc) {
        newMessages.push({
          id: 'ooc' + Date.now(),
          role: 'user',
          text: ooc,
          time: nowTime(),
          hidden: true,
        })
      }
    }
    const userMsg = { id: 'u' + Date.now(), role: 'user', text, time: nowTime() }
    if (imageDataUrl) {
      userMsg.image = { status: 'ready', src: imageDataUrl }
    }
    newMessages.push(userMsg)

    const updated = [...cur, ...newMessages]
    setChatHistory(prev => {
      const result = { ...prev, [activeId]: updated }
      saveState('chatHistory', result).catch(() => {})
      return result
    })
    setTimeout(() => {
      runAssistantTurn(activeId, apiPayload(updated, { prefixTimestamps: settings.awareOfTime === 'true' || settings.awareOfTime === true }))
    }, 0)
  }, [activeId, chatHistory, userProfile, settings.awareOfTime, runAssistantTurn, groups, pickNextGroupSpeaker, handleGroupSend])

  const handleCancelStream = useCallback(() => {
    if (abortRef.current) abortRef.current.abort()
  }, [])

  const handleRegenerate = useCallback((msg) => {
    if (!activeId) return
    const cur = chatHistory[activeId] || []
    const idx = cur.findIndex(m => m.id === msg.id)
    if (idx < 0) return
    const trimmed = cur.slice(0, idx)
    const ts = settings.awareOfTime === 'true' || settings.awareOfTime === true
    runAssistantTurn(activeId, apiPayload(trimmed, { prefixTimestamps: ts }), msg.id)
  }, [activeId, chatHistory, settings.awareOfTime, runAssistantTurn])

  // Re-roll the reply to a user message: drop everything after this user
  // message (including the assistant reply that followed) and regenerate.
  const handleResendUser = useCallback((msg) => {
    if (!activeId || msg.role !== 'user') return
    const cur = chatHistory[activeId] || []
    const idx = cur.findIndex(m => m.id === msg.id)
    if (idx < 0) return
    const trimmed = cur.slice(0, idx + 1)
    setChatHistory(prev => {
      const next = { ...prev, [activeId]: trimmed }
      saveState('chatHistory', next).catch(() => {})
      return next
    })
    const ts = settings.awareOfTime === 'true' || settings.awareOfTime === true
    setTimeout(() => runAssistantTurn(activeId, apiPayload(trimmed, { prefixTimestamps: ts })), 0)
  }, [activeId, chatHistory, settings.awareOfTime, runAssistantTurn])

  const handleContinueFrom = useCallback((msg) => {
    if (!activeId) return
    const cur = chatHistory[activeId] || []
    const idx = cur.findIndex(m => m.id === msg.id)
    if (idx < 0) return
    const next = cur.slice(0, idx + 1)
    persistChatHistory({ ...chatHistory, [activeId]: next })
  }, [activeId, chatHistory, persistChatHistory])

  const handleAttachImage = useCallback((msg) => {
    if (!activeId || msg.role !== 'assistant' || !msg.text) return
    generateImageForMessage(activeId, msg.id, msg.text)
  }, [activeId, generateImageForMessage])

  // ─── Character CRUD ─────────────────────────────────────────────────────
  const handleUpdateChar = useCallback((updatedView) => {
    // Strip the derived/runtime fields before persisting
    const baseFields = ['id', 'name', 'systemPrompt', 'imageTags', 'blurb', 'accent', 'avatarUrl', 'pinned']
    const stripped = {}
    for (const k of baseFields) if (k in updatedView) stripped[k] = updatedView[k]
    const next = characters.map(c => c.id === stripped.id ? { ...c, ...stripped } : c)
    persistCharacters(next)
  }, [characters, persistCharacters])

  // Update messages directly (for delete/edit message ops in Conversation)
  const handleUpdateCharMessages = useCallback((charView) => {
    if (!charView?.id) return
    persistChatHistory({ ...chatHistory, [charView.id]: charView.messages || [] })
  }, [chatHistory, persistChatHistory])

  const handleCreateChar = useCallback((newChar) => {
    const c = {
      id: newChar.id || ('c' + Date.now()),
      name: newChar.name,
      systemPrompt: newChar.systemPrompt || '',
      imageTags: newChar.imageTags || '',
      blurb: newChar.blurb || '',
      accent: newChar.accent,
      avatarUrl: newChar.avatarUrl || null,
    }
    const next = [c, ...characters]
    persistCharacters(next)
    setActiveId(c.id)
    setOverlay(null)
  }, [characters, persistCharacters])

  // Serialise a character to a .llmchar file (JSON) and trigger a download.
  const handleExportChar = useCallback((char) => {
    if (!char) return
    const payload = {
      format: 'llmchar/v1',
      name: char.name || '',
      blurb: char.blurb || '',
      accent: char.accent || '',
      systemPrompt: char.systemPrompt || '',
      imageTags: char.imageTags || '',
      avatarUrl: char.avatarUrl || null,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(char.name || 'character').replace(/[^a-z0-9_-]+/gi, '_').toLowerCase() || 'character'}.llmchar`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [])

  // Read a .llmchar file and create a new character from it.
  const handleImportChar = useCallback(async (file) => {
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data || typeof data !== 'object') throw new Error('File is not a valid JSON object.')
      if (!data.name || typeof data.name !== 'string') throw new Error('Missing required field: name.')
      // Always assign a fresh id — never reuse the source's, even if present,
      // to avoid collisions with existing characters.
      handleCreateChar({
        name: data.name,
        systemPrompt: typeof data.systemPrompt === 'string' ? data.systemPrompt : '',
        imageTags: typeof data.imageTags === 'string' ? data.imageTags : '',
        blurb: typeof data.blurb === 'string' ? data.blurb : '',
        accent: typeof data.accent === 'string' && data.accent ? data.accent : autoAccent('imp' + Date.now()),
        avatarUrl: typeof data.avatarUrl === 'string' && data.avatarUrl.startsWith('data:') ? data.avatarUrl : null,
      })
    } catch (e) {
      alert(`Couldn't import character — ${e.message || e}`)
    }
  }, [handleCreateChar])

  const handleDeleteChar = useCallback((id) => {
    const remaining = characters.filter(c => c.id !== id)
    persistCharacters(remaining)
    const { [id]: _h, ...restHist } = chatHistory; persistChatHistory(restHist)
    const { [id]: _s, ...restScene } = sceneStates; persistSceneStates(restScene)
    setActiveId(remaining[0]?.id || null)
  }, [characters, chatHistory, sceneStates, persistCharacters, persistChatHistory, persistSceneStates])

  const handleClearHistory = useCallback((id) => {
    persistChatHistory({ ...chatHistory, [id]: [] })
    // Reset to whichever scene-shape is appropriate.
    const isGroup = groups.some(g => g.id === id)
    persistSceneStates({ ...sceneStates, [id]: isGroup ? { ...EMPTY_GROUP_SCENE } : { ...EMPTY_SCENE } })
  }, [chatHistory, sceneStates, groups, persistChatHistory, persistSceneStates])

  // ─── Group CRUD ─────────────────────────────────────────────────────────
  const handleCreateGroup = useCallback((draft) => {
    const g = {
      id: 'g-' + Date.now(),
      name: (draft.name || '').trim() || 'New group',
      blurb: draft.blurb || '',
      accent: draft.accent || autoAccent('grp' + Date.now()),
      participants: Array.isArray(draft.participants) ? draft.participants.slice(0, 2) : [],
    }
    persistGroups([g, ...groups])
    setActiveId(g.id)
    setOverlay(null)
    setMobileScreen('conv')
  }, [groups, persistGroups])

  const handleUpdateGroup = useCallback((updated) => {
    const baseFields = ['id', 'name', 'blurb', 'accent', 'participants']
    const stripped = {}
    for (const k of baseFields) if (k in updated) stripped[k] = updated[k]
    const next = groups.map(g => g.id === stripped.id ? { ...g, ...stripped } : g)
    persistGroups(next)
  }, [groups, persistGroups])

  const handleDeleteGroup = useCallback((id) => {
    persistGroups(groups.filter(g => g.id !== id))
    const { [id]: _h, ...restHist } = chatHistory; persistChatHistory(restHist)
    const { [id]: _s, ...restScene } = sceneStates; persistSceneStates(restScene)
    if (activeId === id) {
      const remaining = views.filter(v => v.id !== id)
      setActiveId(remaining[0]?.id || null)
    }
  }, [groups, chatHistory, sceneStates, activeId, views, persistGroups, persistChatHistory, persistSceneStates])

  const handleUpdateGroupScene = useCallback((groupId, scene) => {
    persistSceneStates({ ...sceneStates, [groupId]: scene })
  }, [sceneStates, persistSceneStates])

  // Auto-loop: keep alternating speakers until paused. Ref drives the loop
  // (so changes are seen immediately by the running loop), state mirrors it
  // for the UI to re-render the Auto/Pause toggle.
  const autoLoopRef = useRef({ active: false, groupId: null })
  const [autoLoopActive, setAutoLoopActive] = useState(null)  // active group id, or null
  const startAutoLoop = useCallback(async (groupId) => {
    if (autoLoopRef.current.active) return
    autoLoopRef.current = { active: true, groupId }
    setAutoLoopActive(groupId)
    while (autoLoopRef.current.active && autoLoopRef.current.groupId === groupId) {
      const group = groups.find(g => g.id === groupId)
      if (!group) break
      // Read latest chat history through the ref — the closure version is
      // captured once and never updates, which would make us pick the same
      // speaker every iteration AND send stale context to the LLM.
      const cur = chatHistoryRef.current[groupId] || []
      const speaker = pickNextGroupSpeaker(group, cur)
      if (!speaker) break
      await runGroupAssistantTurn(groupId, speaker, { sourceMessages: cur })
      // One-tick yield so React can flush, ref can update from the new
      // setChatHistory, and a Pause click can interrupt.
      await new Promise(r => setTimeout(r, 50))
    }
    autoLoopRef.current = { active: false, groupId: null }
    setAutoLoopActive(null)
  }, [groups, pickNextGroupSpeaker, runGroupAssistantTurn])

  const stopAutoLoop = useCallback(() => {
    autoLoopRef.current = { active: false, groupId: null }
    setAutoLoopActive(null)
    if (abortRef.current) abortRef.current.abort()
  }, [])

  if (!loaded) {
    return (
      <>
        <style>{SLATE_CSS}</style>
        <div className="sl-root" data-density="cozy" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: 'var(--sl-muted)' }}>Loading…</div>
        </div>
      </>
    )
  }

  return (
    <>
      <style>{SLATE_CSS}</style>
      <div className="sl-root" data-density={settings.density || 'cozy'} data-mobile={isMobile ? 'true' : 'false'}>
        {(!isMobile || mobileScreen === 'list') && (
          <Sidebar
            characters={views}
            activeId={activeId}
            onSelect={(id) => { setActiveId(id); setMobileScreen('conv') }}
            onNewChar={() => setOverlay('newchar')}
            onNewGroup={() => setOverlay('newgroup')}
            onImportChar={handleImportChar}
            onOpenSettings={() => setOverlay('settings')}
            onOpenUserProfile={() => setOverlay('userprofile')}
            userProfile={userProfile}
            isMobile={isMobile}
          />
        )}
        {(!isMobile || mobileScreen === 'conv') && (active ? (
          <Conversation
            char={active}
            userProfile={userProfile}
            settings={settings}
            isStreaming={streamingId !== null}
            onSend={handleSend}
            onCancelStream={handleCancelStream}
            onUpdateChar={handleUpdateCharMessages}
            onOpenProfile={() => setOverlay(active.kind === 'group' ? 'groupinfo' : 'profile')}
            onRegenerate={handleRegenerate}
            onResendUser={handleResendUser}
            onContinueFrom={handleContinueFrom}
            onAttachImage={handleAttachImage}
            onGroupReplyAs={(charId) => runGroupAssistantTurn(active.id, charId)}
            onGroupAutoStart={() => startAutoLoop(active.id)}
            onGroupAutoStop={() => stopAutoLoop()}
            isAutoLoopActive={autoLoopActive === active.id}
            isMobile={isMobile}
            onBack={() => setMobileScreen('list')}
          />
        ) : (
          <EmptyState onNew={() => setOverlay('newchar')} />
        ))}

        {overlay === 'profile' && active && (
          <Profile
            char={active}
            scene={sceneStates[active.id]}
            onClose={() => setOverlay(null)}
            onUpdate={handleUpdateChar}
            onUpdateScene={(s) => persistSceneStates({ ...sceneStates, [active.id]: s })}
            onClearHistory={() => handleClearHistory(active.id)}
            onDelete={() => handleDeleteChar(active.id)}
            onOpenGallery={() => setOverlay('gallery')}
            onExport={() => handleExportChar(active)}
          />
        )}
        {overlay === 'gallery' && active && (
          <Gallery char={active} onClose={() => setOverlay(null)} />
        )}
        {overlay === 'settings' && (
          <Settings settings={settings} onUpdate={persistSettings} onClose={() => setOverlay(null)} />
        )}
        {overlay === 'newchar' && (
          <NewChar onClose={() => setOverlay(null)} onCreate={handleCreateChar} />
        )}
        {overlay === 'userprofile' && (
          <UserProfile
            profile={userProfile}
            savedProfiles={savedProfiles}
            onUpdate={persistUserProfile}
            onUpdateSavedProfiles={persistSavedProfiles}
            onClose={() => setOverlay(null)}
          />
        )}
        {overlay === 'newgroup' && (
          <NewGroup
            characters={characters}
            onCreate={handleCreateGroup}
            onClose={() => setOverlay(null)}
          />
        )}
        {overlay === 'groupinfo' && active && active.kind === 'group' && (
          <GroupInfo
            group={active}
            members={active.members || []}
            scene={sceneStates[active.id]}
            onClose={() => setOverlay(null)}
            onUpdate={handleUpdateGroup}
            onUpdateScene={(s) => handleUpdateGroupScene(active.id, s)}
            onClearHistory={() => handleClearHistory(active.id)}
            onDelete={() => handleDeleteGroup(active.id)}
          />
        )}
      </div>
    </>
  )
}

function EmptyState({ onNew }) {
  return (
    <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--sl-bg)', padding: 40 }}>
      <div style={{ textAlign: 'center', maxWidth: 380 }}>
        <div style={{
          width: 72, height: 72, margin: '0 auto 20px', borderRadius: '50%',
          background: 'var(--sl-accent-soft)', color: 'var(--sl-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{ICONS.user}</div>
        <div style={{ fontSize: 19, fontWeight: 600, marginBottom: 8 }}>No characters yet</div>
        <div style={{ fontSize: 13.5, color: 'var(--sl-muted)', lineHeight: 1.55, marginBottom: 22 }}>
          Create a character to start a roleplay. Everything lives on this machine.
        </div>
        <button className="sl-btn" onClick={onNew}>Create your first character</button>
      </div>
    </main>
  )
}

// Convert old chat-history shape ({role, content, timestamp, ...}) into the
// new shape ({id, role, text, time, ...}) so existing data isn't lost.
function convertLegacyMessages(arr) {
  return arr.map((m, i) => ({
    id: m.id || `legacy-${i}-${Date.now()}`,
    role: m.role,
    text: m.content || m.text || '',
    time: m.timestamp || m.time || '',
    image: m.imageAttachment?.status === 'ready' && m.images?.[0]
      ? { status: 'ready', src: 'data:image/png;base64,' + m.images[0], tags: m.imageAttachment?.prompt || '' }
      : undefined,
  }))
}
