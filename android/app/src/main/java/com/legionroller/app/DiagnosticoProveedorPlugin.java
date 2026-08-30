package com.legionroller.app;

import com.equimaps.capacitor_background_geolocation.BackgroundGeolocationService;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

// Plugin Capacitor LOCAL de esta app (no un paquete npm), companero de
// DisponibilidadUbicacionPlugin.java pero para una señal completamente
// distinta -- ver comentario ahi sobre por que ambas deben permanecer
// separadas (systemLocationEnabled vs providerAvailability).
//
// Expone, mediante consultas puntuales (nunca streaming, nunca una
// suscripcion de ubicacion nueva), la instrumentacion diagnostica agregada
// en BackgroundGeolocationService.DiagnosticoNativo (parche patch-package,
// ver ese archivo) y en DiagnosticoNativoBuffer (pause/resume de
// MainActivity, ver esa clase).
@CapacitorPlugin(name = "DiagnosticoProveedor")
public class DiagnosticoProveedorPlugin extends Plugin {

    @PluginMethod
    public void obtenerDiagnosticoNativo(PluginCall call) {
        JSObject resultado = new JSObject();
        try {
            JSONObject nativo = BackgroundGeolocationService.DiagnosticoNativo.snapshot();
            resultado.put("total", nativo.getLong("total"));
            resultado.put("ultimoTimestamp", nativo.getLong("ultimoTimestamp"));
            resultado.put("maxIntervaloSeg", nativo.getDouble("maxIntervaloSeg"));
            resultado.put("huecosNativos", nativo.getJSONArray("huecosNativos"));
            resultado.put("eventosDisponibilidadProveedor", nativo.getJSONArray("eventosDisponibilidadProveedor"));
            // Instrumentacion adicional (auditoria ruta 104 -- hipotesis
            // "doble watcher"). Ver DiagnosticoNativo.snapshot() en el patch.
            resultado.put("watchersActivos", nativo.getInt("watchersActivos"));
            resultado.put("maxWatchersSimultaneos", nativo.getInt("maxWatchersSimultaneos"));
            resultado.put("eventosWatchers", nativo.getJSONArray("eventosWatchers"));
            resultado.put("foregroundIntentos", nativo.getLong("foregroundIntentos"));
            resultado.put("foregroundExitos", nativo.getLong("foregroundExitos"));
            resultado.put("foregroundErrores", nativo.getJSONArray("foregroundErrores"));
            resultado.put("threadsRequestUpdates", nativo.getJSONArray("threadsRequestUpdates"));
        } catch (JSONException ex) {
            call.reject("No se pudo leer el diagnostico nativo", ex);
            return;
        }

        JSONArray pauseResume = new JSONArray();
        for (Object[] evento : DiagnosticoNativoBuffer.snapshot()) {
            JSONObject e = new JSONObject();
            try {
                e.put("activo", (Boolean) evento[0]);
                e.put("hora", (Long) evento[1]);
                pauseResume.put(e);
            } catch (JSONException ignore) {
                // Un evento individual mal formado no debe tirar abajo el resto.
            }
        }
        resultado.put("eventosPauseResumeActivity", pauseResume);

        call.resolve(resultado);
    }

    // Debe ejecutarse una unica vez al iniciar cada grabacion nueva, ANTES
    // de que el watcher real (BackgroundGeolocation.addWatcher) pueda
    // producir su primer callback -- ver
    // frontend/src/lib/gpsV2/diagnosticoNativo.ts e
    // iniciarSesionDiagnosticoNativoV2() en gpsV2/index.ts, awaited desde
    // grabacionGps.ts antes de arrancar el watcher.
    @PluginMethod
    public void resetDiagnosticoNativo(PluginCall call) {
        BackgroundGeolocationService.DiagnosticoNativo.reset();
        DiagnosticoNativoBuffer.reset();
        call.resolve();
    }
}
