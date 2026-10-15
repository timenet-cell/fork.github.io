// Fork P2P (PWA): guarda a casca para abrir sem rede. Nunca guarda nada de Supabase nem da API (so GET da casca).
const V = 'fork-p2p-shell-v2';
const CASCA = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
               'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => Promise.all(CASCA.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const casca = u.origin === location.origin || u.hostname === 'cdn.jsdelivr.net';
  if (!casca) return;            // supabase.co, STUN, etc.: direto
  // A casca: rede primeiro (versao nova), cache se estiver offline.
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(k => k.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('./'))));
});
