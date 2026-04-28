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

---

## Requirements

| What | Why | Version |
|---|---|---|
| **Python** | Backend (FastAPI + httpx) | 3.10 or newer |
| **Node.js** | Frontend (Vite + React) build | 18 or newer |
| **Ollama** | Local LLM serving | Latest stable |
| **Stable Diffusion Forge** *(optional)* | Scene image generation. Skip if you don't want images. | Latest stable, run with `--api` |

The bundled `run.bat` checks the first two and sets up the venv + npm install + frontend build automatically. Ollama and Forge you install separately (see below).

---

## Quick start (Windows)

1. Install [Python 3.10+](https://www.python.org/downloads/) (tick "Add to PATH").
2. Install [Node 18+](https://nodejs.org/).
3. Install [Ollama](https://ollama.com/download) and pull a model (see [Recommended Ollama models](#recommended-ollama-models)).
4. *(Optional)* Install [Stable Diffusion Forge](https://github.com/lllyasviel/stable-diffusion-webui-forge) and start it with the API enabled (see [Setting up Forge](#setting-up-forge)).
5. Double-click `run.bat`. It will:
   - create the Python venv if missing
   - `pip install -r requirements.txt`
   - `npm install` in `frontend/`
   - `npm run build` in `frontend/`
   - start the FastAPI server on `http://localhost:8000`
6. Open `http://localhost:8000` in your browser.

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

## Setting up Ollama

Pull a model from the terminal:

```bash
ollama pull gemma3:27b
```

Confirm it's reachable on the default port (`11434`) — visit `http://localhost:11434` in a browser, you should see `Ollama is running`. The app's backend talks to this endpoint at the URL hardcoded in `server.py`:

```python
OLLAMA_URL = "http://localhost:11434"
```

If you run Ollama somewhere else, edit that line.

### Recommended Ollama models

| Model | Notes |
|---|---|
| `gemma3:27b` | **Default recommendation.** Strong roleplay output, supports vision (image attachments work), fits on a 24 GB GPU at Q4_K_M. |
| `gemma3:12b` | Lighter alternative, also vision-capable. |
| `gemma3:4b` | Smallest vision-capable Gemma — useful on weaker GPUs. |
| `gemma4:26b` | Mixture-of-experts variant. Faster inference (~4B active params) but no native vision support. |
| `llama3.1:8b` / `llama3.3:70b` | Fine for chat; vision needs a separate vision model. |

**Vision support matters** for the paperclip image-attach feature. If you send a picture to a non-vision model, the model just ignores the image. Switch to a vision-capable model in **Settings → Model** when sending images.

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

3. Confirm Forge is reachable at `http://localhost:7860`. The backend talks to this in `server.py`:

   ```python
   FORGE_URL = "http://localhost:7860"
   ```

### Recommended SD models

The author runs **`novaFurryXL_illustriousV100.safetensors`** for furry/anthro work — it follows booru-style prompting reliably. Any [Illustrious-XL](https://civitai.com/models/795765) or NoobAI checkpoint will work the same way; they all understand the same booru tag schema.

For non-furry photorealistic work, use a SDXL-photoreal checkpoint of your choice. The negative prompt and tag mapping below are tuned for booru-style models — you'll want different defaults for photoreal.

---

## Recommended settings

These are the values the app starts with, tuned for Gemma + Illustrious-XL. Override per-character or globally in the **Settings** overlay.

### LLM sampling (Settings → Model & Advanced → Sampling)

| Field | Value | Why |
|---|---|---|
| Model | `gemma3:27b` | See above |
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

## Notes

- Default Ollama model in code (`frontend/src/App.jsx:DEFAULT_SETTINGS`) is `gemma3:27b`. Change in **Settings → Model** at runtime, or edit the constant.
- Default Forge model is whatever you have in **Settings → Advanced → SD model**. The app calls Forge's options endpoint on change so you don't have to switch checkpoints manually in the Forge UI.
- The frontend talks to the backend via `/api/*`. In dev (`npm run dev` on `:5173`), Vite's proxy routes those to `:8000`. In production (the built `dist/`) the FastAPI server hosts both.
- Mobile viewport (≤ 720 px wide): sidebar and conversation are mutually exclusive screens with a back button, Telegram-style. Long-press a message bubble for the context menu (desktop: right-click).
- Notifications fire only when the page is open in a tab somewhere — closing the tab disables them. For closed-app push you'd need a service worker + Web Push or a foreground-service mobile wrapper, neither of which is included.
