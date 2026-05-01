// Thin wrappers around the FastAPI backend.

export async function loadState() {
  const r = await fetch('/api/state')
  if (!r.ok) throw new Error('load state failed')
  return r.json()
}

export async function saveState(key, data) {
  const r = await fetch(`/api/state/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!r.ok) throw new Error('save state failed')
}

// Stream a narrative reply. Calls onText(token, full) as text arrives, calls
// onScene(sceneDict) when the server emits the parsed scene block, resolves
// with the full text when done arrives.
export async function streamNarrative({ messages, settings, signal, onText, onScene }) {
  const resp = await fetch('/api/chat-narrative', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, settings }),
    signal,
  })
  if (!resp.ok || !resp.body) throw new Error(`chat failed: ${resp.status}`)

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const parts = buf.split('\n\n')
    buf = parts.pop()
    for (const part of parts) {
      let event = 'message', data = ''
      for (const line of part.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim()
        else if (line.startsWith('data: ')) data = line.slice(6)
      }
      if (event === 'text') {
        try {
          const tok = JSON.parse(data)
          full += tok
          onText && onText(tok, full)
        } catch {}
      } else if (event === 'scene') {
        try {
          // Server double-encodes: data is JSON string of a JSON string of the dict
          const inner = JSON.parse(data)
          const sceneDict = typeof inner === 'string' ? JSON.parse(inner) : inner
          onScene && onScene(sceneDict)
        } catch {}
      } else if (event === 'done') {
        return full
      } else if (event === 'error') {
        try { throw new Error(JSON.parse(data)) } catch { throw new Error(data || 'stream error') }
      }
    }
  }
  return full
}

// Ask the model to extract booru-style image tags for the latest narrative.
// Returns { tags: "comma, separated, string" }
export async function extractImageTags({ narrative, characterName, sceneState, model, llm }) {
  const r = await fetch('/api/extract-image-tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      narrative, characterName, sceneState, model,
      settings: {
        llm_provider: llm?.provider || 'ollama',
        llm_endpoint: llm?.endpoint || 'http://localhost:11434',
        llm_api_key: llm?.apiKey || '',
      },
    }),
  })
  if (!r.ok) throw new Error('extract-image-tags failed')
  return r.json()
}

// Send a built prompt to the SD backend.
// Returns { image: <base64-png>, final_prompt: <string> } or { error }
export async function generateImage({ llmTags, sceneTags, generalTags, characterTags, sdEndpoint, sd }) {
  const r = await fetch('/api/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      llm_tags: llmTags || '',
      scene_tags: sceneTags || '',
      general_tags: generalTags || '',
      character_tags: characterTags || '',
      sd_endpoint: sdEndpoint || 'http://localhost:7860',
      negative_prompt: sd?.negativePrompt || '',
      steps: sd?.steps,
      cfg_scale: sd?.cfgScale,
      sampler_name: sd?.samplerName,
      width: sd?.width,
      height: sd?.height,
    }),
  })
  if (!r.ok) throw new Error('generate-image failed')
  return r.json()
}

// List models from the configured LLM provider. Server dispatches between
// Ollama's /api/tags and OpenAI-compatible /v1/models.
export async function listLLMModels({ provider = 'ollama', endpoint = 'http://localhost:11434', apiKey = '' } = {}) {
  try {
    const params = new URLSearchParams({ provider, endpoint, api_key: apiKey })
    const r = await fetch(`/api/llm-models?${params}`)
    if (!r.ok) return []
    return r.json()
  } catch { return [] }
}

// Strict connectivity test — uses the backend's dedicated test endpoints
// which surface real error messages instead of swallowing them.
export async function testLLMConnection({ provider, endpoint, apiKey }) {
  const r = await fetch('/api/test-llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, endpoint, api_key: apiKey || '' }),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const data = await r.json()
  if (!data.ok) throw new Error(data.error || 'unknown error')
  return data.models
}

export async function testSdConnection({ endpoint }) {
  const r = await fetch('/api/test-sd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const data = await r.json()
  if (!data.ok) throw new Error(data.error || 'unknown error')
  return data.models
}

export async function listSdModels(endpoint = 'http://localhost:7860') {
  try {
    const r = await fetch(`/api/sd-models?endpoint=${encodeURIComponent(endpoint)}`)
    if (!r.ok) return []
    return r.json()
  } catch { return [] }
}

export async function listSdSamplers(endpoint = 'http://localhost:7860') {
  try {
    const r = await fetch(`/api/sd-samplers?endpoint=${encodeURIComponent(endpoint)}`)
    if (!r.ok) return []
    return r.json()
  } catch { return [] }
}

export async function setSdModel(name, endpoint = 'http://localhost:7860') {
  await fetch('/api/sd-model', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: name, sd_endpoint: endpoint }),
  })
}

// ── Text-to-speech ───────────────────────────────────────────────────────

export async function listTtsProviders() {
  try {
    const r = await fetch('/api/tts/providers')
    if (!r.ok) return []
    return r.json()
  } catch { return [] }
}

export async function listTtsVoices(provider = 'kokoro-local') {
  try {
    const r = await fetch(`/api/tts/voices?provider=${encodeURIComponent(provider)}`)
    if (!r.ok) return []
    return r.json()
  } catch { return [] }
}

// Returns a Blob URL the browser can play directly. Caller is responsible
// for revoking it when no longer needed.
export async function synthesizeSpeech({ provider = 'kokoro-local', voice, text }) {
  const r = await fetch('/api/tts/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, voice, text }),
  })
  if (!r.ok) {
    let msg = `HTTP ${r.status}`
    try { const j = await r.json(); if (j?.error) msg = j.error } catch {}
    throw new Error(msg)
  }
  const blob = await r.blob()
  return URL.createObjectURL(blob)
}
