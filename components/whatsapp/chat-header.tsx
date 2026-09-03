"use client"

import { ArrowLeft, Video, Phone, MoreVertical } from "lucide-react"
import { VerifiedBadge } from "./verified-badge"

interface ChatHeaderProps {
  isTyping: boolean
}

export function ChatHeader({ isTyping }: ChatHeaderProps) {
  return (
    <header className="flex items-center gap-2 bg-[#008069] px-2 py-2 text-white">
      <button
        type="button"
        aria-label="Voltar"
        className="flex items-center rounded-full p-1 transition-colors hover:bg-white/10"
      >
        <ArrowLeft className="h-6 w-6" />
      </button>

      <img
        src="/images/vanzella-logo.png"
        alt="Foto de perfil de Vanzella IA"
        className="h-10 w-10 rounded-full object-cover bg-white"
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1 text-base font-medium leading-tight">
          <span className="truncate">Vanzella IA</span>
          <VerifiedBadge className="h-4 w-4 shrink-0" />
        </span>
        <span className="truncate text-xs leading-tight text-white/85">
          {isTyping ? "digitando..." : "online"}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Chamada de vídeo"
          className="rounded-full p-2 transition-colors hover:bg-white/10"
        >
          <Video className="h-6 w-6" />
        </button>
        <button
          type="button"
          aria-label="Chamada de voz"
          className="rounded-full p-2 transition-colors hover:bg-white/10"
        >
          <Phone className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Mais opções"
          className="rounded-full p-2 transition-colors hover:bg-white/10"
        >
          <MoreVertical className="h-6 w-6" />
        </button>
      </div>
    </header>
  )
}
