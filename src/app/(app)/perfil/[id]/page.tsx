"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { IconCheck, IconTarget, IconLock } from "@tabler/icons-react";
import { useSession } from "@/context/SessionContext";
import { ApiError } from "@/lib/api";
import { CATALOGO_TECNICAS, HITOS_DISTANCIA_KM, perfilPublico, type PerfilPublico } from "@/lib/perfil";
import { GaleriaPerfil } from "@/components/Perfil/GaleriaPerfil";

// Vista de solo lectura del perfil de OTRO miembro — abierta desde "Ver
// perfil" en el encabezado de una conversación de chat. Es un subconjunto
// recortado de perfil/page.tsx (sin editar estado, sin reconocimientos, sin
// publicaciones ni cerrar sesión): solo lo que tiene sentido mostrar de
// alguien más.
export default function PerfilPublicoPage() {
  const params = useParams<{ id: string }>();
  const miembroId = Number(params.id);
  const router = useRouter();
  const { sesion } = useSession();
  const token = sesion?.token ?? null;

  const [perfil, setPerfil] = useState<PerfilPublico | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sesion?.id === miembroId) {
      router.replace("/perfil");
      return;
    }
    async function cargar() {
      try {
        const datos = await perfilPublico(miembroId, token);
        setPerfil(datos);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "No se pudo cargar el perfil.");
      }
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miembroId, token]);

  if (error) {
    return <p className="text-sm text-fill-warning">{error}</p>;
  }
  if (!perfil) {
    return <p className="text-sm text-text-secondary">Cargando...</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <Link href="/chat" className="text-sm text-text-secondary underline">
        ← Volver
      </Link>

      <div className="card flex flex-col items-center gap-3 p-5">
        {perfil.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={perfil.fotoUrl}
            alt={perfil.nombre}
            className="h-20 w-20 rounded-full border-2 border-border-accent object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-border-accent bg-bg-accent text-2xl font-semibold text-text-accent">
            {perfil.nombre.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-lg font-semibold text-text-accent">{perfil.nombre}</h1>
          <p className="text-xs text-text-secondary">
            {perfil.ciudad ?? "Sin ciudad"} · {perfil.rol}
          </p>
          {perfil.estado && (
            <p className="text-xs text-text-secondary">&quot;{perfil.estado.texto}&quot;</p>
          )}
        </div>
      </div>

      <div className="card grid grid-cols-3 gap-3 p-4 text-center">
        <div>
          <p className="text-lg font-semibold text-text-accent">{perfil.stats.kmTotales}</p>
          <p className="text-xs text-text-muted">km totales</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-text-accent">{perfil.stats.kmOficiales}</p>
          <p className="text-xs text-text-muted">km oficiales</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-text-accent">{perfil.stats.numRutas}</p>
          <p className="text-xs text-text-muted">rutas</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-text-accent">{perfil.stats.asistencias}</p>
          <p className="text-xs text-text-muted">asistencias</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-text-accent">{perfil.stats.eventos}</p>
          <p className="text-xs text-text-muted">eventos</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-text-accent">{perfil.stats.horasPatinadas}</p>
          <p className="text-xs text-text-muted">horas</p>
        </div>
      </div>

      <div className="card flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold text-text-primary">Técnicas dominadas</h2>
        {CATALOGO_TECNICAS.map((cat) => (
          <div key={cat.categoria} className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold text-text-secondary">{cat.categoria}</h3>
            <div className="flex flex-wrap gap-2">
              {cat.tecnicas.map((t) => (
                <span
                  key={t.clave}
                  className={`rounded-app px-3 py-1 text-xs ${
                    perfil.tecnicas.includes(t.clave)
                      ? "btn-hero"
                      : "border border-border text-text-secondary"
                  }`}
                >
                  {t.etiqueta}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold text-text-primary">Distancias Alcanzadas</h2>
        <div className="flex flex-wrap gap-2">
          {(() => {
            const disponibleKm = HITOS_DISTANCIA_KM.find((km) => perfil.mejorDistanciaRuta < km);
            return HITOS_DISTANCIA_KM.map((km) => {
              const desbloqueado = perfil.mejorDistanciaRuta >= km;
              const disponible = !desbloqueado && km === disponibleKm;
              return (
                <div
                  key={km}
                  className={`flex items-center gap-1.5 rounded-app px-3 py-1 text-xs ${
                    desbloqueado
                      ? "btn-hero"
                      : disponible
                        ? "border-2 border-border-accent text-text-accent"
                        : "border border-border text-text-muted opacity-60"
                  }`}
                >
                  {desbloqueado ? (
                    <IconCheck size={14} />
                  ) : disponible ? (
                    <IconTarget size={14} />
                  ) : (
                    <IconLock size={14} />
                  )}
                  {km} km
                </div>
              );
            });
          })()}
        </div>
      </div>

      <GaleriaPerfil miembroId={perfil.id} esPropio={false} token={token} />
    </div>
  );
}
