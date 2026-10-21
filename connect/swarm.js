// Fork network on the phone (ENCRYPTION_SWARM_PLAN §2.G-4 step 2): read your projects from the swarm, with your main Mac off.
// Tudo no telemovel, so com o WebCrypto do browser (sem bibliotecas):
//  - a CHAVE DE DISPOSITIVO nasce aqui (semente aleatoria) e fica so como CryptoKey NAO exportavel no IndexedDB:
//    Ed25519 (identidade = PeerId libp2p, assina o desafio dos anfitrioes) e a X25519 derivada dela (abre o FKX1);
//  - a chave de conta (AK) vem do Supabase so EMBRULHADA para este aparelho (FKX1, `account_keys`), feita pelo Mac
//    principal, e so se aceita assinada pela chave de artista da conta (`artist_keys`);
//  - catalogo (FKM1 + FKB2 sob a AK) → ponteiro da ultima versao → manifesto (FKB2 sob a PK_e) → blocos (FKB2), cada
//    um conferido pelo cid (SHA-256 da cifra), pela tag AES-256-GCM e pelo SHA-256 do texto;
//  - os blocos vem de QUALQUER anfitriao do enxame pelo WebRTC direto (`/webrtc-direct/certhash/` do registo
//    `swarm_hosts`): sem servidor de sinalizacao, sem dados por servidores da Fork.
// Formatos: packages/core-crypto/src/at_rest.rs, packages/core-p2p/src/swarm/catalog.rs, packages/core-rtc/src/swarm_web.rs.
(function (g) {
  'use strict';
  const subtle = g.crypto.subtle, te = new TextEncoder(), td = new TextDecoder();
  const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
  const unhex = h => { if (!/^([0-9a-f]{2})*$/i.test(h)) throw new Error('bad hex'); return Uint8Array.from(h.match(/../g) || [], x => parseInt(x, 16)); };
  const bytea = s => unhex(String(s).startsWith('\\x') ? String(s).slice(2) : String(s));
  const cat = (...a) => { const n = a.reduce((s, x) => s + x.length, 0), o = new Uint8Array(n); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
  const igual = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const sha256 = async b => new Uint8Array(await subtle.digest('SHA-256', b));
  const b64u = s => { const t = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(t, c => c.charCodeAt(0)); };
  const ZERO12 = new Uint8Array(12);

  async function hkdf32(salt, ikm, info) {
    const k = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, 256));
  }
  async function aesOpen(key, iv, aad, ctTag) {
    const k = await subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt']);
    try { return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, k, ctTag)); }
    catch { throw new Error('wrong key or tampered data'); }
  }

  // ── formatos (at_rest.rs) ─────────────────────────────────────────────────────────────────────────────────
  const MAGIC = { FKB2: te.encode('FKB2'), FKM1: te.encode('FKM1'), FKX1: te.encode('FKX1') };
  const PAD = 65536;
  const epochOf = b => hex(b.subarray(4, 20));

  // Um bloco FKB2 com a chave da sua epoca (`pk` = {epoch: hex, key: Uint8Array(32)}) e o SHA-256 do texto (do manifesto).
  async function openBlock(pk, plainSha, sealed) {
    if (sealed.length < 20 + PAD + 16 || !igual(sealed.subarray(0, 4), MAGIC.FKB2)) throw new Error('not an FKB2 block');
    if (epochOf(sealed) !== pk.epoch) throw new Error('block is from another key epoch');
    if ((sealed.length - 36) % PAD !== 0) throw new Error('FKB2 body is not a multiple of 64 KiB');
    const key = await hkdf32(unhex(pk.epoch), pk.key, cat(te.encode('fork/block-key/v1'), plainSha));
    const body = await aesOpen(key, ZERO12, sealed.subarray(0, 20), sealed.subarray(20));
    const dv = new DataView(body.buffer, body.byteOffset, 8);
    const len = Number(dv.getBigUint64(0, true));
    if (len > body.length - 8) throw new Error('FKB2 length out of range');
    for (let i = 8 + len; i < body.length; i++) if (body[i] !== 0) throw new Error('FKB2 padding is not canonical');
    const plain = body.slice(8, 8 + len);
    if (!igual(await sha256(plain), plainSha)) throw new Error('decrypted block does not match its SHA-256');
    return plain;
  }
  // FKM1 (aad = magia + epoca + id da versao/rotulo).
  async function openManifest(pk, label, sealed) {
    if (sealed.length < 32 + 16 || !igual(sealed.subarray(0, 4), MAGIC.FKM1)) throw new Error('not an FKM1 manifest');
    if (epochOf(sealed) !== pk.epoch) throw new Error('manifest is from another key epoch');
    const key = await hkdf32(unhex(pk.epoch), pk.key, te.encode('fork/manifest-key/v1'));
    return aesOpen(key, sealed.subarray(20, 32), cat(MAGIC.FKM1, unhex(pk.epoch), te.encode(label)), sealed.subarray(32));
  }
  // FKX1: a chave embrulhada para a X25519 deste aparelho.
  async function unwrapFromDevice(dev, wrapped) {
    if (wrapped.length !== 52 + 32 + 16 || !igual(wrapped.subarray(0, 4), MAGIC.FKX1)) throw new Error('not an FKX1 wrapped key');
    const eph = wrapped.slice(20, 52);
    const pub = await subtle.importKey('raw', eph, { name: 'X25519' }, false, []);
    const shared = new Uint8Array(await subtle.deriveBits({ name: 'X25519', public: pub }, dev.x, 256));
    if (shared.every(b => b === 0)) throw new Error('low-order key');
    const key = await hkdf32(cat(eph, dev.xPub), shared, te.encode('fork/device-wrap/v1'));
    const k = await aesOpen(key, ZERO12, wrapped.subarray(0, 52), wrapped.subarray(52));
    return { epoch: epochOf(wrapped), key: k };
  }

  // ── chave de dispositivo ──────────────────────────────────────────────────────────────────────────────────
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function base58(b) {
    let n = 0n; for (const x of b) n = n * 256n + BigInt(x);
    let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
    for (const x of b) { if (x !== 0) break; s = '1' + s; }
    return s;
  }
  // O PeerId libp2p de uma publica Ed25519 (multihash identidade da protobuf {Type: Ed25519, Data}).
  const peerIdOf = edPub => base58(cat(Uint8Array.of(0x00, 0x24, 0x08, 0x01, 0x12, 0x20), edPub));
  const PKCS8 = { ed: unhex('302e020100300506032b657004220420'), x: unhex('302e020100300506032b656e04220420') };

  // Da semente (32 bytes) as duas CryptoKeys NAO exportaveis e as publicas. A semente nao fica em lado nenhum.
  async function deviceFromSeed(seed) {
    const edTmp = await subtle.importKey('pkcs8', cat(PKCS8.ed, seed), { name: 'Ed25519' }, true, ['sign']);
    const edPub = b64u((await subtle.exportKey('jwk', edTmp)).x);
    const ed = await subtle.importKey('pkcs8', cat(PKCS8.ed, seed), { name: 'Ed25519' }, false, ['sign']);
    // A X25519 do aparelho = o escalar do SHA-512 da semente (RFC 8032), como `device_x25519_secret_from_ed25519`.
    const scalar = new Uint8Array(await subtle.digest('SHA-512', seed)).slice(0, 32);
    const xTmp = await subtle.importKey('pkcs8', cat(PKCS8.x, scalar), { name: 'X25519' }, true, ['deriveBits']);
    const xPub = b64u((await subtle.exportKey('jwk', xTmp)).x);
    const x = await subtle.importKey('pkcs8', cat(PKCS8.x, scalar), { name: 'X25519' }, false, ['deriveBits']);
    seed.fill(0); scalar.fill(0);
    return { ed, x, edPub, xPub, peer: peerIdOf(edPub) };
  }
  // O browser sabe guardar estas chaves? (Ed25519 e X25519 no WebCrypto: Safari 17+, Chrome 133+, Firefox 130+.)
  async function supported() {
    try {
      const s = g.crypto.getRandomValues(new Uint8Array(32));
      await deviceFromSeed(s);
      return true;
    } catch { return false; }
  }
  const DB = 'fork-p2p-keys';
  function idb(fn) {
    return new Promise((ok, no) => {
      const r = g.indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('k');
      r.onerror = () => no(r.error);
      r.onsuccess = () => { const t = r.result.transaction('k', 'readwrite'), st = t.objectStore('k'); const q = fn(st); t.oncomplete = () => ok(q && q.result); t.onerror = () => no(t.error); };
    });
  }
  // A chave deste telemovel: a guardada, ou uma nova (so quando `criar`).
  async function deviceKey(criar) {
    const d = await idb(st => st.get('device'));
    if (d && d.ed && d.x) return d;
    if (!criar) return null;
    const n = await deviceFromSeed(g.crypto.getRandomValues(new Uint8Array(32)));
    await idb(st => st.put(n, 'device'));
    return n;
  }
  const cache = { get: k => idb(st => st.get(k)), put: (k, v) => idb(st => st.put(v, k)), del: k => idb(st => st.delete(k)) };

  // ── chave de conta (catalog.rs: wrap_message) ─────────────────────────────────────────────────────────────
  async function verifyEd(pubHex, msg, sigHex) {
    try {
      const k = await subtle.importKey('raw', unhex(pubHex), { name: 'Ed25519' }, false, ['verify']);
      return await subtle.verify({ name: 'Ed25519' }, k, unhex(sigHex), msg);
    } catch { return false; }
  }
  async function accountKey(dev, { userId, deviceId, artistPub, rows }) {
    // A mais recente que este aparelho abre e que a chave de artista da conta assinou (forjada = ignorada).
    for (const r of [...rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).reverse()) {
      if (r.device_id !== deviceId) continue;
      const w = bytea(r.wrapped_key);
      const msg = te.encode(`fork-account-key:${userId}:${r.epoch_id}:${deviceId}:${hex(await sha256(w))}`);
      if (!(await verifyEd(artistPub, msg, r.wrapped_by_sig))) continue;
      try { const k = await unwrapFromDevice(dev, w); if (k.epoch === r.epoch_id) return k; } catch {}
    }
    return null;
  }

  // ── enderecos webrtc-direct e a ordem dos anfitrioes (placement.rs: score) ────────────────────────────────
  function webAddr(a) {
    const m = /^\/(ip4|ip6)\/([^/]+)\/udp\/(\d+)\/webrtc-direct\/certhash\/(u[A-Za-z0-9_-]+)$/.exec(a);
    if (!m) return null;
    const mh = b64u(m[4].slice(1));
    if (mh.length !== 34 || mh[0] !== 0x12 || mh[1] !== 0x20) return null;
    return { fam: m[1], ip: m[2], port: +m[3], fp: Array.from(mh.slice(2), b => b.toString(16).padStart(2, '0').toUpperCase()).join(':') };
  }
  async function score(cid, peer, uptime) {
    const h = await sha256(te.encode(`fork/swarm-place/v1|${cid}|${peer}`));
    let x = 0n; for (let i = 0; i < 8; i++) x = x * 256n + BigInt(h[i]);
    const u = (Number(x) + 1) / (2 ** 64 + 2), w = Math.min(1, Math.max(0.01, Number.isFinite(uptime) ? uptime : 0.01));
    return -w / Math.log(u);
  }

  // ── uma ligacao WebRTC direta a um anfitriao (swarm_web.rs) ──────────────────────────────────────────────
  const CANAL = 'fork-swarm/1';
  function rand(n) { const a = g.crypto.getRandomValues(new Uint8Array(n)); return btoa(String.fromCharCode(...a)).replace(/[+/=]/g, '').slice(0, n); }
  function answerSdp(w, ufrag, mid) {
    const f = w.fam === 'ip6' ? 'IP6' : 'IP4';
    return ['v=0', `o=- 0 0 IN ${f} ${w.ip}`, 's=-', 't=0 0', 'a=ice-lite', `a=group:BUNDLE ${mid}`,
      `m=application ${w.port} UDP/DTLS/SCTP webrtc-datachannel`, `c=IN ${f} ${w.ip}`, `a=mid:${mid}`,
      `a=ice-ufrag:${ufrag}`, `a=ice-pwd:${ufrag}`, `a=fingerprint:sha-256 ${w.fp}`, 'a=setup:passive',
      'a=sctp-port:5000', 'a=max-message-size:262144', `a=candidate:1 1 udp 2130706431 ${w.ip} ${w.port} typ host`,
      'a=end-of-candidates', ''].join('\r\n');
  }
  class HostLink {
    constructor(host, w, dev, cert, log) { Object.assign(this, { host, w, dev, cert, log }); this.n = 0; this.wait = new Map(); }
    async open(timeoutMs = 12000) {
      const pc = this.pc = new RTCPeerConnection({ iceServers: [] });
      const dc = this.dc = pc.createDataChannel(CANAL); dc.binaryType = 'arraybuffer';
      const ufrag = 'fsw1' + rand(28);
      const offer = await pc.createOffer();
      // O mesmo ufrag/pwd dos dois lados (o anfitriao so sabe o que o browser escolheu pelo pedido STUN).
      const sdp = offer.sdp.replace(/^a=ice-ufrag:.*$/mg, 'a=ice-ufrag:' + ufrag).replace(/^a=ice-pwd:.*$/mg, 'a=ice-pwd:' + ufrag);
      await pc.setLocalDescription({ type: 'offer', sdp });
      const mid = (/^a=mid:(.*)$/m.exec(sdp) || [, '0'])[1].trim();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp(this.w, ufrag, mid) });
      const msgs = [];
      let acorda = null;
      dc.onmessage = e => {
        if (typeof e.data === 'string') { let m; try { m = JSON.parse(e.data); } catch { return; } msgs.push(m); if (acorda) acorda(); return; }
        const v = new Uint8Array(e.data), id = new DataView(v.buffer, v.byteOffset, 4).getUint32(0), t = v[4], p = this.wait.get(id);
        if (!p) return;
        if (t === 0 || t === 1) { p.parts.push(v.slice(5)); if (t === 1) { this.wait.delete(id); p.ok(cat(...p.parts)); } }
        else { this.wait.delete(id); const txt = td.decode(v.subarray(5)); p.no(Object.assign(new Error(t === 2 ? 'not found' : t === 3 ? 'busy' : 'refused: ' + txt), { kind: t, detail: txt })); }
      };
      const fim = () => { for (const p of this.wait.values()) p.no(new Error('connection closed')); this.wait.clear(); this.closed = true; };
      dc.onclose = fim;
      pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) fim(); };
      const next = async () => {
        const t0 = Date.now();
        while (!msgs.length) {
          if (Date.now() - t0 > timeoutMs || this.closed) throw new Error('the host did not answer');
          await new Promise(r => { acorda = r; setTimeout(r, 250); });
        }
        return msgs.shift();
      };
      const hello = await next();
      if (hello.t !== 'hello' || !/^[0-9a-f]{64}$/.test(hello.nonce) || hello.peer !== this.host.peer_id) throw new Error('unexpected greeting from the host');
      const sig = new Uint8Array(await subtle.sign({ name: 'Ed25519' }, this.dev.ed, te.encode(`fork-swarm-web/1:${hello.nonce}:${hello.peer}`)));
      dc.send(JSON.stringify({ t: 'auth', cert: this.cert, pub: hex(this.dev.edPub), sig: hex(sig) }));
      const r = await next();
      if (r.t !== 'ok') throw new Error('the host refused this phone' + (r.reason ? ': ' + r.reason : ''));
      return this;
    }
    get(cid, timeoutMs = 60000) {
      if (this.closed) return Promise.reject(new Error('connection closed'));
      const id = ++this.n;
      return new Promise((ok, no) => {
        this.wait.set(id, { parts: [], ok, no });
        setTimeout(() => { if (this.wait.delete(id)) no(new Error('timed out')); }, timeoutMs);
        this.dc.send(JSON.stringify({ t: 'get', id, cid }));
      });
    }
    close() { try { this.pc.close(); } catch {} this.closed = true; }
  }

  // ── o leitor: catalogo → versao → ficheiros ─────────────────────────────────────────────────────────────
  // `cloud` = { userId, deviceId, artistPub, accountKeys(), userCatalog(), hosts(), cert }: o Supabase (so metadados e
  // embrulhos) ou, nos testes, um falso. `dev` = a chave deste aparelho.
  class Reader {
    constructor(dev, cloud, log = () => {}) { Object.assign(this, { dev, cloud, log }); this.links = new Map(); this.bad = new Set(); this.stats = { hosts: new Set(), bytes: 0 }; }
    async start() {
      this.ak = await accountKey(this.dev, { userId: this.cloud.userId, deviceId: this.cloud.deviceId, artistPub: this.cloud.artistPub, rows: await this.cloud.accountKeys() });
      if (!this.ak) throw Object.assign(new Error('This phone has no key for your Fork network yet.'), { code: 'no_account_key' });
      this.hosts = (await this.cloud.hosts()).map(h => ({ ...h, web: (h.addrs || []).map(webAddr).filter(Boolean) })).filter(h => h.web.length);
      return this;
    }
    async link(h) {
      if (this.links.has(h.peer_id)) { const l = await this.links.get(h.peer_id); if (l && !l.closed) return l; }
      const p = (async () => {
        let err;
        for (const w of h.web) {
          try { return await new HostLink(h, w, this.dev, this.cloud.cert, this.log).open(); } catch (e) { err = e; this.log('host ' + h.peer_id.slice(-6) + ' ' + w.ip + ': ' + e.message); }
        }
        throw err || new Error('no address');
      })();
      this.links.set(h.peer_id, p.catch(() => null));
      return p;
    }
    // Um bloco pelo cid, do primeiro anfitriao (por pontuacao) que o tiver; a cifra confere-se pelo cid.
    async fetch(cid) {
      const ord = await Promise.all(this.hosts.filter(h => !this.bad.has(h.peer_id)).map(async h => [await score(cid, h.peer_id, h.uptime), h]));
      ord.sort((a, b) => b[0] - a[0]);
      let ult;
      for (const [, h] of ord) {
        let l;
        try { l = await this.link(h); } catch (e) { this.bad.add(h.peer_id); ult = e; continue; }
        try {
          const b = await l.get(cid);
          if (hex(await sha256(b)) !== cid) { this.log('host ' + h.peer_id.slice(-6) + ' sent bytes that are not ' + cid.slice(0, 8)); continue; }
          this.stats.hosts.add(h.peer_id); this.stats.bytes += b.length;
          return b;
        } catch (e) { ult = e; }
      }
      throw Object.assign(new Error(this.hosts.length ? 'No device holding this part of your project can be reached right now.' : 'No device on the Fork network can be reached from this phone right now.'), { code: 'unreachable', cause: ult });
    }
    async catalog() {
      const uc = await this.cloud.userCatalog();
      if (!uc) return null;
      const ref = JSON.parse(td.decode(await openManifest(this.ak, 'fork-catalog/1:' + this.cloud.userId, bytea(uc.sealed_ref))));
      if (ref.cid !== uc.cid || Number(ref.seq) !== Number(uc.seq)) throw new Error('the catalogue reference does not match its row');
      const c = JSON.parse(td.decode(await openBlock(this.ak, unhex(ref.plain_sha256), await this.fetch(ref.cid))));
      if (c.schema !== 'fork-catalog/1' || Number(c.seq) !== Number(ref.seq)) throw new Error('the catalogue does not match its reference');
      return c;
    }
    keyFor(entry, epoch) {
      const k = entry.keys.find(k => k.epoch === epoch);
      if (!k) throw new Error('no key for epoch ' + epoch.slice(0, 8));
      return { epoch: k.epoch, key: unhex(k.key) };
    }
    // O manifesto da ultima versao de um projeto do catalogo: {version, cids}.
    async version(entry) {
      const mb = await this.fetch(entry.pointer.cid);
      const body = JSON.parse(td.decode(await openBlock(this.keyFor(entry, epochOf(mb)), unhex(entry.pointer.plain_sha256), mb)));
      if (!body.version || body.version.id !== entry.pointer.version_id) throw new Error('the swarm manifest is for another version');
      return body;
    }
    // Um ficheiro da versao, inteiro e conferido (blocos e o SHA-256 do todo). `onProgress(bytes, total)`.
    async file(entry, body, path, onProgress = () => {}) {
      const f = body.version.manifest.files.find(f => f.path === path);
      if (!f) throw new Error('no such file in this version');
      const parts = []; let n = 0;
      for (const c of f.chunks) {
        const cid = body.cids[c.sha256];
        if (!cid) throw new Error('the manifest has no cid for a block');
        const b = await this.fetch(cid);
        const p = await openBlock(this.keyFor(entry, epochOf(b)), unhex(c.sha256), b);
        if (p.length !== Number(c.size)) throw new Error('a block has the wrong size');
        parts.push(p); n += p.length; onProgress(n, Number(f.size));
      }
      const all = cat(...parts);
      if (all.length !== Number(f.size) || hex(await sha256(all)) !== f.sha256) throw new Error('the file does not match its SHA-256');
      return all;
    }
    close() { for (const p of this.links.values()) p.then(l => l && l.close()); this.links.clear(); }
  }

  g.ForkSwarm = { openBlock, openManifest, unwrapFromDevice, deviceFromSeed, deviceKey, supported, peerIdOf, accountKey, webAddr, answerSdp, score, Reader, cache, hex, unhex, bytea, sha256 };
})(globalThis);
