package com.legionroller.app;

import android.app.ActivityManager;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

// Instrumentacion diagnostica (auditoria ruta 107) -- distinguir si el
// thread/proceso sigue vivo durante los huecos nativos de onLocationResult
// (con la app en background), o si el heartbeat tambien queda congelado.
// Puramente observacional: no decide nada, no toca ubicacion, no agrega una
// segunda suscripcion GPS.
//
// Se programa sobre el MISMO Looper que ya usa
// BackgroundGeolocationService.requestLocationUpdates(..., null): ese Looper
// esta garantizado por el propio Capacitor -- Bridge.java crea un unico
// HandlerThread("CapacitorPlugins") (node_modules/@capacitor/android/
// capacitor/src/main/java/com/getcapacitor/Bridge.java:138,216-217) por el
// que se despachan TODAS las llamadas @PluginMethod de la app, sin
// excepcion. Por eso iniciar() se llama desde dentro de un @PluginMethod
// (ver DiagnosticoProveedorPlugin.resetDiagnosticoNativo) y simplemente
// captura Looper.myLooper() en ese momento -- no hace falta ninguna
// referencia especial al Bridge, ni cambiar el Looper=null de
// requestLocationUpdates.
//
// Clase separada de DiagnosticoNativo (dentro del parche patch-package de
// background-geolocation) a proposito, mismo criterio que
// DiagnosticoNativoBuffer: codigo propio de la app, sin tocar node_modules.
final class DiagnosticoHeartbeat {
    private DiagnosticoHeartbeat() {}

    private static final Object lock = new Object();
    private static final long INTERVALO_MS = 5000;
    private static final double UMBRAL_HUECO_SEG = 20.0;
    private static final int LIMITE_HUECOS = 200;

    private static boolean activo = false;
    private static Handler handler = null;
    private static Runnable tick = null;
    private static Context contextoApp = null;

    private static long totalHeartbeats = 0;
    private static long ultimoHeartbeatTimestamp = -1;
    private static double maxIntervaloHeartbeatSeg = 0;
    private static final List<Object[]> huecosHeartbeat = new ArrayList<>();

    // Idempotente: si ya esta activo, no hace nada. No hace falta un guard
    // mas elaborado -- todas las llamadas a este metodo llegan desde
    // @PluginMethod, y Capacitor las serializa una a la vez sobre el unico
    // HandlerThread "CapacitorPlugins" (ver comentario de arriba), asi que
    // nunca hay dos invocaciones concurrentes entre si.
    static void iniciar(Context contexto) {
        synchronized (lock) {
            if (activo) return;
            contextoApp = contexto.getApplicationContext();
            Looper looper = Looper.myLooper();
            if (looper == null) {
                // No deberia poder pasar (ver comentario de arriba) -- si
                // alguna vez pasa, no se improvisa: simplemente no arranca.
                return;
            }
            handler = new Handler(looper);
            activo = true;
            tick = new Runnable() {
                @Override
                public void run() {
                    if (!activo) return;
                    registrarTick();
                    handler.postDelayed(this, INTERVALO_MS);
                }
            };
            handler.postDelayed(tick, INTERVALO_MS);
        }
    }

    // Cancela el tick pendiente -- sin esto, un tick fantasma podria seguir
    // disparando y contaminar los contadores de la proxima ruta aunque
    // reset() ya se haya llamado.
    static void detener() {
        synchronized (lock) {
            activo = false;
            if (handler != null && tick != null) {
                handler.removeCallbacks(tick);
            }
            handler = null;
            tick = null;
        }
    }

    static void reset() {
        synchronized (lock) {
            totalHeartbeats = 0;
            ultimoHeartbeatTimestamp = -1;
            maxIntervaloHeartbeatSeg = 0;
            huecosHeartbeat.clear();
        }
    }

    private static void registrarTick() {
        long ahora = System.currentTimeMillis();
        long anterior;
        double intervaloSeg;
        boolean huecoAnomalo;

        synchronized (lock) {
            totalHeartbeats++;
            anterior = ultimoHeartbeatTimestamp;
            intervaloSeg = anterior >= 0 ? (ahora - anterior) / 1000.0 : -1;
            if (intervaloSeg > maxIntervaloHeartbeatSeg) {
                maxIntervaloHeartbeatSeg = intervaloSeg;
            }
            huecoAnomalo = intervaloSeg >= UMBRAL_HUECO_SEG;
            ultimoHeartbeatTimestamp = ahora;
        }

        if (!huecoAnomalo) return;

        // Los 4 campos de estado se leen SOLO acá, para una entrada anomala
        // -- nunca en cada tick normal (serian miles por ruta).
        boolean idle = false;
        boolean interactive = true;
        int importancia = -1;
        if (contextoApp != null) {
            PowerManager pm = (PowerManager) contextoApp.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                idle = pm.isDeviceIdleMode();
                interactive = pm.isInteractive();
            }
            ActivityManager.RunningAppProcessInfo info = new ActivityManager.RunningAppProcessInfo();
            ActivityManager.getMyMemoryState(info);
            importancia = info.importance;
        }
        String nombreThread = Thread.currentThread().getName();

        synchronized (lock) {
            if (huecosHeartbeat.size() >= LIMITE_HUECOS) {
                huecosHeartbeat.remove(0);
            }
            huecosHeartbeat.add(new Object[]{
                anterior, ahora, intervaloSeg, idle, interactive, importancia, nombreThread
            });
        }
    }

    static JSONObject snapshot() throws JSONException {
        JSONObject resultado = new JSONObject();
        synchronized (lock) {
            resultado.put("totalHeartbeats", totalHeartbeats);
            resultado.put("ultimoHeartbeatTimestamp", ultimoHeartbeatTimestamp);
            resultado.put("maxIntervaloHeartbeatSeg", maxIntervaloHeartbeatSeg);
            JSONArray huecos = new JSONArray();
            for (Object[] h : huecosHeartbeat) {
                JSONObject o = new JSONObject();
                o.put("anteriorTimestamp", h[0]);
                o.put("actualTimestamp", h[1]);
                o.put("intervaloSeg", h[2]);
                o.put("isDeviceIdleMode", h[3]);
                o.put("isInteractive", h[4]);
                o.put("memoryImportance", h[5]);
                o.put("nombreThread", h[6]);
                huecos.put(o);
            }
            resultado.put("huecosHeartbeat", huecos);
        }
        return resultado;
    }
}
