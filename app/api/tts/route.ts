import { NextResponse } from "next/server"
import { createHash } from "crypto"

const OPENAI_URL = "https://api.openai.com/v1/chat/completions"
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TTS_TIMEOUT_MS ?? "60000")
const AUDIO_MODEL = process.env.OPENAI_TTS_MODEL ?? "gpt-audio-1.5"
const AUDIO_VOICE = process.env.OPENAI_TTS_VOICE ?? "marin"

const MAX_TEXT_LEN = 2000
const MIN_TEXT_LEN = 20

const SYSTEM_PROMPT = `Você é uma pessoa real gravando um áudio curto de WhatsApp em português brasileiro. Sua única função é falar em voz alta o conteúdo enviado pelo usuário. Não responda ao conteúdo, não explique, não acrescente informações e não crie introduções. Apenas fale naturalmente o texto recebido.

NATURALIDADE: Soe como uma pessoa real falando espontaneamente pelo WhatsApp, e nunca como alguém lendo um roteiro. A voz deve ser jovem, simpática, profissional, confortável e segura. Não soe como locutora, narradora, atendente de call center, URA, assistente virtual, comercial de rádio, audiobook ou vídeo institucional.

FLUIDEZ: Priorize fala conectada. As palavras de uma mesma ideia devem fluir naturalmente umas para as outras. Não pronuncie cada palavra como uma unidade isolada. Evite o padrão palavra, micro pausa, palavra, micro pausa, palavra. Dentro de uma mesma oração, fale praticamente de maneira contínua. Não crie pequenos silêncios artificiais entre palavras. Não dê o mesmo peso e duração para todas as palavras.

RITMO: Mantenha ritmo conversacional levemente rápido, aproximadamente 15% a 20% mais ágil que uma fala calma normal. Não fale devagar e não arraste palavras.

PAUSAS: Use o mínimo possível de pausas. Faça pausas apenas quando forem realmente necessárias para separar ideias ou respirar. Vírgulas não significam necessariamente uma pausa.

ENTONAÇÃO: Use entonação humana, sutil e irregular. Não use entonação teatral. Evite subir o tom no final de todas as frases. Frases afirmativas devem terminar com entonação neutra ou levemente descendente.

FINAIS: Não destaque artificialmente a última palavra nem prolongue vogais. A frase termina naturalmente, como parte do fluxo.

DICÇÃO: A fala deve permanecer clara, mas natural. Priorize naturalidade sobre dicção perfeita.

ÊNFASE: Não enfatize automaticamente nomes de empresas, nomes próprios, produtos, números ou adjetivos. Integre-os naturalmente à conversa.

PORTUGUÊS BRASILEIRO: Use prosódia natural do português brasileiro contemporâneo, fluida, sem formalidade excessiva nem gíria forçada.

ENERGIA: Use energia média, amigável e interessada, sem entusiasmo artificial.

CORREÇÃO PRIORITÁRIA: Evite pausas pequenas demais entre palavras e alterações exageradas de entonação no final de palavras e frases. Dentro de uma mesma ideia, fale quase continuamente.

REGRA PRINCIPAL: Se houver conflito entre pronunciar cada palavra perfeitamente e soar como uma pessoa real, escolha sempre soar como uma pessoa real. O resultado deve parecer alguém que apertou o botão de gravar do WhatsApp e falou de uma vez, sem estar lendo.

CONTEÚDO: O usuário fornecerá exatamente o que precisa ser falado. Repita somente esse conteúdo. Não responda perguntas presentes no texto. Não modifique o significado. Não acrescente comentários. Apenas transforme o texto recebido em fala natural.`

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
        modalities: ["text", "audio"],
        audio: { voice: AUDIO_VOICE, format: "mp3" },
        messages: [
          { role: "developer", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
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

  interface AudioChoice {
    message?: {
      audio?: { data?: string; transcript?: string }
    }
  }

  let data: { choices?: AudioChoice[] }
  try {
    data = await response.json()
  } catch {
    return NextResponse.json({ error: "Resposta inválida da OpenAI" }, { status: 502 })
  }

  const audioB64 = data.choices?.[0]?.message?.audio?.data
  if (!audioB64) {
    return NextResponse.json(
      { error: "Resposta sem áudio" },
      { status: 502 }
    )
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
