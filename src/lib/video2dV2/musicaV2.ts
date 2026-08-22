// V2 -- Fase 6B: música de fondo. Adapta el mecanismo ya probado en V1
// (tarjetaRecorrido.ts: AudioBufferSourceNode -> GainNode ->
// MediaStreamAudioDestinationNode -> track de audio agregado al mismo
// MediaStream del video -- un solo MediaRecorder) implementado acá de
// forma INDEPENDIENTE, sin exportar ni tocar nada de tarjetaRecorrido.ts
// (congelado). El catálogo de canciones y su UI de selección
// (lib/musicaHistorias.ts, components/Historias/SelectorMusicaHistoria.tsx,
// SelectorInicioMusica.tsx) SÍ se reutilizan tal cual desde donde ya
// viven -- no son parte de la congelación de V1, son módulos ya
// compartidos con la feature de Historias.
//
// Diferencia central respecto a V1: V2 graba en segmentos, pausando el
// MediaRecorder mientras busca los tiles del siguiente tramo. V1 nunca
// tuvo que resolver esto (graba de punta a punta sin pausas). Acá la
// música se congela con audioCtx.suspend()/resume() exactamente rodeando
// cada pausa/reanudación de segmento -- la orquestación y el orden exacto
// de esas llamadas viven en grabacionV2.ts (necesitan coordinarse con el
// propio pause()/resume() del MediaRecorder), acá solo la construcción,
// carga, fade y liberación del grafo de audio en sí.
export const VOLUMEN_MUSICA_V2 = 0.65;

export interface GrafoMusicaV2 {
  audioCtx: AudioContext;
  destinoMusica: MediaStreamAudioDestinationNode;
  gananciaMusica: GainNode;
  fuenteMusica: AudioBufferSourceNode;
}

// Nunca lanza -- cualquier falla (red, decode, navegador sin Web Audio)
// devuelve null; el llamador sigue generando el video sin música.
export async function cargarBufferMusicaV2(url: string, audioCtx: AudioContext, log: (linea: string) => void): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      log(`[v2-musica] ERROR al descargar música (${url}): HTTP ${res.status}`);
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    return await audioCtx.decodeAudioData(arrayBuffer);
  } catch (e) {
    log(`[v2-musica] ERROR al cargar/decodificar música (${url}): ${(e as Error).message ?? e}`);
    return null;
  }
}

// Arma el grafo completo pero NUNCA llama fuenteMusica.start() -- eso
// queda para el bloque crítico en grabacionV2.ts, coordinado sin await de
// por medio con mediaRecorder.start().
export function construirGrafoMusicaV2(audioCtx: AudioContext, buffer: AudioBuffer): GrafoMusicaV2 {
  const destinoMusica = audioCtx.createMediaStreamDestination();
  const gananciaMusica = audioCtx.createGain();
  gananciaMusica.gain.value = VOLUMEN_MUSICA_V2;
  const fuenteMusica = audioCtx.createBufferSource();
  fuenteMusica.buffer = buffer;
  fuenteMusica.connect(gananciaMusica).connect(destinoMusica);
  return { audioCtx, destinoMusica, gananciaMusica, fuenteMusica };
}

// Fade-out lineal -- mismo patrón que V1 (cancelScheduledValues +
// setValueAtTime + linearRampToValueAtTime), programado por el llamador en
// el instante exacto en que arranca el beat de logo/ciudad de Fase 6A
// (nunca antes: durante el recorrido, las fotos, la panorámica final o la
// foto final la música se mantiene al volumen normal).
export function programarFadeOutMusicaV2(grafo: GrafoMusicaV2, duracionSeg: number): void {
  const { audioCtx, gananciaMusica } = grafo;
  const ahora = audioCtx.currentTime;
  gananciaMusica.gain.cancelScheduledValues(ahora);
  gananciaMusica.gain.setValueAtTime(gananciaMusica.gain.value, ahora);
  gananciaMusica.gain.linearRampToValueAtTime(0, ahora + duracionSeg);
}

// Libera todos los recursos de audio -- se llama SIEMPRE al terminar
// grabarVideoV2, incluso en rutas de error (ver finally en
// grabacionV2.ts), para no dejar un AudioContext vivo después de generar
// el video. Tolera que fuenteMusica ya se haya detenido sola (canción más
// corta que el video).
export async function liberarMusicaV2(grafo: GrafoMusicaV2 | null, log: (linea: string) => void): Promise<void> {
  if (!grafo) return;
  try {
    grafo.fuenteMusica.stop();
  } catch {
    // esperado si la canción ya había terminado sola antes del cierre
  }
  try {
    grafo.fuenteMusica.disconnect();
  } catch {
    /* noop */
  }
  try {
    grafo.gananciaMusica.disconnect();
  } catch {
    /* noop */
  }
  try {
    grafo.destinoMusica.disconnect();
  } catch {
    /* noop */
  }
  try {
    if (grafo.audioCtx.state !== "closed") await grafo.audioCtx.close();
  } catch (e) {
    log(`[v2-musica] ERROR al cerrar AudioContext: ${(e as Error).message ?? e}`);
  }
}
