"use client";

import { useEffect, useState } from "react";
import {
  IconX,
  IconPhoto,
  IconVideo,
  IconFile,
  IconFileTypePdf,
  IconFileTypeDoc,
  IconFileTypeXls,
  IconDownload,
} from "@tabler/icons-react";
import { adjuntosDeSala, type AdjuntoAlbum } from "@/lib/chat";

type Pestana = "foto" | "video" | "archivo";

const PESTANAS: { valor: Pestana; etiqueta: string; icono: typeof IconPhoto }[] = [
  { valor: "foto", etiqueta: "Fotos", icono: IconPhoto },
  { valor: "video", etiqueta: "Videos", icono: IconVideo },
  { valor: "archivo", etiqueta: "Archivos", icono: IconFile },
];

// Duplicada de BurbujaMensaje.tsx (mismo criterio ya establecido en el
// proyecto de no compartir helpers pequeños entre módulos).
function IconoArchivo({ nombre, size }: { nombre: string; size: number }) {
  const ext = nombre.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return <IconFileTypePdf size={size} />;
  if (ext === "doc" || ext === "docx") return <IconFileTypeDoc size={size} />;
  if (ext === "xls" || ext === "xlsx") return <IconFileTypeXls size={size} />;
  return <IconFile size={size} />;
}

function formatearTamano(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function AlbumChatPanel({
  sala,
  token,
  onCerrar,
}: {
  sala: string;
  token: string | null;
  onCerrar: () => void;
}) {
  const [pestana, setPestana] = useState<Pestana>("foto");
  const [adjuntos, setAdjuntos] = useState<AdjuntoAlbum[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelado = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true);
    setError("");
    adjuntosDeSala(sala, pestana, token)
      .then((lista) => {
        if (!cancelado) setAdjuntos(lista);
      })
      .catch(() => {
        if (!cancelado) setError("No se pudo cargar el álbum.");
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [sala, pestana, token]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-page-bg" data-no-swipe>
      <div className="card -mx-0 flex items-center gap-2 px-3 py-2.5">
        <h1 className="flex-1 text-sm font-semibold text-text-accent">Álbum</h1>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-text-secondary">
          <IconX size={20} />
        </button>
      </div>

      <div className="flex border-b border-border">
        {PESTANAS.map(({ valor, etiqueta, icono: Icono }) => (
          <button
            key={valor}
            type="button"
            onClick={() => setPestana(valor)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold ${
              pestana === valor
                ? "border-b-2 border-text-accent text-text-accent"
                : "text-text-secondary"
            }`}
          >
            <Icono size={16} />
            {etiqueta}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {cargando && <p className="text-xs text-text-secondary">Cargando...</p>}
        {error && <p className="text-xs text-fill-warning">{error}</p>}

        {!cargando && !error && adjuntos.length === 0 && (
          <p className="text-xs text-text-secondary">Todavía no hay nada acá.</p>
        )}

        {!cargando && pestana === "foto" && adjuntos.length > 0 && (
          <div className="grid grid-cols-3 gap-1">
            {adjuntos.map(
              (a) =>
                a.url && (
                  <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.url}
                      alt=""
                      className="aspect-square w-full rounded-app object-cover"
                    />
                  </a>
                ),
            )}
          </div>
        )}

        {!cargando && pestana === "video" && adjuntos.length > 0 && (
          <div className="flex flex-col gap-2">
            {adjuntos.map(
              (a) =>
                a.url && (
                  <video key={a.id} src={a.url} controls className="w-full rounded-app" />
                ),
            )}
          </div>
        )}

        {!cargando && pestana === "archivo" && adjuntos.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {adjuntos.map(
              (a) =>
                a.url && (
                  <a
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={a.nombre ?? undefined}
                    className="flex items-center gap-2 rounded-app bg-surface-2 px-2.5 py-2"
                  >
                    <IconoArchivo nombre={a.nombre ?? ""} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-text-primary">
                        {a.nombre ?? "Documento"}
                      </span>
                      <span className="block text-[11px] text-text-secondary">
                        {a.autorNombre}
                        {a.tamanoKb !== null && ` · ${formatearTamano(a.tamanoKb)}`}
                      </span>
                    </span>
                    <IconDownload size={16} className="shrink-0 text-text-secondary" />
                  </a>
                ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
