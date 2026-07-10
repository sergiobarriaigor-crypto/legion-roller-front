"use client";

import { useEffect, useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { useSession } from "@/context/SessionContext";
import { apiGet } from "@/lib/api";
import { listarHistorias, type GrupoHistorias } from "@/lib/historias";
import { Avatar } from "@/components/Avatar";
import { EditorHistoria } from "@/components/Historias/EditorHistoria";
import { VisorHistorias } from "@/components/Historias/VisorHistorias";

// Barra horizontal de historias arriba del feed de Post, estilo Instagram.
// Oculta por completo para Visitante (sin token, no hay forma de calcular
// "vistoCompleto" ni de publicar) — mismo criterio que Mapa/Perfil/Chat.
export function BarraHistorias() {
  const { sesion } = useSession();
  const token = sesion?.token ?? null;

  const [grupos, setGrupos] = useState<GrupoHistorias[]>([]);
  const [miFotoUrl, setMiFotoUrl] = useState<string | null>(null);
  const [mostrarEditor, setMostrarEditor] = useState(false);
  const [indiceVisor, setIndiceVisor] = useState<number | null>(null);

  async function cargar() {
    if (!token) return;
    try {
      const lista = await listarHistorias(token);
      setGrupos(lista);
    } catch {
      // silencioso: si falla, la barra simplemente no muestra historias de otros
    }
  }

  useEffect(() => {
    cargar();
    if (token) {
      apiGet<{ fotoUrl: string | null }>("/perfil/mio", token)
        .then((p) => setMiFotoUrl(p.fotoUrl))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token) return null;

  const misHistorias = grupos.find((g) => g.autorId === sesion?.id);
  const otrosGrupos = grupos.filter((g) => g.autorId !== sesion?.id);

  function abrirMiHistoriaOEditor() {
    if (misHistorias) {
      setIndiceVisor(grupos.indexOf(misHistorias));
    } else {
      setMostrarEditor(true);
    }
  }

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-1">
        <div className="flex flex-col items-center gap-1">
          <div
            role="button"
            tabIndex={0}
            className="relative cursor-pointer"
            onClick={abrirMiHistoriaOEditor}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                abrirMiHistoriaOEditor();
              }
            }}
          >
            <Avatar
              fotoUrl={miFotoUrl}
              nombre={sesion?.nombre ?? "Yo"}
              anillo={misHistorias && !misHistorias.vistoCompleto ? "dorado" : "ninguno"}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMostrarEditor(true);
                }}
                aria-label="Agregar historia"
                className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-page-bg bg-fill-primary text-on-primary"
              >
                <IconPlus size={12} />
              </button>
            </Avatar>
          </div>
          <span className="max-w-[60px] truncate text-center text-[11px] text-text-secondary">
            Mi historia
          </span>
        </div>

        {otrosGrupos.map((g) => (
          <button
            key={g.autorId}
            type="button"
            onClick={() => setIndiceVisor(grupos.indexOf(g))}
            className="flex flex-col items-center gap-1"
          >
            <Avatar
              fotoUrl={g.autorFotoUrl}
              nombre={g.autorNombre}
              anillo={g.vistoCompleto ? "ninguno" : "dorado"}
            />
            <span className="max-w-[60px] truncate text-center text-[11px] text-text-secondary">
              {g.autorNombre.split(" ")[0]}
            </span>
          </button>
        ))}
      </div>

      {mostrarEditor && (
        <EditorHistoria
          token={token}
          onClose={() => setMostrarEditor(false)}
          onPublicado={() => {
            setMostrarEditor(false);
            cargar();
          }}
        />
      )}

      {indiceVisor !== null && (
        <VisorHistorias
          grupos={grupos}
          indiceInicial={indiceVisor}
          token={token}
          onClose={() => {
            setIndiceVisor(null);
            cargar();
          }}
        />
      )}
    </>
  );
}
