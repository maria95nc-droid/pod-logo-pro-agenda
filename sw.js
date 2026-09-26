// Service worker mínimo: solo existe para que el navegador ofrezca
// "Instalar app" / "Añadir a pantalla de inicio". No cachea nada todavía
// (para no complicar el mantenimiento con una app en construcción activa);
// deja pasar todas las peticiones a la red tal cual.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Sin caché: se limita a existir para cumplir el requisito de instalación.
});
