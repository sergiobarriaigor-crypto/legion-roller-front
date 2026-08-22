// V2 -- preflight de compatibilidad para la integración a producción. Se
// llama ANTES de intentar generarVideoRecorridoV2 -- si algo esencial no
// está disponible en este navegador, el llamador (CompartirRecorridoModal)
// usa V1 directamente, sin siquiera intentar V2. Nunca se invoca a mitad de
// una generación ya en curso: una falla real durante V2 (después de pasar
// este preflight) se resuelve mostrando error/reintentar, nunca cayendo a
// V1 en silencio (ver generarVideoRecorridoV2.ts / CompartirRecorridoModal.tsx).
//
// Mismas listas de mimeType que ya usa grabacionV2.ts (CANDIDATOS_MIME_VIDEO/
// CANDIDATOS_MIME_VIDEO_CON_AUDIO), reimplementadas acá a propósito -- mismo
// criterio que el resto del proyecto (cada archivo nuevo reimplementa
// constantes chicas en vez de importar de un archivo ya congelado). Si
// alguna vez cambian los candidatos de grabacionV2.ts, hay que replicar el
// cambio acá.
const CANDIDATOS_MIME_VIDEO = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4;codecs=avc1",
  "video/mp4",
];
const CANDIDATOS_MIME_VIDEO_CON_AUDIO = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
];

export interface ResultadoPreflightV2 {
  compatible: boolean;
  motivo?: string;
}

// conMusica: true si el usuario eligió una canción para este video --
// además de los requisitos base de video, exige que exista una combinación
// de video+audio realmente soportada (MediaRecorder.isTypeSupported) y Web
// Audio con MediaStreamAudioDestinationNode. Si el usuario no eligió
// música, esos dos chequeos no aplican (decisión explícita del usuario: no
// generar V2 sin la música pedida en vez de degradar en silencio).
export function verificarCompatibilidadV2(conMusica: boolean): ResultadoPreflightV2 {
  if (typeof MediaRecorder === "undefined") {
    return { compatible: false, motivo: "MediaRecorder no disponible" };
  }
  if (typeof HTMLCanvasElement === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
    return { compatible: false, motivo: "canvas.captureStream no disponible" };
  }
  const mimeVideoOk = CANDIDATOS_MIME_VIDEO.some((c) => MediaRecorder.isTypeSupported(c));
  if (!mimeVideoOk) {
    return { compatible: false, motivo: "ningún mimeType de video soportado" };
  }
  if (conMusica) {
    const AudioCtxCtor =
      typeof AudioContext !== "undefined"
        ? AudioContext
        : (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxCtor || typeof AudioCtxCtor.prototype.createMediaStreamDestination !== "function") {
      return { compatible: false, motivo: "Web Audio / MediaStreamAudioDestinationNode no disponible" };
    }
    const mimeConAudioOk = CANDIDATOS_MIME_VIDEO_CON_AUDIO.some((c) => MediaRecorder.isTypeSupported(c));
    if (!mimeConAudioOk) {
      return { compatible: false, motivo: "ningún mimeType de video+audio soportado (se pidió música)" };
    }
  }
  return { compatible: true };
}
