// Offline shell: serve from cache, refresh the cache in the background.
// No user data passes through here. Add new files to FILES.
// ponytail: stale-while-revalidate per file, so a deploy lands on the second launch and one launch
// can mix old and new files. Bump C on a breaking change; switch to a versioned precache if that bites.
const C = "workout-log-v1";
const FILES = ["./", "styles.css", "js/app.js", "js/model.js", "js/io.js", "js/views.js", "manifest.webmanifest", "icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.open(C).then(c => c.match(e.request).then(hit => {
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; });
    if (!hit) return net;
    e.waitUntil(net.catch(() => {}));
    return hit;
  })));
});
