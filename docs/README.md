# Vanzella IA — demo WhatsApp interativo

Preview do assistente **Vane** rodando dentro de uma UI que imita o WhatsApp
real. O agente vive em um fluxo n8n; o front-end interpreta marcadores
especiais no texto de resposta e transforma em elementos ricos (botões,
cards, fotos, enquetes, etc.).

## Rodando local

```bash
pnpm install
pnpm dev
```

Endpoint da API: `POST /api/chat` — recebe `{ message, sessionId }` e devolve
`{ output }`. O proxy encaminha via **GET** pro webhook n8n com `content`,
`type` e `sessionId` na query, e extrai o texto do payload de resposta.

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e ajuste:

| Variável | Descrição | Default |
|----------|-----------|---------|
| `N8N_WEBHOOK_URL` | URL do webhook GET n8n | `.../webhook/vanzella-ia-preview` (fallback hardcoded) |

## Prompt (pipeline de 2 agentes)

O agente vive num pipeline **Conversacional + Revisor** (padrão do playbook do
ecossistema). Cole cada um no nó AI correspondente do n8n como System:

- [`prompt-vane-conversacional.md`](./prompt-vane-conversacional.md) — gera o
  draft da resposta, sem tools.
- [`prompt-vane-revisor.md`](./prompt-vane-revisor.md) — valida, corrige
  (anti-alucinação, marcadores, tom) e emite o texto final que o cliente lê.
- [`testes-vane.md`](./testes-vane.md) — suíte de QA/red-team.

Status: **preview** (testes do cliente). Prompt monolítico anterior:
[`prompt-vane-v2.md`](./prompt-vane-v2.md).

## Marcadores suportados

| Marcador | Renderização |
|----------|-------------|
| `#LINK:label\|url#` | Botão de link |
| `#BOTOES:a\|b\|c#` | Quick-replies (2-4 chips) |
| `#FOTO:url\|legenda#` | Imagem com legenda + lightbox |
| `#LOCAL:nome\|end\|url#` | Card de mapa |
| `#DOC:nome\|tam\|url#` | PDF/anexo |
| `#CONTATO:nome\|tel\|url#` | Card de contato clicável |
| `#ENQUETE:pergunta\|op1\|op2#` | Enquete (com estado de "votado") |
| `#CARD:titulo\|sub\|linhas\|label\|url#` | Passagem "consultada" com botão |
| `#SPLIT#` | Divide resposta em múltiplas bolhas |

Formatação inline WhatsApp: `*negrito*`, `_itálico_`, `~riscado~`, `` `mono` ``.

## Allowlist de URLs

Por segurança, o parser rejeita URLs que não estejam em domínios conhecidos.
Editar em [`../lib/parse-markers.ts`](../lib/parse-markers.ts) no array
`URL_ALLOWLIST`.

Atualmente permitido:

- `*.vanzella-transportes.vercel.app`
- `*.vanzella.com.br`
- `wa.me` / `api.whatsapp.com`
- `google.com/maps`, `maps.google.com`, `maps.app.goo.gl`, `goo.gl/maps`
- `images.unsplash.com`
- `upload.wikimedia.org`, `commons.wikimedia.org`

`tel:+55...` também é aceito em `#CONTATO#`.

## Modo demo (sem n8n)

Em qualquer momento, digite `/demo <tipo>` no chat pra ver um exemplo.

Tipos: `saudacao`, `card`, `foto`, `local`, `doc`, `contato`, `enquete`,
`link`, `formatacao`, `split`, `help`.

## Persistência

- `localStorage['vanzella-ia:chat']` — histórico da conversa
- `localStorage['vanzella-ia:session']` — sessionId estável entre reloads

Pra resetar: `localStorage.clear()` no console.

## Estrutura

```
app/
  page.tsx              # entrada
  api/chat/route.ts     # proxy p/ n8n + demos
components/whatsapp/
  whatsapp-phone.tsx    # frame + splash
  whatsapp-chat.tsx     # estado + envio + SPLIT + typing delay
  message-bubble.tsx    # render de blocos + poll + lightbox
  chat-header.tsx
  chat-input.tsx
  iphone-frame.tsx
  splash-screen.tsx
  verified-badge.tsx
lib/
  parse-markers.ts      # parser dos marcadores + allowlist + SPLIT
  utils.ts
docs/
  prompt-vane-conversacional.md  # agente 1: gera draft (sem tools)
  prompt-vane-revisor.md         # agente 2: valida/corrige/emite final
  testes-vane.md                 # suíte QA/red-team
  prompt-vane-v2.md              # prompt monolítico anterior (legado)
  README.md                      # este arquivo
```
