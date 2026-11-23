'use strict';
/* السلطان للتوزيع - نظام مديونيات المناديب */

const CFG = window.APP_CONFIG || {};
const TERM_DAYS = Number(CFG.termDays) || 15;
const DAY = 86400000;
const LIVE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);

/* ---------------- helpers ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
const egp = (n) => `${money(n)} <span class="cur">ج.م</span>`;
const dFmt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' });
const dtFmt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const mFmt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { year: 'numeric', month: 'long' });
const fmtDate = (d) => dFmt.format(new Date(d));
const fmtDT = (d) => dtFmt.format(new Date(d));
const monthKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
const monthLabel = (k) => { const [y, m] = k.split('-').map(Number); return mFmt.format(new Date(y, m - 1, 1)); };
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
const parseAmount = (s) => {
  const t = String(s ?? '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٫]/g, '.').replace(/[,،\s]/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};
const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
const KIND = { opening: 'رصيد افتتاحي', invoice: 'فاتورة آجل', collection: 'تحصيل', correction: 'تصحيح' };
const TYPE = { retail: 'قطاعي', wholesale: 'جملة' };

/* ---------------- domain logic ---------------- */
function effect(t) {
  if (t.status !== 'approved') return 0;
  return t.kind === 'collection' ? -Number(t.amount) : Number(t.amount);
}

// FIFO: collections pay the oldest debt first. The oldest unpaid part decides overdue.
function analyzeCustomer(c, txs, now = Date.now()) {
  const list = txs.filter((t) => t.customer_id === c.id).sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at) || new Date(a.created_at) - new Date(b.created_at));
  let balance = 0, credit = 0, monthCollected = 0, lastCollection = null;
  const debits = [];
  const mk = monthKey(now);
  for (const t of list) {
    const e = effect(t);
    balance += e;
    if (e > 0) debits.push({ at: new Date(t.occurred_at).getTime(), left: e });
    else if (e < 0) credit += -e;
    if (t.kind === 'collection' && t.status === 'approved') {
      if (monthKey(t.occurred_at) === mk) monthCollected += Number(t.amount);
      lastCollection = t.occurred_at;
    }
  }
  for (const d of debits) { const use = Math.min(d.left, credit); d.left -= use; credit -= use; }
  const open = debits.filter((d) => d.left > 0.009);
  const oldest = open.length ? open[0].at : null;
  const age = oldest == null ? null : Math.floor((startOfDay(now) - startOfDay(oldest)) / DAY) + 1; // day 1 = invoice day
  const overdue = balance > 0.009 && age != null && age > TERM_DAYS;
  return {
    balance: Math.round(balance * 100) / 100,
    monthCollected, lastCollection, list,
    oldestOpen: oldest, age, overdue,
    overdueDays: overdue ? age - TERM_DAYS : 0,
    dueDate: oldest == null ? null : oldest + (TERM_DAYS - 1) * DAY, // last day of the term
    pending: list.filter((t) => t.status === 'pending').length,
  };
}

function repSummary(rep, customers, stats) {
  const mine = customers.filter((c) => c.rep_id === rep.id);
  let total = 0, month = 0, overdue = 0, retail = 0, wholesale = 0;
  for (const c of mine) {
    const s = stats.get(c.id);
    total += s.balance; month += s.monthCollected; if (s.overdue) overdue++;
    if (c.debt_type === 'wholesale') wholesale += s.balance; else retail += s.balance;
  }
  const limit = Number(rep.credit_limit) || 0;
  return { customers: mine, total, month, overdue, retail, wholesale, limit, over: total > limit, pct: limit ? total / limit : (total > 0 ? 2 : 0) };
}

/* ---------------- demo backend (local, realtime across tabs) ---------------- */
function demoSeed() {
  const now = Date.now();
  const at = (daysAgo, h = 11) => { const d = new Date(now - daysAgo * DAY); d.setHours(h, 15, 0, 0); return d.toISOString(); };
  const profiles = [
    { id: 'u-sayed', username: 'sayed', full_name: 'سيد', role: 'admin', credit_limit: 0, active: true, created_at: at(120) },
    { id: 'u-mohamed', username: 'mohamed', full_name: 'محمد', role: 'admin', credit_limit: 0, active: true, created_at: at(120) },
    { id: 'u-ahmed', username: 'ahmed', full_name: 'أحمد عبد العزيز', role: 'rep', credit_limit: 1000000, active: true, created_at: at(100) },
    { id: 'u-mahmoud', username: 'mahmoud', full_name: 'محمود السيد', role: 'rep', credit_limit: 500000, active: true, created_at: at(100) },
    { id: 'u-karim', username: 'karim', full_name: 'كريم فتحي', role: 'rep', credit_limit: 200000, active: true, created_at: at(100) },
    { id: 'u-youssef', username: 'youssef', full_name: 'يوسف رمضان', role: 'rep', credit_limit: 0, active: false, created_at: at(1) },
  ];
  const passwords = Object.fromEntries(profiles.map((p) => [p.username, '1234']));
  // [rep, name, phone, location, type, weekly invoice, pay ratio]
  const shops = [
    ['u-ahmed', 'سوبر ماركت أبو الوفا', '01001234567', 'الأربعين - ش الجيش', 'wholesale', 52000, 1],
    ['u-ahmed', 'كشك الحاج سعيد', '01112345678', 'الأربعين - ميدان الشهداء', 'retail', 9000, 1],
    ['u-ahmed', 'ماركت النور', '01223456789', 'فيصل - ش 23 يوليو', 'retail', 21000, 0.62],
    ['u-ahmed', 'صيدلية الشفاء', '01098765432', 'السلام - المرحلة الأولى', 'retail', 14000, 1],
    ['u-ahmed', 'مخازن الإخلاص', '01287654321', 'عتاقة - المنطقة الصناعية', 'wholesale', 78000, 1],
    ['u-ahmed', 'بقالة أم هاشم', '01555443322', 'الجناين - عزبة الشلوفة', 'retail', 7000, 0.7],
    ['u-ahmed', 'هايبر الفتح', '01033221100', 'حي السويس - ش صدقي', 'wholesale', 46000, 1],
    ['u-mahmoud', 'كشك عم رضا', '01144556677', 'فيصل - مساكن السلام', 'retail', 6000, 1],
    ['u-mahmoud', 'ماركت الرحمة', '01266778899', 'الأربعين - ش النيل', 'retail', 18000, 1],
    ['u-mahmoud', 'سوبر ماركت المدينة', '01011223344', 'حي الغريب', 'wholesale', 41000, 0.68],
    ['u-mahmoud', 'بقالة الأمانة', '01577889900', 'السلام 2', 'retail', 8500, 1],
    ['u-mahmoud', 'صيدلية د. منى', '01199887766', 'فيصل - ش الشهيد', 'retail', 12000, 1],
    ['u-mahmoud', 'ماركت أولاد الشيخ', '01200112233', 'عتاقة - مساكن عتاقة', 'wholesale', 33000, 1],
    ['u-karim', 'كشك الصفا', '01022334455', 'الجناين - كبريت', 'retail', 5000, 0.5],
    ['u-karim', 'ماركت البركة', '01133445566', 'الجناين - الشلوفة', 'retail', 10000, 0.65],
    ['u-karim', 'سوبر ماركت الهدى', '01244556677', 'عتاقة - الأدبية', 'wholesale', 15000, 0.7],
    ['u-karim', 'بقالة الحرمين', '01555667788', 'الجناين - جنيفة', 'retail', 4500, 1],
    ['u-karim', 'ماركت السلطان الصغير', '01066778899', 'الجناين - عامر', 'retail', 6000, 1],
  ];
  const customers = [], transactions = [];
  let seedR = 7;
  const rnd = () => { seedR = (seedR * 16807) % 2147483647; return seedR / 2147483647; };
  const round = (n) => Math.round(n / 50) * 50;
  shops.forEach(([rep, name, phone, location, type, weekly, ratio], i) => {
    const id = 'c-' + (i + 1);
    customers.push({ id, rep_id: rep, name, phone, location, debt_type: type, created_at: at(84, 9), created_by: rep });
    const debts = [];
    const opening = round(weekly * (1.4 + rnd()));
    debts.push(opening);
    transactions.push({ id: uid(), customer_id: id, rep_id: rep, kind: 'opening', amount: opening, note: 'رصيد افتتاحي', status: 'approved', occurred_at: at(84, 9), created_at: at(84, 9), created_by: rep });
    for (let d = 77, w = 1; d >= 0; d -= 7, w++) {
      const prev = debts[w - 2] || 0;
      const pay = round(prev * ratio * (ratio < 1 ? 0.9 + rnd() * 0.2 : 1));
      if (pay > 0) transactions.push({ id: uid(), customer_id: id, rep_id: rep, kind: 'collection', amount: pay, note: '', status: 'approved', occurred_at: at(d, 10 + (i % 6)), created_at: at(d, 10 + (i % 6)), created_by: rep });
      {
        const inv = round(weekly * (0.75 + rnd() * 0.5));
        debts.push(inv);
        transactions.push({ id: uid(), customer_id: id, rep_id: rep, kind: 'invoice', amount: inv, note: 'فاتورة رقم ' + (1000 + i * 20 + w), status: 'approved', occurred_at: at(d, d ? 12 + (i % 5) : 8), created_at: at(d, d ? 12 + (i % 5) : 8), created_by: rep });
      }
    }
  });
  // one pending correction request for the demo
  const c3 = customers[2];
  transactions.push({ id: uid(), customer_id: c3.id, rep_id: c3.rep_id, kind: 'correction', amount: -2000, note: 'العميل دفع 2000 امبارح ونسيت أسجلها - أكد معاه بالتليفون', status: 'pending', occurred_at: at(0, 9), created_at: at(0, 9), created_by: c3.rep_id });
  return { v: 1, profiles, passwords, customers, transactions };
}

function DemoBackend() {
  const KEY = 'alsultan-demo-v1';
  const SKEY = 'alsultan-demo-session';
  let memSession = null;
  let db = safe(() => JSON.parse(localStorage.getItem(KEY)), null) || demoSeed();
  const persist = () => safe(() => localStorage.setItem(KEY, JSON.stringify(db)));
  persist();
  const ch = 'BroadcastChannel' in window ? new BroadcastChannel(KEY) : null;
  const listeners = [];
  const emit = (evt, remote) => listeners.forEach((f) => f({ ...evt, remote }));
  if (ch) ch.onmessage = (e) => { if (e.data?.db) db = e.data.db; emit(e.data.evt, true); };
  window.addEventListener('storage', (e) => { if (e.key === KEY && e.newValue) { db = safe(() => JSON.parse(e.newValue), db); } });
  const commit = (evt) => { persist(); ch?.postMessage({ evt, db }); emit(evt, false); };

  const me = () => {
    const id = safe(() => sessionStorage.getItem(SKEY), null) ?? memSession;
    return db.profiles.find((p) => p.id === id) || null;
  };
  const setSession = (id) => { memSession = id; safe(() => (id ? sessionStorage.setItem(SKEY, id) : sessionStorage.removeItem(SKEY))); };
  const requireActive = () => { const m = me(); if (!m || !m.active) throw new Error('الحساب غير مفعل'); return m; };
  const balOf = (pred) => db.transactions.filter((t) => t.status === 'approved' && pred(t)).reduce((s, t) => s + effect(t), 0);

  function insertTx(input) {
    const m = requireActive();
    const cust = db.customers.find((c) => c.id === input.customer_id);
    if (!cust) throw new Error('العميل غير موجود');
    if (m.role !== 'admin' && cust.rep_id !== m.id) throw new Error('العميل ده مش بتاعك');
    const amount = Number(input.amount);
    if (!amount || (input.kind !== 'correction' && amount <= 0)) throw new Error('اكتب مبلغ صحيح');
    const nowIso = new Date().toISOString();
    let occurred = nowIso;
    if (input.kind === 'opening' && input.occurred_at) {
      const t = Math.min(Date.now(), Math.max(new Date(input.occurred_at).getTime(), Date.now() - 365 * DAY));
      occurred = new Date(t).toISOString();
    }
    if (input.kind === 'opening' && db.transactions.some((t) => t.customer_id === cust.id && t.kind === 'opening')) throw new Error('الرصيد الافتتاحي متسجل قبل كده');
    if (input.kind === 'collection') {
      const bal = balOf((t) => t.customer_id === cust.id);
      if (amount > bal + 0.001) throw new Error(`المبلغ (${money(amount)}) أكبر من مديونية العميل (${money(bal)})`);
    }
    if (input.kind === 'invoice') {
      const rep = db.profiles.find((p) => p.id === cust.rep_id);
      const bal = balOf((t) => t.rep_id === cust.rep_id);
      if (bal + amount > Number(rep.credit_limit)) throw new Error(`مرفوض: المديونية هتبقى ${money(bal + amount)} وحد الائتمان ${money(rep.credit_limit)}`);
    }
    const isAdmin = m.role === 'admin';
    const tx = {
      id: uid(), customer_id: cust.id, rep_id: cust.rep_id, kind: input.kind, amount,
      note: (input.note || '').trim(), corrects_id: input.corrects_id || null,
      status: input.kind === 'correction' && !isAdmin ? 'pending' : 'approved',
      occurred_at: occurred, created_at: nowIso, created_by: m.id,
      reviewed_by: input.kind === 'correction' && isAdmin ? m.id : null,
      reviewed_at: input.kind === 'correction' && isAdmin ? nowIso : null,
    };
    db.transactions.push(tx);
    return tx;
  }

  return {
    mode: 'demo',
    async session() { return me(); },
    async signIn(username, password) {
      const u = String(username).trim().toLowerCase();
      const p = db.profiles.find((x) => x.username === u);
      if (!p || db.passwords[u] !== password) throw new Error('اسم المستخدم أو كلمة المرور غلط');
      setSession(p.id);
      return p;
    },
    async signUp(username, password, fullName) {
      const u = String(username).trim().toLowerCase();
      if (db.profiles.some((x) => x.username === u)) throw new Error('اسم المستخدم ده موجود');
      const p = { id: 'u-' + uid(), username: u, full_name: fullName, role: 'rep', credit_limit: 0, active: false, created_at: new Date().toISOString() };
      db.profiles.push(p); db.passwords[u] = password;
      commit({ table: 'profiles', type: 'INSERT', row: p });
    },
    async signOut() { setSession(null); },
    async loadAll() {
      const m = me(); if (!m) return { profiles: [], customers: [], transactions: [] };
      if (m.role === 'admin') return structuredClone({ profiles: db.profiles, customers: db.customers, transactions: db.transactions });
      return structuredClone({ profiles: [m], customers: db.customers.filter((c) => c.rep_id === m.id), transactions: db.transactions.filter((t) => t.rep_id === m.id) });
    },
    async addCustomer({ name, phone, location, debt_type, opening, opening_date, rep_id }) {
      const m = requireActive();
      const c = { id: 'c-' + uid(), rep_id: m.role === 'admin' && rep_id ? rep_id : m.id, name: name.trim(), phone: (phone || '').trim(), location: (location || '').trim(), debt_type, created_at: new Date().toISOString(), created_by: m.id };
      db.customers.push(c);
      if (opening > 0) insertTx({ customer_id: c.id, kind: 'opening', amount: opening, note: 'رصيد افتتاحي', occurred_at: opening_date });
      commit({ table: 'customers', type: 'INSERT', row: c });
      return c.id;
    },
    async addTransaction(input) { const tx = insertTx(input); commit({ table: 'transactions', type: 'INSERT', row: tx }); return tx; },
    async reviewTransaction(id, approve) {
      const m = requireActive(); if (m.role !== 'admin') throw new Error('للإدارة فقط');
      const t = db.transactions.find((x) => x.id === id);
      if (!t || t.status !== 'pending') throw new Error('الطلب ده اتراجع قبل كده');
      t.status = approve ? 'approved' : 'rejected'; t.reviewed_by = m.id; t.reviewed_at = new Date().toISOString();
      commit({ table: 'transactions', type: 'UPDATE', row: t });
    },
    async updateProfile(id, patch) {
      const m = requireActive(); if (m.role !== 'admin') throw new Error('للإدارة فقط');
      const p = db.profiles.find((x) => x.id === id);
      Object.assign(p, patch);
      commit({ table: 'profiles', type: 'UPDATE', row: p });
    },
    onChange(cb) { listeners.push(cb); },
    resetDemo() { db = demoSeed(); commit({ table: 'all', type: 'RESET' }); },
  };
}

/* ---------------- Supabase backend (production) ---------------- */
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('تعذر تحميل مكتبة الاتصال')); document.head.appendChild(s); });
}

async function SupabaseBackend() {
  await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js');
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  const email = (u) => `${String(u).trim().toLowerCase()}@${CFG.emailDomain || 'alsultan.app'}`;
  const fail = (error) => { if (error) throw new Error(error.message?.replace(/^.*?ERROR:\s*/, '') || 'حصل خطأ'); };
  const profileOf = async (id) => { const { data, error } = await sb.from('profiles').select('*').eq('id', id).single(); fail(error); return data; };
  const fetchAll = async (table, order) => {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(table).select('*').order(order).range(from, from + 999);
      fail(error); out.push(...data); if (data.length < 1000) break;
    }
    return out;
  };
  return {
    mode: 'live',
    async session() { const { data } = await sb.auth.getSession(); return data.session ? profileOf(data.session.user.id) : null; },
    async signIn(u, p) {
      const { data, error } = await sb.auth.signInWithPassword({ email: email(u), password: p });
      if (error) throw new Error('اسم المستخدم أو كلمة المرور غلط');
      return profileOf(data.user.id);
    },
    async signUp(u, p, name) {
      const { error } = await sb.auth.signUp({ email: email(u), password: p, options: { data: { username: u.trim().toLowerCase(), full_name: name } } });
      if (error) throw new Error(/registered/i.test(error.message) ? 'اسم المستخدم ده موجود' : error.message);
      await sb.auth.signOut();
    },
    async signOut() { await sb.auth.signOut(); },
    async loadAll() {
      const [profiles, customers, transactions] = await Promise.all([fetchAll('profiles', 'created_at'), fetchAll('customers', 'created_at'), fetchAll('transactions', 'occurred_at')]);
      return { profiles, customers, transactions };
    },
    async addCustomer(c) {
      const { data, error } = await sb.rpc('add_customer', { p_name: c.name, p_phone: c.phone, p_location: c.location, p_debt_type: c.debt_type, p_opening: c.opening || 0, p_opening_date: c.opening_date || null, p_rep_id: c.rep_id || null });
      fail(error); return data;
    },
    async addTransaction(t) {
      const row = { customer_id: t.customer_id, rep_id: t.rep_id, kind: t.kind, amount: t.amount, note: t.note || null, corrects_id: t.corrects_id || null };
      const { data, error } = await sb.from('transactions').insert(row).select().single(); fail(error); return data;
    },
    async reviewTransaction(id, approve) { const { error } = await sb.from('transactions').update({ status: approve ? 'approved' : 'rejected' }).eq('id', id); fail(error); },
    async updateProfile(id, patch) { const { error } = await sb.from('profiles').update(patch).eq('id', id); fail(error); },
    onChange(cb) {
      sb.channel('alsultan-live')
        .on('postgres_changes', { event: '*', schema: 'public' }, (p) => cb({ table: p.table, type: p.eventType, row: p.new, remote: true }))
        .subscribe((status) => { state.liveStatus = status; renderLiveDot(); });
    },
  };
}

/* ---------------- app state ---------------- */
const state = {
  me: null, profiles: [], customers: [], txs: [], stats: new Map(),
  view: { name: 'home' }, stack: [], search: '', typeFilter: 'all', monthFilter: 'all',
  liveStatus: 'SUBSCRIBED', notifiedOverdue: new Set(), authTab: 'login',
};
let api;

function recompute() {
  const now = Date.now();
  state.stats = new Map(state.customers.map((c) => [c.id, analyzeCustomer(c, state.txs, now)]));
}
const profileName = (id) => state.profiles.find((p) => p.id === id)?.full_name || (id === state.me?.id ? state.me.full_name : '—');
const reps = () => state.profiles.filter((p) => p.role === 'rep');

async function reload() {
  const data = await api.loadAll();
  state.profiles = data.profiles; state.customers = data.customers; state.txs = data.transactions;
  const fresh = state.profiles.find((p) => p.id === state.me?.id);
  if (fresh) state.me = fresh;
  recompute();
  render();
  maybeNotify();
}

let reloadTimer;
function scheduleReload() { clearTimeout(reloadTimer); reloadTimer = setTimeout(() => reload().catch(showError), 120); }

function handleChange(evt) {
  if (!state.me) return;
  if (evt?.remote && evt.table === 'transactions' && evt.type === 'INSERT' && evt.row && evt.row.created_by !== state.me.id) {
    const visible = state.me.role === 'admin' || evt.row.rep_id === state.me.id;
    if (visible) {
      setTimeout(() => {
        const c = state.customers.find((x) => x.id === evt.row.customer_id);
        const who = profileName(evt.row.created_by);
        toast(`${who}: ${KIND[evt.row.kind]} ${money(Math.abs(evt.row.amount))} ج.م${c ? ' - ' + c.name : ''}`, 'live');
      }, 300);
    }
  }
  if (evt?.type === 'RESET') { state.view = { name: 'home' }; state.stack = []; }
  scheduleReload();
}

/* ---------------- navigation ---------------- */
function go(view) { state.stack.push(state.view); state.view = view; state.search = ''; state.monthFilter = 'all'; render(); window.scrollTo({ top: 0 }); }
function back() { state.view = state.stack.pop() || { name: 'home' }; render(); }

/* ---------------- rendering ---------------- */
const root = () => $('#app');

function render() {
  closePanels();
  if (!state.me) return renderAuth();
  if (!state.me.active) return renderInactive();
  const v = state.view;
  let body = '';
  if (v.name === 'customer') body = viewCustomer(v.id);
  else if (state.me.role === 'admin') body = v.name === 'rep' ? viewRepDetail(v.id) : viewAdminHome();
  else body = viewRepHome();
  root().innerHTML = header() + `<main class="wrap">${body}</main>` + footer();
  renderLiveDot();
  const s = $('#search'); if (s && state._refocus) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); state._refocus = false; }
}

function header() {
  const overdue = visibleOverdue();
  return `
  <header class="top"><div class="wrap top-in">
    <button class="brand" data-act="home" aria-label="الرئيسية">
      <span class="mark" aria-hidden="true">س</span>
      <span><b>السلطان</b><small>للتوزيع - السويس</small></span>
    </button>
    <div class="top-tools">
      <span class="live" id="live"><i></i><span>مباشر</span></span>
      <button class="bell ${overdue.length ? 'has' : ''}" data-act="bell" aria-label="التنبيهات">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"/></svg>
        ${overdue.length ? `<em>${overdue.length}</em>` : ''}
      </button>
      <div class="who"><b>${esc(state.me.full_name)}</b><small>${state.me.role === 'admin' ? 'إدارة' : 'مندوب'}</small></div>
      <button class="ghost sm" data-act="logout">خروج</button>
    </div>
  </div>
  <div class="panel" id="bell-panel" hidden></div>
  </header>`;
}

function footer() {
  return `<footer class="wrap foot">
    ${api.mode === 'demo' ? `<span>نسخة تجريبية: البيانات محفوظة على الجهاز ده فقط. افتح تابين (مندوب وإدارة) وشوف التحديث اللحظي.</span><button class="link" data-act="reset-demo">رجّع البيانات التجريبية</button>` : `<span>كل الحركات محفوظة في الأرشيف ولا تُحذف.</span>`}
    <span class="muted">الأجل ${TERM_DAYS} يوم · من اليوم ${TERM_DAYS + 1} العميل يتعلم بالأحمر</span>
  </footer>`;
}

function renderLiveDot() {
  const el = $('#live'); if (!el) return;
  const ok = state.liveStatus === 'SUBSCRIBED';
  el.classList.toggle('off', !ok);
  el.lastElementChild.textContent = ok ? 'مباشر' : 'بيعيد الاتصال…';
}

function visibleOverdue() {
  return state.customers.filter((c) => state.stats.get(c.id)?.overdue)
    .sort((a, b) => state.stats.get(b.id).overdueDays - state.stats.get(a.id).overdueDays);
}

function meter(sum) {
  const pct = Math.min(sum.pct, 1.15);
  const cls = sum.over ? 'bad' : sum.pct >= 0.85 ? 'warn' : 'ok';
  return `<div class="meter ${cls}" role="img" aria-label="المديونية ${Math.round(sum.pct * 100)}% من حد الائتمان">
    <div class="bar"><span style="width:${Math.min(pct, 1) * 100}%"></span></div>
    <div class="meter-l"><span>${Math.round(sum.pct * 100)}% من الحد</span><span>${sum.over ? 'فوق الحد بـ ' + money(sum.total - sum.limit) : 'متاح ' + money(sum.limit - sum.total)}</span></div>
  </div>`;
}

function statusChip(s) {
  if (s.balance <= 0.009) return '<span class="chip ok">خالص</span>';
  if (s.overdue) return `<span class="chip bad">متأخر ${s.overdueDays} يوم</span>`;
  const left = TERM_DAYS - s.age + 1;
  return `<span class="chip ${left <= 3 ? 'warn' : 'neutral'}">باقي ${left} يوم</span>`;
}

function customerTable(list, { showRep = false, actions = true } = {}) {
  const q = state.search.trim();
  let rows = list.filter((c) => !q || c.name.includes(q) || (c.phone || '').includes(q) || (c.location || '').includes(q));
  if (state.typeFilter !== 'all') rows = rows.filter((c) => c.debt_type === state.typeFilter);
  rows.sort((a, b) => {
    const A = state.stats.get(a.id), B = state.stats.get(b.id);
    return (B.overdue - A.overdue) || (B.balance - A.balance);
  });
  const canCollect = actions && state.me.role === 'rep';
  if (!rows.length) return `<div class="empty">${list.length ? 'مفيش نتائج للبحث ده.' : 'لسه مفيش عملاء. دوس "إضافة عميل" وسجل أول عميل بالرصيد اللي عليه.'}</div>`;
  return `<div class="table-scroll"><table class="grid cust-list">
    <thead><tr><th>العميل</th>${showRep ? '<th>المندوب</th>' : ''}<th>النوع</th><th class="num">عليه</th><th class="num">تحصيل الشهر</th><th>الأجل</th>${canCollect ? '<th></th>' : ''}</tr></thead>
    <tbody>${rows.map((c) => {
      const s = state.stats.get(c.id);
      return `<tr class="${s.overdue ? 'row-bad' : ''}" data-act="open-customer" data-id="${c.id}" tabindex="0">
        <td class="c-name"><b class="cname">${esc(c.name)}</b><small class="sub">${esc(c.location || '')}${c.phone ? ' · <span dir="ltr">' + esc(c.phone) + '</span>' : ''}</small></td>
        ${showRep ? `<td class="c-rep">${esc(profileName(c.rep_id))}</td>` : ''}
        <td class="c-type"><span class="chip type">${TYPE[c.debt_type] || ''}</span></td>
        <td class="num strong c-bal">${money(s.balance)}</td>
        <td class="num c-month" data-l="حصّل الشهر: ">${s.monthCollected ? money(s.monthCollected) : '<span class="muted">—</span>'}</td>
        <td class="c-stat">${statusChip(s)}${s.pending ? ' <span class="chip pend">طلب تصحيح</span>' : ''}</td>
        ${canCollect ? `<td class="act"><button class="primary sm" data-act="collect" data-id="${c.id}" ${s.balance <= 0 ? 'disabled' : ''}>تحصيل</button></td>` : ''}
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function listTools(extra = '') {
  return `<div class="tools">
    <input id="search" type="search" placeholder="ابحث باسم العميل أو التليفون أو المنطقة" value="${esc(state.search)}" autocomplete="off">
    <div class="seg" role="group" aria-label="نوع المديونية">
      ${['all', 'retail', 'wholesale'].map((k) => `<button class="${state.typeFilter === k ? 'on' : ''}" data-act="type" data-k="${k}">${k === 'all' ? 'الكل' : TYPE[k]}</button>`).join('')}
    </div>
    ${extra}
  </div>`;
}

/* ----- rep home ----- */
function viewRepHome() {
  const sum = repSummary(state.me, state.customers, state.stats);
  const overdue = sum.customers.filter((c) => state.stats.get(c.id).overdue).length;
  return `
  ${sum.over ? `<div class="stop" role="alert"><b>موقوف عن البيع الآجل</b><span>مديونيتك ${money(sum.total)} فوق حد الائتمان ${money(sum.limit)} بـ ${money(sum.total - sum.limit)} ج.م. حصّل من العملاء عشان ترجع تشتغل.</span></div>` : ''}
  <section class="hero ${sum.over ? 'is-bad' : ''}">
    <div class="hero-main">
      <span class="eyebrow">إجمالي المديونية اللي في السوق</span>
      <div class="big">${egp(sum.total)}</div>
      <div class="hero-sub">حد الائتمان: <b>${money(sum.limit)}</b> ج.م</div>
      ${meter(sum)}
    </div>
    <dl class="kpis">
      <div><dt>تحصيل الشهر ده</dt><dd>${money(sum.month)}</dd></div>
      <div><dt>عملاء</dt><dd>${sum.customers.length}</dd></div>
      <div class="${overdue ? 'bad' : ''}"><dt>متأخرين (+${TERM_DAYS} يوم)</dt><dd>${overdue}</dd></div>
      <div><dt>قطاعي / جملة</dt><dd class="small">${money(sum.retail)} / ${money(sum.wholesale)}</dd></div>
    </dl>
  </section>
  <section class="card">
    <div class="sec-head"><h2>عملائي</h2>
      <div class="btns">
        <button class="secondary" data-act="invoice-pick" ${sum.over ? 'disabled title="موقوف: فوق حد الائتمان"' : ''}>فاتورة آجل</button>
        <button class="primary" data-act="add-customer">+ إضافة عميل</button>
      </div>
    </div>
    ${listTools()}
    ${customerTable(sum.customers)}
  </section>`;
}

/* ----- admin home ----- */
function viewAdminHome() {
  const all = reps();
  const sums = all.filter((r) => r.active).map((r) => ({ r, s: repSummary(r, state.customers, state.stats) }));
  const total = sums.reduce((a, x) => a + x.s.total, 0);
  const month = sums.reduce((a, x) => a + x.s.month, 0);
  const stopped = sums.filter((x) => x.s.over).length;
  const overdue = visibleOverdue();
  const pendingTx = state.txs.filter((t) => t.status === 'pending');
  const pendingAcc = all.filter((r) => !r.active);
  return `
  <section class="summary">
    <div><span class="eyebrow">إجمالي الآجل في السوق</span><b>${egp(total)}</b></div>
    <div><span class="eyebrow">تحصيل ${monthLabel(monthKey(Date.now()))}</span><b>${egp(month)}</b></div>
    <div class="${stopped ? 'bad' : ''}"><span class="eyebrow">مناديب فوق الحد</span><b>${stopped}</b></div>
    <div class="${overdue.length ? 'bad' : ''}"><span class="eyebrow">عملاء متأخرين</span><b>${overdue.length}</b></div>
  </section>

  ${pendingAcc.length ? `<section class="card attn"><div class="sec-head"><h2>حسابات جديدة مستنية تفعيل</h2></div>
    <div class="stack">${pendingAcc.map((r) => `<form class="inline-form" data-form="activate" data-id="${r.id}">
      <div><b>${esc(r.full_name)}</b><small class="sub" dir="ltr">@${esc(r.username)}</small></div>
      <label>حد الائتمان<input name="limit" inputmode="decimal" placeholder="مثلاً 500000" required></label>
      <button class="primary sm">تفعيل</button></form>`).join('')}</div></section>` : ''}

  ${pendingTx.length ? `<section class="card attn"><div class="sec-head"><h2>طلبات تصحيح مستنية موافقتك</h2></div>${pendingList(pendingTx)}</section>` : ''}

  <section class="card">
    <div class="sec-head"><h2>المناديب</h2><span class="muted">دوس على المندوب تشوف عملاءه</span></div>
    <div class="reps">${sums.sort((a, b) => b.s.pct - a.s.pct).map(({ r, s }) => `
      <button class="rep ${s.over ? 'is-bad' : ''}" data-act="open-rep" data-id="${r.id}">
        <div class="rep-h"><b>${esc(r.full_name)}</b>${s.over ? '<span class="chip bad">موقوف</span>' : ''}</div>
        <div class="rep-n">${egp(s.total)}</div>
        <small class="sub">من حد ${money(s.limit)}</small>
        ${meter(s)}
        <div class="rep-f"><span>${s.customers.length} عميل</span><span>تحصيل الشهر ${money(s.month)}</span>${s.overdue ? `<span class="t-bad">${s.overdue} متأخر</span>` : ''}</div>
      </button>`).join('') || '<div class="empty">لسه مفيش مناديب مفعلين.</div>'}
    </div>
  </section>

  <section class="card">
    <div class="sec-head"><h2>العملاء المتأخرين (+${TERM_DAYS} يوم)</h2></div>
    ${overdue.length ? customerTable(overdue, { showRep: true, actions: false }) : '<div class="empty">مفيش عملاء متأخرين.</div>'}
  </section>`;
}

function pendingList(list) {
  return `<div class="stack">${list.map((t) => {
    const c = state.customers.find((x) => x.id === t.customer_id);
    const admin = state.me.role === 'admin';
    return `<div class="pending">
      <div><b>${esc(c?.name || '')}</b> <small class="sub">${esc(profileName(t.created_by))} · ${fmtDT(t.created_at)}</small>
      <p>${t.amount < 0 ? 'تقليل المديونية' : 'زيادة المديونية'} بـ <b>${money(Math.abs(t.amount))}</b> ج.م · ${esc(t.note)}</p></div>
      ${admin ? `<div class="btns"><button class="primary sm" data-act="approve" data-id="${t.id}">موافقة</button><button class="ghost sm" data-act="reject" data-id="${t.id}">رفض</button></div>` : '<span class="chip pend">مستني الإدارة</span>'}
    </div>`;
  }).join('')}</div>`;
}

/* ----- admin: one rep ----- */
function viewRepDetail(id) {
  const r = state.profiles.find((p) => p.id === id);
  if (!r) return '<div class="empty">المندوب مش موجود.</div>';
  const s = repSummary(r, state.customers, state.stats);
  return `
  <button class="back" data-act="back">→ رجوع</button>
  <section class="hero ${s.over ? 'is-bad' : ''}">
    <div class="hero-main">
      <span class="eyebrow">${esc(r.full_name)} · <span dir="ltr">@${esc(r.username)}</span></span>
      <div class="big">${egp(s.total)}</div>
      <form class="inline-form tight" data-form="limit" data-id="${r.id}">
        <label>حد الائتمان<input name="limit" inputmode="decimal" value="${money(r.credit_limit)}"></label>
        <button class="secondary sm">حفظ الحد</button>
      </form>
      ${meter(s)}
    </div>
    <dl class="kpis">
      <div><dt>تحصيل الشهر ده</dt><dd>${money(s.month)}</dd></div>
      <div><dt>عملاء</dt><dd>${s.customers.length}</dd></div>
      <div class="${s.overdue ? 'bad' : ''}"><dt>متأخرين</dt><dd>${s.overdue}</dd></div>
      <div><dt>قطاعي / جملة</dt><dd class="small">${money(s.retail)} / ${money(s.wholesale)}</dd></div>
    </dl>
  </section>
  <section class="card">
    <div class="sec-head"><h2>عملاء ${esc(r.full_name)}</h2><button class="ghost sm" data-act="toggle-active" data-id="${r.id}">إيقاف الحساب</button></div>
    ${listTools()}
    ${customerTable(s.customers, { actions: false })}
  </section>`;
}

/* ----- customer detail (both roles) ----- */
function viewCustomer(id) {
  const c = state.customers.find((x) => x.id === id);
  if (!c) return '<div class="empty">العميل مش موجود.</div>';
  const s = state.stats.get(id);
  const isRep = state.me.role === 'rep';
  const repSum = repSummary(state.profiles.find((p) => p.id === c.rep_id) || state.me, state.customers, state.stats);
  // running balance (oldest first), shown newest first
  let run = 0;
  const rows = s.list.map((t) => { run += effect(t); return { t, run }; });
  const months = [...new Set(s.list.map((t) => monthKey(t.occurred_at)))].sort().reverse();
  const shown = rows.filter((x) => state.monthFilter === 'all' || monthKey(x.t.occurred_at) === state.monthFilter).reverse();
  const byMonth = months.map((k) => {
    const ts = s.list.filter((t) => t.status === 'approved' && monthKey(t.occurred_at) === k);
    return { k, debit: ts.filter((t) => effect(t) > 0).reduce((a, t) => a + effect(t), 0), credit: ts.filter((t) => effect(t) < 0).reduce((a, t) => a - effect(t), 0) };
  });
  const pending = s.list.filter((t) => t.status === 'pending');
  return `
  <button class="back" data-act="back">→ رجوع</button>
  <section class="cust ${s.overdue ? 'is-bad' : ''}">
    <div class="cust-id">
      <h1>${esc(c.name)}</h1>
      <div class="facts">
        ${c.phone ? `<span>📞 <b dir="ltr" class="sel">${esc(c.phone)}</b></span>` : ''}
        ${c.location ? `<span>📍 ${esc(c.location)}</span>` : ''}
        <span class="chip type">${TYPE[c.debt_type]}</span>
        ${!isRep ? `<span class="muted">المندوب: ${esc(profileName(c.rep_id))}</span>` : ''}
      </div>
    </div>
    <dl class="kpis">
      <div class="${s.overdue ? 'bad' : ''}"><dt>عليه دلوقتي</dt><dd>${money(s.balance)}</dd></div>
      <div><dt>تحصيل الشهر ده</dt><dd>${money(s.monthCollected)}</dd></div>
      <div class="${s.overdue ? 'bad' : ''}"><dt>الأجل</dt><dd class="small">${s.balance > 0 ? (s.overdue ? `متأخر ${s.overdueDays} يوم` : `آخر يوم ${fmtDate(s.dueDate)}`) : 'خالص'}</dd></div>
      <div><dt>آخر تحصيل</dt><dd class="small">${s.lastCollection ? fmtDate(s.lastCollection) : '—'}</dd></div>
    </dl>
    <div class="btns">
      ${isRep ? `<button class="primary" data-act="collect" data-id="${c.id}" ${s.balance <= 0 ? 'disabled' : ''}>تحصيل</button>
      <button class="secondary" data-act="invoice" data-id="${c.id}" ${repSum.over ? 'disabled title="موقوف: فوق حد الائتمان"' : ''}>فاتورة آجل</button>
      <button class="ghost" data-act="correction" data-id="${c.id}">طلب تصحيح</button>` :
      `<button class="secondary" data-act="correction" data-id="${c.id}">تصحيح (من الإدارة)</button>`}
    </div>
  </section>

  ${pending.length ? `<section class="card attn"><div class="sec-head"><h2>طلبات تصحيح معلقة</h2></div>${pendingList(pending)}</section>` : ''}

  <section class="card">
    <div class="sec-head"><h2>كشف الحساب</h2>
      <select id="month" aria-label="الشهر"><option value="all">كل الحركات</option>${months.map((k) => `<option value="${k}" ${state.monthFilter === k ? 'selected' : ''}>${monthLabel(k)}</option>`).join('')}</select>
    </div>
    <div class="table-scroll"><table class="grid ledger">
      <thead><tr><th>التاريخ</th><th>الحركة</th><th class="num">عليه (+)</th><th class="num">دفع (−)</th><th class="num">الرصيد</th><th>سجّلها</th><th>ملاحظة</th></tr></thead>
      <tbody>${shown.map(({ t, run }) => {
        const e = t.kind === 'collection' ? -t.amount : Number(t.amount);
        const off = t.status !== 'approved';
        return `<tr class="${off ? 'row-off' : ''} k-${t.kind}">
          <td class="nowrap">${fmtDT(t.occurred_at)}</td>
          <td>${KIND[t.kind]}${t.status === 'pending' ? ' <span class="chip pend">معلق</span>' : t.status === 'rejected' ? ' <span class="chip neutral">مرفوض</span>' : ''}</td>
          <td class="num">${e > 0 ? money(e) : ''}</td>
          <td class="num t-ok">${e < 0 ? money(-e) : ''}</td>
          <td class="num strong">${off ? '<span class="muted">—</span>' : money(run)}</td>
          <td>${esc(profileName(t.created_by))}</td>
          <td class="note">${esc(t.note || '')}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="7" class="empty">مفيش حركات.</td></tr>'}</tbody>
    </table></div>
  </section>

  <section class="card">
    <div class="sec-head"><h2>ملخص شهري (الأرشيف)</h2><span class="muted">محفوظ دايماً ولا يُحذف</span></div>
    <div class="table-scroll"><table class="grid">
      <thead><tr><th>الشهر</th><th class="num">فواتير / زيادة</th><th class="num">تحصيل / خصم</th></tr></thead>
      <tbody>${byMonth.map((m) => `<tr data-act="month" data-k="${m.k}"><td>${monthLabel(m.k)}</td><td class="num">${money(m.debit)}</td><td class="num t-ok">${money(m.credit)}</td></tr>`).join('')}</tbody>
    </table></div>
  </section>`;
}

/* ----- auth screens ----- */
function renderAuth() {
  const tab = state.authTab;
  root().innerHTML = `
  <main class="auth">
    <div class="auth-card">
      <div class="auth-brand"><span class="mark" aria-hidden="true">س</span><div><h1>السلطان للتوزيع</h1><p>دفتر مديونيات المناديب</p></div></div>
      <div class="seg wide" role="tablist">
        <button class="${tab === 'login' ? 'on' : ''}" data-act="auth-tab" data-k="login">دخول</button>
        <button class="${tab === 'signup' ? 'on' : ''}" data-act="auth-tab" data-k="signup">حساب مندوب جديد</button>
      </div>
      ${tab === 'login' ? `
      <form data-form="login" class="form">
        <label>اسم المستخدم<input id="login-user" name="username" autocomplete="username" dir="ltr" required></label>
        <label>كلمة المرور<input id="login-pass" name="password" type="password" autocomplete="current-password" dir="ltr" required></label>
        <button class="primary block">دخول</button>
      </form>` : `
      <form data-form="signup" class="form">
        <label>الاسم بالكامل<input id="su-name" name="full_name" required></label>
        <label>اسم المستخدم (إنجليزي)<input id="su-user" name="username" dir="ltr" pattern="[A-Za-z0-9_.\\-]{3,30}" title="3 حروف على الأقل، إنجليزي أو أرقام" required></label>
        <label>كلمة المرور<input id="su-pass" name="password" type="password" dir="ltr" minlength="6" required></label>
        <p class="hint">بعد التسجيل الإدارة بتفعل حسابك وتحدد حد الائتمان بتاعك.</p>
        <button class="primary block">إنشاء الحساب</button>
      </form>`}
      <div class="form-msg" id="auth-msg" role="status"></div>
      ${api.mode === 'demo' ? `<div class="demo">
        <b>نسخة تجريبية - جرّب بأي حساب (كلمة المرور 1234):</b>
        <div class="demo-list">
          ${[['sayed', 'سيد (إدارة)'], ['mohamed', 'محمد (إدارة)'], ['ahmed', 'أحمد - حد مليون'], ['mahmoud', 'محمود - حد 500 ألف'], ['karim', 'كريم - حد 200 ألف (موقوف)']].map(([u, l]) => `<button class="chipbtn" data-act="demo-login" data-u="${u}">${l}</button>`).join('')}
        </div>
      </div>` : ''}
    </div>
  </main>`;
}

function renderInactive() {
  root().innerHTML = `<main class="auth"><div class="auth-card">
    <div class="auth-brand"><span class="mark" aria-hidden="true">س</span><div><h1>أهلاً ${esc(state.me.full_name)}</h1><p>حسابك مستني تفعيل</p></div></div>
    <p>الإدارة لازم تفعل حسابك وتحدد حد الائتمان قبل ما تبدأ. الصفحة دي هتتحدث لوحدها أول ما يتفعل.</p>
    <button class="ghost block" data-act="logout">خروج</button>
  </div></main>`;
}

/* ---------------- modals ---------------- */
function modal(title, inner, onSubmit) {
  closeModal();
  const el = document.createElement('div');
  el.className = 'overlay';
  el.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-h"><h3>${esc(title)}</h3><button class="x" data-close aria-label="إغلاق">×</button></div>
    <form class="form" novalidate>${inner}<div class="form-msg" role="status"></div></form></div>`;
  document.body.appendChild(el);
  const form = el.querySelector('form');
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) closeModal(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button.primary'); const msg = form.querySelector('.form-msg');
    msg.textContent = ''; btn.disabled = true;
    try { await onSubmit(new FormData(form), form); closeModal(); }
    catch (err) { msg.textContent = err.message || String(err); msg.className = 'form-msg err'; btn.disabled = false; }
  });
  setTimeout(() => form.querySelector('input:not([type=hidden]),select,textarea')?.focus(), 30);
  return form;
}
function closeModal() { document.querySelector('.overlay')?.remove(); }

function amountField(name = 'amount', label = 'المبلغ', extra = '') {
  return `<label>${label}<input id="f-${name}" name="${name}" inputmode="decimal" autocomplete="off" placeholder="0" class="amount" required ${extra}></label>`;
}

function openCollect(cid) {
  const c = state.customers.find((x) => x.id === cid); const s = state.stats.get(cid);
  const form = modal('تحصيل من ' + c.name, `
    <div class="ctx"><span>عليه دلوقتي</span><b>${egp(s.balance)}</b></div>
    ${amountField('amount', 'المبلغ اللي استلمته')}
    <div class="preview" id="pv">الرصيد بعد التحصيل: <b>${money(s.balance)}</b></div>
    <label>ملاحظة (اختياري)<input id="f-note" name="note" placeholder="مثلاً: كاش / شيك رقم …"></label>
    <button class="primary block">تسجيل التحصيل</button>`,
    async (fd) => {
      const amount = parseAmount(fd.get('amount'));
      if (!(amount > 0)) throw new Error('اكتب المبلغ بالأرقام');
      if (amount > s.balance) throw new Error(`المبلغ أكبر من اللي على العميل (${money(s.balance)})`);
      await api.addTransaction({ customer_id: cid, rep_id: c.rep_id, kind: 'collection', amount, note: fd.get('note') });
      toast(`اتسجل تحصيل ${money(amount)} ج.م من ${c.name}`, 'ok');
    });
  form.amount.addEventListener('input', () => {
    const a = parseAmount(form.amount.value);
    const left = s.balance - (a > 0 ? a : 0);
    $('#pv').innerHTML = `الرصيد بعد التحصيل: <b class="${left < 0 ? 't-bad' : ''}">${money(left)}</b>`;
  });
}

function openInvoice(cid) {
  const sum = repSummary(state.me, state.customers, state.stats);
  const pick = !cid;
  const opts = sum.customers.slice().sort((a, b) => a.name.localeCompare(b.name, 'ar')).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const c = cid && state.customers.find((x) => x.id === cid);
  const due = fmtDate(Date.now() + (TERM_DAYS - 1) * DAY);
  const form = modal(pick ? 'فاتورة آجل جديدة' : 'فاتورة آجل - ' + c.name, `
    ${pick ? `<label>العميل<select id="f-customer" name="customer" required><option value="">اختار العميل</option>${opts}</select></label>` : ''}
    <div class="ctx"><span>متاح لك قبل الحد</span><b>${egp(Math.max(0, sum.limit - sum.total))}</b></div>
    ${amountField('amount', 'قيمة الفاتورة')}
    <label>رقم الفاتورة / ملاحظة<input id="f-note" name="note" placeholder="مثلاً: فاتورة 1543"></label>
    <p class="hint">آخر يوم للأجل: ${due}. من بعده العميل يتعلم بالأحمر.</p>
    <button class="primary block">تسجيل الفاتورة</button>`,
    async (fd) => {
      const id = cid || fd.get('customer');
      if (!id) throw new Error('اختار العميل');
      const amount = parseAmount(fd.get('amount'));
      if (!(amount > 0)) throw new Error('اكتب المبلغ بالأرقام');
      if (sum.total + amount > sum.limit) throw new Error(`مرفوض: المديونية هتبقى ${money(sum.total + amount)} وحد الائتمان ${money(sum.limit)}`);
      const cc = state.customers.find((x) => x.id === id);
      await api.addTransaction({ customer_id: id, rep_id: cc.rep_id, kind: 'invoice', amount, note: fd.get('note') });
      toast(`اتسجلت فاتورة ${money(amount)} ج.م على ${cc.name}`, 'ok');
    });
  return form;
}

function openAddCustomer() {
  const today = new Date().toISOString().slice(0, 10);
  const minD = new Date(Date.now() - 365 * DAY).toISOString().slice(0, 10);
  const form = modal('إضافة عميل', `
    <label>اسم العميل / المحل<input id="f-name" name="name" required></label>
    <div class="row2">
      <label>رقم التليفون<input id="f-phone" name="phone" inputmode="tel" dir="ltr"></label>
      <label>النوع<select id="f-type" name="debt_type"><option value="retail">قطاعي</option><option value="wholesale">جملة</option></select></label>
    </div>
    <label>المكان / العنوان<input id="f-location" name="location" placeholder="المنطقة - الشارع"></label>
    <div class="row2">
      ${amountField('opening', 'عليه كام دلوقتي', 'required=false')}
      <label>تاريخ أقدم فاتورة مفتوحة<input id="f-odate" name="opening_date" type="date" value="${today}" min="${minD}" max="${today}"></label>
    </div>
    <div class="form-msg warn" id="dup"></div>
    <button class="primary block">حفظ العميل</button>`,
    async (fd) => {
      const name = String(fd.get('name') || '').trim();
      if (!name) throw new Error('اكتب اسم العميل');
      const opening = fd.get('opening') ? parseAmount(fd.get('opening')) : 0;
      if (!(opening >= 0)) throw new Error('الرصيد لازم يكون رقم');
      const d = fd.get('opening_date');
      await api.addCustomer({ name, phone: fd.get('phone'), location: fd.get('location'), debt_type: fd.get('debt_type'), opening, opening_date: d ? new Date(d + 'T12:00:00').toISOString() : null });
      toast(`اتضاف ${name}`, 'ok');
    });
  form.opening.required = false;
  const check = () => {
    const n = form.name.value.trim(), p = form.phone.value.trim();
    const hit = state.customers.find((c) => (n && c.name === n) || (p.length > 6 && c.phone === p));
    $('#dup').textContent = hit ? `تنبيه: فيه عميل مسجل باسم "${hit.name}"${hit.phone ? ' (' + hit.phone + ')' : ''}` : '';
  };
  form.name.addEventListener('input', check); form.phone.addEventListener('input', check);
}

function openCorrection(cid) {
  const c = state.customers.find((x) => x.id === cid); const s = state.stats.get(cid);
  const admin = state.me.role === 'admin';
  modal((admin ? 'تصحيح رصيد - ' : 'طلب تصحيح - ') + c.name, `
    <div class="ctx"><span>عليه دلوقتي</span><b>${egp(s.balance)}</b></div>
    <div class="seg wide" role="radiogroup">
      <label class="radio"><input type="radio" name="dir" value="-1" checked> تقليل المديونية</label>
      <label class="radio"><input type="radio" name="dir" value="1"> زيادة المديونية</label>
    </div>
    ${amountField('amount', 'قيمة التصحيح')}
    <label>السبب (إجباري)<textarea id="f-note" name="note" rows="2" required placeholder="مثلاً: تحصيل 2000 يوم 12 اتسجل 20000 غلط"></textarea></label>
    <p class="hint">${admin ? 'التصحيح من الإدارة بيتطبق فوراً ويفضل ظاهر في كشف الحساب.' : 'المندوب ما يقدرش يعدل أو يمسح حركة. الطلب بيروح للإدارة، ولما يتوافق عليه يتطبق.'}</p>
    <button class="primary block">${admin ? 'تطبيق التصحيح' : 'إرسال الطلب للإدارة'}</button>`,
    async (fd) => {
      const amount = parseAmount(fd.get('amount'));
      const note = String(fd.get('note') || '').trim();
      if (!(amount > 0)) throw new Error('اكتب المبلغ بالأرقام');
      if (note.length < 4) throw new Error('اكتب السبب');
      await api.addTransaction({ customer_id: cid, rep_id: c.rep_id, kind: 'correction', amount: amount * Number(fd.get('dir')), note });
      toast(admin ? 'اتطبق التصحيح' : 'الطلب اتبعت للإدارة', 'ok');
    });
}

/* ---------------- notifications ---------------- */
function openBell() {
  const p = $('#bell-panel'); if (!p) return;
  if (!p.hidden) { p.hidden = true; return; }
  const list = visibleOverdue();
  const canNotify = 'Notification' in window;
  p.innerHTML = `<div class="wrap"><div class="panel-in">
    <div class="sec-head"><h3>عملاء عدّوا ${TERM_DAYS} يوم</h3>${canNotify && Notification.permission === 'default' ? '<button class="link" data-act="enable-notify">فعّل إشعارات المتصفح</button>' : ''}</div>
    ${list.length ? `<ul class="notes">${list.slice(0, 40).map((c) => { const s = state.stats.get(c.id); return `<li data-act="open-customer" data-id="${c.id}"><b>${esc(c.name)}</b><span>${money(s.balance)} ج.م · متأخر ${s.overdueDays} يوم${state.me.role === 'admin' ? ' · ' + esc(profileName(c.rep_id)) : ''}</span></li>`; }).join('')}</ul>` : '<div class="empty">مفيش تنبيهات.</div>'}
  </div></div>`;
  p.hidden = false;
}
function closePanels() { const p = $('#bell-panel'); if (p) p.hidden = true; }

function maybeNotify() {
  if (!state.me || !('Notification' in window) || Notification.permission !== 'granted') return;
  const fresh = visibleOverdue().filter((c) => !state.notifiedOverdue.has(c.id));
  if (!fresh.length) return;
  fresh.forEach((c) => state.notifiedOverdue.add(c.id));
  safe(() => new Notification('السلطان: عملاء متأخرين', { body: fresh.slice(0, 3).map((c) => c.name).join('، ') + (fresh.length > 3 ? ` و${fresh.length - 3} غيرهم` : '') + ` عدّوا ${TERM_DAYS} يوم` }));
}

/* ---------------- toast ---------------- */
function toast(text, kind = 'ok') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = text; box.appendChild(t);
  setTimeout(() => t.classList.add('out'), 3800); setTimeout(() => t.remove(), 4300);
}
function showError(e) { console.error(e); toast(e.message || String(e), 'err'); }

/* ---------------- events ---------------- */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) { if (!e.target.closest('#bell-panel')) closePanels(); return; }
  const act = el.dataset.act, id = el.dataset.id;
  if (act !== 'bell' && !el.closest('#bell-panel')) closePanels();
  try {
    switch (act) {
      case 'home': state.view = { name: 'home' }; state.stack = []; render(); break;
      case 'back': back(); break;
      case 'logout': await api.signOut(); state.me = null; state.view = { name: 'home' }; state.stack = []; render(); break;
      case 'bell': openBell(); break;
      case 'enable-notify': await Notification.requestPermission(); maybeNotify(); closePanels(); break;
      case 'open-customer': e.stopPropagation(); closePanels(); go({ name: 'customer', id }); break;
      case 'open-rep': go({ name: 'rep', id }); break;
      case 'collect': e.stopPropagation(); openCollect(id); break;
      case 'invoice': openInvoice(id); break;
      case 'invoice-pick': openInvoice(null); break;
      case 'add-customer': openAddCustomer(); break;
      case 'correction': openCorrection(id); break;
      case 'type': state.typeFilter = el.dataset.k; render(); break;
      case 'month': state.monthFilter = el.dataset.k; render(); break;
      case 'approve': case 'reject': await api.reviewTransaction(id, act === 'approve'); toast(act === 'approve' ? 'اتوافق على التصحيح' : 'اترفض الطلب', 'ok'); break;
      case 'toggle-active': {
        const r = state.profiles.find((p) => p.id === id);
        await api.updateProfile(id, { active: !r.active }); toast('اتوقف حساب ' + r.full_name, 'ok'); back(); break;
      }
      case 'auth-tab': state.authTab = el.dataset.k; renderAuth(); break;
      case 'demo-login': state.me = await api.signIn(el.dataset.u, '1234'); await afterLogin(); break;
      case 'reset-demo': api.resetDemo(); toast('رجعت البيانات التجريبية', 'ok'); break;
    }
  } catch (err) { showError(err); }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); closePanels(); }
  if (e.key === 'Enter' && e.target.matches('tr[data-act]')) e.target.click();
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'search') { state.search = e.target.value; state._refocus = true; render(); }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'month') { state.monthFilter = e.target.value; render(); }
});

document.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-form]'); if (!f) return;
  e.preventDefault();
  const fd = new FormData(f); const kind = f.dataset.form;
  const msg = $('#auth-msg');
  try {
    if (kind === 'login') { state.me = await api.signIn(fd.get('username'), fd.get('password')); await afterLogin(); }
    else if (kind === 'signup') {
      await api.signUp(String(fd.get('username')), String(fd.get('password')), String(fd.get('full_name')).trim());
      state.authTab = 'login'; renderAuth(); $('#auth-msg').textContent = 'اتعمل الحساب. الإدارة هتفعله وبعدها تقدر تدخل.'; $('#auth-msg').className = 'form-msg ok';
    } else if (kind === 'activate' || kind === 'limit') {
      const limit = parseAmount(fd.get('limit'));
      if (!(limit >= 0)) throw new Error('اكتب حد الائتمان بالأرقام');
      await api.updateProfile(f.dataset.id, kind === 'activate' ? { credit_limit: limit, active: true } : { credit_limit: limit });
      toast(kind === 'activate' ? 'اتفعل الحساب' : 'اتحفظ حد الائتمان الجديد', 'ok');
    }
  } catch (err) { if (msg) { msg.textContent = err.message; msg.className = 'form-msg err'; } else showError(err); }
});

async function afterLogin() {
  state.view = { name: 'home' }; state.stack = []; state.typeFilter = 'all'; state.search = '';
  await reload();
}

/* ---------------- boot ---------------- */
(async function boot() {
  try {
    api = LIVE ? await SupabaseBackend() : DemoBackend();
    api.onChange(handleChange);
    state.me = await api.session();
    if (state.me) await reload(); else render();
    // re-evaluate the 15-day rule when the date changes while the page stays open
    setInterval(() => { if (state.me) { recompute(); maybeNotify(); } }, 10 * 60 * 1000);
  } catch (err) {
    root().innerHTML = `<main class="auth"><div class="auth-card"><h1>تعذر التشغيل</h1><p>${esc(err.message)}</p></div></main>`;
  }
})();
