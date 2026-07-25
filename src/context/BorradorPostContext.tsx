"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface BorradorPost {
  titulo: string;
  resena: string;
}

const BORRADOR_VACIO: BorradorPost = { titulo: "", resena: "" };

interface BorradorPostContextValor {
  borrador: BorradorPost;
  setBorrador: (borrador: BorradorPost) => void;
  limpiarBorrador: () => void;
}

const BorradorPostContext = createContext<BorradorPostContextValor | null>(null);

// Vive en el layout de (app) (que no se desmonta al cambiar de pestaña con
// swipe, a diferencia de cada page.tsx) para que el título/reseña que el
// usuario está escribiendo en "Comparte tu experiencia" sobreviva un cambio
// de pestaña y vuelta. Solo en memoria a propósito: si recarga la página o
// cierra la app el borrador se pierde igual, que es lo que se pidió (nada
// de persistir en localStorage/sessionStorage).
export function BorradorPostProvider({ children }: { children: ReactNode }) {
  const [borrador, setBorrador] = useState<BorradorPost>(BORRADOR_VACIO);

  function limpiarBorrador() {
    setBorrador(BORRADOR_VACIO);
  }

  return (
    <BorradorPostContext.Provider value={{ borrador, setBorrador, limpiarBorrador }}>
      {children}
    </BorradorPostContext.Provider>
  );
}

export function useBorradorPost() {
  const contexto = useContext(BorradorPostContext);
  if (!contexto) throw new Error("useBorradorPost debe usarse dentro de BorradorPostProvider");
  return contexto;
}
