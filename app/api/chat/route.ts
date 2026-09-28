// Proxy do chat VANZELLA: encaminha texto ao webhook n8n vanzella-ia-preview
// e devolve pra UI o texto puro que a Vane gerou.
import { NextResponse } from "next/server"

export const maxDuration = 300
export const dynamic = "force-dynamic"

const N8N_WEBHOOK_URL =
  process.env.N8N_WEBHOOK_URL ??
  "https://automacao.v4kuri.com.br/webhook/vanzella-ia-preview"

const DEMOS: Record<string, string> = {
  saudacao:
    "Oi! Eu sou a Vane, da Vanzella. Como posso te ajudar?\n\n#BOTOES:Comprar passagem|Fretamento / grupo|Enviar encomenda#",
  card: "Encontrei essa saída pra vocês:\n\n#CARD:Campo Grande → Bonito|Segunda, 15 de setembro|Saída *10:00*;2 passageiros;A partir de *R$ 149* por pessoa|Avançar pro checkout|https://vanzella-transportes.vercel.app/checkout?tripId=cgr-bon-1000-2026-09-15&passageiros=2&morador=0#\n\nSe quiser um horário mais tarde, me fala.",
  foto: "Bonito é uma das joias do MS. Água transparente, cachoeira, gruta.\n\n#FOTO:/destinos/bonito-gruta.jpg|Gruta do Lago Azul, Bonito MS#\n\nVocê tá pensando em ir quando?",
  local:
    "O embarque é aqui:\n\n#LOCAL:Terminal Rodoviário de Campo Grande|Rua Vasconcelos Fernandes, 1200 — Vila Bandeirantes|https://maps.google.com/?q=Terminal+Rodoviario+Campo+Grande#\n\nRecomendo chegar 30 minutos antes.",
  doc: "Segue o roteiro:\n\n#DOC:Roteiro Serra da Bodoquena.pdf|420 KB|https://vanzella-transportes.vercel.app/#",
  contato:
    "Vou te passar o contato da equipe:\n\n#CONTATO:Consultor de Fretamentos|+55 67 9 9999-0000|https://wa.me/5567999990000#",
  enquete:
    "Qual desses horários funciona melhor?\n\n#ENQUETE:Sábado, saída de CG|10:00|12:00|15:00|17:30|22:30#",
  link: "Você consegue rastrear direto por aqui:\n\n#LINK:Rastrear encomenda|https://vanzella-transportes.vercel.app/carga/rastreio#",
  formatacao:
    "Formatação: *negrito*, _itálico_, ~riscado~ e `mono`.\n\nUse com parcimônia.",
  audio:
    "Bonito é um dos destinos mais especiais do Brasil. Aquário natural, gruta com estalactites de milhões de anos, cachoeiras cristalinas em plena Serra da Bodoquena. Vale muito a experiência. A rota de Campo Grande até Bonito leva umas cinco horas, saída de manhã cedo faz sentido pra quem quer aproveitar já a tarde por lá.",
  split:
    "Separei duas opções pra vocês.\n#SPLIT#\n#CARD:Campo Grande → Bonito|Manhã|Saída *10:00*;2 passageiros;A partir de *R$ 149*|Avançar|https://vanzella-transportes.vercel.app/checkout?tripId=cgr-bon-1000-2026-09-15&passageiros=2&morador=0#\n#SPLIT#\n#CARD:Campo Grande → Bonito|Tarde|Saída *15:00*;2 passageiros;A partir de *R$ 149*|Avançar|https://vanzella-transportes.vercel.app/checkout?tripId=cgr-bon-1500-2026-09-15&passageiros=2&morador=0#\n#SPLIT#\nQual funciona melhor?",
}

function demoResponse(input: string): string | null {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed.startsWith("/demo")) return null
  const rest = trimmed.slice(5).trim()
  if (!rest || rest === "help") {
    return `Demos disponíveis: ${Object.keys(DEMOS)
      .map((k) => `/demo ${k}`)
      .join(", ")}`
  }
  return DEMOS[rest] ?? `Demo "${rest}" não existe. Use /demo help.`
}

function pickString(data: unknown): string {
  if (typeof data === "string") return data
  if (Array.isArray(data)) return pickString(data[0])
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>
    const candidates = [
      obj.content,
      obj.output,
      obj.message,
      obj.text,
      obj.reply,
      obj.body,
      obj.answer,
    ]
    for (const c of candidates) {
      const s = pickString(c)
      if (s) return s
    }
  }
  return ""
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const content: string | undefined = body?.message ?? body?.content
    const type: string = body?.type === "audio" ? "audio" : "text"
    const sessionId: string = body?.sessionId || crypto.randomUUID()

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "Mensagem inválida" }, { status: 400 })
    }

    // DEMOS: /demo intercepta antes de bater no webhook.
    const demo = demoResponse(content)
    if (demo !== null) {
      return NextResponse.json({ output: demo })
    }

    const url = new URL(N8N_WEBHOOK_URL)
    url.searchParams.set("content", content)
    url.searchParams.set("type", type)
    url.searchParams.set("sessionId", sessionId)

    // Sem timeout: espera o n8n responder o quanto for necessário.
    // A plataforma (Vercel) tem seu próprio limite via maxDuration.
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    })

    const raw = await response.text()

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Webhook n8n retornou erro",
          upstream_status: response.status,
          upstream_body: raw.slice(0, 2000),
          debug: { method: "GET", target: url.toString() },
        },
        { status: 502 }
      )
    }

    let picked = ""
    try {
      picked = pickString(JSON.parse(raw))
    } catch {
      picked = ""
    }
    if (!picked) picked = raw
    const output = picked.trim()

    return NextResponse.json({
      output,
      upstream_status: response.status,
      upstream_length: raw.length,
      raw_debug:
        raw.length <= 8000
          ? raw
          : `${raw.slice(0, 8000)}...(${raw.length - 8000} chars a mais)`,
      _version: "route.chat.v6-direct",
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: "Erro ao comunicar com o chatbot", detail },
      { status: 500 }
    )
  }
}
