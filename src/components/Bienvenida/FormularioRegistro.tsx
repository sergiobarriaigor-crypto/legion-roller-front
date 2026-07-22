"use client";

import { useMemo, useState } from "react";
import { apiPost, ApiError } from "@/lib/api";
import { ImageUploadCrop } from "@/components/ImageUploadCrop";

interface Props {
  onVolver: () => void;
}

interface CodigoResponse {
  mensaje: string;
  codigoDev: string;
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
  const [correo, setCorreo] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [clave, setClave] = useState("");
  const [confirmarClave, setConfirmarClave] = useState("");
  const [mostrarClave, setMostrarClave] = useState(false);
  const [fotoUrl, setFotoUrl] = useState("");

  const [tocado, setTocado] = useState<Record<string, boolean>>({});

  const [codigo, setCodigo] = useState("");
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [codigoDevHint, setCodigoDevHint] = useState("");
  const [correoVerificado, setCorreoVerificado] = useState(false);
  const [enviandoCodigo, setEnviandoCodigo] = useState(false);
  const [verificandoCodigo, setVerificandoCodigo] = useState(false);
  const [errorCodigo, setErrorCodigo] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [errorFinal, setErrorFinal] = useState("");
  const [mensajeFinal, setMensajeFinal] = useState("");

  function marcarTocado(campo: string) {
    setTocado((prev) => ({ ...prev, [campo]: true }));
  }

  function onCambiarCorreo(v: string) {
    setCorreo(v);
    if (correoVerificado || codigoEnviado) {
      setCorreoVerificado(false);
      setCodigoEnviado(false);
      setCodigo("");
      setCodigoDevHint("");
      setErrorCodigo("");
    }
  }

  async function enviarCodigo() {
    if (!correoValido(correo)) {
      marcarTocado("correo");
      return;
    }
    setErrorCodigo("");
    setEnviandoCodigo(true);
    try {
      const res = await apiPost<CodigoResponse>("/auth/correo/enviar-codigo", {
        correo: correo.trim(),
      });
      setCodigoEnviado(true);
      setCodigoDevHint(res.codigoDev);
    } catch (err) {
      setErrorCodigo(err instanceof ApiError ? err.message : "No se pudo enviar el código.");
    } finally {
      setEnviandoCodigo(false);
    }
  }

  async function verificarCodigo() {
    if (codigo.length !== 6) return;
    setErrorCodigo("");
    setVerificandoCodigo(true);
    try {
      await apiPost("/auth/correo/confirmar-codigo", {
        correo: correo.trim(),
        codigo,
      });
      setCorreoVerificado(true);
    } catch (err) {
      setErrorCodigo(err instanceof ApiError ? err.message : "No se pudo verificar el código.");
    } finally {
      setVerificandoCodigo(false);
    }
  }

  const erroresCampos = useMemo(() => {
    return {
      nombre: nombre.trim().length === 0 ? "Ingresa tu nombre o apodo." : "",
      correo: !correoValido(correo) ? "Correo con formato inválido." : "",
      fechaNacimiento: !fechaNacimiento ? "Ingresa tu fecha de nacimiento." : "",
      clave:
        !claveTieneLongitud(clave) || !claveTieneMayuscula(clave)
          ? "Mínimo 8 caracteres y al menos una mayúscula."
          : "",
      confirmarClave: confirmarClave !== clave ? "Las contraseñas no coinciden." : "",
      fotoUrl: !fotoUrl ? "Sube una foto de perfil." : "",
    };
  }, [nombre, correo, fechaNacimiento, clave, confirmarClave, fotoUrl]);

  const camposValidos = {
    nombre: !erroresCampos.nombre,
    correo: correoVerificado,
    fechaNacimiento: !erroresCampos.fechaNacimiento,
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
      className="card flex w-full max-w-xs flex-col gap-3 p-5"
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
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Correo electrónico"
                value={correo}
                onChange={(e) => onCambiarCorreo(e.target.value)}
                onBlur={() => marcarTocado("correo")}
                disabled={correoVerificado}
                className="min-w-0 flex-1 rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none disabled:opacity-60"
              />
              {!correoVerificado && (
                <button
                  type="button"
                  disabled={!correoValido(correo) || enviandoCodigo}
                  onClick={enviarCodigo}
                  className="shrink-0 whitespace-nowrap rounded-app border border-border px-2 py-2 text-[11px] text-text-secondary disabled:opacity-40"
                >
                  {enviandoCodigo ? "Enviando..." : codigoEnviado ? "Reenviar" : "Enviar código"}
                </button>
              )}
            </div>
            {tocado.correo && !correoVerificado && erroresCampos.correo && (
              <p className="text-xs text-fill-warning">{erroresCampos.correo}</p>
            )}

            {correoVerificado ? (
              <p className="text-xs text-fill-success">Correo verificado.</p>
            ) : (
              codigoEnviado && (
                <div className="flex flex-col gap-1 rounded-app border border-border bg-surface-2 p-2">
                  <p className="text-[11px] text-text-muted">
                    Ingresa el código de 6 dígitos enviado a tu correo.
                  </p>
                  {codigoDevHint && (
                    <p className="text-[11px] text-text-accent">
                      Modo simulado — código: {codigoDevHint}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="123456"
                      value={codigo}
                      onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
                      className="min-w-0 flex-1 rounded-app border border-border bg-surface-1 px-3 py-2 text-text-primary outline-none"
                    />
                    <button
                      type="button"
                      disabled={codigo.length !== 6 || verificandoCodigo}
                      onClick={verificarCodigo}
                      className="btn-hero shrink-0 rounded-app px-3 py-2 text-xs disabled:opacity-40"
                    >
                      {verificandoCodigo ? "Verificando..." : "Verificar"}
                    </button>
                  </div>
                  {errorCodigo && <p className="text-xs text-fill-warning">{errorCodigo}</p>}
                </div>
              )
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
