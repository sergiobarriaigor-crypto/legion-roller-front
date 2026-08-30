package com.legionroller.app;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin local (no npm), ver DisponibilidadUbicacionPlugin.java --
        // debe registrarse ANTES de super.onCreate().
        registerPlugin(DisponibilidadUbicacionPlugin.class);
        // Idem, ver DiagnosticoProveedorPlugin.java -- instrumentacion
        // diagnostica, señal separada de la de arriba.
        registerPlugin(DiagnosticoProveedorPlugin.class);
        super.onCreate(savedInstanceState);
        // Con targetSdkVersion 36 (Android 15+), el sistema fuerza el modo
        // edge-to-edge y android:statusBarColor/navigationBarColor del tema
        // dejan de tener efecto -- lo que queda detrás de esas barras
        // transparentes es el fondo real de la ventana/WebView, así que hay
        // que pintarlo directamente en vez de depender del tema.
        int azulOscuro = Color.parseColor("#0b121c");
        getWindow().setBackgroundDrawable(new ColorDrawable(azulOscuro));
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setBackgroundColor(azulOscuro);
        }
        // El gris que se seguía viendo es el "scrim" de contraste que Android
        // dibuja encima de las barras transparentes (sobre todo con
        // navegación de 3 botones) para que los íconos del sistema se lean
        // bien -- sin desactivarlo, tapa cualquier color que pintemos abajo.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }
    }

    // Instrumentacion diagnostica (auditoria GPS V2) -- registra unicamente
    // que esta Activity paso por onPause()/onResume(), con hora nativa. Ver
    // DiagnosticoNativoBuffer.java: deliberadamente NO se interpreta esto
    // como "la app entera esta en segundo/primer plano", solo como lifecycle
    // de esta Activity puntual. No reemplaza ni interactua con nada del
    // ciclo de vida real de BridgeActivity -- solo se agrega la llamada,
    // después de invocar al comportamiento original.
    @Override
    public void onPause() {
        super.onPause();
        DiagnosticoNativoBuffer.registrarPauseResume(false, System.currentTimeMillis());
    }

    @Override
    public void onResume() {
        super.onResume();
        DiagnosticoNativoBuffer.registrarPauseResume(true, System.currentTimeMillis());
    }
}
