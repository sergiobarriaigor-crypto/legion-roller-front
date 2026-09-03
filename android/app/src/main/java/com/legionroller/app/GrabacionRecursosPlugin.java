package com.legionroller.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Plugin Capacitor LOCAL de esta app (no un paquete npm) -- Fase 1 de la
// correccion de produccion (auditoria ruta 107/108, ver GrabacionWakeLock).
// Unica responsabilidad por ahora: adquirir/liberar el WakeLock parcial
// atado al ciclo de vida real de una grabacion GPS. Deliberadamente NO
// incluye todavia la solicitud de exencion de bateria (Fase 2, no
// autorizada aun) -- ver conversacion de diseno.
@CapacitorPlugin(name = "GrabacionRecursos")
public class GrabacionRecursosPlugin extends Plugin {

    @PluginMethod
    public void adquirirWakeLock(PluginCall call) {
        GrabacionWakeLock.adquirir(getContext());
        call.resolve();
    }

    @PluginMethod
    public void liberarWakeLock(PluginCall call) {
        GrabacionWakeLock.liberar();
        call.resolve();
    }
}
