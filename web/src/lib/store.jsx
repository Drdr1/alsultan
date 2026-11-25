import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { LIVE, TERM_DAYS, DemoBackend, SupabaseBackend, analyzeCustomer, repSummary, KIND, money } from './core.js';
import { useToast } from '../components/ui.jsx';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const toast = useToast();
  const [api, setApi] = useState(null);
  const [boot, setBoot] = useState({ ready: false, error: '' });
  const [me, setMe] = useState(null);
  const [raw, setData] = useState({ agencies: [], profiles: [], customers: [], transactions: [] });
  const [agency, setAgencyState] = useState(() => { try { return sessionStorage.getItem('alsultan-agency') || 'all'; } catch { return 'all'; } });
  const setAgency = (a) => { setAgencyState(a); try { sessionStorage.setItem('alsultan-agency', a); } catch { /* storage blocked */ } };
  const [live, setLive] = useState('SUBSCRIBED');
  const [view, setView] = useState({ name: 'home' });
  const [stack, setStack] = useState([]);
  const [tick, setTick] = useState(0);
  const agencies = raw.agencies || [];
  // Admins always look at one agency at a time (no combined numbers across agencies).
  const activeAgency = me?.role !== 'admin' || !agencies.length ? 'all' : (agencies.some((a) => a.id === agency) ? agency : agencies[0].id);
  // Admin can narrow every page to one agency: filter the data once, here.
  const data = useMemo(() => {
    if (activeAgency === 'all') return raw;
    const profiles = raw.profiles.filter((p) => p.role === 'admin' || p.agency_id === activeAgency);
    const repIds = new Set(profiles.filter((p) => p.role === 'rep').map((p) => p.id));
    return { ...raw, profiles, customers: raw.customers.filter((c) => repIds.has(c.rep_id)), transactions: raw.transactions.filter((t) => repIds.has(t.rep_id)) };
  }, [raw, activeAgency]);
  const agencyName = useCallback((id) => agencies.find((a) => a.id === id)?.name || '', [agencies]);
  const meRef = useRef(null); meRef.current = me;
  const dataRef = useRef(data); dataRef.current = data;
  const notified = useRef(new Set());

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
                toast(`${who}: ${KIND[evt.row.kind]} ${money(Math.abs(evt.row.amount))} ج.م${c ? ' · ' + c.name : ''}`, 'live');
              }, 300);
            }
          }
          if (evt?.type === 'RESET') { setView({ name: 'home' }); setStack([]); }
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
    return new Map(data.customers.map((c) => [c.id, analyzeCustomer(c, data.transactions, now)]));
  }, [data, tick]);

  const reps = useMemo(() => data.profiles.filter((p) => p.role === 'rep'), [data.profiles]);
  const overdue = useMemo(() => data.customers.filter((c) => stats.get(c.id)?.overdue).sort((a, b) => stats.get(b.id).overdueDays - stats.get(a.id).overdueDays), [data.customers, stats]);
  const nameOf = useCallback((id) => data.profiles.find((p) => p.id === id)?.full_name || (id === me?.id ? me?.full_name : '—'), [data.profiles, me]);
  const summaryOf = useCallback((rep) => repSummary(rep, data.customers, stats), [data.customers, stats]);

  useEffect(() => {
    if (!me || !('Notification' in window) || Notification.permission !== 'granted') return;
    const fresh = overdue.filter((c) => !notified.current.has(c.id));
    if (!fresh.length) return;
    fresh.forEach((c) => notified.current.add(c.id));
    try { new Notification('السلطان: عملاء متأخرين', { body: fresh.slice(0, 3).map((c) => c.name).join('، ') + ` تجاوزوا ${TERM_DAYS} يوم` }); } catch { /* blocked */ }
  }, [overdue, me]);

  const go = (v) => { setStack((s) => [...s, view]); setView(v); window.scrollTo({ top: 0 }); };
  const back = () => { setStack((s) => { const n = [...s]; setView(n.pop() || { name: 'home' }); return n; }); };
  const nav = (name) => { setView({ name }); setStack([]); window.scrollTo({ top: 0 }); };

  const signIn = async (u, p) => { const m = await api.signIn(u, p); setMe(m); setView({ name: 'home' }); setStack([]); await reload(); };
  const signOut = async () => { await api.signOut(); setMe(null); setData({ agencies: [], profiles: [], customers: [], transactions: [] }); setView({ name: 'home' }); setStack([]); };

  const value = { api, boot, me, data, raw, agencies, agency: activeAgency, setAgency, agencyName, stats, reps, overdue, live, view, stack, go, back, nav, signIn, signOut, reload, nameOf, summaryOf, toast };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
