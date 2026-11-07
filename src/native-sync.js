/* FARPOP - sincronização em tempo real (Firebase Firestore) + recursos nativos do Android.
   Compilado por scripts/build.mjs para www/sync.bundle.js (expõe window.Sync e window.FarpopNative). */
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/* ======================= SINCRONIZAÇÃO ======================= */
const LS_KEY = 'farpop_sync';
const COLLECTION = 'farpop';
const PERMANENT = /permission-denied|operation-not-allowed|admin-restricted|invalid-api-key|api-key-not-valid/;

const bridge = () => window.SyncBridge;
const sig = o => JSON.stringify(o, (k, v) =>
  (v && typeof v === 'object' && !Array.isArray(v))
    ? Object.keys(v).sort().reduce((a, x) => (a[x] = v[x], a), {})
    : v);

let app = null, db = null, unsub = null, saved = null;
let pushTimer = null, retryTimer = null, pushing = false, again = false, lastStatus = 'off';

function status(s, extra) {
  lastStatus = s;
  try { const b = bridge(); b && b.onStatus && b.onStatus(s, extra); } catch (_) { /* ignora */ }
}
const loadCfg = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (_) { return null; } };
const storeCfg = v => { try { v ? localStorage.setItem(LS_KEY, JSON.stringify(v)) : localStorage.removeItem(LS_KEY); } catch (_) { /* ignora */ } };

function deviceId() {
  try {
    let d = localStorage.getItem('farpop_device');
    if (!d) { d = Math.random().toString(36).slice(2, 10); localStorage.setItem('farpop_device', d); }
    return d;
  } catch (_) { return 'x'; }
}

function parseConfig(text) {
  const cfg = {};
  const re = /["']?(apiKey|authDomain|projectId|storageBucket|messagingSenderId|appId|measurementId)["']?\s*:\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(text))) cfg[m[1]] = m[2];
  if (!cfg.apiKey || !cfg.projectId || !cfg.appId) {
    throw new Error('CONFIGURAÇÃO INVÁLIDA. COLE O BLOCO firebaseConfig COMPLETO (COM apiKey, projectId E appId).');
  }
  return cfg;
}
function genCode() {
  const a = new Uint8Array(20);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}
function decodePair(str) {
  try {
    const o = JSON.parse(atob(String(str).trim().replace(/^FARPOP1\./, '')));
    if (!o || !o.c || !o.k || !o.c.apiKey || !o.c.projectId) throw new Error('x');
    return o;
  } catch (_) {
    throw new Error('CÓDIGO DE PAREAMENTO INVÁLIDO. COPIE-O NOVAMENTE NO OUTRO APARELHO.');
  }
}

function stop() {
  if (unsub) { try { unsub(); } catch (_) { /* ignora */ } unsub = null; }
  clearTimeout(pushTimer); clearTimeout(retryTimer);
  if (app) { deleteApp(app).catch(() => {}); app = null; db = null; }
}

function onErr(e) {
  const code = (e && (e.code || e.message)) || 'erro';
  status(navigator.onLine ? 'error' : 'offline', code);
  clearTimeout(retryTimer);
  if (!PERMANENT.test(String(code))) retryTimer = setTimeout(() => { if (saved) start(); }, 30000);
}

async function start() {
  stop();
  saved = loadCfg();
  if (!saved) { status('off'); return { ok: false }; }
  status(navigator.onLine ? 'syncing' : 'offline');
  try {
    app = initializeApp(saved.cfg, 'farpop-' + Date.now());
    await signInAnonymously(getAuth(app));
    db = getFirestore(app);
    unsub = onSnapshot(doc(db, COLLECTION, saved.code), onRemote, onErr);
    return { ok: true };
  } catch (e) {
    onErr(e);
    return { ok: false, error: e };
  }
}

function onRemote(snap) {
  if (snap.metadata.hasPendingWrites) return;
  if (!snap.exists()) { schedulePush(0); return; }        // primeiro aparelho: cria o documento
  const B = bridge();
  let remote;
  try { remote = B.normalize(JSON.parse(snap.data().data)); }
  catch (_) { status('error', 'dados-invalidos'); return; }
  const local = B.getState();
  const merged = B.merge(local, remote);
  if (sig(merged) !== sig(local)) B.setState(merged);      // traz as mudanças dos outros aparelhos
  if (sig(merged) !== sig(remote)) schedulePush(300);      // há algo local que a nuvem ainda não tem
  else status('ok');
}

function schedulePush(ms = 500) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, ms);
}

async function push() {
  if (!db || !saved) return;
  if (pushing) { again = true; return; }
  pushing = true;
  status('syncing');
  try {
    const B = bridge();
    const ref = doc(db, COLLECTION, saved.code);
    let result = null;
    await runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      let remote = null;
      if (snap.exists()) { try { remote = B.normalize(JSON.parse(snap.data().data)); } catch (_) { remote = null; } }
      const local = B.getState();
      result = remote ? B.merge(local, remote) : local;
      tx.set(ref, { data: JSON.stringify(result), updatedAt: serverTimestamp(), by: deviceId() });
    });
    // Aplica o que veio da nuvem sem perder edições feitas enquanto a gravação rodava.
    const after = B.merge(B.getState(), result);
    if (sig(after) !== sig(B.getState())) B.setState(after);
    status('ok');
  } catch (e) {
    onErr(e);
  } finally {
    pushing = false;
    if (again) { again = false; schedulePush(200); }
  }
}

window.addEventListener('online', () => api.resume());
window.addEventListener('offline', () => status('offline'));

const api = {
  start,
  resume() {
    if (!loadCfg()) return;
    if (!db || lastStatus === 'error' || lastStatus === 'offline') start();
    else schedulePush(300);
  },
  push: () => schedulePush(600),
  info() {
    const s = loadCfg();
    return { connected: !!s, project: s ? s.cfg.projectId : '' };
  },
  async connectNew(text) {
    const cfg = parseConfig(String(text));
    storeCfg({ cfg, code: genCode() });
    return start();
  },
  async join(str) {
    const o = decodePair(str);
    storeCfg({ cfg: o.c, code: o.k });
    return start();
  },
  pairing() {
    const s = loadCfg();
    return s ? 'FARPOP1.' + btoa(JSON.stringify({ c: s.cfg, k: s.code })) : '';
  },
  async syncNow() { return start(); },
  disconnect() { stop(); saved = null; storeCfg(null); status('off'); },
};
window.Sync = api;

/* ======================= RECURSOS NATIVOS (ANDROID) ======================= */
const isNative = Capacitor.isNativePlatform();
const CHANNEL = 'farpop-lembretes';
let channelReady = false;

async function ensureChannel() {
  if (channelReady || Capacitor.getPlatform() !== 'android') return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL, name: 'Lembretes de retirada',
      description: 'Avisos de retiradas e renovação da receita', importance: 4, visibility: 1,
    });
    channelReady = true;
  } catch (_) { /* ignora */ }
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 2000000000) + 1;
}

window.FarpopNative = {
  isNative,
  async permission() {
    if (!isNative) return 'denied';
    const p = await LocalNotifications.checkPermissions();
    return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'default';
  },
  async request() {
    const p = await LocalNotifications.requestPermissions();
    return p.display === 'granted' ? 'granted' : 'denied';
  },
  /* Reagenda todos os lembretes: itens = [{ key, title, body, at(ms) }] */
  async schedule(items) {
    if (!isNative) return;
    await ensureChannel();
    const pend = await LocalNotifications.getPending();
    if (pend.notifications.length) await LocalNotifications.cancel({ notifications: pend.notifications });
    const used = new Set(), list = [];
    const now = Date.now();
    items.filter(i => i.at > now + 2000).sort((a, b) => a.at - b.at).slice(0, 400).forEach(it => {
      let id = hash(it.key);
      while (used.has(id)) id++;
      used.add(id);
      list.push({
        id, title: it.title, body: it.body, channelId: CHANNEL, smallIcon: 'ic_stat_icon',
        schedule: { at: new Date(it.at), allowWhileIdle: true },
      });
    });
    if (list.length) await LocalNotifications.schedule({ notifications: list });
  },
  async now(title, body) {
    await ensureChannel();
    await LocalNotifications.schedule({
      notifications: [{
        id: 2147483000, title, body, channelId: CHANNEL, smallIcon: 'ic_stat_icon',
        schedule: { at: new Date(Date.now() + 1500), allowWhileIdle: true },
      }],
    });
  },
  async saveFile(name, text) {
    const r = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: name, url: r.uri, dialogTitle: 'SALVAR / ENVIAR ARQUIVO' });
  },
  async shareText(text) {
    await Share.share({ text, dialogTitle: 'ENVIAR CÓDIGO DE PAREAMENTO' });
  },
};
