package com.legionroller.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.location.LocationManager;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Plugin Capacitor LOCAL de esta app (no un paquete npm) -- única
// responsabilidad: informar a JS cuándo Android enciende/apaga Ubicación,
// de forma independiente de cualquier watcher de posición activo.
//
// Motivo (ver diagnóstico ruta 102): @capacitor-community/background-geolocation
// expone onLocationAvailability() solo del lado nativo (Logger.debug, nunca
// llega a JS) y su FusedLocationProviderClient sigue entregando ubicaciones
// en caché/derivadas incluso con Ubicación apagada. LocationManager.isLocationEnabled()
// (API 28+) / Settings.Secure.LOCATION_MODE (anterior) es la señal real del
// sistema operativo, y MODE_CHANGED_ACTION es el broadcast que Android emite
// cuando esa señal cambia -- ninguno de los dos depende de que exista una
// suscripción de ubicación activa.
//
// No decide nada por sí mismo: solo emite el evento "cambioDisponibilidad" y
// expone estaDisponible() para consultar el estado actual al momento de
// suscribirse. Quien decide qué hacer con eso es GPS V2 (ver
// frontend/src/lib/disponibilidadUbicacion.ts / gpsV2/index.ts).
@CapacitorPlugin(name = "DisponibilidadUbicacion")
public class DisponibilidadUbicacionPlugin extends Plugin {

    private static final String EVENTO_CAMBIO = "cambioDisponibilidad";

    private BroadcastReceiver receptor;

    @Override
    public void load() {
        receptor = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                notificarEstadoActual();
            }
        };
        getContext().registerReceiver(receptor, new IntentFilter(LocationManager.MODE_CHANGED_ACTION));
    }

    @Override
    protected void handleOnDestroy() {
        if (receptor != null) {
            getContext().unregisterReceiver(receptor);
            receptor = null;
        }
    }

    private boolean ubicacionDisponible() {
        LocationManager lm = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return lm.isLocationEnabled();
        }
        int modo = Settings.Secure.getInt(
            getContext().getContentResolver(),
            Settings.Secure.LOCATION_MODE,
            Settings.Secure.LOCATION_MODE_OFF
        );
        return modo != Settings.Secure.LOCATION_MODE_OFF;
    }

    private void notificarEstadoActual() {
        JSObject datos = new JSObject();
        datos.put("disponible", ubicacionDisponible());
        notifyListeners(EVENTO_CAMBIO, datos);
    }

    @PluginMethod
    public void estaDisponible(PluginCall call) {
        JSObject resultado = new JSObject();
        resultado.put("disponible", ubicacionDisponible());
        call.resolve(resultado);
    }
}
