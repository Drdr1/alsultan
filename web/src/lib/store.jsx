import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { LIVE, TERM_DAYS, DemoBackend, SupabaseBackend, analyzeCustomer, repSummary, KIND, money, isOwner, hasPerm, dayKey, openDay, unclosedDay } from './core.js';
import { useToast } from '../components/ui.jsx';
import { notify, permission, onTarget, peekTarget, takeTarget } from './notify.js';

export const IDLE_HOUR = 19; // 7 PM: time to warn about reps with no activity today

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const toast = useToast();
  const [api, setApi] = useState(null);
  const [boot, setBoot] = useState({ ready: false, error: '' });
  const [me, setMe] = useState(null);
  const [raw, setData] = useState({ agencies: [], profiles: [], customers: [], transactions: [], closings: [] });
  const [agency, setAgencyState] = useState(() => { try { return sessionStorage.getItem('alsultan-agency') || 'all'; } catch { return 'all'; } });
  const setAgency = (a) => { setAgencyState(a); try { sessionStorage.setItem('alsultan-agency', a); } catch { /* storage blocked */ } };
  const [live, setLive] = useState('SUBSCRIBED');
  const [view, setView] = useState({ name: 'home' });
  const [stack, setStack] = useState([]);
  const [tick, setTick] = useState(0);
  // Owner (Sayed, Mohamed): every agency. Manager: only the agencies in the scopes an owner gave him.
  const owner = isOwner(me);
  const scopeKey = JSON.stringify(me?.scopes || []);
  const agencies = useMemo(() => (raw.agencies || []).filter((a) => owner || me?.role !== 'admin' || (me.scopes || []).some((x) => x.agency_id === a.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raw.agencies, owner, me?.role, scopeKey]);
  // Admins always look at one agency at a time (no combined numbers across agencies).
  const activeAgency = me?.role !== 'admin' || !agencies.length ? 'all' : (agencies.some((a) => a.id === agency) ? agency : agencies[0].id);
  // Admin can narrow every page to one agency: filter the data once, here.
  const data = useMemo(() => {
    const live = (c) => c.status !== 'rejected'; // refused coding requests disappear from the lists
    const closings = raw.closings || [];
    if (activeAgency === 'all') return { ...raw, closings, customers: raw.customers.filter(live) };
    const profiles = raw.profiles.filter((p) => p.role === 'admin' || p.agency_id === activeAgency);
    const repIds = new Set(profiles.filter((p) => p.role === 'rep').map((p) => p.id));
    return { ...raw, profiles, customers: raw.customers.filter((c) => live(c) && repIds.has(c.rep_id)), transactions: raw.transactions.filter((t) => repIds.has(t.rep_id)), closings: closings.filter((x) => repIds.has(x.rep_id)) };
  }, [raw, activeAgency]);
  const agencyName = useCallback((id) => agencies.find((a) => a.id === id)?.name || '', [agencies]);
  const meRef = useRef(null); meRef.current = me;
  const dataRef = useRef(data); dataRef.current = data;
  // Remember which overdue customers we already notified about today (once a day each).
  const NKEY = 'alsultan-notified-' + new Date().toISOString().slice(0, 10);
  const notified = useRef(new Set((() => { try { return JSON.parse(localStorage.getItem(NKEY)) || []; } catch { return []; } })()));

  const reload = useCallback(async (a = api) => {
    if (!a) return;
    const d = await a.loadAll();
    setData(d);
    const fresh = d.profiles.find((p) => p.id === meRef.current?.id);
    if (fresh) setMe(fresh);
  }, [api]);

  useEffect(() => {
    let timer;
    (async () => {
      try {
        const a = LIVE ? await SupabaseBackend() : DemoBackend();
        a.onChange((evt) => {
          if (evt?.type === 'STATUS') return setLive(evt.status);
          if (!meRef.current) return;
          if (evt?.remote && evt.table === 'transactions' && evt.type === 'INSERT' && evt.row && evt.row.created_by !== meRef.current.id) {
            const m = meRef.current;
            if (m.role === 'admin' || evt.row.rep_id === m.id) {
              setTimeout(() => {
                const d = dataRef.current;
                const c = d.customers.find((x) => x.id === evt.row.customer_id);
                const who = d.profiles.find((p) => p.id === evt.row.created_by)?.full_name || '';
                const msg = `${who}: ${KIND[evt.row.kind]} ${money(Math.abs(evt.row.amount))} ج.م${c ? ' · ' + c.name : ''}`;
                toast(msg, 'live'); // in-app only: no phone notification per collection
              }, 300);
            }
          }
          if (evt?.type === 'RESET') { setView({ name: 'home' }); setStack([]); notified.current.clear(); try { localStorage.removeItem(NKEY); } catch { /* storage blocked */ } }
          clearTimeout(timer); timer = setTimeout(() => reload(a).catch((e) => toast(e.message, 'err')), 120);
        });
        setApi(a);
        const m = await a.session();
        if (m) { setMe(m); await reload(a); }
        setBoot({ ready: true, error: '' });
      } catch (e) { setBoot({ ready: true, error: e.message }); }
    })();
    const iv = setInterval(() => setTick((t) => t + 1), 10 * 60 * 1000); // re-check the 15-day rule
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const now = Date.now();
    return new Map(raw.customers.map((c) => [c.id, analyzeCustomer(c, raw.transactions, now)]));
  }, [raw, tick]);

  const reps = useMemo(() => data.profiles.filter((p) => p.role === 'rep'), [data.profiles]);
  const overdue = useMemo(() => data.customers.filter((c) => stats.get(c.id)?.overdue).sort((a, b) => stats.get(b.id).overdueDays - stats.get(a.id).overdueDays), [data.customers, stats]);
  const nameOf = useCallback((id) => data.profiles.find((p) => p.id === id)?.full_name || (id === me?.id ? me?.full_name : '—'), [data.profiles, me]);
  const summaryOf = useCallback((rep) => repSummary(rep, data.customers, stats), [data.customers, stats]);

  // Phone notifications, only for two things (across every agency this user can see, whatever agency is on screen):
  // a customer passing the credit term, and a rep going over his credit limit. Once a day each.
  const overdueAll = useMemo(() => raw.customers.filter((c) => stats.get(c.id)?.overdue), [raw.customers, stats]);
  const overLimit = useMemo(() => raw.profiles.filter((p) => p.role === 'rep' && p.active).map((r) => ({ r, s: repSummary(r, raw.customers, stats) })).filter((x) => x.s.over), [raw.profiles, raw.customers, stats]);
  // Reps who logged no invoice and no collection today (checked from IDLE_HOUR in the evening).
  const idleReps = useMemo(() => {
    const now = new Date(); if (now.getHours() < IDLE_HOUR) return [];
    const today = dayKey(now);
    const busy = new Set(raw.transactions.filter((t) => (t.kind === 'invoice' || t.kind === 'collection') && dayKey(t.created_at) === today).map((t) => t.rep_id));
    return raw.profiles.filter((p) => p.role === 'rep' && p.active && !busy.has(p.id));
  }, [raw, stats]);
  // Reps whose open day started before today (didn't close yesterday). Not blocked, just reported.
  const unclosedReps = useMemo(() => raw.profiles.filter((p) => p.role === 'rep' && p.active).map((r) => ({ r, day: unclosedDay(raw.closings, raw.transactions, r.id) })).filter((x) => x.day), [raw]);
  useEffect(() => {
    if (!me || me.role !== 'admin' || permission() !== 'granted') return;
    const fresh = unclosedReps.filter((x) => !notified.current.has('unc-' + x.r.id + x.day));
    if (!fresh.length) return;
    fresh.forEach((x) => notified.current.add('unc-' + x.r.id + x.day));
    try { localStorage.setItem(NKEY, JSON.stringify([...notified.current])); } catch { /* storage blocked */ }
    if (fresh.length <= 3) fresh.forEach((x) => notify(`${x.r.full_name} مقفلش يومه`, 'اليوم مفتوح من ' + x.day, 'unc-' + x.r.id, '#rep=' + x.r.id));
    else notify(`${fresh.length} مناديب مقفلوش يومهم`, fresh.map((x) => x.r.full_name).join('، '), 'unc', '#report');
  }, [unclosedReps, me]);
  useEffect(() => {
    if (!me || me.role !== 'admin' || permission() !== 'granted') return;
    const fresh = idleReps.filter((r) => !notified.current.has('idle-' + r.id));
    if (!fresh.length) return;
    fresh.forEach((r) => notified.current.add('idle-' + r.id));
    try { localStorage.setItem(NKEY, JSON.stringify([...notified.current])); } catch { /* storage blocked */ }
    if (fresh.length <= 3) fresh.forEach((r) => notify(`${r.full_name} مسجلش أي حركة النهارده`, 'لا فواتير ولا تحصيلات من الصبح', 'idle-' + r.id, '#rep=' + r.id));
    else notify(`${fresh.length} مناديب مسجلوش حركة النهارده`, fresh.map((r) => r.full_name).join('، '), 'idle', '#report');
  }, [idleReps, me]);

  useEffect(() => {
    if (!me || permission() !== 'granted') return;
    const mark = (k) => { if (notified.current.has(k)) return false; notified.current.add(k); return true; };
    const freshReps = overLimit.filter(({ r }) => mark('rep-' + r.id));
    const fresh = overdueAll.filter((c) => mark(c.id));
    if (!fresh.length && !freshReps.length) return;
    try { localStorage.setItem(NKEY, JSON.stringify([...notified.current])); } catch { /* storage blocked */ }
    freshReps.forEach(({ r, s }) => {
      const mine = r.id === me.id;
      notify(mine ? 'عدّيت حد الائتمان بتاعك' : `${r.full_name} عدّى حد الائتمان`, `المديونية ${money(s.total)} ج.م والحد ${money(s.limit)} ج.م`, 'limit-' + r.id, mine ? '' : '#rep=' + r.id);
    });
    // One notification per customer (tap opens that customer); a summary if there are many.
    if (fresh.length <= 4) fresh.forEach((c) => { const s = stats.get(c.id); notify(`${c.name} متأخر ${s.overdueDays} يوم`, `عليه ${money(s.balance)} ج.م وعدّى مدة الأجل (${TERM_DAYS} يوم)`, 'overdue-' + c.id, '#customer=' + c.id); });
    else notify(`${fresh.length} عملاء متأخرين`, fresh.slice(0, 3).map((c) => c.name).join('، ') + ` و${fresh.length - 3} غيرهم عدّوا ${TERM_DAYS} يوم`, 'overdue', '#overdue');
  }, [overdueAll, overLimit, me]);

  // Open the page a tapped notification points to (once the data is loaded).
  const [targetTick, setTargetTick] = useState(0);
  useEffect(() => onTarget(() => setTargetTick((n) => n + 1)), []);
  useEffect(() => {
    if (!me || !raw.customers.length || !peekTarget()) return;
    const t = takeTarget();
    const m = /^#customer=(.+)$/.exec(t);
    if (m) {
      const c = raw.customers.find((x) => x.id === decodeURIComponent(m[1]));
      if (!c) return;
      const rep = raw.profiles.find((p) => p.id === c.rep_id);
      if (me.role === 'admin' && rep?.agency_id) setAgency(rep.agency_id);
      setStack([{ name: 'overdue' }]); setView({ name: 'customer', id: c.id }); window.scrollTo({ top: 0 });
    } else if (/^#rep=/.test(t)) {
      const r = raw.profiles.find((p) => p.id === decodeURIComponent(t.slice(5)));
      if (!r || me.role !== 'admin') return;
      if (r.agency_id) setAgency(r.agency_id);
      setStack([{ name: 'reps' }]); setView({ name: 'rep', id: r.id }); window.scrollTo({ top: 0 });
    } else if (t === '#report') { setStack([]); setView({ name: 'report' }); window.scrollTo({ top: 0 });
    } else if (t === '#overdue') { setStack([]); setView({ name: 'overdue' }); window.scrollTo({ top: 0 }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, raw, targetTick]);

  const go = (v) => { setStack((s) => [...s, view]); setView(v); window.scrollTo({ top: 0 }); };
  const back = () => { setStack((s) => { const n = [...s]; setView(n.pop() || { name: 'home' }); return n; }); };
  const nav = (name) => { setView({ name }); setStack([]); window.scrollTo({ top: 0 }); };

  const signIn = async (u, p) => { const m = await api.signIn(u, p); setMe(m); setView({ name: 'home' }); setStack([]); await reload(); };
  const signOut = async () => { await api.signOut(); setMe(null); setData({ agencies: [], profiles: [], customers: [], transactions: [], closings: [] }); setView({ name: 'home' }); setStack([]); };

  const can = useCallback((k) => hasPerm(me, k), [me]);
  const myDay = me?.role === 'rep' ? openDay(raw.closings, raw.transactions, me.id) : null;
  const value = { api, boot, me, owner, can, myDay, overLimit, idleReps, unclosedReps, data, raw, agencies, agency: activeAgency, setAgency, agencyName, stats, reps, overdue, live, view, stack, go, back, nav, signIn, signOut, reload, nameOf, summaryOf, toast };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
