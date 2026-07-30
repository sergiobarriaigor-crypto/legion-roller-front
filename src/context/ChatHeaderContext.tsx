"use client";

import { createContext, useContext, type Dispatch, type ReactNode, type SetStateAction } from "react";

type SetChatHeader = Dispatch<SetStateAction<ReactNode | null>>;

const ChatHeaderContext = createContext<SetChatHeader | null>(null);

// El header de una conversación de chat (avatar/nombre/estado) necesita vivir
// FUERA del <main> que hace scroll (igual que AppHeader/BottomNav en
// (app)/layout.tsx) para quedar realmente pegado arriba de la pantalla desde
// el primer render — un position:sticky adentro de ese <main> siempre queda
// atado al padding-top del contenedor. chat/[sala]/page.tsx publica su header
// acá; layout.tsx lo renderiza como hermano de <main>, en el lugar de
// AppHeader.
export function ChatHeaderProvider({
  value,
  children,
}: {
  value: SetChatHeader;
  children: ReactNode;
}) {
  return <ChatHeaderContext.Provider value={value}>{children}</ChatHeaderContext.Provider>;
}

export function useSetChatHeader() {
  const ctx = useContext(ChatHeaderContext);
  if (!ctx) throw new Error("useSetChatHeader debe usarse dentro de ChatHeaderProvider");
  return ctx;
}
