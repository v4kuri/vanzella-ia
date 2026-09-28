import { NextResponse } from "next/server"
import { createHash } from "crypto"

// Endpoint de TTS puro (/v1/audio/speech): apenas vocaliza o texto, sem
// interpretar nem aplicar safety de chat. O modelo de chat com áudio
// (gpt-audio via /chat/completions) RECUSA conteúdo como data de nascimento
// ou CPF, falando a recusa no lugar de ler — por isso não é usado aqui.
const OPENAI_URL = "https://api.openai.com/v1/audio/speech"
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TTS_TIMEOUT_MS ?? "60000")
const AUDIO_MODEL = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts"
const AUDIO_VOICE = process.env.OPENAI_TTS_VOICE ?? "verse"

const MAX_TEXT_LEN = 2000
const MIN_TEXT_LEN = 20

// `instructions` guia só o TOM da fala no gpt-4o-mini-tts. Não é um chat:
// o modelo não responde nem recusa o conteúdo, só o pronuncia.
const TTS_INSTRUCTIONS =
  process.env.OPENAI_TTS_SYSTEM_PROMPT ??
  `Fale como se tivesse acabado de gravar um áudio de WhatsApp pra um amigo, em português brasileiro. Tom leve, jovem, amigável, informal. Fale conectado, fluindo, sem pausas de leitura. Não repita a última palavra com entonação forte. Não soe como locutora, narradora ou URA.`

interface CachedAudio {
  audio: string
  mime: string
  duration: number
  createdAt: number
}

const cache = new Map<string, CachedAudio>()
const MAX_CACHE_ENTRIES = 128
const CACHE_TTL_MS = 60 * 60 * 1000

function pruneCache() {
  const now = Date.now()
  for (const [k, v] of cache) {
    if (now - v.createdAt > CACHE_TTL_MS) cache.delete(k)
  }
  while (cache.size > MAX_CACHE_ENTRIES) {
    const first = cache.keys().next().value
    if (!first) break
    cache.delete(first)
  }
}

function hashText(text: string): string {
  return createHash("sha256")
    .update(`${AUDIO_MODEL}:${AUDIO_VOICE}:${text}`)
    .digest("hex")
    .slice(0, 32)
}

function stripMarkers(raw: string): string {
  return raw
    .replace(/#(LINK|BOTOES|FOTO|LOCAL|DOC|CONTATO|ENQUETE|CARD|SPLIT)[^#]*#/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY não configurada" },
      { status: 501 }
    )
  }

  let body: { text?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const rawText = typeof body.text === "string" ? body.text : ""
  const text = stripMarkers(rawText)

  if (text.length < MIN_TEXT_LEN) {
    return NextResponse.json(
      { error: `Texto muito curto (mínimo ${MIN_TEXT_LEN} caracteres)` },
      { status: 400 }
    )
  }
  if (text.length > MAX_TEXT_LEN) {
    return NextResponse.json(
      { error: `Texto excede ${MAX_TEXT_LEN} caracteres` },
      { status: 400 }
    )
  }

  pruneCache()
  const key = hashText(text)
  const hit = cache.get(key)
  if (hit) {
    return NextResponse.json(hit)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: AUDIO_MODEL,
        voice: AUDIO_VOICE,
        input: text,
        instructions: TTS_INSTRUCTIONS,
        response_format: "mp3",
      }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeout)
    const aborted = err instanceof DOMException && err.name === "AbortError"
    return NextResponse.json(
      { error: aborted ? "Timeout ao gerar áudio" : "Erro ao chamar OpenAI" },
      { status: 504 }
    )
  }
  clearTimeout(timeout)

  if (!response.ok) {
    return NextResponse.json(
      { error: `OpenAI retornou ${response.status}` },
      { status: 502 }
    )
  }

  // /v1/audio/speech devolve o áudio binário direto (não JSON).
  let audioB64: string
  try {
    const buf = Buffer.from(await response.arrayBuffer())
    if (buf.length === 0) {
      return NextResponse.json({ error: "Resposta sem áudio" }, { status: 502 })
    }
    audioB64 = buf.toString("base64")
  } catch {
    return NextResponse.json({ error: "Resposta inválida da OpenAI" }, { status: 502 })
  }

  const approxDurationSec = Math.max(
    1,
    Math.round(text.length / 15)
  )

  const payload: CachedAudio = {
    audio: audioB64,
    mime: "audio/mpeg",
    duration: approxDurationSec,
    createdAt: Date.now(),
  }
  cache.set(key, payload)

  return NextResponse.json(payload)
}
