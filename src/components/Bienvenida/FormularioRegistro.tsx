"use client";

import { useMemo, useState } from "react";
import { apiPost, ApiError } from "@/lib/api";
import { ImageUploadCrop } from "@/components/ImageUploadCrop";
import { useNoAutofill } from "@/lib/useNoAutofill";
import { SelectorCiudad } from "./SelectorCiudad";

interface Props {
  onVolver: () => void;
}

interface RegistroResponse {
  id: number;
  mensaje: string;
}

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function correoValido(v: string) {
  return REGEX_CORREO.test(v.trim());
}

function claveTieneLongitud(v: string) {
  return v.length >= 8;
}

function claveTieneMayuscula(v: string) {
  return /[A-Z]/.test(v);
}

export function FormularioRegistro({ onVolver }: Props) {
  const [nombre, setNombre] = useState("");
  const noAutofillNombre = useNoAutofill();
  const [correo, setCorreo] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [telefono, setTelefono] = useState("");
  const [clave, setClave] = useState("");
  const [confirmarClave, setConfirmarClave] = useState("");
  const [mostrarClave, setMostrarClave] = useState(false);
  const [fotoUrl, setFotoUrl] = useState("");

  const [tocado, setTocado] = useState<Record<string, boolean>>({});

  const [enviando, setEnviando] = useState(false);
  const [errorFinal, setErrorFinal] = useState("");
  const [mensajeFinal, setMensajeFinal] = useState("");

  function marcarTocado(campo: string) {
    setTocado((prev) => ({ ...prev, [campo]: true }));
  }

  const erroresCampos = useMemo(() => {
    return {
      nombre: nombre.trim().length === 0 ? "Ingresa tu nombre o apodo." : "",
      correo: !correoValido(correo) ? "Correo con formato inválido." : "",
      fechaNacimiento: !fechaNacimiento ? "Ingresa tu fecha de nacimiento." : "",
      ciudad: !ciudad.trim() ? "Selecciona tu ciudad de la lista." : "",
      clave:
        !claveTieneLongitud(clave) || !claveTieneMayuscula(clave)
          ? "Mínimo 8 caracteres y al menos una mayúscula."
          : "",
      confirmarClave: confirmarClave !== clave ? "Las contraseñas no coinciden." : "",
      fotoUrl: !fotoUrl ? "Sube una foto de perfil." : "",
    };
  }, [nombre, correo, fechaNacimiento, ciudad, clave, confirmarClave, fotoUrl]);

  const camposValidos = {
    nombre: !erroresCampos.nombre,
    correo: !erroresCampos.correo,
    fechaNacimiento: !erroresCampos.fechaNacimiento,
    ciudad: !erroresCampos.ciudad,
    clave: !erroresCampos.clave,
    confirmarClave: !erroresCampos.confirmarClave,
    fotoUrl: !erroresCampos.fotoUrl,
  };

  const totalCampos = Object.keys(camposValidos).length;
  const camposCompletos = Object.values(camposValidos).filter(Boolean).length;
  const progreso = Math.round((camposCompletos / totalCampos) * 100);
  const formularioValido = camposCompletos === totalCampos;

  async function enviarSolicitud(e: React.FormEvent) {
    e.preventDefault();
    setTocado({
      nombre: true,
      correo: true,
      fechaNacimiento: true,
      ciudad: true,
      clave: true,
      confirmarClave: true,
      fotoUrl: true,
    });
    if (!formularioValido) return;

    setErrorFinal("");
    setEnviando(true);
    try {
      const res = await apiPost<RegistroResponse>("/auth/registro", {
        nombre: nombre.trim(),
        correo: correo.trim(),
        fechaNacimiento,
        ciudad: ciudad.trim(),
        telefono: telefono.trim() || undefined,
        fotoUrl,
        clave,
      });
      setMensajeFinal(res.mensaje);
    } catch (err) {
      setErrorFinal(err instanceof ApiError ? err.message : "No se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={enviarSolicitud}
      className="card flex w-full flex-col gap-3 p-5"
      style={{ border: "none" }}
    >
      <h2 className="text-sm font-semibold text-text-primary">Solicitud de registro</h2>

      {!mensajeFinal && (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-fill-primary transition-all"
              style={{ width: `${progreso}%` }}
            />
          </div>
          <p className="text-[11px] text-text-muted">{progreso}% completado</p>
        </div>
      )}

      {mensajeFinal ? (
        <p className="text-xs text-fill-success">{mensajeFinal}</p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <input
              type="text"
              autoComplete="off"
              {...noAutofillNombre}
              placeholder="Nombre o apodo"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onBlur={() => marcarTocado("nombre")}
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
            />
            {tocado.nombre && erroresCampos.nombre && (
              <p className="text-xs text-fill-warning">{erroresCampos.nombre}</p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <input
              type="email"
              placeholder="Correo electrónico"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              onBlur={() => marcarTocado("correo")}
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
            />
            {tocado.correo && erroresCampos.correo && (
              <p className="text-xs text-fill-warning">{erroresCampos.correo}</p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <input
              type="date"
              value={fechaNacimiento}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setFechaNacimiento(e.target.value)}
              onBlur={() => marcarTocado("fechaNacimiento")}
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
            />
            {tocado.fechaNacimiento && erroresCampos.fechaNacimiento && (
              <p className="text-xs text-fill-warning">{erroresCampos.fechaNacimiento}</p>
            )}
          </div>

          <SelectorCiudad value={ciudad} onChange={setCiudad} onBlurCampo={() => marcarTocado("ciudad")} />
          {tocado.ciudad && erroresCampos.ciudad && (
            <p className="-mt-2 text-xs text-fill-warning">{erroresCampos.ciudad}</p>
          )}

          <div className="flex flex-col gap-1">
            <input
              type="tel"
              autoComplete="off"
              placeholder="Teléfono (opcional)"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="relative">
              <input
                type={mostrarClave ? "text" : "password"}
                placeholder="Contraseña"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                onBlur={() => marcarTocado("clave")}
                className="w-full rounded-app border border-border bg-surface-2 px-3 py-2 pr-16 text-text-primary outline-none"
              />
              <button
                type="button"
                onClick={() => setMostrarClave((v) => !v)}
                className="absolute inset-y-0 right-3 text-xs text-text-secondary underline"
              >
                {mostrarClave ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            <div className="flex gap-3 text-[11px]">
              <span className={claveTieneLongitud(clave) ? "text-fill-success" : "text-text-muted"}>
                {claveTieneLongitud(clave) ? "✓" : "○"} 8+ caracteres
              </span>
              <span className={claveTieneMayuscula(clave) ? "text-fill-success" : "text-text-muted"}>
                {claveTieneMayuscula(clave) ? "✓" : "○"} una mayúscula
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <input
              type={mostrarClave ? "text" : "password"}
              placeholder="Confirmar contraseña"
              value={confirmarClave}
              onChange={(e) => setConfirmarClave(e.target.value)}
              onBlur={() => marcarTocado("confirmarClave")}
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
            />
            {tocado.confirmarClave && erroresCampos.confirmarClave && (
              <p className="text-xs text-fill-warning">{erroresCampos.confirmarClave}</p>
            )}
            {confirmarClave.length > 0 && confirmarClave === clave && (
              <p className="text-xs text-fill-success">✓ Coinciden</p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-xs text-text-secondary">Foto de perfil</p>
            {fotoUrl ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fotoUrl}
                  alt="Foto de perfil"
                  className="h-16 w-16 rounded-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setFotoUrl("")}
                  className="text-xs text-text-secondary underline"
                >
                  Cambiar foto
                </button>
              </div>
            ) : (
              <ImageUploadCrop
                token={null}
                ruta="/uploads/registro"
                onSubido={(url) => {
                  setFotoUrl(url);
                  marcarTocado("fotoUrl");
                }}
                etiqueta="Agregar foto de perfil"
                formaCircular
                permitirCamara
              />
            )}
          </div>

          {errorFinal && <p className="text-xs text-fill-warning">{errorFinal}</p>}

          <button
            type="submit"
            disabled={!formularioValido || enviando}
            className="btn-hero rounded-app px-4 py-2 disabled:opacity-60"
          >
            {enviando ? "Enviando..." : "Enviar solicitud"}
          </button>
        </>
      )}

      <button
        type="button"
        className="text-xs text-text-secondary underline"
        onClick={onVolver}
      >
        Volver
      </button>
    </form>
  );
}
