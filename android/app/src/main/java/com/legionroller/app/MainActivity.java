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
}
