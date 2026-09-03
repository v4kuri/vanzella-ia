import { NextResponse } from "next/server"

const N8N_WEBHOOK_URL =
  "https://automacao.v4kuri.com.br/webhook/a2a18084-89e1-4ca4-b2f8-f611b0a598f2/chat"

export async function POST(request: Request) {
  try {
    const { message, sessionId } = await request.json()

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Mensagem inválida" }, { status: 400 })
    }

    const response = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "sendMessage",
        sessionId: sessionId || crypto.randomUUID(),
        chatInput: message,
      }),
    })

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
