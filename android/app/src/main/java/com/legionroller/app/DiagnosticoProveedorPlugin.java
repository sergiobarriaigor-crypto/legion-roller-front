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

            // Heartbeat (auditoria ruta 107) -- ver DiagnosticoHeartbeat.
            JSONObject heartbeat = DiagnosticoHeartbeat.snapshot();
            resultado.put("totalHeartbeats", heartbeat.getLong("totalHeartbeats"));
            resultado.put("ultimoHeartbeatTimestamp", heartbeat.getLong("ultimoHeartbeatTimestamp"));
            resultado.put("maxIntervaloHeartbeatSeg", heartbeat.getDouble("maxIntervaloHeartbeatSeg"));
            resultado.put("huecosHeartbeat", heartbeat.getJSONArray("huecosHeartbeat"));
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
        // Heartbeat (auditoria ruta 107): se resetea y arranca junto con el
        // resto de la sesion diagnostica, ANTES del watcher real -- ver
        // DiagnosticoHeartbeat.iniciar() para la justificacion del Looper.
        DiagnosticoHeartbeat.reset();
        DiagnosticoHeartbeat.iniciar(getContext());
        call.resolve();
    }

    // Simetrico al arranque de arriba -- debe llamarse al terminar de
    // verdad la grabacion (detenerGrabacionGps en el frontend), para que el
    // heartbeat no siga tickeando y contamine la proxima ruta.
    @PluginMethod
    public void detenerHeartbeat(PluginCall call) {
        DiagnosticoHeartbeat.detener();
        call.resolve();
    }
}
