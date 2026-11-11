/*
 * Additions to the generated service worker (loaded with importScripts).
 *
 * keepalive: while an import is running, the page sends this message every
 * 20 seconds. Holding the event open keeps the service worker running, which
 * is one of the things that stops Chrome on Android from freezing the page
 * in the background. Each message is a new, short event.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'keepalive') {
    event.waitUntil(new Promise((resolve) => setTimeout(resolve, 25000)));
  }
});

// Tapping an "import finished / paused" notification brings the app forward.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(self.registration.scope);
    }),
  );
});
