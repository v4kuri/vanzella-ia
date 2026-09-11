import { NextResponse } from "next/server"

const N8N_WEBHOOK_URL =
  process.env.N8N_WEBHOOK_URL ??
  "https://automacao.v4kuri.com.br/webhook/a2a18084-89e1-4ca4-b2f8-f611b0a598f2/chat"

const N8N_TIMEOUT_MS = Number(process.env.N8N_TIMEOUT_MS ?? "25000")

const DEMOS: Record<string, string> = {
  saudacao:
    "Oi! Eu sou a Vane, da Vanzella. Como posso te ajudar?\n\n#BOTOES:Comprar passagem|Fretamento / grupo|Enviar encomenda#",
  card: "Encontrei essa saída pra vocês:\n\n#CARD:Campo Grande → Bonito|Segunda, 15 de setembro|Saída *10:00*;2 passageiros;A partir de *R$ 149* por pessoa|Escolher poltronas|https://vanzella-transportes.vercel.app/passagens/cgr-bon-1000-2026-09-15/poltronas?passageiros=2&morador=0#\n\nSe quiser um horário mais tarde, me fala.",
  foto: "Bonito é uma das joias do MS. Água transparente, cachoeira, gruta.\n\n#FOTO:https://images.unsplash.com/photo-1554260570-e9689a3418b8?w=600|Gruta do Lago Azul — Bonito, MS#\n\nVocê tá pensando em ir quando?",
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
  split:
    "Separei duas opções pra vocês.\n#SPLIT#\n#CARD:Campo Grande → Bonito|Manhã|Saída *10:00*;2 passageiros;A partir de *R$ 149*|Escolher|https://vanzella-transportes.vercel.app/passagens/cgr-bon-1000-2026-09-15/poltronas?passageiros=2&morador=0#\n#SPLIT#\n#CARD:Campo Grande → Bonito|Tarde|Saída *15:00*;2 passageiros;A partir de *R$ 149*|Escolher|https://vanzella-transportes.vercel.app/passagens/cgr-bon-1500-2026-09-15/poltronas?passageiros=2&morador=0#\n#SPLIT#\nQual funciona melhor?",
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

export async function POST(request: Request) {
  try {
    const { message, sessionId } = await request.json()

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Mensagem inválida" }, { status: 400 })
    }

    const demo = demoResponse(message)
    if (demo !== null) {
      return NextResponse.json({ output: demo })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), N8N_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sendMessage",
          sessionId: sessionId || crypto.randomUUID(),
          chatInput: message,
        }),
        signal: controller.signal,
      })
    } catch (err) {
      clearTimeout(timeout)
      const aborted = err instanceof DOMException && err.name === "AbortError"
      return NextResponse.json(
        {
          error: aborted
            ? "Tempo esgotado ao consultar o assistente"
            : "Erro ao comunicar com o chatbot",
        },
        { status: 504 }
      )
    }
    clearTimeout(timeout)

    if (!response.ok) {
      return NextResponse.json(
        { error: "Erro ao comunicar com o chatbot" },
        { status: 502 }
      )
    }

    const data = await response.json()

    return NextResponse.json({ output: data.output ?? "" })
  } catch {
    return NextResponse.json(
      { error: "Erro interno no servidor" },
      { status: 500 }
    )
  }
}
