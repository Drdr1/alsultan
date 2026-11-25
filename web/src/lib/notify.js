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
}
export const onPWAChange = (f) => { subs.add(f); return () => subs.delete(f); };
export const canInstall = () => !!installEvt;
export async function install() { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => null); installEvt = null; ping(); }

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
export const permission = () => ('Notification' in window ? Notification.permission : 'unsupported');

export async function notify(title, body, tag) {
  if (permission() !== 'granted') return;
  const opts = { body, icon: './icon-192.png', badge: './icon-192.png', dir: 'rtl', lang: 'ar', tag };
  try { const reg = regP && (await regP); if (reg) { await reg.showNotification(title, opts); return; } } catch { /* fall back */ }
  try { new Notification(title, opts); } catch { /* blocked */ }
}

export async function enableNotifications() {
  if (!('Notification' in window)) return 'unsupported';
  const p = await Notification.requestPermission();
  ping();
  if (p === 'granted') notify('الإشعارات اشتغلت', 'هيوصلك تنبيه لما عميل يعدّي مدة الأجل أو يتسجل تحصيل جديد.', 'welcome');
  return p;
}
