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
function nav(name) { state.view = { name }; state.stack = []; state.search = ''; render(); window.scrollTo({ top: 0 }); }

/* ---------------- icons (stroke, 24 grid) ---------------- */
const ICONS = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>',
  userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  logout: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M8 17l-5-5 5-5"/><path d="M3 12h12"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  store: '<path d="M3 9h18l-1.5-5h-15z"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/>',
  down: '<path d="M22 17 13.5 8.5l-5 5L2 7"/><path d="M16 17h6v-6"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16v-8"/>',
};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const initials = (name) => String(name || '؟').replace(/^(سوبر ماركت|ماركت|كشك|بقالة|صيدلية|مخازن|هايبر)\s+/, '').replace(/^(د\.|الحاج|عم|أم|أبو)\s+/, '').replace(/^ال(?=\S{2})/, '').trim().charAt(0);

/* ---------------- rendering ---------------- */
const root = () => $('#app');

function navItems() {
  if (state.me.role === 'admin') {
    const pendTx = state.txs.filter((t) => t.status === 'pending').length;
    const pendAcc = reps().filter((r) => !r.active).length;
    return [
      ['home', 'home', 'لوحة التحكم', 0],
      ['reps', 'users', 'المناديب', 0],
      ['customers', 'store', 'العملاء', 0],
      ['overdue', 'alert', 'المتأخرين', visibleOverdue().length],
      ['approvals', 'check', 'التصحيحات', pendTx],
      ['accounts', 'userplus', 'الحسابات', pendAcc],
    ];
  }
  return [
    ['home', 'home', 'الرئيسية', 0],
    ['overdue', 'alert', 'المتأخرين', visibleOverdue().length],
  ];
}

function activeNav() {
  const v = state.view.name;
  if (v === 'rep') return 'reps';
  if (v === 'customer') return state.stack[0]?.name || 'home';
  return v;
}

const TITLES = { home: 'لوحة التحكم', reps: 'المناديب', customers: 'العملاء', overdue: 'العملاء المتأخرين', approvals: 'طلبات التصحيح', accounts: 'الحسابات الجديدة' };

function crumbs() {
  const v = state.view;
  const parts = [];
  const rootName = activeNav();
  const rootTitle = state.me.role === 'rep' && rootName === 'home' ? 'الرئيسية' : (TITLES[rootName] || 'الرئيسية');
  parts.push(rootTitle);
  if (v.name === 'rep') parts.push(profileName(v.id));
  if (v.name === 'customer') {
    const c = state.customers.find((x) => x.id === v.id);
    if (c && state.me.role === 'admin' && state.stack.some((s) => s.name === 'rep')) parts.push(profileName(c.rep_id));
    parts.push(c?.name || '');
  }
  return parts;
}

function render() {
  closePanels();
  hideTip();
  if (!state.me) return renderAuth();
  if (!state.me.active) return renderInactive();
  const v = state.view;
  let body = '';
  if (v.name === 'customer') body = viewCustomer(v.id);
  else if (state.me.role === 'admin') {
    body = ({ rep: () => viewRepDetail(v.id), reps: viewReps, customers: viewAllCustomers, overdue: viewOverdue, approvals: viewApprovals, accounts: viewAccounts }[v.name] || viewAdminHome)();
  } else body = v.name === 'overdue' ? viewOverdue() : viewRepHome();
  const items = navItems();
  const act = activeNav();
  const cr = crumbs();
  const nOver = visibleOverdue().length;
  root().innerHTML = `
  <header class="nav">
    <div class="nav-in">
      <button class="brand" data-act="nav" data-k="home">
        <span class="logo" aria-hidden="true">${ic('store')}</span>
        <span><b>السلطان للتوزيع</b><small>دفتر المديونيات</small></span>
      </button>
      <nav class="tabs">${items.map(([k, i, l, n]) => `<button class="tab ${act === k ? 'on' : ''}" data-act="nav" data-k="${k}">${ic(i)}<span>${l}</span>${n ? `<em class="${k === 'overdue' ? 'bad' : ''}">${n}</em>` : ''}</button>`).join('')}</nav>
      <div class="nav-tools">
        <span class="live" id="live" title="تحديث لحظي"><i></i><span>مباشر</span></span>
        <button class="icon-btn bell ${nOver ? 'has' : ''}" data-act="bell" aria-label="التنبيهات">${ic('bell')}${nOver ? `<em>${nOver}</em>` : ''}</button>
        <div class="me"><span class="avatar">${esc(state.me.full_name.charAt(0))}</span><span class="me-t"><b>${esc(state.me.full_name)}</b><small>${state.me.role === 'admin' ? 'مدير' : 'مندوب'}</small></span></div>
        <button class="icon-btn" data-act="logout" title="تسجيل الخروج" aria-label="تسجيل الخروج">${ic('logout')}</button>
      </div>
    </div>
    <div class="panel" id="bell-panel" hidden></div>
  </header>
  <main class="content">
    ${state.stack.length ? `<div class="crumbs"><button class="link back" data-act="back">${ic('right')}رجوع</button>${cr.map((p, i) => `<span class="${i === cr.length - 1 ? 'cur-c' : ''}">${esc(p)}</span>`).join(ic('left', 'sep'))}</div>` : ''}
    ${body}
    ${footer()}
  </main>
  <nav class="bottom-nav">${items.slice(0, 5).map(([k, i, l, n]) => `<button class="${act === k ? 'on' : ''}" data-act="nav" data-k="${k}">${ic(i)}<span>${l}</span>${n ? `<em>${n}</em>` : ''}</button>`).join('')}</nav>`;
  renderLiveDot();
  const s = $('#search'); if (s && state._refocus) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); state._refocus = false; }
}

/* ---------------- charts (inline SVG, RTL: time runs right to left) ---------------- */
const fmtK = (n) => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : Math.abs(n) >= 1000 ? Math.round(n / 1000) + 'k' : String(Math.round(n)));
function niceMax(v) { if (v <= 0) return 1000; const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }

function weeklySeries(txs, weeks = 10) {
  const now = startOfDay(Date.now());
  const start = now - (weeks * 7 - 1) * DAY;
  const col = Array(weeks).fill(0), inv = Array(weeks).fill(0);
  for (const t of txs) {
    if (t.status !== 'approved') continue;
    const d = startOfDay(t.occurred_at); if (d < start) continue;
    const i = Math.min(weeks - 1, Math.floor((d - start) / (7 * DAY)));
    if (t.kind === 'collection') col[i] += Number(t.amount);
    else if (t.kind === 'invoice') inv[i] += Number(t.amount);
  }
  const labels = col.map((_, i) => new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'short' }).format(new Date(start + i * 7 * DAY)));
  return { labels, col, inv };
}

function lineChart({ labels, series }) {
  const W = 640, H = 250, padR = 50, padL = 14, padT = 14, padB = 30;
  const inset = 14, iw = W - padR - padL - inset * 2, ih = H - padT - padB;
  const max = niceMax(Math.max(...series.flatMap((s) => s.values)));
  const n = labels.length;
  const x = (i) => W - padR - inset - (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v) => padT + ih - (v / max) * ih;
  const ticks = [0, 1, 2, 3, 4].map((k) => (max * k) / 4);
  let g = ticks.map((t) => `<line class="gl" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${W - padR + 10}" y="${y(t) + 4}" text-anchor="start">${fmtK(t)}</text>`).join('');
  g += labels.map((l, i) => (i % 2 === (n - 1) % 2 ? `<text class="ax" x="${x(i)}" y="${H - 8}" text-anchor="middle">${l}</text>` : '')).join('');
  series.forEach((s, si) => {
    const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    if (si === 0) g += `<polygon class="area s${si}" points="${x(0)},${y(0)} ${pts} ${x(n - 1)},${y(0)}"/>`;
    g += `<polyline class="ln s${si}" points="${pts}"/>`;
    g += s.values.map((v, i) => `<circle class="pt s${si}" cx="${x(i)}" cy="${y(v)}" r="4"/>`).join('');
  });
  const colW = n > 1 ? iw / (n - 1) : iw;
  g += labels.map((l, i) => {
    const tip = `<b>أسبوع ${l}</b>` + series.map((s, si) => `<span><i class="sw s${si}"></i>${s.name}: ${money(s.values[i])}</span>`).join('');
    return `<rect class="hit" x="${x(i) - colW / 2}" y="${padT}" width="${colW}" height="${ih}" data-tip="${esc(tip)}"><title>${l}</title></rect>`;
  }).join('');
  return `<div class="chart"><div class="legend">${series.map((s, si) => `<span><i class="sw s${si}"></i>${s.name}</span>`).join('')}</div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map((s) => s.name).join(' و '))} أسبوعياً">${g}</svg></div>`;
}

function repBars(sums) {
  const W = 640, H = 250, padR = 46, padL = 12, padT = 22, padB = 30;
  const iw = W - padR - padL, ih = H - padT - padB;
  const max = niceMax(Math.max(1, ...sums.flatMap(({ s }) => [s.total, s.limit])));
  const y = (v) => padT + ih - (v / max) * ih;
  const slot = iw / Math.max(1, sums.length), bw = Math.min(56, slot * 0.42);
  const ticks = [0, 1, 2, 3, 4].map((k) => (max * k) / 4);
  let g = ticks.map((t) => `<line class="gl" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${W - padR + 8}" y="${y(t) + 4}">${fmtK(t)}</text>`).join('');
  sums.forEach(({ r, s }, i) => {
    const cx = W - padR - slot * (i + 0.5);
    const top = y(s.total), h = Math.max(0, padT + ih - top), rr = Math.min(4, h / 2);
    const cls = s.over ? 'bar bad' : 'bar s1';
    g += `<path class="${cls}" d="M${cx - bw / 2},${padT + ih} V${top + rr} Q${cx - bw / 2},${top} ${cx - bw / 2 + rr},${top} H${cx + bw / 2 - rr} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + rr} V${padT + ih} Z"/>`;
    g += `<line class="lim" x1="${cx - bw / 2 - 10}" x2="${cx + bw / 2 + 10}" y1="${y(s.limit)}" y2="${y(s.limit)}"/>`;
    g += `<text class="val ${s.over ? 'bad' : ''}" x="${cx}" y="${Math.min(top, y(s.limit)) - 7}" text-anchor="middle">${fmtK(s.total)}${s.over ? ' · موقوف' : ''}</text>`;
    g += `<text class="ax" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(r.full_name.split(' ')[0])}</text>`;
    const tip = `<b>${esc(r.full_name)}</b><span>المديونية: ${money(s.total)}</span><span>حد الائتمان: ${money(s.limit)}</span><span>${s.over ? 'تجاوز بـ ' + money(s.total - s.limit) : 'متاح ' + money(s.limit - s.total)}</span>`;
    g += `<rect class="hit" x="${cx - slot / 2}" y="${padT}" width="${slot}" height="${ih}" data-tip="${esc(tip)}" data-act="open-rep" data-id="${r.id}"/>`;
  });
  return `<div class="chart"><div class="legend"><span><i class="sw s1"></i>المديونية</span><span><i class="sw lim"></i>حد الائتمان</span><span><i class="sw bad"></i>تجاوز الحد</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="مديونية كل مندوب مقابل حد الائتمان">${g}</svg></div>`;
}

function showTip(el, ev) {
  let t = $('#tip'); if (!t) { t = document.createElement('div'); t.id = 'tip'; document.body.appendChild(t); }
  t.innerHTML = el.getAttribute('data-tip'); t.hidden = false;
  const w = t.offsetWidth, h = t.offsetHeight;
  let lx = ev.clientX - w / 2, ly = ev.clientY - h - 14;
  lx = Math.max(8, Math.min(window.innerWidth - w - 8, lx)); if (ly < 8) ly = ev.clientY + 18;
  t.style.left = lx + 'px'; t.style.top = ly + 'px';
}
function hideTip() { const t = $('#tip'); if (t) t.hidden = true; }
document.addEventListener('mousemove', (e) => { const el = e.target.closest?.('[data-tip]'); if (el) showTip(el, e); else hideTip(); });
document.addEventListener('mouseleave', hideTip);

function greet() {
  const h = new Date().getHours();
  return `<div class="hello"><h1>${h < 12 ? 'صباح الخير' : 'مساء الخير'}، ${esc(state.me.full_name.split(' ')[0])}</h1><span class="muted">${new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</span></div>`;
}

function tiles(list) {
  return `<div class="tiles">${list.map(([act, icon, label, tone, k, n, dis]) => `<button class="tile t-${tone}" data-act="${act}" ${k ? `data-k="${k}"` : ''} ${dis ? 'disabled' : ''}>${n ? `<em>${n}</em>` : ''}${ic(icon)}<span>${label}</span></button>`).join('')}</div>`;
}

function globalSearch() {
  return `<div class="search wide-search">${ic('search')}<input id="gsearch" type="search" placeholder="البحث عن العملاء بالاسم أو التليفون أو المنطقة" autocomplete="off"></div>`;
}

function footer() {
  return `<footer class="foot">
    ${api.mode === 'demo' ? `<span>${ic('zap')} نسخة تجريبية: البيانات محفوظة على هذا الجهاز فقط.</span><button class="link" data-act="reset-demo">استرجاع البيانات التجريبية</button>` : `<span>${ic('archive')} كل الحركات محفوظة في الأرشيف ولا تُحذف.</span>`}
  </footer>`;
}

function renderLiveDot() {
  const el = $('#live'); if (!el) return;
  const ok = state.liveStatus === 'SUBSCRIBED';
  el.classList.toggle('off', !ok);
  el.lastElementChild.textContent = ok ? 'مباشر' : 'جاري إعادة الاتصال…';
}

function visibleOverdue() {
  return state.customers.filter((c) => state.stats.get(c.id)?.overdue)
    .sort((a, b) => state.stats.get(b.id).overdueDays - state.stats.get(a.id).overdueDays);
}

const levelOf = (sum) => (sum.over ? 'bad' : sum.pct >= 0.85 ? 'warn' : 'ok');

function meter(sum) {
  return `<div class="meter ${levelOf(sum)}" role="img" aria-label="المديونية ${Math.round(sum.pct * 100)}% من حد الائتمان">
    <div class="bar"><span style="width:${Math.min(sum.pct, 1) * 100}%"></span></div>
    <div class="meter-l"><span>${Math.round(sum.pct * 100)}% من الحد</span><span>${sum.over ? 'تجاوز بـ ' + money(sum.total - sum.limit) : 'متاح ' + money(sum.limit - sum.total)}</span></div>
  </div>`;
}

function gauge(sum) {
  const r = 52, C = 2 * Math.PI * r, p = Math.min(sum.pct, 1);
  return `<div class="gauge ${levelOf(sum)}">
    <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="${r}" class="g-track"/><circle cx="60" cy="60" r="${r}" class="g-val" stroke-dasharray="${C * p} ${C}" transform="rotate(-90 60 60)"/></svg>
    <div class="g-t"><b>${Math.round(sum.pct * 100)}%</b><small>من الحد</small></div>
  </div>`;
}

function kpi(icon, label, value, sub = '', tone = '') {
  return `<div class="kpi ${tone}"><span class="kpi-ic">${ic(icon)}</span><div><span class="kpi-l">${label}</span><b class="kpi-v">${value}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
}

function statusChip(s) {
  if (s.balance <= 0.009) return '<span class="pill ok"><i></i>مسدد</span>';
  if (s.overdue) return `<span class="pill bad"><i></i>متأخر ${s.overdueDays} يوم</span>`;
  const left = TERM_DAYS - s.age + 1;
  return `<span class="pill ${left <= 3 ? 'warn' : 'neutral'}"><i></i>باقي ${left} يوم</span>`;
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
  if (!rows.length) return `<div class="empty">${ic('store')}<p>${list.length ? 'لا توجد نتائج مطابقة للبحث.' : 'لا يوجد عملاء بعد. اضغط "إضافة عميل" لتسجيل أول عميل ورصيده.'}</p></div>`;
  return `<div class="table-scroll"><table class="grid cust-list">
    <thead><tr><th>العميل</th>${showRep ? '<th>المندوب</th>' : ''}<th>النوع</th><th class="num">الرصيد المستحق</th><th class="num">تحصيل الشهر</th><th>حالة الأجل</th><th></th></tr></thead>
    <tbody>${rows.map((c) => {
      const s = state.stats.get(c.id);
      return `<tr class="${s.overdue ? 'row-bad' : ''}" data-act="open-customer" data-id="${c.id}" tabindex="0">
        <td class="c-name"><div class="who-cell"><span class="av ${s.overdue ? 'bad' : ''}">${esc(initials(c.name))}</span><div><b class="cname">${esc(c.name)}</b><small class="sub">${esc(c.location || '')}${c.phone ? ' · <span dir="ltr">' + esc(c.phone) + '</span>' : ''}</small></div></div></td>
        ${showRep ? `<td class="c-rep">${esc(profileName(c.rep_id))}</td>` : ''}
        <td class="c-type"><span class="tag">${TYPE[c.debt_type] || ''}</span></td>
        <td class="num strong c-bal">${money(s.balance)}</td>
        <td class="num c-month" data-l="تحصيل الشهر: ">${s.monthCollected ? money(s.monthCollected) : '<span class="muted">—</span>'}</td>
        <td class="c-stat">${statusChip(s)}${s.pending ? ' <span class="pill pend"><i></i>تصحيح معلق</span>' : ''}</td>
        <td class="act">${canCollect ? `<button class="btn primary sm" data-act="collect" data-id="${c.id}" ${s.balance <= 0 ? 'disabled' : ''}>${ic('wallet')}تحصيل</button>` : `<span class="row-go">${ic('left')}</span>`}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function listTools(extra = '') {
  return `<div class="tools">
    <div class="search">${ic('search')}<input id="search" type="search" placeholder="بحث بالاسم أو التليفون أو المنطقة" value="${esc(state.search)}" autocomplete="off"></div>
    <div class="seg" role="group" aria-label="نوع المديونية">
      ${['all', 'retail', 'wholesale'].map((k) => `<button class="${state.typeFilter === k ? 'on' : ''}" data-act="type" data-k="${k}">${k === 'all' ? 'الكل' : TYPE[k]}</button>`).join('')}
    </div>
    ${extra}
  </div>`;
}

function creditCard(sum, title, extra = '') {
  return `<section class="card credit ${sum.over ? 'is-bad' : ''}">
    <div class="card-h"><h2>${title}</h2>${sum.over ? '<span class="pill bad"><i></i>موقوف عن الآجل</span>' : `<span class="pill ${levelOf(sum) === 'warn' ? 'warn' : 'ok'}"><i></i>${levelOf(sum) === 'warn' ? 'قريب من الحد' : 'داخل الحد'}</span>`}</div>
    <div class="credit-b">
      ${gauge(sum)}
      <div class="credit-body">
        <span class="kpi-l">إجمالي المديونية</span>
        <div class="big">${money(sum.total)} <span class="cur">ج.م</span></div>
        <div class="credit-row">
          <div><span>حد الائتمان</span><b>${money(sum.limit)}</b></div>
          <div><span>${sum.over ? 'التجاوز' : 'المتاح'}</span><b class="${sum.over ? 't-bad' : 't-ok'}">${money(Math.abs(sum.limit - sum.total))}</b></div>
          <div><span>قطاعي</span><b>${money(sum.retail)}</b></div>
          <div><span>جملة</span><b>${money(sum.wholesale)}</b></div>
        </div>
        ${extra}
      </div>
    </div>
  </section>`;
}

function trendCard(txs, title) {
  const w = weeklySeries(txs);
  const totC = w.col.reduce((a, b) => a + b, 0), totI = w.inv.reduce((a, b) => a + b, 0);
  return `<section class="card">
    <div class="card-h"><h2>${title}</h2><span class="muted">آخر 10 أسابيع</span></div>
    <div class="mini-stats"><div><span>إجمالي التحصيل</span><b class="t-ok">${money(totC)}</b></div><div><span>إجمالي الفواتير الآجل</span><b>${money(totI)}</b></div></div>
    ${lineChart({ labels: w.labels, series: [{ name: 'التحصيل', values: w.col }, { name: 'فواتير آجل', values: w.inv }] })}
  </section>`;
}

function recentCard(limit = 6) {
  const recent = state.txs.filter((t) => t.status === 'approved' && t.kind === 'collection').sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at)).slice(0, limit);
  return `<section class="card">
    <div class="card-h"><h2>أحدث التحصيلات</h2></div>
    ${recent.length ? `<ul class="mini">${recent.map((t) => { const c = state.customers.find((x) => x.id === t.customer_id); return `<li data-act="open-customer" data-id="${t.customer_id}"><span class="av ok">${ic('down')}</span><div><b>${esc(c?.name || '')}</b><small class="sub">${state.me.role === 'admin' ? esc(profileName(t.created_by)) + ' · ' : ''}${fmtDT(t.occurred_at)}</small></div><div class="mini-v"><b class="t-ok">${money(t.amount)}</b></div></li>`; }).join('')}</ul>` : `<div class="empty"><p>لا توجد تحصيلات بعد.</p></div>`}
  </section>`;
}

function overdueCard(limit = 6) {
  const overdue = visibleOverdue();
  return `<section class="card">
    <div class="card-h"><h2>أكثر العملاء تأخيراً</h2><button class="btn ghost sm" data-act="nav" data-k="overdue">عرض الكل</button></div>
    ${overdue.length ? `<ul class="mini">${overdue.slice(0, limit).map((c) => { const s = state.stats.get(c.id); return `<li data-act="open-customer" data-id="${c.id}"><span class="av bad">${esc(initials(c.name))}</span><div><b>${esc(c.name)}</b><small class="sub">${state.me.role === 'admin' ? esc(profileName(c.rep_id)) : esc(c.location || '')}</small></div><div class="mini-v"><b>${money(s.balance)}</b><span class="pill bad"><i></i>${s.overdueDays} يوم تأخير</span></div></li>`; }).join('')}</ul>` : `<div class="empty">${ic('check')}<p>لا يوجد عملاء متأخرين.</p></div>`}
  </section>`;
}

/* ----- rep home ----- */
function viewRepHome() {
  const sum = repSummary(state.me, state.customers, state.stats);
  const overdue = sum.customers.filter((c) => state.stats.get(c.id).overdue).length;
  return `
  ${greet()}
  ${sum.over ? `<div class="banner bad" role="alert">${ic('lock')}<div><b>تم إيقاف البيع الآجل</b><span>مديونيتك ${money(sum.total)} ج.م تجاوزت حد الائتمان (${money(sum.limit)}) بمبلغ ${money(sum.total - sum.limit)} ج.م. قم بالتحصيل من العملاء لاستئناف العمل.</span></div></div>` : ''}
  ${tiles([
    ['collect-pick', 'wallet', 'تسجيل تحصيل', 'green'],
    ['invoice-pick', 'file', 'فاتورة آجل', 'blue', '', 0, sum.over],
    ['add-customer', 'userplus', 'عميل جديد', 'purple'],
    ['scroll-customers', 'store', 'عملائي', 'teal', '', sum.customers.length],
    ['nav', 'alert', 'المتأخرين', 'red', 'overdue', overdue],
  ])}
  <div class="row">
    ${creditCard(sum, 'حد الائتمان')}
    ${trendCard(state.txs, 'التحصيل والفواتير')}
  </div>
  <section class="card" id="my-customers">
    <div class="card-h"><h2>عملائي</h2><span class="muted">${sum.customers.length} عميل · مرتبين حسب التأخير ثم الرصيد</span></div>
    ${listTools()}
    ${customerTable(sum.customers)}
  </section>`;
}

/* ----- admin ----- */
function adminSums() {
  return reps().filter((r) => r.active).map((r) => ({ r, s: repSummary(r, state.customers, state.stats) }));
}

function repCards(sums) {
  return `<div class="reps">${sums.sort((a, b) => b.s.pct - a.s.pct).map(({ r, s }) => `
    <button class="rep ${s.over ? 'is-bad' : ''}" data-act="open-rep" data-id="${r.id}">
      <div class="rep-h"><span class="avatar">${esc(r.full_name.charAt(0))}</span><div><b>${esc(r.full_name)}</b><small class="sub" dir="ltr">@${esc(r.username)}</small></div>${s.over ? '<span class="pill bad"><i></i>موقوف</span>' : `<span class="pill ${levelOf(s) === 'warn' ? 'warn' : 'ok'}"><i></i>${levelOf(s) === 'warn' ? 'قريب من الحد' : 'نشط'}</span>`}</div>
      <div class="rep-n">${money(s.total)} <span class="cur">ج.م</span></div>
      ${meter(s)}
      <div class="rep-f"><span>${ic('store')}${s.customers.length} عميل</span><span>${ic('down')}${money(s.month)} هذا الشهر</span>${s.overdue ? `<span class="t-bad">${ic('alert')}${s.overdue} متأخر</span>` : ''}</div>
    </button>`).join('') || `<div class="empty">${ic('users')}<p>لا يوجد مناديب مفعّلين بعد.</p></div>`}
  </div>`;
}

function viewAdminHome() {
  const sums = adminSums();
  const total = sums.reduce((a, x) => a + x.s.total, 0);
  const month = sums.reduce((a, x) => a + x.s.month, 0);
  const stopped = sums.filter((x) => x.s.over).length;
  const overdue = visibleOverdue();
  const overdueAmt = overdue.reduce((a, c) => a + state.stats.get(c.id).balance, 0);
  const pendingTx = state.txs.filter((t) => t.status === 'pending').length;
  const pendingAcc = reps().filter((r) => !r.active).length;
  return `
  ${greet()}
  ${globalSearch()}
  ${tiles([
    ['nav', 'users', 'المناديب', 'purple', 'reps', 0],
    ['nav', 'store', 'كل العملاء', 'blue', 'customers', 0],
    ['nav', 'alert', 'المتأخرين', 'red', 'overdue', overdue.length],
    ['nav', 'check', 'طلبات التصحيح', 'amber', 'approvals', pendingTx],
    ['nav', 'userplus', 'حسابات جديدة', 'teal', 'accounts', pendingAcc],
  ])}
  <div class="kpis four">
    ${kpi('wallet', 'إجمالي الآجل في السوق', money(total), `${sums.length} مندوب نشط`)}
    ${kpi('down', 'تحصيل الشهر', money(month), monthLabel(monthKey(Date.now())), 'ok')}
    ${kpi('lock', 'مناديب تجاوزوا الحد', stopped, stopped ? 'موقوفين عن الآجل' : 'الكل داخل الحد', stopped ? 'bad' : '')}
    ${kpi('alert', 'عملاء متأخرين', overdue.length, `بإجمالي ${money(overdueAmt)} ج.م`, overdue.length ? 'bad' : '')}
  </div>
  <div class="row">
    ${trendCard(state.txs, 'التحصيل والفواتير')}
    <section class="card">
      <div class="card-h"><h2>المديونية حسب المندوب</h2><button class="btn ghost sm" data-act="nav" data-k="reps">عرض المناديب</button></div>
      ${repBars(sums.slice().sort((a, b) => b.s.total - a.s.total))}
    </section>
  </div>
  <div class="row">
    ${recentCard()}
    ${overdueCard()}
  </div>`;
}

function viewAllCustomers() {
  return `<section class="card"><div class="card-h"><h2>كل العملاء</h2><span class="muted">${state.customers.length} عميل</span></div>${listTools()}${customerTable(state.customers, { showRep: true, actions: false })}</section>`;
}

function viewReps() {
  return `<section class="card"><div class="card-h"><div><h2>كل المناديب</h2><small class="sub">مرتبين حسب نسبة استخدام حد الائتمان</small></div></div>${repCards(adminSums())}</section>`;
}

function viewOverdue() {
  const list = visibleOverdue();
  const amt = list.reduce((a, c) => a + state.stats.get(c.id).balance, 0);
  return `<section class="card">
    <div class="card-h"><div><h2>عملاء تجاوزوا ${TERM_DAYS} يوم</h2><small class="sub">${list.length} عميل بإجمالي ${money(amt)} ج.م</small></div></div>
    ${list.length ? customerTable(list, { showRep: state.me.role === 'admin', actions: true }) : `<div class="empty">${ic('check')}<p>لا يوجد عملاء متأخرين.</p></div>`}
  </section>`;
}

function viewApprovals() {
  const list = state.txs.filter((t) => t.status === 'pending');
  const done = state.txs.filter((t) => t.kind === 'correction' && t.status !== 'pending').sort((a, b) => new Date(b.reviewed_at || b.created_at) - new Date(a.reviewed_at || a.created_at)).slice(0, 15);
  return `<section class="card"><div class="card-h"><div><h2>طلبات بانتظار الموافقة</h2><small class="sub">المندوب لا يستطيع تعديل أو حذف أي حركة. التصحيح يُطبق فقط بعد موافقتك.</small></div></div>
    ${list.length ? pendingList(list) : `<div class="empty">${ic('check')}<p>لا توجد طلبات معلقة.</p></div>`}</section>
    ${done.length ? `<section class="card"><div class="card-h"><h2>سجل التصحيحات</h2></div>${pendingList(done)}</section>` : ''}`;
}

function viewAccounts() {
  const list = reps().filter((r) => !r.active);
  return `<section class="card"><div class="card-h"><div><h2>حسابات بانتظار التفعيل</h2><small class="sub">حدد حد الائتمان لكل مندوب ثم فعّل الحساب.</small></div></div>
    ${list.length ? `<div class="stack">${list.map((r) => `<form class="row-form" data-form="activate" data-id="${r.id}">
      <div class="who-cell"><span class="avatar">${esc(r.full_name.charAt(0))}</span><div><b>${esc(r.full_name)}</b><small class="sub" dir="ltr">@${esc(r.username)} · ${fmtDate(r.created_at)}</small></div></div>
      <label class="fl">حد الائتمان (ج.م)<input name="limit" inputmode="decimal" placeholder="500,000" required></label>
      <button class="btn primary">${ic('check')}تفعيل</button></form>`).join('')}</div>` : `<div class="empty">${ic('userplus')}<p>لا توجد حسابات جديدة.</p></div>`}</section>`;
}

function pendingList(list) {
  return `<div class="stack">${list.map((t) => {
    const c = state.customers.find((x) => x.id === t.customer_id);
    const admin = state.me.role === 'admin';
    const st = t.status === 'pending' ? '' : t.status === 'approved' ? '<span class="pill ok"><i></i>تمت الموافقة</span>' : '<span class="pill neutral"><i></i>مرفوض</span>';
    return `<div class="req">
      <span class="req-ic ${t.amount < 0 ? 'ok' : 'bad'}">${ic('edit')}</span>
      <div class="req-b"><div><b>${esc(c?.name || '')}</b> <span class="muted">· ${esc(profileName(t.created_by))} · ${fmtDT(t.created_at)}</span></div>
      <p><b>${t.amount < 0 ? 'تقليل المديونية' : 'زيادة المديونية'} ${money(Math.abs(t.amount))} ج.م</b> — ${esc(t.note)}</p></div>
      ${t.status === 'pending' ? (admin ? `<div class="btns"><button class="btn ghost sm" data-act="reject" data-id="${t.id}">رفض</button><button class="btn primary sm" data-act="approve" data-id="${t.id}">${ic('check')}موافقة</button></div>` : '<span class="pill pend"><i></i>بانتظار الإدارة</span>') : st}
    </div>`;
  }).join('')}</div>`;
}

/* ----- admin: one rep ----- */
function viewRepDetail(id) {
  const r = state.profiles.find((p) => p.id === id);
  if (!r) return `<div class="empty"><p>المندوب غير موجود.</p></div>`;
  const s = repSummary(r, state.customers, state.stats);
  return `
  <div class="grid-2">
    ${creditCard(s, 'مديونية ' + esc(r.full_name), `<form class="limit-form" data-form="limit" data-id="${r.id}">
        <label class="fl">تعديل حد الائتمان<input name="limit" inputmode="decimal" value="${money(r.credit_limit)}"></label>
        <button class="btn secondary sm">حفظ</button></form>`)}
    <div class="kpis">
      ${kpi('down', 'تحصيل الشهر', money(s.month), monthLabel(monthKey(Date.now())), 'ok')}
      ${kpi('store', 'عدد العملاء', s.customers.length)}
      ${kpi('alert', 'عملاء متأخرين', s.overdue, '', s.overdue ? 'bad' : '')}
      ${kpi('shield', 'حالة الحساب', s.over ? 'موقوف' : 'نشط', s.over ? 'تجاوز الحد' : 'داخل الحد', s.over ? 'bad' : 'ok')}
    </div>
  </div>
  <section class="card">
    <div class="card-h"><div><h2>عملاء ${esc(r.full_name)}</h2></div><button class="btn ghost sm danger" data-act="toggle-active" data-id="${r.id}">${ic('lock')}إيقاف الحساب</button></div>
    ${listTools()}
    ${customerTable(s.customers, { actions: false })}
  </section>`;
}

/* ----- customer detail (both roles) ----- */
function viewCustomer(id) {
  const c = state.customers.find((x) => x.id === id);
  if (!c) return `<div class="empty"><p>العميل غير موجود.</p></div>`;
  const s = state.stats.get(id);
  const isRep = state.me.role === 'rep';
  const repSum = repSummary(state.profiles.find((p) => p.id === c.rep_id) || state.me, state.customers, state.stats);
  let run = 0;
  const rows = s.list.map((t) => { run += effect(t); return { t, run }; });
  const months = [...new Set(s.list.map((t) => monthKey(t.occurred_at)))].sort().reverse();
  const shown = rows.filter((x) => state.monthFilter === 'all' || monthKey(x.t.occurred_at) === state.monthFilter).reverse();
  const byMonth = months.map((k) => {
    const ts = s.list.filter((t) => t.status === 'approved' && monthKey(t.occurred_at) === k);
    return { k, debit: ts.filter((t) => effect(t) > 0).reduce((a, t) => a + effect(t), 0), credit: ts.filter((t) => effect(t) < 0).reduce((a, t) => a - effect(t), 0) };
  });
  const pending = s.list.filter((t) => t.status === 'pending');
  const kindIc = { opening: 'archive', invoice: 'file', collection: 'down', correction: 'edit' };
  return `
  <section class="card profile ${s.overdue ? 'is-bad' : ''}">
    <div class="profile-h">
      <span class="av lg ${s.overdue ? 'bad' : ''}">${esc(initials(c.name))}</span>
      <div class="profile-t">
        <div class="pt-row"><h2>${esc(c.name)}</h2><span class="tag">${TYPE[c.debt_type]}</span>${statusChip(s)}</div>
        <div class="facts">
          ${c.phone ? `<span>${ic('phone')}<b dir="ltr" class="sel">${esc(c.phone)}</b></span>` : ''}
          ${c.location ? `<span>${ic('pin')}${esc(c.location)}</span>` : ''}
          ${!isRep ? `<span>${ic('users')}${esc(profileName(c.rep_id))}</span>` : ''}
          <span>${ic('clock')}عميل منذ ${fmtDate(c.created_at)}</span>
        </div>
      </div>
      <div class="btns">
        ${isRep ? `<button class="btn ghost" data-act="correction" data-id="${c.id}">${ic('edit')}طلب تصحيح</button>
        <button class="btn secondary" data-act="invoice" data-id="${c.id}" ${repSum.over ? 'disabled title="موقوف: تجاوز حد الائتمان"' : ''}>${ic('file')}فاتورة آجل</button>
        <button class="btn primary" data-act="collect" data-id="${c.id}" ${s.balance <= 0 ? 'disabled' : ''}>${ic('wallet')}تحصيل</button>` :
        `<button class="btn secondary" data-act="correction" data-id="${c.id}">${ic('edit')}تصحيح الرصيد</button>`}
      </div>
    </div>
    <div class="stats">
      <div class="${s.overdue ? 'bad' : ''}"><span>الرصيد المستحق</span><b>${money(s.balance)} <small>ج.م</small></b></div>
      <div><span>تحصيل الشهر</span><b class="t-ok">${money(s.monthCollected)} <small>ج.م</small></b></div>
      <div class="${s.overdue ? 'bad' : ''}"><span>${s.overdue ? 'التأخير' : 'آخر يوم في الأجل'}</span><b>${s.balance > 0 ? (s.overdue ? `${s.overdueDays} يوم` : fmtDate(s.dueDate)) : '—'}</b></div>
      <div><span>آخر تحصيل</span><b>${s.lastCollection ? fmtDate(s.lastCollection) : '—'}</b></div>
    </div>
  </section>

  ${pending.length ? `<section class="card"><div class="card-h"><h2>طلبات تصحيح معلقة</h2></div>${pendingList(pending)}</section>` : ''}

  <div class="grid-ledger">
    <section class="card">
      <div class="card-h"><div><h2>كشف الحساب</h2><small class="sub">${shown.length} حركة</small></div>
        <select id="month" aria-label="الشهر"><option value="all">كل الفترات</option>${months.map((k) => `<option value="${k}" ${state.monthFilter === k ? 'selected' : ''}>${monthLabel(k)}</option>`).join('')}</select>
      </div>
      <div class="table-scroll"><table class="grid ledger">
        <thead><tr><th>التاريخ</th><th>البيان</th><th class="num">مدين</th><th class="num">دائن</th><th class="num">الرصيد</th><th>بواسطة</th></tr></thead>
        <tbody>${shown.map(({ t, run }) => {
          const e = t.kind === 'collection' ? -t.amount : Number(t.amount);
          const off = t.status !== 'approved';
          return `<tr class="${off ? 'row-off' : ''}">
            <td class="nowrap muted-c">${fmtDT(t.occurred_at)}</td>
            <td><div class="kind k-${t.kind}">${ic(kindIc[t.kind])}<div><b>${KIND[t.kind]}</b>${t.status === 'pending' ? ' <span class="pill pend"><i></i>معلق</span>' : t.status === 'rejected' ? ' <span class="pill neutral"><i></i>مرفوض</span>' : ''}${t.note && t.note !== 'رصيد افتتاحي' ? `<small class="sub">${esc(t.note)}</small>` : ''}</div></div></td>
            <td class="num">${e > 0 ? money(e) : ''}</td>
            <td class="num t-ok">${e < 0 ? money(-e) : ''}</td>
            <td class="num strong">${off ? '<span class="muted">—</span>' : money(run)}</td>
            <td class="muted-c nowrap">${esc(profileName(t.created_by))}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="6"><div class="empty"><p>لا توجد حركات.</p></div></td></tr>'}</tbody>
      </table></div>
    </section>
    <section class="card">
      <div class="card-h"><div><h2>الأرشيف الشهري</h2><small class="sub">محفوظ دائماً ولا يُحذف</small></div></div>
      <ul class="months">${byMonth.map((m) => `<li data-act="month" data-k="${m.k}" class="${state.monthFilter === m.k ? 'on' : ''}"><b>${monthLabel(m.k)}</b><span><small>مدين</small>${money(m.debit)}</span><span class="t-ok"><small>محصّل</small>${money(m.credit)}</span></li>`).join('')}</ul>
    </section>
  </div>`;
}

/* ----- auth screens ----- */
function authShell(inner) {
  return `<div class="auth">
    <section class="auth-art">
      <div class="aa-brand"><span class="logo" aria-hidden="true">${ic('store')}</span><div><b>السلطان للتوزيع</b><small>السويس</small></div></div>
      <div class="aa-copy">
        <h2>دفتر مديونيات المناديب</h2>
        <p>تسجيل العملاء والتحصيل اليومي، ومتابعة لحظية للإدارة، وأرشيف كامل لا يُحذف.</p>
        <ul>
          <li>${ic('zap')}<span>تحديث لحظي بين المندوب والإدارة بدون إعادة تحميل</span></li>
          <li>${ic('shield')}<span>حد ائتمان لكل مندوب وإيقاف تلقائي عند تجاوزه</span></li>
          <li>${ic('clock')}<span>تنبيه بالعملاء المتأخرين بعد ${TERM_DAYS} يوم من الفاتورة</span></li>
          <li>${ic('archive')}<span>سجل دائم لكل حركة: من سجّلها ومتى</span></li>
        </ul>
      </div>
      <small class="aa-foot">© ${new Date().getFullYear()} السلطان للتوزيع</small>
    </section>
    <section class="auth-form"><div class="auth-card">${inner}</div></section>
  </div>`;
}

function renderAuth() {
  const tab = state.authTab;
  root().innerHTML = authShell(`
      <div class="m-brand"><span class="logo" aria-hidden="true">${ic('store')}</span><b>السلطان للتوزيع</b></div>
      <div><h1>${tab === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب مندوب'}</h1><p class="muted">${tab === 'login' ? 'ادخل باسم المستخدم وكلمة المرور الخاصة بك.' : 'بعد التسجيل تقوم الإدارة بتفعيل الحساب وتحديد حد الائتمان.'}</p></div>
      ${tab === 'login' ? `
      <form data-form="login" class="form">
        <label class="fl">اسم المستخدم<input id="login-user" name="username" autocomplete="username" dir="ltr" required></label>
        <label class="fl">كلمة المرور<input id="login-pass" name="password" type="password" autocomplete="current-password" dir="ltr" required></label>
        <button class="btn primary block lg">دخول</button>
      </form>
      <p class="switch">مندوب جديد؟ <button class="link" data-act="auth-tab" data-k="signup">إنشاء حساب</button></p>` : `
      <form data-form="signup" class="form">
        <label class="fl">الاسم بالكامل<input id="su-name" name="full_name" required></label>
        <label class="fl">اسم المستخدم (حروف إنجليزية)<input id="su-user" name="username" dir="ltr" pattern="[A-Za-z0-9_.\\-]{3,30}" title="3 حروف على الأقل، إنجليزي أو أرقام" required></label>
        <label class="fl">كلمة المرور<input id="su-pass" name="password" type="password" dir="ltr" minlength="6" required></label>
        <button class="btn primary block lg">إنشاء الحساب</button>
      </form>
      <p class="switch">لديك حساب؟ <button class="link" data-act="auth-tab" data-k="login">تسجيل الدخول</button></p>`}
      <div class="form-msg" id="auth-msg" role="status"></div>
      ${api.mode === 'demo' ? `<div class="demo">
        <span class="demo-h">${ic('zap')}نسخة تجريبية · دخول سريع (كلمة المرور 1234)</span>
        <div class="demo-list">
          ${[['sayed', 'سيد', 'مدير'], ['mohamed', 'محمد', 'مدير'], ['ahmed', 'أحمد', 'حد 1,000,000'], ['mahmoud', 'محمود', 'حد 500,000'], ['karim', 'كريم', 'حد 200,000 · موقوف']].map(([u, n, l]) => `<button class="demo-acc" data-act="demo-login" data-u="${u}"><span class="avatar">${n.charAt(0)}</span><span><b>${n}</b><small>${l}</small></span></button>`).join('')}
        </div>
      </div>` : ''}`);
}

function renderInactive() {
  root().innerHTML = authShell(`
    <span class="big-ic">${ic('clock')}</span>
    <div><h1>أهلاً ${esc(state.me.full_name)}</h1><p class="muted">حسابك بانتظار التفعيل من الإدارة وتحديد حد الائتمان. ستتحدث هذه الصفحة تلقائياً فور التفعيل.</p></div>
    <button class="btn ghost block" data-act="logout">${ic('logout')}تسجيل الخروج</button>`);
}

/* ---------------- modals ---------------- */
function modal(title, inner, onSubmit) {
  closeModal();
  const el = document.createElement('div');
  el.className = 'overlay';
  el.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-h"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="إغلاق">${ic('x')}</button></div>
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

function openCollectPick() {
  const list = state.customers.filter((c) => state.stats.get(c.id).balance > 0).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  modal('تسجيل تحصيل', `
    <label>العميل<select id="f-customer" name="customer" required><option value="">اختار العميل</option>${list.map((c) => `<option value="${c.id}">${esc(c.name)} · عليه ${money(state.stats.get(c.id).balance)}</option>`).join('')}</select></label>
    <button class="btn primary block lg">متابعة</button>`,
    async (fd) => { const id = fd.get('customer'); if (!id) throw new Error('اختار العميل'); setTimeout(() => openCollect(id), 0); });
}

function openCollect(cid) {
  const c = state.customers.find((x) => x.id === cid); const s = state.stats.get(cid);
  const form = modal('تحصيل من ' + c.name, `
    <div class="ctx"><span>عليه دلوقتي</span><b>${egp(s.balance)}</b></div>
    ${amountField('amount', 'المبلغ اللي استلمته')}
    <div class="preview" id="pv">الرصيد بعد التحصيل: <b>${money(s.balance)}</b></div>
    <label>ملاحظة (اختياري)<input id="f-note" name="note" placeholder="مثلاً: كاش / شيك رقم …"></label>
    <button class="btn primary block lg">تسجيل التحصيل</button>`,
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
    <button class="btn primary block lg">تسجيل الفاتورة</button>`,
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
    <button class="btn primary block lg">حفظ العميل</button>`,
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
    <button class="btn primary block lg">${admin ? 'تطبيق التصحيح' : 'إرسال الطلب للإدارة'}</button>`,
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
  p.innerHTML = `<div class="panel-in">
    <div class="sec-head"><h3>${ic('bell')} عملاء تجاوزوا ${TERM_DAYS} يوم</h3>${canNotify && Notification.permission === 'default' ? '<button class="link" data-act="enable-notify">فعّل إشعارات المتصفح</button>' : ''}</div>
    ${list.length ? `<ul class="notes">${list.slice(0, 40).map((c) => { const s = state.stats.get(c.id); return `<li data-act="open-customer" data-id="${c.id}"><b>${esc(c.name)}</b><span>${money(s.balance)} ج.م · متأخر ${s.overdueDays} يوم${state.me.role === 'admin' ? ' · ' + esc(profileName(c.rep_id)) : ''}</span></li>`; }).join('')}</ul>` : '<div class="empty">مفيش تنبيهات.</div>'}
  </div>`;
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
      case 'home': nav('home'); break;
      case 'nav': nav(el.dataset.k); break;
      case 'back': back(); break;
      case 'logout': await api.signOut(); state.me = null; state.view = { name: 'home' }; state.stack = []; render(); break;
      case 'bell': openBell(); break;
      case 'enable-notify': await Notification.requestPermission(); maybeNotify(); closePanels(); break;
      case 'open-customer': e.stopPropagation(); closePanels(); go({ name: 'customer', id }); break;
      case 'open-rep': go({ name: 'rep', id }); break;
      case 'collect': e.stopPropagation(); openCollect(id); break;
      case 'invoice': openInvoice(id); break;
      case 'invoice-pick': openInvoice(null); break;
      case 'collect-pick': openCollectPick(); break;
      case 'scroll-customers': $('#my-customers')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
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
  if (e.target.id === 'gsearch') { const v = e.target.value; state.view = { name: 'customers' }; state.stack = []; state.search = v; state._refocus = true; render(); }
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
