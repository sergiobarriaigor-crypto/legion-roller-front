package com.legionroller.app;

import android.content.Context;
import android.os.PowerManager;

// WakeLock parcial -- Fase 1 de la correccion de produccion (auditoria ruta
// 107/108: los huecos de onLocationResult correlacionan casi exactamente
// con huecos del heartbeat diagnostico, evidencia de que el sistema/OEM
// congela el proceso completo -- ver conversacion de diseno). Sostenido
// EXCLUSIVAMENTE durante una grabacion GPS activa, para evitar que el
// sistema suspenda la CPU (y con ella el HandlerThread "CapacitorPlugins"
// que usa tanto el watcher real como el heartbeat) mientras la app esta en
// segundo plano. No mantiene la pantalla encendida -- PARTIAL_WAKE_LOCK,
// nunca SCREEN_*.
//
// Codigo propio de la app, sin tocar el patch-package del plugin
// vendorizado ni su Service -- mismo criterio ya usado por
// DiagnosticoHeartbeat/DisponibilidadUbicacionPlugin: no agrega un segundo
// watcher ni una segunda suscripcion de ubicacion, es puramente un recurso
// del sistema sostenido en paralelo.
final class GrabacionWakeLock {
    private GrabacionWakeLock() {}

    private static final String TAG = "LegionRoller:grabacionGps";
    // Red de seguridad: si por lo que sea liberar() nunca llega a
    // invocarse (crash, kill del proceso sin pasar por detenerGrabacionGps),
    // el propio sistema libera el wakelock solo a las 6h -- nunca queda
    // sostenido indefinidamente.
    private static final long TIMEOUT_SEGURIDAD_MS = 6L * 60 * 60 * 1000;

    private static PowerManager.WakeLock wakeLock = null;

    // Idempotente: si ya esta sostenido, no vuelve a adquirir.
    static void adquirir(Context contexto) {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager pm = (PowerManager) contexto.getApplicationContext()
            .getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, TAG);
        // Evita el bug clasico de conteo desbalanceado entre acquire()/
        // release() -- este wakelock es un unico recurso binario (sostenido
        // o no), nunca necesita conteo de referencias.
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire(TIMEOUT_SEGURIDAD_MS);
    }

    // Idempotente: seguro de llamar aunque no haya nada sostenido.
    static void liberar() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        wakeLock = null;
    }
}
