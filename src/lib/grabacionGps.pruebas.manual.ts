// FASE 3.1 -- verificación manual del uso de pos.time real (en vez de
// Date.now()) en alRecibirPosicion (ver grabacionGps.ts). Mismo patrón que
// gpsV2/pruebas.manual.ts: script autoejecutable, sin framework de test
// (el proyecto no tiene ninguno instalado). Se corre a mano con:
//
//   npx tsx src/lib/grabacionGps.pruebas.manual.ts
//
// alRecibirPosicion es privada del módulo (a propósito -- no se exportó
// nada nuevo para esta fase). Para ejercitarla de verdad (no un mock del
// comportamiento) se polyfillea navigator.geolocation.watchPosition -- el
// único punto de entrada real del que depende iniciarSeguimientoUbicacion()
// en la rama web -- y se dispara a través de iniciarGrabacionGps(), la API
// pública ya existente. Bajo Node/tsx, Capacitor.isNativePlatform() da
// `false` (no hay window.androidBridge), así que geolocacionNativa.ts toma
// la rama web -- se confirmó leyendo @capacitor/core (getPlatformId).
//
// Todo dentro de main() (en vez de top-level await) porque tsx transpila
// este archivo como CJS por defecto, que no soporta top-level await.
import assert from "node:assert/strict";

let capturedSuccessCb: ((pos: { coords: Record<string, unknown>; timestamp: number | null }) => void) | null = null;
// Node 22+ ya trae un `navigator` global propio (getter de solo lectura,
// sin `.geolocation`) -- no se puede reasignar con `=` (TypeError:
// "Cannot set property navigator of #<Object> which has only a getter").
// Object.defineProperty lo reemplaza igual, mismo resultado que necesita
// geolocacionNativa.ts (navigator.geolocation.watchPosition/clearWatch).
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  writable: true,
  value: {
    geolocation: {
      watchPosition: (
        successCb: (pos: { coords: Record<string, unknown>; timestamp: number | null }) => void,
      ) => {
        capturedSuccessCb = successCb;
        return 1;
      },
      clearWatch: () => {},
    },
  },
});

const LAT0 = -41.4693;
const LON0 = -72.9424;
const M_POR_GRADO_LAT = 111_320;
const M_POR_GRADO_LON = 111_320 * Math.cos((LAT0 * Math.PI) / 180);

function coordsDesdeMetros(norteM: number, esteM: number): { lat: number; lon: number } {
  return { lat: LAT0 + norteM / M_POR_GRADO_LAT, lon: LON0 + esteM / M_POR_GRADO_LON };
}

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  // Import dinámico, DESPUÉS de instalar el polyfill de arriba -- para que
  // esté listo antes de que iniciarGrabacionGps() dispare watchPosition()
  // de verdad.
  const { iniciarGrabacionGps, detenerGrabacionGps, obtenerGrabacionActiva } = await import("./grabacionGps");

  // Simula un GeolocationPosition real del navegador -- mismo shape que
  // geolocacionNativa.ts lee (pos.coords.latitude/longitude/accuracy/speed,
  // pos.timestamp). `timestampMs: null` permite ejercitar el fallback (ver
  // PASO 1 de la auditoría: PosicionSimple.time es `number | null` también
  // del lado nativo, ya contemplado en todo el resto del código).
  function emitirFix(
    norteM: number,
    esteM: number,
    timestampMs: number | null,
    opciones: { accuracy?: number } = {},
  ): void {
    if (!capturedSuccessCb) throw new Error("watchPosition no fue llamado todavía -- ¿falta iniciarGrabacionGps()?");
    const { lat, lon } = coordsDesdeMetros(norteM, esteM);
    capturedSuccessCb({
      coords: { latitude: lat, longitude: lon, accuracy: opciones.accuracy ?? 8, speed: null },
      timestamp: timestampMs,
    });
  }

  async function nuevaGrabacion(): Promise<void> {
    // Por si una verificación previa dejó una grabación activa (no debería,
    // pero detenerGrabacionGps es idempotente/seguro llamarlo de más).
    detenerGrabacionGps();
    capturedSuccessCb = null;
    await iniciarGrabacionGps("patinando", false, () => {
      throw new Error("onError() no debería dispararse en estas pruebas");
    });
  }

  let ok = 0;
  async function verificar(nombre: string, fn: () => void | Promise<void>): Promise<void> {
    await fn();
    ok++;
    console.log(`OK: ${nombre}`);
  }

  // A. Fix live con pos.time válido: PuntoGps.timestamp === pos.time.
  await verificar("A -- timestamp real del fix se preserva (no Date.now())", async () => {
    await nuevaGrabacion();
    const tReal = 1_788_000_000_000; // deliberadamente MUY distinto de Date.now() actual
    emitirFix(0, 0, tReal, { accuracy: 10 });
    const puntos = obtenerGrabacionActiva()?.puntos ?? [];
    assert.equal(puntos.length, 1);
    assert.equal(puntos[0].timestamp, tReal);
    assert.notEqual(puntos[0].timestamp, Date.now());
    detenerGrabacionGps();
  });

  // B. Fix sin pos.time: mantiene fallback válido a Date.now().
  await verificar("B -- pos.time null cae a Date.now() (fallback, no se rompe)", async () => {
    await nuevaGrabacion();
    const antes = Date.now();
    emitirFix(0, 0, null, { accuracy: 10 });
    const despues = Date.now();
    const puntos = obtenerGrabacionActiva()?.puntos ?? [];
    assert.equal(puntos.length, 1);
    assert.ok(
      puntos[0].timestamp >= antes && puntos[0].timestamp <= despues,
      `timestamp del fallback (${puntos[0].timestamp}) debe caer entre ${antes} y ${despues}`,
    );
    detenerGrabacionGps();
  });

  // C. Dos fixes "históricos" (10s de diferencia real según pos.time),
  // procesados uno inmediatamente después del otro (sin esperar real): la
  // detección de salto sospechoso (kmhEntre) debe usar los 10s reales, NO
  // el tiempo de replay (~0ms). Distancia elegida (300m/10s = 108km/h)
  // queda JUSTO por debajo del umbral (115km/h) usando el tiempo real --
  // con el bug (Date.now() en vez de pos.time), el delta real entre las
  // dos llamadas síncronas es de microsegundos, dando una velocidad
  // absurda que SÍ dispararía "salto sospechoso" y dejaría el segundo
  // punto pendiente en vez de confirmado.
  await verificar("C -- kmhEntre usa el dt real del fix, no el dt de replay", async () => {
    await nuevaGrabacion();
    const t0 = 1_788_000_000_000;
    emitirFix(0, 0, t0, { accuracy: 10 }); // primer punto, siempre entra directo
    emitirFix(300, 0, t0 + 10_000, { accuracy: 10 }); // 300m al norte, +10s reales, sin esperar de verdad
    const puntos = obtenerGrabacionActiva()?.puntos ?? [];
    assert.equal(
      puntos.length,
      2,
      `con dt real (10s) el 2do punto debe confirmarse directo, no quedar pendiente (puntos.length=${puntos.length})`,
    );
    assert.equal(puntos[1].timestamp, t0 + 10_000);
    detenerGrabacionGps();
  });

  // D. El mismo par timestamps/coordenadas produce el MISMO resultado
  // (mismos puntos, mismos timestamps) sea que se procese "en vivo" (con
  // un delay real entre fixes) o "en replay" (sin delay real) -- la única
  // variable que debe importar es pos.time, nunca la velocidad real de
  // ejecución de JS.
  await verificar("D -- resultado determinista: replay rápido vs. con delay real dan lo mismo", async () => {
    const t0 = 1_788_100_000_000;

    await nuevaGrabacion();
    emitirFix(0, 0, t0, { accuracy: 10 });
    emitirFix(300, 0, t0 + 10_000, { accuracy: 10 }); // sin delay real
    const puntosReplay = obtenerGrabacionActiva()?.puntos ?? [];
    detenerGrabacionGps();

    await nuevaGrabacion();
    emitirFix(0, 0, t0, { accuracy: 10 });
    await dormir(50); // delay real (arbitrario, > 0 -- lo único que debe ser irrelevante)
    emitirFix(300, 0, t0 + 10_000, { accuracy: 10 });
    const puntosEnVivo = obtenerGrabacionActiva()?.puntos ?? [];
    detenerGrabacionGps();

    assert.deepEqual(
      puntosReplay,
      puntosEnVivo,
      "el resultado (cantidad de puntos, timestamps, coordenadas) no debe depender de la velocidad real de replay",
    );
  });

  console.log(`\nTODO OK (${ok} verificaciones)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
