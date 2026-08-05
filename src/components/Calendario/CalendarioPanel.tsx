"use client";

import { useEffect, useState } from "react";
import {
  IconCake,
  IconChevronLeft,
  IconChevronRight,
  IconDotsVertical,
  IconMapPin,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import {
  listarMesCalendario,
  misInvitacionesPendientes,
  responderInvitacion,
  cancelarActividad,
  ETIQUETA_CATEGORIA,
  COLOR_CATEGORIA,
  type ItemCalendario,
  type InvitacionPendiente,
} from "@/lib/calendario";
import { Avatar } from "@/components/Avatar";
import { CrearActividadModal } from "./CrearActividadModal";
import { EditarActividadModal } from "./EditarActividadModal";

const NOMBRES_MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const NOMBRES_DIA = ["D", "L", "M", "M", "J", "V", "S"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function hoyStr() {
  const h = new Date();
  return `${h.getFullYear()}-${pad(h.getMonth() + 1)}-${pad(h.getDate())}`;
}

export function CalendarioPanel({
  propioId,
  token,
  onCerrar,
}: {
  propioId: number | null | undefined;
  token: string | null;
  onCerrar: () => void;
}) {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [diaSeleccionado, setDiaSeleccionado] = useState(hoyStr());
  const [items, setItems] = useState<ItemCalendario[]>([]);
  const [pendientes, setPendientes] = useState<InvitacionPendiente[]>([]);
  const [mostrarCrear, setMostrarCrear] = useState(false);
  const [menuAbiertoId, setMenuAbiertoId] = useState<number | null>(null);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);

  function recargar() {
    if (!token) return;
    setCargando(true);
    Promise.all([listarMesCalendario(anio, mes, token), misInvitacionesPendientes(token)])
      .then(([itemsRes, pendientesRes]) => {
        setItems(itemsRes);
        setPendientes(pendientesRes);
      })
      .catch(() => {})
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anio, mes, token]);

  function cambiarMes(delta: number) {
    let m = mes + delta;
    let a = anio;
    if (m < 1) {
      m = 12;
      a -= 1;
    } else if (m > 12) {
      m = 1;
      a += 1;
    }
    setMes(m);
    setAnio(a);
  }

  async function responder(actividadId: number, estado: "aceptada" | "rechazada") {
    if (!token) return;
    await responderInvitacion(actividadId, estado, token).catch(() => {});
    recargar();
  }

  async function cancelar(actividadId: number) {
    if (!token) return;
    await cancelarActividad(actividadId, token).catch(() => {});
    recargar();
  }

  const primerDiaSemana = new Date(anio, mes - 1, 1).getDay();
  const diasEnMes = new Date(anio, mes, 0).getDate();
  const celdas: (string | null)[] = [
    ...Array(primerDiaSemana).fill(null),
    ...Array.from({ length: diasEnMes }, (_, i) => `${anio}-${pad(mes)}-${pad(i + 1)}`),
  ];

  const itemsPorDia = new Map<string, ItemCalendario[]>();
  for (const item of items) {
    const lista = itemsPorDia.get(item.fecha) ?? [];
    lista.push(item);
    itemsPorDia.set(item.fecha, lista);
  }
  const itemsDelDia = itemsPorDia.get(diaSeleccionado) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-page-bg" data-no-swipe>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text-accent">Calendario</h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMostrarCrear(true)}
            aria-label="Nueva actividad"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-fill-primary text-on-primary"
          >
            <IconPlus size={18} />
          </button>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-text-secondary">
            <IconX size={22} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {pendientes.length > 0 && (
          <div className="flex flex-col gap-2 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-accent">
              Invitaciones pendientes
            </p>
            {pendientes.map((inv) => (
              <div
                key={inv.id}
                className="rounded-app border-l-4 bg-surface-1 p-3"
                style={{ borderColor: COLOR_CATEGORIA[inv.categoria] }}
              >
                <p className="text-sm font-medium text-text-primary">{inv.titulo}</p>
                <p className="text-xs text-text-secondary">
                  {ETIQUETA_CATEGORIA[inv.categoria]} · {inv.creadorNombre} te invitó · {inv.fecha}
                  {inv.hora ? ` · ${inv.hora}` : ""}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => responder(inv.actividadId, "aceptada")}
                    className="btn-hero flex-1 rounded-app py-1.5 text-xs"
                  >
                    Aceptar
                  </button>
                  <button
                    type="button"
                    onClick={() => responder(inv.actividadId, "rechazada")}
                    className="flex-1 rounded-app border border-border py-1.5 text-xs text-text-secondary"
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-4">
          <button type="button" onClick={() => cambiarMes(-1)} aria-label="Mes anterior" className="text-text-accent">
            <IconChevronLeft size={20} />
          </button>
          <p className="text-sm font-semibold text-text-primary">
            {NOMBRES_MES[mes - 1]} {anio}
          </p>
          <button type="button" onClick={() => cambiarMes(1)} aria-label="Mes siguiente" className="text-text-accent">
            <IconChevronRight size={20} />
          </button>
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1.5 text-center text-xs text-text-secondary">
          {NOMBRES_DIA.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {celdas.map((fecha, i) => {
            if (!fecha) return <div key={i} />;
            const diaItems = itemsPorDia.get(fecha) ?? [];
            const esHoy = fecha === hoyStr();
            const esSeleccionado = fecha === diaSeleccionado;
            const visibles = diaItems.slice(0, 3);
            const restantes = diaItems.length - visibles.length;
            return (
              <button
                key={fecha}
                type="button"
                onClick={() => setDiaSeleccionado(fecha)}
                style={{
                  minHeight: "76px",
                  border: esHoy ? "1px solid var(--border-accent)" : "1px solid transparent",
                }}
                className={`flex flex-col items-stretch gap-1 rounded-app p-1.5 text-left ${
                  esSeleccionado ? "bg-bg-accent" : ""
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center self-start rounded-full text-xs ${
                    esHoy ? "bg-fill-primary font-bold text-on-primary" : "bg-surface-2 text-text-primary"
                  }`}
                >
                  {Number(fecha.slice(-2))}
                </span>
                <div className="flex flex-col gap-1">
                  {visibles.map((it, idx) => {
                    const color = it.cancelada ? "#8a8177" : COLOR_CATEGORIA[it.categoria];
                    const etiqueta =
                      it.origen === "cumpleanos" ? it.titulo.replace("Cumpleaños de ", "") : it.titulo;
                    return (
                      <span
                        key={idx}
                        className={`truncate rounded-[3px] px-1 text-[10px] leading-[14px] ${
                          it.cancelada ? "line-through" : ""
                        }`}
                        style={{ backgroundColor: `${color}33`, color }}
                      >
                        {etiqueta}
                      </span>
                    );
                  })}
                  {restantes > 0 && (
                    <span className="text-[10px] text-text-secondary">+{restantes} más</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {cargando && <p className="text-sm text-text-secondary">Cargando...</p>}
          {!cargando && itemsDelDia.length === 0 && (
            <p className="text-sm text-text-secondary">Sin actividades este día.</p>
          )}
          {itemsDelDia.map((it) =>
            it.origen === "cumpleanos" ? (
              <div
                key={`cumple-${it.id}`}
                className="flex items-center gap-3 rounded-app p-3"
                style={{ backgroundColor: "rgba(224,127,168,0.14)", border: "1px solid #e07fa8" }}
              >
                <Avatar fotoUrl={it.fotoUrl} nombre={it.titulo} tamano={40} />
                <div>
                  <p className="flex items-center gap-1 text-sm font-medium text-text-primary">
                    <IconCake size={16} style={{ color: "#e07fa8" }} />
                    {it.titulo}
                  </p>
                  <p className="text-xs text-text-secondary">¡Feliz cumpleaños! 🎉</p>
                </div>
              </div>
            ) : (
              <div
                key={`${it.origen}-${it.id}`}
                className="relative rounded-app border-l-4 bg-surface-1 p-3"
                style={{
                  borderColor: it.cancelada ? "#8a8177" : COLOR_CATEGORIA[it.categoria],
                  opacity: it.cancelada ? 0.6 : 1,
                }}
              >
                {it.origen === "actividad" && it.esCreador && !it.cancelada && (
                  <div className="absolute right-2 top-2">
                    <button
                      type="button"
                      onClick={() => setMenuAbiertoId(menuAbiertoId === it.id ? null : it.id)}
                      aria-label="Más opciones"
                      className="flex h-6 w-6 items-center justify-center text-text-secondary"
                    >
                      <IconDotsVertical size={16} />
                    </button>
                    {menuAbiertoId === it.id && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setMenuAbiertoId(null)} />
                        <div className="absolute right-0 top-7 z-50 flex w-36 flex-col overflow-hidden rounded-app border border-border bg-surface-2">
                          <button
                            type="button"
                            onClick={() => {
                              setMenuAbiertoId(null);
                              setEditandoId(it.id);
                            }}
                            className="px-3 py-2 text-left text-xs text-text-primary active:bg-surface-1"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuAbiertoId(null);
                              cancelar(it.id);
                            }}
                            className="px-3 py-2 text-left text-xs text-fill-warning active:bg-surface-1"
                          >
                            Cancelar actividad
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <p
                  className={`pr-6 text-sm font-medium text-text-primary ${it.cancelada ? "line-through" : ""}`}
                >
                  {it.titulo}
                </p>
                <p className="text-xs text-text-secondary">
                  {ETIQUETA_CATEGORIA[it.categoria]}
                  {it.hora ? ` · ${it.hora}` : ""}
                  {it.cancelada ? " · Cancelada" : ""}
                </p>
                {it.descripcion && (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-text-secondary">
                    {it.descripcion}
                  </p>
                )}
                {it.puntoEncuentro && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-text-secondary">
                    <IconMapPin size={13} />
                    {it.puntoEncuentro}
                  </p>
                )}
              </div>
            ),
          )}
        </div>
      </div>

      {mostrarCrear && (
        <CrearActividadModal
          propioId={propioId}
          token={token}
          fechaInicial={diaSeleccionado}
          onCreada={() => {
            setMostrarCrear(false);
            recargar();
          }}
          onCerrar={() => setMostrarCrear(false)}
        />
      )}

      {editandoId !== null && (
        <EditarActividadModal
          actividadId={editandoId}
          propioId={propioId}
          token={token}
          onGuardada={() => {
            setEditandoId(null);
            recargar();
          }}
          onCerrar={() => setEditandoId(null)}
        />
      )}
    </div>
  );
}
