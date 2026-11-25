/* App-like install + notifications (PWA). */
let regP = null;
let installEvt = null;
const subs = new Set();
const ping = () => subs.forEach((f) => f());

export function initPWA() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    regP = navigator.serviceWorker.register('./sw.js').catch(() => null);
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; ping(); });
  window.addEventListener('appinstalled', () => { installEvt = null; ping(); });
  navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.type === 'open') openTarget(e.data.url); });
  window.addEventListener('hashchange', () => openTarget(location.hash));
}
export const onPWAChange = (f) => { subs.add(f); return () => subs.delete(f); };
export const canInstall = () => !!installEvt;
export async function install() { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => null); installEvt = null; ping(); }

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
export const permission = () => ('Notification' in window ? Notification.permission : 'unsupported');

// url: where tapping the notification should go, e.g. '#customer=c-5' or '#overdue'.
export async function notify(title, body, tag, url = '') {
  if (permission() !== 'granted') return;
  const opts = { body, icon: './icon-192.png', badge: './icon-192.png', dir: 'rtl', lang: 'ar', tag, data: { url } };
  try { const reg = regP && (await regP); if (reg) { await reg.showNotification(title, opts); return; } } catch { /* fall back */ }
  try { const n = new Notification(title, opts); n.onclick = () => { window.focus(); openTarget(url); n.close(); }; } catch { /* blocked */ }
}

/* Deep links from notifications: '#customer=<id>' or '#overdue'. */
const targetSubs = new Set();
let pendingTarget = location.hash.length > 1 ? location.hash : '';
export function openTarget(url) { const h = String(url || '').replace(/^[^#]*/, ''); if (!h) return; pendingTarget = h; targetSubs.forEach((f) => f()); }
export function takeTarget() { const t = pendingTarget; pendingTarget = ''; if (location.hash) history.replaceState(null, '', location.pathname + location.search); return t; }
export const peekTarget = () => pendingTarget;
export const onTarget = (f) => { targetSubs.add(f); return () => targetSubs.delete(f); };

export async function enableNotifications() {
  if (!('Notification' in window)) return 'unsupported';
  const p = await Notification.requestPermission();
  ping();
  if (p === 'granted') notify('الإشعارات اشتغلت', '', 'welcome');
  return p;
}
