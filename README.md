# gemma4-rp

A self-hosted, local-first roleplay messenger. React frontend in a Telegram-style dark UI, FastAPI backend that proxies to a local **Ollama** instance for chat and an optional **Stable Diffusion Forge** instance for scene illustrations. Per-character chat history, per-character scene state, user-profile injection on first turn, on-demand scene image generation, native browser notifications, draggable composer, mobile-aware layout.

Runs entirely on your own machine. No cloud calls, no telemetry. The only data that leaves the box is your conversation when it talks to Ollama on `localhost:11434` and Forge on `localhost:7860`.

---

## Features

- Per-character conversations, each with their own messages, scene state, and image gallery
- User profile + saved persona presets — your name, age, description, and toggles get injected into the first message of every new conversation as an `[OOC]` block the model treats as setup info, not speech
- Scene-state tracker — every model reply opens with a hidden `LOCATION/CLOTHING/APPEARANCE/OBJECTS/MOOD` block that's parsed out and used for continuity
- On-demand scene image generation via Stable Diffusion Forge — right-click any assistant reply → "Generate scene image". Booru-style tags get extracted from the narrative, normalised against the canonical e621/Danbooru tag map, and merged with the character's image tags
- Image attachments — paperclip a picture into a user message, sent as multimodal input to Ollama (works with vision-capable models)
- Native browser notifications when a reply lands and the tab isn't focused
- Draggable composer divider (desktop), single-screen layout with back-button navigation (mobile)
- **Local text-to-speech** via Kokoro-82M — every character can have a distinct voice (54 to choose from across English / European / Asian variants), played from a per-bubble button or auto-played as replies arrive. No cloud, runs in-process.

---

## Requirements

| What | Why | Version |
|---|---|---|
| **Python** | Backend (FastAPI + httpx) | 3.10 or newer |
| **Node.js** | Frontend (Vite + React) build | 18 or newer |
| **An LLM backend** | Generates the chat replies. **Pick one**: [Ollama](https://ollama.com/), [llama.cpp](https://github.com/ggerganov/llama.cpp), [OpenRouter](https://openrouter.ai/), or any OpenAI-compatible endpoint (vLLM, LM Studio, text-generation-webui's OpenAI extension, etc.) | — |
| **Stable Diffusion Forge** *(optional)* | Scene image generation. Skip if you don't want images. | Latest stable, run with `--api` |
| **Kokoro-82M ONNX** *(optional, bundled)* | Local text-to-speech. Installs into the venv via `pip` and runs in-process — no extra service to start. Model files (~330 MB) download lazily on first use. | `kokoro-onnx>=0.5` (in requirements.txt) |

The bundled `run.bat` checks Python and Node and sets up the venv + npm install + frontend build automatically. The LLM backend and Forge you install / sign up for separately (see below). Both endpoints are configured in **Settings → Connection** at runtime — nothing is hardcoded.

---

## Quick start (Windows)

1. Install [Python 3.10+](https://www.python.org/downloads/) (tick "Add to PATH").
2. Install [Node 18+](https://nodejs.org/).
3. Set up an LLM backend — see [LLM backends](#llm-backends) for the four supported options. The default config expects [Ollama](https://ollama.com/download) on `http://localhost:11434`.
4. *(Optional)* Install [Stable Diffusion Forge](https://github.com/lllyasviel/stable-diffusion-webui-forge) and start it with the API enabled (see [Setting up Forge](#setting-up-forge)).
5. Double-click `run.bat`. It will:
   - create the Python venv if missing
   - `pip install -r requirements.txt`
   - `npm install` in `frontend/`
   - `npm run build` in `frontend/`
   - start the FastAPI server on `http://localhost:8000`
6. Open `http://localhost:8000` in your browser.
7. Open **Settings → Connection** and pick the LLM provider + endpoint that matches what you've set up.

If you'd rather drive it manually:

```bat
python -m venv venv
venv\Scripts\python.exe -m pip install -r requirements.txt
cd frontend
npm install
npm run build
cd ..
venv\Scripts\python.exe server.py
```

---

## LLM backends

The app speaks two API dialects — Ollama's native `/api/chat` and the OpenAI-compatible `/v1/chat/completions`. That covers basically everything that runs an LLM. Pick one of the four presets in **Settings → Connection → LLM provider**:

| Provider | Default endpoint | API key? | Notes |
|---|---|---|---|
| **Ollama** | `http://localhost:11434` | no | Easiest local option. Ships its own model library — `ollama pull gemma3:27b` and you're done. |
| **llama.cpp** | `http://localhost:8080` | no | Run `llama-server -m model.gguf -c 16384 --port 8080`. Lighter than Ollama, more knobs, BYO GGUF. |
| **OpenRouter** | `https://openrouter.ai/api` | yes (`sk-or-...`) | Cloud. Hundreds of models behind one key. Costs money. Useful when you want models too big to run locally. |
| **Custom (OpenAI-compat)** | (whatever you set) | optional | For LM Studio, vLLM, text-generation-webui's OpenAI extension, etc. Anything that exposes `/v1/chat/completions`. |

The endpoint is editable per-provider, so you can point at LAN addresses, Tailscale hostnames, reverse-proxy URLs, etc. The API key field appears only for providers that need one.

### Setting up Ollama

```bash
ollama pull gemma4:26b
```

Confirm it's reachable: visit `http://localhost:11434` in a browser, you should see `Ollama is running`.

### Setting up llama.cpp

Build llama.cpp following [their README](https://github.com/ggerganov/llama.cpp), download a GGUF (e.g. from Hugging Face), then:

```bash
llama-server -m models/gemma-3-27b.gguf -c 16384 --port 8080 --host 0.0.0.0
```

The OpenAI-compatible chat endpoint lives at `/v1/chat/completions`. The app handles the rest.

### Setting up OpenRouter

Sign up at [openrouter.ai](https://openrouter.ai/), generate an API key (`sk-or-v1-...`), paste it into the **API key** field in Settings. Model names look like `anthropic/claude-sonnet-4-5` or `meta-llama/llama-3.3-70b-instruct` — pick from the model dropdown which is auto-populated from `/v1/models`.

### Recommended models

| Model | Run via | Notes |
|---|---|---|
| `gemma4:26b` | Ollama | **Default recommendation.** Mixture-of-experts (~4B active params per token), so it runs noticeably faster than the dense Gemma 3 27B on the same GPU while producing roleplay output that's comparable or better. Fits on a 24 GB GPU at Q4_K_M with the recommended 16k context. No native vision. |
| `gemma3:27b` | Ollama | Slower than gemma4 but vision-capable — pick this when you actually want to send the model pictures via the paperclip. |
| `gemma3:12b` / `gemma3:4b` | Ollama | Lighter vision-capable Gemmas for weaker GPUs. |
| `llama3.3:70b` | Ollama / OpenRouter | Strong general chat. Needs a serious local box, or use OpenRouter. |
| `meta-llama/llama-3.3-70b-instruct` | OpenRouter | Same model, cloud-hosted, no GPU needed. |
| `mistralai/mistral-large` | OpenRouter | Solid roleplay output via OpenRouter. |

**Vision support matters** for the paperclip image-attach feature. Gemma 3 family is vision-capable; Gemma 4, Llama 3.3, and most non-vision GGUFs are not. Sending a picture to a non-vision model just gets ignored — swap to a vision-capable model in **Settings → Model** when you want pictures understood.

---

## Setting up Forge

Image generation is optional. To enable it:

1. Install Stable Diffusion Forge.
2. Launch with the API exposed and (recommended) accepting LAN connections:

   ```bash
   webui-user.bat
   ```

   With this in `webui-user.bat`:

   ```bat
   set COMMANDLINE_ARGS=--api --listen
   ```

   - `--api` exposes the `/sdapi/v1/*` endpoints the backend calls.
   - `--listen` lets devices on your LAN reach Forge (useful if you want the server hosting Forge to be different from the one running this app).

3. Confirm Forge is reachable at `http://localhost:7860` (default — change in **Settings → Connection → Image generation endpoint** if it's somewhere else).

### Recommended SD models

The author runs **`novaFurryXL_illustriousV100.safetensors`** for furry/anthro work — it follows booru-style prompting reliably. Any [Illustrious-XL](https://civitai.com/models/795765) or NoobAI checkpoint will work the same way; they all understand the same booru tag schema.

For non-furry photorealistic work, use a SDXL-photoreal checkpoint of your choice. The negative prompt and tag mapping below are tuned for booru-style models — you'll want different defaults for photoreal.

---

## Recommended settings

These are the values the app starts with, tuned for Gemma + Illustrious-XL. Override per-character or globally in the **Settings** overlay.

### Connection (Settings → Connection)

| Field | Default | Notes |
|---|---|---|
| LLM provider | `Ollama` | Pick the backend you've set up |
| LLM endpoint | `http://localhost:11434` | Auto-fills the provider's default; edit if yours lives elsewhere |
| API key | *(empty)* | Only shown for providers that need one (OpenRouter, custom) |
| Image gen endpoint | `http://localhost:7860` | Stable Diffusion Forge / A1111 with `--api` |

### LLM sampling (Settings → Model & Advanced → Sampling)

| Field | Value | Why |
|---|---|---|
| Model | `gemma4:26b` | See above |
| Context size | `16384` | Large enough for long roleplays + scene block + system prompt |
| Temperature | `1.0` | Gemma official guidance |
| top_k | `64` | Gemma official guidance |
| top_p | `0.95` | Gemma official guidance |
| min_p | `0.01` | Light tail-cut for coherence |
| repeat_penalty | `1.05` | Soft anti-repetition; higher hurts naturalness |
| repeat_last_n | `1024` | Window for the repetition penalty |
| num_predict | `2048` | Max tokens per reply |
| Show thinking | `off` | Stream the chain-of-thought only if you want to see it |

### Image generation (Settings → Advanced → Image generation)

| Field | Value |
|---|---|
| SD model | `novaFurryXL_illustriousV100.safetensors` (or your preferred Illustrious checkpoint) |
| Sampler | `Euler a` |
| Steps | `40` |
| CFG scale | `4` |
| Width × Height | `1024 × 1024` |

#### General positive tags

```
masterpiece, best quality, amazing quality, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery, detailed background, depth of field, photorealistic details, volumetric lighting,
```

#### Negative prompt

```
multiple tails, modern, recent, old, oldest, graphic, cartoon, text, painting, crayon, graphite, abstract, glitch, deformed, mutated, ugly, disfigured, long body, lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, very displeasing, (worst quality, bad quality:1.2), bad anatomy, sketch, jpeg artifacts, signature, watermark, username, simple background, conjoined, bad ai-generated, white pupils
```

### Display (Settings → Display)

| Field | Value |
|---|---|
| Density | `cozy` (or `compact` if you want tighter rows) |

---

## First run

Once the app loads:

1. **Click the avatar in the top-left of the sidebar** → "Your profile". Set your name, optional avatar, age, description. Toggle whether characters know you, can see you physically, can use your name in dialogue. Save. This gets injected as `[OOC]` context on the first message of every new conversation.
2. **Add a character**: bottom-left "Add new character" button. Two-step wizard — identity (name, blurb, accent, picture) then persona + image tags (the booru/LoRA tags that get appended to every generated scene image for this character).
3. **Settings → Model**: pick the Ollama model you pulled.
4. *(If using Forge)* **Settings → Advanced → Image generation**: pick the SD checkpoint, confirm the recommended values above.
5. Click the character in the sidebar, type, send.

---

## Architecture

```
┌─────────────────┐    HTTP    ┌────────────────┐    HTTP    ┌────────────┐
│  Browser (UI)   │ ────────►  │  FastAPI       │ ────────►  │  Ollama    │
│  Vite + React   │            │  server.py     │            │  :11434    │
│  :8000          │ ◄────SSE── │  :8000         │ ◄────────  │            │
└─────────────────┘            │                │            └────────────┘
                               │                │    HTTP    ┌────────────┐
                               │                │ ────────►  │  SD Forge  │
                               │                │            │  :7860     │
                               │                │ ◄────────  │  (optional)│
                               └────────────────┘            └────────────┘
```

- **Frontend** (`frontend/`): single-page React app, built with Vite. Talks to the backend over `fetch` and Server-Sent Events.
- **Backend** (`server.py`): FastAPI + httpx. Streams Ollama replies, parses the leading scene block out of each response, exposes endpoints for state persistence, image-tag extraction, and image generation.
- **State** (`data/`): plain JSON files — `characters.json`, `chat_history.json`, `scene_state.json`, `settings.json`, `user_profile.json`, `saved_profiles.json`. Per-character data is keyed by character id. The booru tag CSV (`booru_tags.csv`, 5.8 MB) is canonical reference data tracked in git; everything else under `data/` is your personal RP content and is gitignored.

---

## Project layout

```
gemma4-rp/
├── server.py                  # FastAPI backend — chat-narrative SSE, image gen, state I/O
├── requirements.txt           # Python deps
├── run.bat                    # Windows launcher: sets up venv, npm install, build, run
├── Modelfile                  # Optional Ollama Modelfile for building a tuned model
├── data/
│   └── booru_tags.csv         # Canonical booru tag map (tracked)
│   └── *.json                 # Your data — gitignored
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js         # Dev proxy /api → :8000
    └── src/
        ├── App.jsx            # Top-level state, system-prompt builder, OOC injection
        ├── Sidebar.jsx        # Character list, search, user-avatar button
        ├── Conversation.jsx   # Header, message list, composer, lightbox, context menu
        ├── shared.jsx         # Slate CSS, ICONS, Avatar, renderRP
        ├── api.js             # streamNarrative, extractImageTags, generateImage
        ├── notifications.js   # Web Notifications API helpers
        ├── useViewport.js     # Mobile breakpoint hook
        └── overlays/
            ├── Profile.jsx        # Character profile + scene editing
            ├── UserProfile.jsx    # Your profile + saved presets
            ├── Settings.jsx       # Sampling + image gen + advanced
            ├── NewChar.jsx        # 2-step character wizard
            ├── Gallery.jsx        # Per-character generated-image gallery
            └── Overlay.jsx        # Modal wrapper + ConfirmDialog
```

---

## Text-to-speech

Kokoro-82M runs inside the FastAPI process via `kokoro-onnx`. The first time you call any TTS endpoint (or open a Character profile), the model files (~330 MB total: a 310 MB ONNX checkpoint + a 26 MB voice bank) download into `~/.cache/kokoro_onnx/` and are reused thereafter. Subsequent synthesis is fast — typically 1–3 seconds per sentence on CPU.

**Per-character voice**: open a character's profile, scroll to the **Voice** section, and pick from the dropdown. Hit **Preview** to hear them say a sample line before you commit. New characters default to the first voice in the list. The voice catalogue includes American (`af_*`, `am_*`), British (`bf_*`, `bm_*`), and a wider set of European, Hindi, Italian, Japanese, Polish, Brazilian Portuguese, and Mandarin Chinese voices.

**Auto-play**: in **Settings → Behavior**, toggle **"Speak assistant messages aloud"**. When on, every new assistant reply is synthesised and played in sequence. When off, you can still play any individual message manually using the small ▶ button next to its timestamp.

**Swapping engines later**: TTS is abstracted behind a `TTSEngine` interface in `tts_engine.py`. To plug in a different engine (a remote TTS service, ElevenLabs API, a different local model), implement the interface and register the class in `ENGINES`. The frontend dropdown for `Settings → Voice` will pick it up automatically — no JS changes needed.

## Notes

- LLM and image-gen endpoints are runtime settings, not constants. The `DEFAULT_OLLAMA_URL` / `DEFAULT_FORGE_URL` in `server.py` are only used as fallbacks when the request body or query string doesn't supply an explicit URL.
- Default LLM provider is `ollama` at `http://localhost:11434`. Default SD endpoint is `http://localhost:7860`. Change either in **Settings → Connection**.
- Default model name in code (`frontend/src/App.jsx:DEFAULT_SETTINGS.ollamaModel`) is `gemma4:26b`. Override in **Settings → Model**.
- The app calls Forge's options endpoint when you change SD model in settings, so you don't have to switch checkpoints in the Forge UI manually.
- The frontend talks to the backend via `/api/*`. In dev (`npm run dev` on `:5173`), Vite's proxy routes those to `:8000`. In production (the built `dist/`) the FastAPI server hosts both.
- Mobile viewport (≤ 720 px wide): sidebar and conversation are mutually exclusive screens with a back button, Telegram-style. Long-press a message bubble for the context menu (desktop: right-click).
- Notifications fire only when the page is open in a tab somewhere — closing the tab disables them. For closed-app push you'd need a service worker + Web Push or a foreground-service mobile wrapper, neither of which is included.
