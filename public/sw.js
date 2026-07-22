self.addEventListener("push", (event) => {
  if (!event.data) return;
  const payload = event.data.json();
  const url = payload.url || "/";

  event.waitUntil(
    self.registration.showNotification(payload.titulo || "Legión Roller", {
      body: payload.cuerpo || "",
      icon: "/logo-legion-roller-mini.png",
      badge: "/logo-legion-roller-mini.png",
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
