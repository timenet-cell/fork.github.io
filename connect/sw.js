// Fork P2P (PWA): (1) a casca offline do /connect/ e (2) o TUNEL: depois de ligar a um Mac, o Studio dele corre num iframe
// em /connect/mac/<device>/ e CADA pedido desse iframe (HTML, JS, CSS, imagens, audio com Range, XHR — mesmo os com URL
// absoluta tipo /static/x.js) passa por aqui e vai, pelo data channel, ao Studio do Mac. O canal vive na pagina /connect/
// (o service worker nao tem WebRTC): fala-se com ela por MessageChannel e a resposta volta aos bocados.
const V = 'fork-p2p-shell-v4';
const BASE = new URL(self.registration.scope).pathname;            // /connect/
const CASCA = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
               'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => Promise.all(CASCA.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

const b64 = buf => { let s = '', a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
const PROIBIDOS = /^(host|cookie|origin|referer|connection|content-length|accept-encoding|user-agent|sec-.*|upgrade-insecure-requests|priority)$/i;

// A que Mac/caminho vai este pedido? null = nao e do tunel.
async function destino(e) {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return null;
  const m = u.pathname.startsWith(BASE + 'mac/') && u.pathname.slice((BASE + 'mac/').length).match(/^([^/]+)(\/.*)?$/);
  if (m) return { id: m[1], path: (m[2] || '/') + u.search };
  // Um pedido do iframe do Studio com URL absoluta (/static/…, /api/…): o cliente que o faz esta em /connect/mac/<id>/.
  if (e.clientId && !u.pathname.startsWith(BASE)) {
    const c = await self.clients.get(e.clientId);
    const cm = c && new URL(c.url).pathname.startsWith(BASE + 'mac/') && new URL(c.url).pathname.slice((BASE + 'mac/').length).match(/^([^/]+)/);
    if (cm) return { id: cm[1], path: u.pathname + u.search };
  }
  return null;
}

async function conchaCliente() {
  const todos = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return todos.find(c => { const p = new URL(c.url).pathname; return p === BASE || p === BASE + 'index.html'; });
}

async function tunel(request, d) {
  const casca = await conchaCliente();
  if (!casca) return new Response('Open Fork and connect to your Mac first.', { status: 503, headers: { 'content-type': 'text/plain' } });
  const headers = {};
  request.headers.forEach((v, k) => { if (!PROIBIDOS.test(k)) headers[k] = v; });
  let body = null;
  if (!['GET', 'HEAD'].includes(request.method)) { const ab = await request.arrayBuffer(); if (ab.byteLength) body = b64(ab); }
  const canal = new MessageChannel();
  let controlo;
  const cabeca = new Promise((ok, falha) => {
    canal.port1.onmessage = ev => {
      const m = ev.data;
      if (m.t === 'head') ok(m);
      else if (m.t === 'chunk') controlo && controlo.enqueue(new Uint8Array(m.buf));
      else if (m.t === 'done') { try { controlo && controlo.close(); } catch {} ok(null); }
      else if (m.t === 'err') { try { controlo && controlo.error(new Error(m.msg)); } catch {} falha(new Error(m.msg)); }
    };
    setTimeout(() => falha(new Error('The Mac did not answer in time.')), 60000);
  });
  const corpo = new ReadableStream({ start(c) { controlo = c; }, cancel() { canal.port1.postMessage({ t: 'cancel' }); } });
  casca.postMessage({ t: 'fetch', method: request.method, path: d.path, headers, body }, [canal.port2]);
  let h;
  try { h = await cabeca; } catch (err) { return new Response('Fork: ' + err.message, { status: 504, headers: { 'content-type': 'text/plain' } }); }
  if (!h) return new Response(null, { status: 502 });
  const hs = new Headers(h.headers || {});
  const loc = hs.get('location');
  if (loc && loc.startsWith('/')) hs.set('location', BASE + 'mac/' + d.id + loc);      // um redirect para a raiz fica no tunel
  const semCorpo = [101, 204, 205, 304].includes(h.status) || request.method === 'HEAD';
  return new Response(semCorpo ? null : corpo, { status: h.status, headers: hs });
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' && e.request.method !== 'HEAD' && e.request.method !== 'POST' && e.request.method !== 'PUT' && e.request.method !== 'PATCH') return;
  e.respondWith((async () => {
    const d = await destino(e);
    if (d) return tunel(e.request, d);
    if (e.request.method !== 'GET') return fetch(e.request);
    const u = new URL(e.request.url);
    const casca = u.origin === location.origin || u.hostname === 'cdn.jsdelivr.net';
    if (!casca) return fetch(e.request);                    // supabase.co, STUN, etc.: direto
    // A casca: rede primeiro, SEM a cache HTTP (o GitHub Pages serve com max-age de 10 min); a cache so serve offline.
    const fresco = e.request.mode === 'navigate' || /\/(index\.html|sw\.js|manifest\.webmanifest)?$/.test(u.pathname);
    try {
      const r = await fetch(e.request, fresco ? { cache: 'no-store' } : undefined);
      const c = r.clone(); caches.open(V).then(k => k.put(e.request, c));
      return r;
    } catch { return (await caches.match(e.request)) || (await caches.match('./')) || Response.error(); }
  })());
});
