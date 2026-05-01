import csv
import json
import mimetypes
import os
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

import tts_engine

# Windows registry sometimes maps .js to text/plain, which breaks
# ES module loading in modern browsers. Force the correct types.
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")

FRONTEND_DIST = Path(__file__).parent / "frontend" / "dist"

# ── Server-side data persistence ──
DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

DATA_FILES = {
    "settings": DATA_DIR / "settings.json",
    "characters": DATA_DIR / "characters.json",
    "sceneState": DATA_DIR / "scene_state.json",
    "chatHistory": DATA_DIR / "chat_history.json",
    "userProfile": DATA_DIR / "user_profile.json",
    "savedProfiles": DATA_DIR / "saved_profiles.json",
    "groups": DATA_DIR / "groups.json",
}


def read_data(key: str):
    path = DATA_FILES.get(key)
    if not path or not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def write_data(key: str, data):
    path = DATA_FILES.get(key)
    if not path:
        return
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    os.replace(str(tmp), str(path))


# ── Booru tag normalizer ──
# Loads a CSV of canonical tags + aliases (danbooru_e621_merged format)
# to normalize LLM-generated tags to actual booru tags the SD model knows.
#
# CSV format: tag,category,count,"alias1,alias2,..."
# Category 1 = artist (skip), others = general/character/etc.

BOORU_TAGS_FILE = DATA_DIR / "booru_tags.csv"
_TAG_MAP = {}  # lowercase alias/canonical -> canonical
_TAG_SET = set()  # all canonical tags (for is_canonical check)


def _normalize_key(s: str) -> str:
    """Normalize a tag for lookup: lowercase, spaces->underscores, strip."""
    return s.strip().lower().replace(" ", "_").replace("-", "_")


def load_booru_tags():
    """Load the booru tag CSV into memory. Silent if file missing."""
    global _TAG_MAP, _TAG_SET
    if not BOORU_TAGS_FILE.exists():
        print(f"  {YELLOW}! Booru tag file not found at {BOORU_TAGS_FILE}{RESET}")
        return

    t0 = time.time()
    tag_map = {}
    tag_set = set()
    try:
        with open(BOORU_TAGS_FILE, encoding="utf-8", newline="") as f:
            reader = csv.reader(f)
            for row in reader:
                if len(row) < 3:
                    continue
                canonical = row[0].strip()
                if not canonical:
                    continue
                category = row[1].strip() if len(row) > 1 else ""
                # Skip artist tags (category 1) — not useful for our scenes
                if category == "1":
                    continue

                canonical_key = _normalize_key(canonical)
                tag_set.add(canonical_key)
                # Map canonical to itself
                tag_map[canonical_key] = canonical

                # Map each alias to canonical
                if len(row) >= 4 and row[3]:
                    aliases_str = row[3]
                    # CSV reader handles quoted fields; aliases are comma-separated
                    for alias in aliases_str.split(","):
                        alias_key = _normalize_key(alias)
                        if alias_key and alias_key not in tag_map:
                            tag_map[alias_key] = canonical
    except Exception as e:
        print(f"  {RED}X Failed to load booru tags: {e}{RESET}")
        return

    _TAG_MAP = tag_map
    _TAG_SET = tag_set
    elapsed = (time.time() - t0) * 1000
    print(f"  {GREEN}Loaded {len(tag_set)} canonical booru tags + {len(tag_map) - len(tag_set)} aliases ({elapsed:.0f}ms){RESET}")


def normalize_booru_tag(tag: str):
    """Map a single tag to its canonical form.

    Tries exact match, then plural/singular variations, then partial matches.
    Returns the canonical tag with underscores (as the SD model expects)
    or None if no match found.
    """
    if not tag or not _TAG_MAP:
        return tag  # no tag data loaded — pass through

    key = _normalize_key(tag)

    # Direct hit
    if key in _TAG_MAP:
        return _TAG_MAP[key]

    # Try singular (strip trailing 's')
    if key.endswith("s") and key[:-1] in _TAG_MAP:
        return _TAG_MAP[key[:-1]]

    # Try plural (add 's')
    if (key + "s") in _TAG_MAP:
        return _TAG_MAP[key + "s"]

    # Try ing -> e (smiling -> smile)
    if key.endswith("ing"):
        stem = key[:-3]
        if stem in _TAG_MAP:
            return _TAG_MAP[stem]
        if (stem + "e") in _TAG_MAP:
            return _TAG_MAP[stem + "e"]

    # Try reversing compound word order (tail_wagging -> wagging_tail)
    if "_" in key:
        parts = key.split("_")
        if len(parts) == 2:
            reversed_key = f"{parts[1]}_{parts[0]}"
            if reversed_key in _TAG_MAP:
                return _TAG_MAP[reversed_key]

    return None  # no match


def normalize_booru_tags(tags):
    """Normalize a list of tags. Drops unmatched ones and dedupes.

    Returns (normalized_list, dropped_list) for logging.
    """
    if not _TAG_MAP:
        return list(tags), []

    seen = set()
    result = []
    dropped = []
    for tag in tags:
        if not tag or not tag.strip():
            continue
        normalized = normalize_booru_tag(tag)
        if normalized:
            key = normalized.lower()
            if key not in seen:
                seen.add(key)
                result.append(normalized)
        else:
            # Fall back to the original (with underscores) for unknowns
            # — some SD models understand loose tags
            fallback = _normalize_key(tag)
            if fallback not in seen:
                seen.add(fallback)
                result.append(fallback)
                dropped.append(tag)
    return result, dropped


# ── Logging helpers ──
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
DIM = "\033[2m"
RESET = "\033[0m"


def log_req(method: str, url: str, detail: str = ""):
    ts = time.strftime("%H:%M:%S")
    print(f"{DIM}{ts}{RESET} {CYAN}-> {method} {url}{RESET}{' ' + DIM + detail + RESET if detail else ''}")


def log_res(url: str, status: int, detail: str = "", elapsed_ms: float = 0):
    ts = time.strftime("%H:%M:%S")
    color = GREEN if status < 400 else RED
    elapsed = f" {DIM}({elapsed_ms:.0f}ms){RESET}" if elapsed_ms else ""
    print(f"{DIM}{ts}{RESET} {color}<- {status} {url}{RESET}{elapsed}{' ' + DIM + detail + RESET if detail else ''}")


DEFAULT_OLLAMA_URL = "http://localhost:11434"
DEFAULT_FORGE_URL = "http://localhost:7860"

# Single shared HTTP client — endpoints are passed in per-request now so the
# user can point the app at any Ollama / llama.cpp / OpenRouter / Forge URL.
http_long = httpx.AsyncClient(timeout=300)   # for chat streams
http_short = httpx.AsyncClient(timeout=120)  # for image gen + utility calls


def _llm_config(settings: dict) -> dict:
    """Pull provider config out of the request settings, with sane defaults."""
    return {
        "provider": (settings.get("llm_provider") or "ollama").lower(),
        "endpoint": (settings.get("llm_endpoint") or DEFAULT_OLLAMA_URL).rstrip("/"),
        "api_key": settings.get("llm_api_key") or "",
    }


def _sd_endpoint(body: dict) -> str:
    return (body.get("sd_endpoint") or DEFAULT_FORGE_URL).rstrip("/")


# ── LLM provider helpers ─────────────────────────────────────────────────
# Two backends supported:
#   - 'ollama'           → POST {endpoint}/api/chat with native Ollama body
#   - 'openai-compatible' → POST {endpoint}/v1/chat/completions (covers
#                            llama.cpp, OpenRouter, vLLM, LM Studio, etc.)

def _openai_options(options: dict) -> dict:
    """Translate Ollama-style options into OpenAI-compatible parameters."""
    out = {}
    if options.get("temperature") is not None:
        out["temperature"] = options["temperature"]
    if options.get("top_p") is not None:
        out["top_p"] = options["top_p"]
    # The following are non-standard OpenAI but accepted by llama.cpp /
    # vLLM / OpenRouter — they get silently ignored by strict OpenAI hosts.
    if options.get("top_k") is not None:
        out["top_k"] = options["top_k"]
    if options.get("min_p") is not None:
        out["min_p"] = options["min_p"]
    if options.get("repeat_penalty") is not None:
        out["repetition_penalty"] = options["repeat_penalty"]
    if options.get("num_predict") is not None:
        out["max_tokens"] = options["num_predict"]
    return out


async def _stream_chat_tokens(messages, options, model, llm, think=None):
    """Async generator yielding plain text content tokens from the LLM.

    Hides the provider-specific streaming format from callers. Raises
    httpx.ConnectError or Exception on failure — caller is responsible for
    surfacing those as `event: error` to the client.
    """
    provider = llm["provider"]
    endpoint = llm["endpoint"]

    if provider == "ollama":
        url = f"{endpoint}/api/chat"
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "options": options,
        }
        if think is not None:
            payload["think"] = think
        log_req("POST", url, f"[ollama] model={model} msgs={len(messages)}")
        async with http_long.stream("POST", url, json=payload) as resp:
            raw_buf = b""
            async for raw in resp.aiter_bytes():
                raw_buf += raw
                while b"\n" in raw_buf:
                    line_bytes, raw_buf = raw_buf.split(b"\n", 1)
                    if not line_bytes.strip():
                        continue
                    try:
                        chunk = json.loads(line_bytes)
                    except json.JSONDecodeError:
                        continue
                    content = chunk.get("message", {}).get("content", "")
                    if content:
                        yield content
                    if chunk.get("done", False):
                        return
        return

    # OpenAI-compatible streaming SSE: "data: {...}\n\n", terminator "data: [DONE]"
    url = f"{endpoint}/v1/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        **_openai_options(options),
    }
    headers = {"Content-Type": "application/json"}
    if llm.get("api_key"):
        headers["Authorization"] = f"Bearer {llm['api_key']}"
    log_req("POST", url, f"[openai-compatible] model={model} msgs={len(messages)}")
    async with http_long.stream("POST", url, json=payload, headers=headers) as resp:
        text_buf = ""
        async for chunk in resp.aiter_text():
            text_buf += chunk
            while "\n\n" in text_buf:
                event, text_buf = text_buf.split("\n\n", 1)
                for line in event.split("\n"):
                    line = line.strip()
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        return
                    try:
                        obj = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    delta = (obj.get("choices") or [{}])[0].get("delta") or {}
                    content = delta.get("content") or ""
                    if content:
                        yield content


async def _complete_chat(messages, options, model, llm) -> str:
    """Non-streaming chat completion — returns the assistant's full content string."""
    provider = llm["provider"]
    endpoint = llm["endpoint"]

    if provider == "ollama":
        url = f"{endpoint}/api/chat"
        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
            "think": False,
            "options": options,
        }
        log_req("POST", url, f"[ollama:complete] model={model}")
        resp = await http_long.post(url, json=payload)
        data = resp.json()
        return data.get("message", {}).get("content", "")

    url = f"{endpoint}/v1/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        **_openai_options(options),
    }
    headers = {"Content-Type": "application/json"}
    if llm.get("api_key"):
        headers["Authorization"] = f"Bearer {llm['api_key']}"
    log_req("POST", url, f"[openai-compatible:complete] model={model}")
    resp = await http_long.post(url, json=payload, headers=headers)
    data = resp.json()
    return ((data.get("choices") or [{}])[0].get("message") or {}).get("content", "")


@asynccontextmanager
async def lifespan(app):
    load_booru_tags()
    yield
    # Force-close clients with a short timeout so shutdown doesn't hang
    # on in-flight streaming requests
    import asyncio
    try:
        await asyncio.wait_for(http_long.aclose(), timeout=2.0)
    except (asyncio.TimeoutError, Exception):
        pass
    try:
        await asyncio.wait_for(http_short.aclose(), timeout=2.0)
    except (asyncio.TimeoutError, Exception):
        pass


app = FastAPI(lifespan=lifespan)


@app.get("/api/state")
async def get_all_state():
    """Load all persisted state at once."""
    return {
        "settings": read_data("settings"),
        "characters": read_data("characters"),
        "sceneState": read_data("sceneState"),
        "chatHistory": read_data("chatHistory"),
        "userProfile": read_data("userProfile"),
        "savedProfiles": read_data("savedProfiles"),
        "groups": read_data("groups"),
    }


@app.put("/api/state/{key}")
async def put_state(key: str, request: Request):
    """Save a single state key."""
    if key not in DATA_FILES:
        return JSONResponse(status_code=400, content={"error": f"Unknown key: {key}"})
    body = await request.json()
    write_data(key, body)
    return {"ok": True}


@app.get("/")
async def index():
    return FileResponse(FRONTEND_DIST / "index.html")




SCENE_END_MARKER = "[/SCENE]"


def parse_scene_block(text: str) -> dict:
    """Parse a LOCATION/CLOTHING/APPEARANCE/OBJECTS/MOOD scene block.
    Returns a dict with the 5 fields (lowercase keys), missing keys = None.
    """
    field_map = {
        "LOCATION": "location",
        "CLOTHING": "clothing",
        "APPEARANCE": "appearance",
        "OBJECTS": "objects",
        "MOOD": "mood",
    }
    out = {}
    for line in text.splitlines():
        m = re.match(r'^\s*\*?\*?(LOCATION|CLOTHING|APPEARANCE|OBJECTS|MOOD)\*?\*?\s*:\s*(.+?)\s*$', line, re.IGNORECASE)
        if m:
            key = field_map.get(m.group(1).upper())
            if key:
                out[key] = m.group(2).strip()
    return out


async def stream_narrative_only(messages: list, options: dict, model: str, llm: dict, think=None):
    """Stream from the configured LLM, parsing the leading scene block out.

    Expected response shape from the LLM:
        LOCATION: ...
        CLOTHING: ...
        APPEARANCE: ...
        OBJECTS: ...
        MOOD: ...
        [/SCENE]
        <narrative text starts here>

    Buffer content until the [/SCENE] marker, emit a `scene` SSE event with
    the parsed dict, then stream everything after as `text` events.
    """
    accum = ""
    scene_emitted = False
    narrative_started = False  # have we emitted any non-whitespace text yet?
    token_count = 0
    t0 = time.time()

    try:
        async for content in _stream_chat_tokens(messages, options, model, llm, think=think):
            token_count += 1
            accum += content

            if not scene_emitted:
                marker_idx = accum.find(SCENE_END_MARKER)
                if marker_idx >= 0:
                    scene_block = accum[:marker_idx]
                    scene_dict = parse_scene_block(scene_block)
                    if scene_dict:
                        print(f"  {GREEN}* Scene parsed:{RESET} {list(scene_dict.keys())}")
                    else:
                        print(f"  {YELLOW}! Scene marker found but no fields parsed{RESET}")
                    yield f"event: scene\ndata: {json.dumps(json.dumps(scene_dict))}\n\n"
                    scene_emitted = True

                    narrative_start = marker_idx + len(SCENE_END_MARKER)
                    tail = accum[narrative_start:].lstrip()  # strip ALL leading whitespace, not just \r\n
                    if tail:
                        yield f"event: text\ndata: {json.dumps(tail)}\n\n"
                        narrative_started = True
                # else: keep buffering — no emit until marker arrives
            else:
                # While we haven't yet emitted any real content, swallow purely
                # whitespace tokens and lstrip the first non-whitespace one.
                # Stops blank lines / leading spaces leaking into the chat bubble.
                if not narrative_started:
                    stripped = content.lstrip()
                    if stripped:
                        yield f"event: text\ndata: {json.dumps(stripped)}\n\n"
                        narrative_started = True
                    # else: pure whitespace before any real text — drop it
                else:
                    yield f"event: text\ndata: {json.dumps(content)}\n\n"

        # Stream finished. If [/SCENE] never appeared, fall back to emitting
        # everything as plain text with an empty scene dict — still trimmed.
        if not scene_emitted:
            print(f"  {YELLOW}! No [/SCENE] marker found, emitting raw text{RESET}")
            yield f"event: scene\ndata: {json.dumps(json.dumps({}))}\n\n"
            yield f"event: text\ndata: {json.dumps(accum.lstrip())}\n\n"
        elapsed = (time.time() - t0) * 1000
        log_res(f"{llm['endpoint']}", 200, f"[narrative] tokens={token_count}", elapsed)
        yield f"event: done\ndata: {{}}\n\n"
    except httpx.ConnectError:
        endpoint = llm["endpoint"]
        print(f"  {RED}X Cannot connect to LLM at {endpoint}{RESET}")
        yield f"event: error\ndata: {json.dumps(f'Cannot connect to LLM at {endpoint}. Is the service running?')}\n\n"
    except Exception as e:
        print(f"  {RED}X LLM error: {e}{RESET}")
        yield f"event: error\ndata: {json.dumps(str(e))}\n\n"


@app.post("/api/chat-narrative")
async def chat_narrative(request: Request):
    """Pure narrative streaming — no tags, no scene state, no format constraint."""
    body = await request.json()
    messages = body.get("messages", [])
    settings = body.get("settings", {})
    model = settings.get("model", "gemma4:26b")
    llm = _llm_config(settings)
    last_msg = messages[-1]["content"][:60] if messages else ""
    print(f"\n{'='*60}")
    log_req("POST", "/api/chat-narrative", f'provider={llm["provider"]} model={model} last_msg="{last_msg}..."')
    if messages and messages[-1]["content"].startswith("[NARRATOR"):
        print(f"  {YELLOW}* God-mode command detected{RESET}")

    options = {}
    option_keys = [
        "temperature", "top_k", "top_p", "min_p",
        "repeat_penalty", "repeat_last_n", "num_ctx", "num_predict"
    ]
    for key in option_keys:
        if key in settings and settings[key] is not None:
            options[key] = settings[key]

    system_prompt = settings.get("system_prompt", "")
    if system_prompt:
        messages = [{"role": "system", "content": system_prompt}] + messages

    think = settings.get("think")  # may be None, True, or False

    return StreamingResponse(
        stream_narrative_only(messages, options, model, llm, think=think),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


# Schema for the on-demand image extraction call
IMAGE_EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "subject_count": {"type": "string"},
        "hair": {"type": "string"},
        "eyes": {"type": "string"},
        "body": {"type": "string"},
        "clothing": {"type": "string"},
        "clothing_state": {"type": "string"},
        "expression": {"type": "string"},
        "pose": {"type": "string"},
        "action": {"type": "string"},
        "framing": {"type": "string"},
        "background": {"type": "string"},
        "lighting": {"type": "string"},
        "style": {"type": "string"},
        "scene_location": {"type": "string"},
        "scene_clothing": {"type": "string"},
        "scene_appearance": {"type": "string"},
        "scene_objects": {"type": "string"},
        "scene_mood": {"type": "string"}
    },
    "required": [
        "subject_count", "hair", "eyes", "body", "clothing",
        "expression", "pose", "framing", "background", "lighting",
        "scene_location", "scene_clothing", "scene_appearance", "scene_mood"
    ]
}



@app.post("/api/extract-image-tags")
async def extract_image_tags(request: Request):
    """On-demand call: ask the LLM for plain comma-separated booru tags.

    Scene state is passed in as context (already maintained separately
    via /api/extract-scene). The LLM only needs to produce tags — no JSON,
    no structured output, no thinking required. Fast.
    """
    body = await request.json()
    narrative = body.get("narrative", "")
    character_name = body.get("characterName", "the character")
    model = body.get("model", "gemma4:26b")
    current_scene = body.get("sceneState", {})
    # The full settings object is passed through so we can pick up
    # llm_provider / llm_endpoint / llm_api_key for non-Ollama backends.
    llm = _llm_config(body.get("settings") or body)

    log_req("POST", "/api/extract-image-tags", f"provider={llm['provider']} model={model} narrative_len={len(narrative)}")
    t0 = time.time()

    extract_system = f"""You are an image tag generator. Given a roleplay narrative from {character_name} and the current scene state, output a single line of booru-style image tags describing what is visible in the scene RIGHT NOW.

Current scene state (use this for context — location, clothing, appearance, etc.):
{json.dumps(current_scene)}

Output rules:
- Return ONLY a single line of comma-separated booru tags
- No explanation, no preamble, no quotes, no JSON
- Use short tags (1-3 words each), lowercase, with spaces (not underscores)
- Cover: subject_count (1girl/1boy/solo), hair, eyes, body, clothing, expression, pose, action, framing/camera angle, background/setting, lighting, style
- Do NOT include the character's name — that is added separately
- Be SPECIFIC to what is happening in THIS narrative moment

Example output:
1girl, solo, long blue hair, amber eyes, slim, denim jacket, white crop top, leaning forward, bright smile, looking at viewer, upper body, from front, indoors, warm lighting, masterpiece"""

    extract_user = f"Narrative:\n{narrative}\n\nGenerate the booru tags now (one line, comma-separated, no other text):"

    try:
        content = await _complete_chat(
            messages=[
                {"role": "system", "content": extract_system},
                {"role": "user", "content": extract_user},
            ],
            options={"temperature": 0.4, "num_predict": 400},
            model=model,
            llm=llm,
        )
        elapsed = (time.time() - t0) * 1000

        # Clean the output: strip markdown, take only the first non-empty line of tags
        cleaned = content.strip()
        # Strip Harmony/GPT-OSS channel markers — some models leak their
        # internal thinking format even when think=False. We discard everything
        # before the final-channel marker if one is present, then drop any
        # remaining <|...|> tokens entirely.
        final_idx = cleaned.rfind("<|channel|>final<|channel|>")
        if final_idx == -1:
            final_idx = cleaned.rfind("<|channel|>final<|message|>")
        if final_idx >= 0:
            # advance past the marker to keep only the final-channel content
            after = re.search(r"<\|channel\|>final<\|[^|]+\|>", cleaned[final_idx:])
            if after:
                cleaned = cleaned[final_idx + after.end():]
        cleaned = re.sub(r"<\|[^|]+\|>", "", cleaned)
        # Drop common chat-template wrappers
        cleaned = re.sub(r"<(?:think|thinking|reasoning)>.*?</(?:think|thinking|reasoning)>", "", cleaned, flags=re.DOTALL | re.IGNORECASE)
        # Remove any markdown code fences
        cleaned = re.sub(r'^```[a-z]*\s*', '', cleaned)
        cleaned = re.sub(r'\s*```\s*$', '', cleaned)
        # Remove common preamble phrases
        cleaned = re.sub(r'^(here are the tags|tags:|output:|response:)\s*[:\-]?\s*', '', cleaned.strip(), flags=re.IGNORECASE)

        # Take everything up to the first double newline (in case the model adds extra text)
        if "\n\n" in cleaned:
            cleaned = cleaned.split("\n\n", 1)[0]
        # If multiple lines remain, join them with commas
        cleaned = " ".join(cleaned.split("\n"))

        # Split into individual tags and normalize through booru tag map
        raw_tags = [t.strip() for t in cleaned.split(",") if t.strip()]
        normalized, dropped = normalize_booru_tags(raw_tags)
        tags_str = ", ".join(normalized)

        log_res("/api/extract-image-tags", 200, f"tags={len(normalized)} dropped={len(dropped)} raw_chars={len(content)}", elapsed)
        return {"tags": tags_str}
    except httpx.ConnectError:
        print(f"  {RED}X Cannot connect to LLM at {llm['endpoint']} for extraction{RESET}")
        return {"error": f"Cannot connect to LLM at {llm['endpoint']}", "tags": ""}
    except Exception as e:
        print(f"  {RED}X Extract error: {e}{RESET}")
        return {"error": str(e), "tags": ""}


@app.post("/api/generate-image")
async def generate_image(request: Request):
    body = await request.json()

    # New flow: client can send tag components separately, server normalizes
    # the LLM/scene tags via booru tag map, then composes the final prompt.
    # Old flow: client sends `prompt` directly (already-built string).
    llm_tags = body.get("llm_tags", "")
    scene_tags = body.get("scene_tags", "")
    general_tags = body.get("general_tags", "")
    character_tags = body.get("character_tags", "")
    legacy_prompt = body.get("prompt", "")

    if llm_tags or scene_tags or general_tags or character_tags:
        # Normalize the LLM + scene tags via the booru tag map.
        # Split each tag string on commas, normalize each tag, then dedupe.
        to_normalize = []
        for src in (llm_tags, scene_tags, general_tags):
            if src:
                for t in src.split(","):
                    t = t.strip()
                    if t:
                        to_normalize.append(t)
        normalized, dropped = normalize_booru_tags(to_normalize)
        if dropped:
            print(f"  {YELLOW}! Unknown tags kept as fallback:{RESET} {dropped[:5]}")

        # Compose final prompt: normalized tags first, then character tags verbatim
        # (character tags often contain LoRAs and weighted syntax that must not be touched)
        prompt_parts = [", ".join(normalized)] if normalized else []
        if character_tags.strip():
            prompt_parts.append(character_tags.strip())
        final_prompt = ", ".join(p for p in prompt_parts if p)
    else:
        # Legacy path — use the prompt as-is
        final_prompt = legacy_prompt

    # Replace underscores with spaces, but preserve content inside <...> blocks
    # (LoRAs like <lora:PorshaIL:1> must keep their underscores intact).
    # Also collapse multiple spaces into one and tidy up comma spacing.
    def _cleanup_prompt(text: str) -> str:
        parts = re.split(r'(<[^>]*>)', text)
        for i, part in enumerate(parts):
            if not part.startswith("<"):
                # Underscores → spaces
                p = part.replace("_", " ")
                # Collapse runs of whitespace (spaces, tabs, newlines) into single spaces
                p = re.sub(r'\s+', ' ', p)
                # Tidy comma spacing: " ," → "," and ",," → "," (no empty tags)
                p = re.sub(r'\s*,\s*', ', ', p)
                p = re.sub(r'(,\s*)+', ', ', p)
                parts[i] = p
        result = "".join(parts)
        # Trim leading/trailing comma+whitespace from the whole thing
        result = result.strip().strip(",").strip()
        return result

    final_prompt = _cleanup_prompt(final_prompt)

    sd_endpoint = _sd_endpoint(body)
    payload = {
        "prompt": final_prompt,
        "negative_prompt": body.get("negative_prompt", ""),
        "steps": body.get("steps", 20),
        "cfg_scale": body.get("cfg_scale", 7),
        "sampler_name": body.get("sampler_name", "Euler"),
        "width": body.get("width", 512),
        "height": body.get("height", 768),
    }
    url = f"{sd_endpoint}/sdapi/v1/txt2img"
    log_req("POST", url, f'steps={payload["steps"]} {payload["width"]}x{payload["height"]}')
    print(f"  {DIM}prompt ({len(final_prompt)}c):{RESET} {final_prompt}")
    t0 = time.time()
    try:
        resp = await http_short.post(url, json=payload)
        data = resp.json()
        elapsed = (time.time() - t0) * 1000
        has_image = bool(data.get("images"))
        log_res(url, resp.status_code, f"has_image={has_image}", elapsed)
        return {"image": data.get("images", [None])[0], "final_prompt": final_prompt}
    except httpx.ConnectError:
        print(f"  {RED}X Cannot connect to SD endpoint at {sd_endpoint}{RESET}")
        return {"error": f"Cannot connect to SD endpoint at {sd_endpoint}. Is it running with --api?"}
    except Exception as e:
        print(f"  {RED}X SD error: {e}{RESET}")
        return {"error": str(e)}


@app.get("/api/sd-models")
async def sd_models(endpoint: str = ""):
    sd = (endpoint or DEFAULT_FORGE_URL).rstrip("/")
    url = f"{sd}/sdapi/v1/sd-models"
    log_req("GET", url)
    try:
        resp = await http_short.get(url)
        data = resp.json()
        log_res(url, resp.status_code, f"count={len(data)}")
        return data
    except Exception as e:
        print(f"  {RED}X {e}{RESET}")
        return []


@app.get("/api/sd-samplers")
async def sd_samplers(endpoint: str = ""):
    sd = (endpoint or DEFAULT_FORGE_URL).rstrip("/")
    url = f"{sd}/sdapi/v1/samplers"
    log_req("GET", url)
    try:
        resp = await http_short.get(url)
        data = resp.json()
        log_res(url, resp.status_code, f"count={len(data)}")
        return data
    except Exception as e:
        print(f"  {RED}X {e}{RESET}")
        return []


@app.post("/api/sd-model")
async def set_sd_model(request: Request):
    body = await request.json()
    model_name = body.get("model", "")
    sd = _sd_endpoint(body)
    url = f"{sd}/sdapi/v1/options"
    log_req("POST", url, f"model={model_name}")
    try:
        resp = await http_short.post(url, json={"sd_model_checkpoint": model_name})
        log_res(url, resp.status_code)
        return {"ok": True}
    except Exception as e:
        print(f"  {RED}X {e}{RESET}")
        return {"error": str(e)}


@app.get("/api/llm-models")
async def llm_models(provider: str = "ollama", endpoint: str = "", api_key: str = ""):
    """List available models from the configured LLM provider.

    Ollama uses /api/tags; OpenAI-compatible endpoints (llama.cpp,
    OpenRouter, vLLM, LM Studio, etc.) use /v1/models.
    """
    provider = (provider or "ollama").lower()
    base = (endpoint or DEFAULT_OLLAMA_URL).rstrip("/")

    try:
        if provider == "ollama":
            url = f"{base}/api/tags"
            log_req("GET", url)
            resp = await http_short.get(url)
            data = resp.json()
            models = [m["name"] for m in data.get("models", [])]
            log_res(url, resp.status_code, f"models={len(models)}")
            return models
        # OpenAI-compatible
        url = f"{base}/v1/models"
        headers = {}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        log_req("GET", url, "[openai-compatible]")
        resp = await http_short.get(url, headers=headers)
        data = resp.json()
        models = [m.get("id") for m in (data.get("data") or []) if m.get("id")]
        log_res(url, resp.status_code, f"models={len(models)}")
        return models
    except Exception as e:
        print(f"  {RED}X {e}{RESET}")
        return []


# Back-compat alias for older clients that still call /api/ollama-models.
@app.get("/api/ollama-models")
async def ollama_models_alias():
    return await llm_models(provider="ollama", endpoint=DEFAULT_OLLAMA_URL)


# ── Text-to-speech ────────────────────────────────────────────────────────

@app.get("/api/tts/providers")
async def tts_providers():
    """List engine implementations the user can choose between in Settings."""
    return tts_engine.list_providers()


@app.get("/api/tts/voices")
async def tts_voices(provider: str = "kokoro-local"):
    """Return the voice catalogue offered by the chosen engine."""
    try:
        engine = tts_engine.get_engine(provider)
        return await engine.list_voices()
    except Exception as e:
        print(f"  {RED}X TTS voice list failed: {e}{RESET}")
        return []


@app.post("/api/tts/synthesize")
async def tts_synthesize(request: Request):
    """POST {provider, voice, text} → audio/wav bytes."""
    body = await request.json()
    provider = body.get("provider") or "kokoro-local"
    voice = body.get("voice") or ""
    text = (body.get("text") or "").strip()
    if not text:
        return JSONResponse(status_code=400, content={"error": "text is required"})

    log_req("POST", "/api/tts/synthesize", f"provider={provider} voice={voice} chars={len(text)}")
    t0 = time.time()
    try:
        engine = tts_engine.get_engine(provider)
        audio = await engine.synthesize(text, voice)
        elapsed = (time.time() - t0) * 1000
        log_res("/api/tts/synthesize", 200, f"bytes={len(audio)}", elapsed)
        return Response(content=audio, media_type="audio/wav")
    except Exception as e:
        print(f"  {RED}X TTS synth failed: {e}{RESET}")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/test-llm")
async def test_llm(request: Request):
    """Strict connectivity test for the configured LLM provider — surfaces
    real error messages (the regular /api/llm-models swallows them so the
    dropdown can stay populated)."""
    body = await request.json()
    provider = (body.get("provider") or "ollama").lower()
    endpoint = (body.get("endpoint") or DEFAULT_OLLAMA_URL).rstrip("/")
    api_key = body.get("api_key") or ""
    try:
        if provider == "ollama":
            url = f"{endpoint}/api/tags"
            resp = await http_short.get(url)
            resp.raise_for_status()
            count = len(resp.json().get("models", []))
        else:
            url = f"{endpoint}/v1/models"
            headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
            resp = await http_short.get(url, headers=headers)
            resp.raise_for_status()
            count = len(resp.json().get("data", []))
        return {"ok": True, "models": count, "endpoint": endpoint}
    except httpx.ConnectError:
        return {"ok": False, "error": f"Could not connect to {endpoint}"}
    except httpx.HTTPStatusError as e:
        msg = f"HTTP {e.response.status_code}"
        try:
            err = e.response.json()
            if isinstance(err, dict) and err.get("error"):
                msg += f": {err['error'].get('message') or err['error']}"
        except Exception:
            pass
        return {"ok": False, "error": msg}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/api/test-sd")
async def test_sd(request: Request):
    """Strict connectivity test for the SD endpoint."""
    body = await request.json()
    endpoint = (body.get("endpoint") or DEFAULT_FORGE_URL).rstrip("/")
    try:
        resp = await http_short.get(f"{endpoint}/sdapi/v1/sd-models")
        resp.raise_for_status()
        data = resp.json()
        count = len(data) if isinstance(data, list) else 0
        return {"ok": True, "models": count, "endpoint": endpoint}
    except httpx.ConnectError:
        return {"ok": False, "error": f"Could not connect to {endpoint}"}
    except httpx.HTTPStatusError as e:
        return {"ok": False, "error": f"HTTP {e.response.status_code}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        timeout_graceful_shutdown=3,  # don't hang waiting for streaming requests
    )
