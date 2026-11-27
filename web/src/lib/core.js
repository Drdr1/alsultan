/* Core: helpers, money rules, demo backend (local, realtime across tabs) and Supabase backend. */
export const CFG = window.APP_CONFIG || {};
export const TERM_DAYS = Number(CFG.termDays) || 15;
export const LIVE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
export const DAY = 86400000;

/* ---------------- helpers ---------------- */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
export const egp = (n) => `${money(n)} <span class="cur">ج.م</span>`;
export const dFmt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' });
export const dtFmt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const mFmt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { year: 'numeric', month: 'long' });
export const fmtDate = (d) => dFmt.format(new Date(d));
export const fmtDT = (d) => dtFmt.format(new Date(d));
export const monthKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
export const monthLabel = (k) => { const [y, m] = k.split('-').map(Number); return mFmt.format(new Date(y, m - 1, 1)); };
export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
export const parseAmount = (s) => {
  const t = String(s ?? '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٫]/g, '.').replace(/[,،\s]/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};
export const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
export const KIND = { opening: 'رصيد افتتاحي', invoice: 'فاتورة آجل', collection: 'تحصيل', return: 'مرتجع', correction: 'تصحيح' };
// Admin permissions an owner can give a manager (owners have all of them).
export const PERMS = { credit: 'تعديل حد الائتمان', review: 'التصحيح والمرتجعات', coding: 'تكويد العملاء' };
export const dayKey = (d = Date.now()) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
// A rep's day has no fixed hours: it stays open until he closes it, and the next day starts right after.
const ms = (x) => new Date(x).getTime();
const repClosings = (closings, repId) => (closings || []).filter((x) => x.rep_id === repId).sort((a, b) => ms(a.created_at) - ms(b.created_at));
export function openDay(closings, txs, repId) {
  const cl = repClosings(closings, repId), last = cl.length ? ms(cl[cl.length - 1].created_at) : 0;
  const mine = txs.filter((t) => t.rep_id === repId && t.created_by === repId && t.status !== 'rejected' && ms(t.created_at) > last);
  const start = mine.reduce((a, t) => (a == null || ms(t.created_at) < a ? ms(t.created_at) : a), null);
  const sum = (k) => mine.filter((t) => t.kind === k).reduce((a, t) => a + Number(t.amount), 0);
  return { last: cl[cl.length - 1] || null, txs: mine, day: start == null ? null : dayKey(start), collections: sum('collection'), invoices: sum('invoice'), returns: sum('return'), count: mine.length };
}
// Which day a transaction is counted on: the rep's own entries go to the day he closed them in; anything else by its date.
export function dayLabeler(closings, txs, repId) {
  const cl = repClosings(closings, repId), open = openDay(closings, txs, repId).day;
  return (t) => {
    if (t.created_by !== repId) return dayKey(t.occurred_at);
    const c = cl.find((x) => ms(x.created_at) >= ms(t.created_at));
    return c ? c.day : open;
  };
}
// The rep's open day started before today = he didn't close yesterday.
export const unclosedDay = (closings, txs, repId, now = Date.now()) => { const d = openDay(closings, txs, repId).day; return d && d < dayKey(now) ? d : null; };
export const dueOf = (t) => new Date(t.occurred_at).getTime() + (TERM_DAYS - 1) * DAY; // last day of the term for an invoice
export const TYPE = { retail: 'قطاعي', wholesale: 'جملة' };
export const REP_TYPE = { retail: 'مندوب قطاعي', wholesale: 'مندوب جملة' };

/* ---------------- domain logic ---------------- */
// Signed amount: collections and returns lower the debt.
export const signed = (t) => (t.kind === 'collection' || t.kind === 'return' ? -Number(t.amount) : Number(t.amount));
export function effect(t) {
  if (t.status !== 'approved') return 0;
  return signed(t);
}

// FIFO: collections pay the oldest debt first. The oldest unpaid part decides overdue.
export function analyzeCustomer(c, txs, now = Date.now()) {
  const list = txs.filter((t) => t.customer_id === c.id).sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at) || new Date(a.created_at) - new Date(b.created_at));
  let balance = 0, credit = 0, monthCollected = 0, lastCollection = null;
  const debits = [];
  const mk = monthKey(now);
  for (const t of list) {
    const e = effect(t);
    balance += e;
    if (e > 0) debits.push({ at: new Date(t.occurred_at).getTime(), left: e, t });
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
    // invoices (and opening balance) still unpaid, oldest first, with what is left and the due day
    openItems: open.map((d) => ({ t: d.t, left: Math.round(d.left * 100) / 100, due: d.at + (TERM_DAYS - 1) * DAY })),
  };
}

export function repSummary(rep, customers, stats) {
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

/* ---------------- roles ---------------- */
export const isOwner = (p) => !!p && p.role === 'admin' && p.active !== false && !!p.is_owner;
export const hasPerm = (p, k) => isOwner(p) || (!!p && p.role === 'admin' && p.active !== false && (p.perms || []).includes(k));
export const inScopes = (admin, rep) => (admin?.scopes || []).some((x) => x.agency_id === rep.agency_id && x.rep_type === rep.rep_type);

/* ---------------- demo backend (local, realtime across tabs) ---------------- */
export function demoSeed() {
  const now = Date.now();
  const at = (daysAgo, h = 11) => { const d = new Date(now - daysAgo * DAY); d.setHours(h, 15, 0, 0); return d.toISOString(); };
  const profiles = [
    { id: 'u-sayed', username: 'sayed', full_name: 'سيد', role: 'admin', is_owner: true, title: 'مدير عام', credit_limit: 0, active: true, created_at: at(120) },
    { id: 'u-mohamed', username: 'mohamed', full_name: 'محمد', role: 'admin', is_owner: true, title: 'مدير عام', credit_limit: 0, active: true, created_at: at(120) },
    { id: 'u-barqi', username: 'barqi', full_name: 'محمد البرقي', role: 'admin', title: 'مدير فرع تايجر', scopes: [{ agency_id: 'ag-tiger', rep_type: 'retail' }, { agency_id: 'ag-tiger', rep_type: 'wholesale' }], credit_limit: 0, active: true, created_at: at(110) },
    { id: 'u-younis', username: 'younis', full_name: 'محمد يونس', role: 'admin', title: 'مشرف تجزئة', scopes: [{ agency_id: 'ag-tiger', rep_type: 'retail' }], credit_limit: 0, active: true, created_at: at(110) },
    { id: 'u-aref', username: 'aref', full_name: 'أحمد عارف', role: 'admin', title: 'مشرف جملة', scopes: [{ agency_id: 'ag-tiger', rep_type: 'wholesale' }], credit_limit: 0, active: true, created_at: at(110) },
    { id: 'u-mokhtar', username: 'mokhtar', full_name: 'محمد مختار', role: 'admin', title: 'محاسب الفرع', scopes: [{ agency_id: 'ag-tiger', rep_type: 'retail' }, { agency_id: 'ag-tiger', rep_type: 'wholesale' }], perms: ['credit', 'review', 'coding'], credit_limit: 0, active: true, created_at: at(110) },
    { id: 'u-ezzat', username: 'ezzat', full_name: 'محمد عزت', role: 'admin', title: 'محاسب', scopes: [{ agency_id: 'ag-tiger', rep_type: 'retail' }, { agency_id: 'ag-tiger', rep_type: 'wholesale' }], perms: ['credit', 'review', 'coding'], credit_limit: 0, active: true, created_at: at(110) },
    { id: 'u-gomaa', username: 'gomaa', full_name: 'محمود جمعة', role: 'admin', title: 'محاسب', scopes: [{ agency_id: 'ag-tiger', rep_type: 'retail' }, { agency_id: 'ag-tiger', rep_type: 'wholesale' }], perms: ['credit', 'review', 'coding'], credit_limit: 0, active: true, created_at: at(110) },
    { id: 'u-ahmed', username: 'ahmed', full_name: 'أحمد عبد العزيز', role: 'rep', credit_limit: 1000000, rep_type: 'wholesale', agency_id: 'ag-tiger', active: true, created_at: at(100) },
    { id: 'u-mahmoud', username: 'mahmoud', full_name: 'محمود السيد', role: 'rep', credit_limit: 500000, rep_type: 'retail', agency_id: 'ag-molfix', active: true, created_at: at(100) },
    { id: 'u-karim', username: 'karim', full_name: 'كريم فتحي', role: 'rep', credit_limit: 200000, rep_type: 'retail', agency_id: 'ag-tiger', active: true, created_at: at(100) },
    { id: 'u-youssef', username: 'youssef', full_name: 'يوسف رمضان', role: 'rep', credit_limit: 0, rep_type: 'wholesale', agency_id: 'ag-molfix', active: false, created_at: at(1) },
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
  const owners = ['الحاج محمد سعيد', 'سعيد عبد الله', 'محمود النجار', 'د. هاني فؤاد', 'إبراهيم الشاذلي', 'أم هاشم', 'فتحي عبد الرحمن', 'رضا السيد', 'عادل حسن', 'وليد مصطفى', 'جمال عبده', 'د. منى رشاد', 'أحمد الشيخ', 'صفاء محمود', 'حسن البركة', 'عبد الهادي علي', 'محمد الحرمين', 'سلطان فرج'];
  const customers = [], transactions = [], closings = [];
  let seedR = 7;
  const rnd = () => { seedR = (seedR * 16807) % 2147483647; return seedR / 2147483647; };
  const round = (n) => Math.round(n / 50) * 50;
  shops.forEach(([rep, name, phone, location, type, weekly, ratio], i) => {
    const id = 'c-' + (i + 1);
    customers.push({ id, rep_id: rep, name, owner_name: owners[i], code: String(1001 + i), status: 'approved', phone, location, debt_type: rep === 'u-ahmed' ? 'wholesale' : 'retail', agency_id: rep === 'u-mahmoud' ? 'ag-molfix' : 'ag-tiger', created_at: at(84, 9), created_by: rep });
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
        transactions.push({ id: uid(), customer_id: id, rep_id: rep, kind: 'invoice', amount: inv, invoice_no: String(5000 + i * 20 + w), note: '', status: 'approved', occurred_at: at(d, d ? 12 + (i % 5) : 8), created_at: at(d, d ? 12 + (i % 5) : 8), created_by: rep });
      }
    }
  });
  // one pending correction request for the demo
  const c3 = customers[2];
  transactions.push({ id: uid(), customer_id: c3.id, rep_id: c3.rep_id, kind: 'correction', amount: -2000, note: 'العميل دفع 2000 امبارح ونسيت أسجلها - أكد معاه بالتليفون', status: 'pending', occurred_at: at(0, 9), created_at: at(0, 9), created_by: c3.rep_id });
  // a pending return (needs approval) and a new-customer coding request
  const c1 = customers[0];
  transactions.push({ id: uid(), customer_id: c1.id, rep_id: c1.rep_id, kind: 'return', amount: 3500, note: 'مرتجع 5 كراتين منتهية الصلاحية', status: 'pending', occurred_at: at(0, 10), created_at: at(0, 10), created_by: c1.rep_id });
  customers.push({ id: 'c-new', rep_id: 'u-karim', name: 'ماركت الأمل', owner_name: 'عم شعبان', code: null, status: 'pending', phone: '01099887766', location: 'الجناين - الشلوفة', debt_type: 'retail', agency_id: 'ag-tiger', opening_amount: 4200, opening_date: at(3, 12), created_at: at(0, 9), created_by: 'u-karim' });
  const ck = customers.find((c) => c.rep_id === 'u-karim' && c.status === 'approved');
  transactions.push({ id: uid(), customer_id: ck.id, rep_id: 'u-karim', kind: 'collection', amount: 1500, note: '', status: 'approved', occurred_at: at(1, 21), created_at: at(1, 21), created_by: 'u-karim' });
  // daily closings for every past day each rep worked (karim left yesterday open)
  for (const rep of ['u-ahmed', 'u-mahmoud', 'u-karim']) {
    let prev = 0;
    for (let d = 90; d >= 1; d--) {
      if (rep === 'u-karim' && d === 1) continue;
      const end = ms(at(d, 22));
      const mine = transactions.filter((t) => t.rep_id === rep && t.created_by === rep && t.status !== 'rejected' && ms(t.created_at) > prev && ms(t.created_at) <= end);
      if (!mine.length) continue;
      const sum = (k) => mine.filter((t) => t.kind === k).reduce((a, t) => a + Number(t.amount), 0);
      const col = sum('collection');
      closings.push({ id: uid(), rep_id: rep, day: dayKey(Math.min(...mine.map((t) => ms(t.created_at)))), collections: col, invoices: sum('invoice'), returns: sum('return'), remitted: col, note: '', created_at: at(d, 22) });
      prev = end;
    }
  }
  const agencies = [{ id: 'ag-tiger', name: 'تايجر', created_at: at(120) }, { id: 'ag-molfix', name: 'مولفيكس', created_at: at(120) }];
  return { v: 1, agencies, profiles, passwords, customers, transactions, closings };
}

export function DemoBackend() {
  const KEY = 'alsultan-demo-v11';
  const SKEY = 'alsultan-demo-session';
  let memSession = null;
  let db = safe(() => JSON.parse(localStorage.getItem(KEY)), null) || demoSeed();
  db.closings ||= [];
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
  // Owners (Sayed, Mohamed) see everything. Other admins are managers: they see the reps whose
  // agency + type (retail/wholesale) is in their scopes, set by an owner from the settings page.
  const repVisible = (m, repId) => {
    if (m.role !== 'admin') return repId === m.id;
    if (isOwner(m)) return true;
    const r = db.profiles.find((p) => p.id === repId);
    return !!r && r.role === 'rep' && inScopes(m, r);
  };
  const nextCode = () => String(Math.max(1000, ...db.customers.map((c) => Number(c.code) || 0)) + 1);
  const balOf = (pred) => db.transactions.filter((t) => t.status === 'approved' && pred(t)).reduce((s, t) => s + effect(t), 0);

  function insertTx(input) {
    const m = requireActive();
    const cust = db.customers.find((c) => c.id === input.customer_id);
    if (!cust) throw new Error('العميل غير موجود');
    if (!repVisible(m, cust.rep_id)) throw new Error('العميل ده مش بتاعك');
    if ((cust.status || 'approved') !== 'approved' && !input.fromCoding) throw new Error('العميل ده لسه مستني التكويد');
    const isAdmin = m.role === 'admin';
    if (isAdmin && (input.kind === 'correction' || input.kind === 'return') && !hasPerm(m, 'review')) throw new Error('التصحيح والمرتجعات محتاجين صلاحية');
    const amount = Number(input.amount);
    if (!amount || (input.kind !== 'correction' && amount <= 0)) throw new Error('اكتب مبلغ صحيح');
    const nowIso = new Date().toISOString();
    let occurred = nowIso;
    if (input.kind === 'opening' && input.occurred_at) {
      const t = Math.min(Date.now(), Math.max(new Date(input.occurred_at).getTime(), Date.now() - 365 * DAY));
      occurred = new Date(t).toISOString();
    }
    if (input.kind === 'opening' && db.transactions.some((t) => t.customer_id === cust.id && t.kind === 'opening')) throw new Error('الرصيد الافتتاحي متسجل قبل كده');
    if (input.kind === 'collection' || input.kind === 'return') {
      const bal = balOf((t) => t.customer_id === cust.id);
      if (amount > bal + 0.001) throw new Error(`المبلغ (${money(amount)}) أكبر من مديونية العميل (${money(bal)})`);
    }
    if (input.kind === 'invoice') {
      const rep = db.profiles.find((p) => p.id === cust.rep_id);
      const bal = balOf((t) => t.rep_id === cust.rep_id);
      if (bal + amount > Number(rep.credit_limit)) throw new Error(`مرفوض: المديونية هتبقى ${money(bal + amount)} وحد الائتمان ${money(rep.credit_limit)}`);
    }
    const needsReview = input.kind === 'correction' || input.kind === 'return';
    const tx = {
      id: uid(), customer_id: cust.id, rep_id: cust.rep_id, kind: input.kind, amount,
      note: (input.note || '').trim(), corrects_id: input.corrects_id || null, invoice_no: input.kind === 'invoice' ? String(input.invoice_no || '').trim() || null : null,
      status: needsReview && !isAdmin ? 'pending' : 'approved',
      occurred_at: occurred, created_at: nowIso, created_by: m.id,
      reviewed_by: needsReview && isAdmin ? m.id : null,
      reviewed_at: needsReview && isAdmin ? nowIso : null,
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
    async signUp(username, password, fullName, repType, agencyId) {
      const u = String(username).trim().toLowerCase();
      if (db.profiles.some((x) => x.username === u)) throw new Error('اسم المستخدم ده موجود');
      const p = { id: 'u-' + uid(), username: u, full_name: fullName, role: 'rep', rep_type: repType, agency_id: agencyId || null, credit_limit: 0, active: false, created_at: new Date().toISOString() };
      db.profiles.push(p); db.passwords[u] = password;
      commit({ table: 'profiles', type: 'INSERT', row: p });
    },
    async signOut() { setSession(null); },
    async loadAll() {
      const m = me(); if (!m) return { agencies: [], profiles: [], customers: [], transactions: [], closings: [] };
      if (m.role === 'admin') {
        if (isOwner(m)) return structuredClone({ agencies: db.agencies, profiles: db.profiles, customers: db.customers, transactions: db.transactions, closings: db.closings });
        const reps = new Set(db.profiles.filter((p) => repVisible(m, p.id)).map((p) => p.id));
        return structuredClone({
          agencies: db.agencies.filter((a) => (m.scopes || []).some((x) => x.agency_id === a.id)),
          profiles: db.profiles.filter((p) => reps.has(p.id) || p.id === m.id || isOwner(p)),
          customers: db.customers.filter((c) => reps.has(c.rep_id)),
          transactions: db.transactions.filter((t) => reps.has(t.rep_id)),
          closings: db.closings.filter((x) => reps.has(x.rep_id)),
        });
      }
      return structuredClone({ agencies: db.agencies.filter((a) => a.id === m.agency_id), profiles: [m], customers: db.customers.filter((c) => c.rep_id === m.id), transactions: db.transactions.filter((t) => t.rep_id === m.id), closings: db.closings.filter((x) => x.rep_id === m.id) });
    },
    async addCustomer({ name, owner_name, phone, location, opening, opening_date, rep_id }) {
      const m = requireActive();
      if (m.role === 'admin' && rep_id && !repVisible(m, rep_id)) throw new Error('المندوب ده مش في توكيلك');
      const owner = m.role === 'admin' && rep_id ? db.profiles.find((x) => x.id === rep_id) : m;
      const debt_type = owner?.rep_type || 'retail';
      const agency_id = owner?.agency_id || null;
      // a rep's new customer is a coding request: it waits for someone with the coding permission
      const coded = m.role === 'admin' && hasPerm(m, 'coding');
      const c = { id: 'c-' + uid(), rep_id: m.role === 'admin' && rep_id ? rep_id : m.id, name: name.trim(), owner_name: (owner_name || '').trim(), phone: (phone || '').trim(), location: (location || '').trim(), debt_type, agency_id,
        code: coded ? nextCode() : null, status: coded ? 'approved' : 'pending', opening_amount: opening > 0 ? opening : 0, opening_date: opening_date || null, created_at: new Date().toISOString(), created_by: m.id };
      db.customers.push(c);
      if (coded && opening > 0) insertTx({ customer_id: c.id, kind: 'opening', amount: opening, note: 'رصيد افتتاحي', occurred_at: opening_date });
      commit({ table: 'customers', type: 'INSERT', row: c });
      return c.id;
    },
    async codeCustomer(id, approve, code) {
      const m = requireActive(); if (!hasPerm(m, 'coding')) throw new Error('تكويد العملاء محتاج صلاحية');
      const c = db.customers.find((x) => x.id === id);
      if (!c || c.status !== 'pending' || !repVisible(m, c.rep_id)) throw new Error('الطلب ده اتراجع قبل كده');
      if (approve) {
        const k = String(code || '').trim(); if (!k) throw new Error('اكتب كود العميل');
        if (db.customers.some((x) => x.code === k)) throw new Error('الكود ده متسجل لعميل تاني');
        c.status = 'approved'; c.code = k;
        if (Number(c.opening_amount) > 0) insertTx({ customer_id: c.id, kind: 'opening', amount: c.opening_amount, note: 'رصيد افتتاحي', occurred_at: c.opening_date, fromCoding: true });
      } else c.status = 'rejected';
      c.reviewed_by = m.id; c.reviewed_at = new Date().toISOString();
      commit({ table: 'customers', type: 'UPDATE', row: c });
    },
    async closeDay({ note } = {}) {
      const m = requireActive(); if (m.role !== 'rep') throw new Error('التقفيل للمندوب بس');
      const o = openDay(db.closings, db.transactions, m.id);
      if (!o.count) throw new Error('مفيش حاجة تتقفل');
      const x = { id: uid(), rep_id: m.id, day: o.day, collections: o.collections, invoices: o.invoices, returns: o.returns, remitted: o.collections, note: (note || '').trim(), created_at: new Date().toISOString() };
      db.closings.push(x); commit({ table: 'day_closings', type: 'INSERT', row: x }); return x;
    },
    async addTransaction(input) { const tx = insertTx(input); commit({ table: 'transactions', type: 'INSERT', row: tx }); return tx; },
    async reviewTransaction(id, approve) {
      const m = requireActive(); if (m.role !== 'admin') throw new Error('للإدارة فقط');
      const t = db.transactions.find((x) => x.id === id);
      if (!t || t.status !== 'pending' || !repVisible(m, t.rep_id)) throw new Error('الطلب ده اتراجع قبل كده');
      if (!hasPerm(m, 'review')) throw new Error('مراجعة التصحيح والمرتجعات محتاجة صلاحية');
      if (approve && t.kind === 'return') {
        const bal = balOf((x) => x.customer_id === t.customer_id);
        if (t.amount > bal + 0.001) throw new Error(`المرتجع (${money(t.amount)}) أكبر من مديونية العميل (${money(bal)})`);
      }
      t.status = approve ? 'approved' : 'rejected'; t.reviewed_by = m.id; t.reviewed_at = new Date().toISOString();
      commit({ table: 'transactions', type: 'UPDATE', row: t });
    },
    async updateProfile(id, patch) {
      const m = requireActive(); if (m.role !== 'admin') throw new Error('للإدارة فقط');
      const p = db.profiles.find((x) => x.id === id);
      if (!p) throw new Error('الحساب مش موجود');
      if ('is_owner' in patch && !!patch.is_owner !== !!p.is_owner) throw new Error('مينفعش تغيير المدير العام من هنا');
      if (!isOwner(m)) {
        if (!repVisible(m, id)) throw new Error('الحساب ده مش في صلاحياتك');
        if (('role' in patch && patch.role !== p.role) || 'scopes' in patch || 'title' in patch || 'perms' in patch) throw new Error('الصلاحيات بيحددها المدير العام بس');
        if (!inScopes(m, { ...p, ...patch })) throw new Error('مينفعش تنقل مندوب لحاجة مش في صلاحياتك');
      } else if (isOwner(p) && p.id !== m.id) throw new Error('مينفعش تعدّل حساب مدير عام تاني');
      if ('credit_limit' in patch && Number(patch.credit_limit) !== Number(p.credit_limit) && !hasPerm(m, 'credit')) throw new Error('تعديل حد الائتمان للمحاسب والمدير العام بس');
      Object.assign(p, patch);
      commit({ table: 'profiles', type: 'UPDATE', row: p });
    },
    async listAgencies() { return structuredClone(db.agencies); },
    async addAgency(name) {
      const m = requireActive(); if (!isOwner(m)) throw new Error('للمدير العام بس');
      const n = String(name || '').trim(); if (!n) throw new Error('اكتب اسم التوكيل');
      if (db.agencies.some((a) => a.name === n)) throw new Error('التوكيل ده موجود');
      const a = { id: 'ag-' + uid(), name: n, created_at: new Date().toISOString() };
      db.agencies.push(a); commit({ table: 'agencies', type: 'INSERT', row: a }); return a;
    },
    onChange(cb) { listeners.push(cb); },
    resetDemo() { db = demoSeed(); commit({ table: 'all', type: 'RESET' }); },
  };
}

/* ---------------- Supabase backend (production) ---------------- */

export async function SupabaseBackend() {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
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
    async signUp(u, p, name, repType, agencyId) {
      const { error } = await sb.auth.signUp({ email: email(u), password: p, options: { data: { username: u.trim().toLowerCase(), full_name: name, rep_type: repType, agency_id: agencyId || null } } });
      if (error) throw new Error(/registered/i.test(error.message) ? 'اسم المستخدم ده موجود' : error.message);
      await sb.auth.signOut();
    },
    async signOut() { await sb.auth.signOut(); },
    async loadAll() {
      const [agencies, profiles, customers, transactions, closings] = await Promise.all([fetchAll('agencies', 'name'), fetchAll('profiles', 'created_at'), fetchAll('customers', 'created_at'), fetchAll('transactions', 'occurred_at'), fetchAll('day_closings', 'day')]);
      return { agencies, profiles, customers, transactions, closings };
    },
    async addCustomer(c) {
      const { data, error } = await sb.rpc('add_customer', { p_name: c.name, p_phone: c.phone, p_location: c.location, p_debt_type: null, p_opening: c.opening || 0, p_opening_date: c.opening_date || null, p_rep_id: c.rep_id || null, p_owner_name: c.owner_name || null });
      fail(error); return data;
    },
    async codeCustomer(id, approve, code) { const { error } = await sb.rpc('code_customer', { p_id: id, p_approve: !!approve, p_code: code || null }); fail(error); },
    async closeDay({ note } = {}) { const { data, error } = await sb.from('day_closings').insert({ note: note || null }).select().single(); fail(error); return data; },
    async addTransaction(t) {
      const row = { customer_id: t.customer_id, rep_id: t.rep_id, kind: t.kind, amount: t.amount, note: t.note || null, corrects_id: t.corrects_id || null, invoice_no: t.invoice_no || null };
      const { data, error } = await sb.from('transactions').insert(row).select().single(); fail(error); return data;
    },
    async reviewTransaction(id, approve) { const { error } = await sb.from('transactions').update({ status: approve ? 'approved' : 'rejected' }).eq('id', id); fail(error); },
    async updateProfile(id, patch) { const { error } = await sb.from('profiles').update(patch).eq('id', id); fail(error); },
    async listAgencies() { const { data, error } = await sb.from('agencies').select('id,name').order('name'); fail(error); return data; },
    async addAgency(name) { const { data, error } = await sb.from('agencies').insert({ name: String(name || '').trim() }).select().single(); fail(error); return data; },
    onChange(cb) {
      sb.channel('alsultan-live')
        .on('postgres_changes', { event: '*', schema: 'public' }, (p) => cb({ table: p.table, type: p.eventType, row: p.new, remote: true }))
        .subscribe((status) => cb({ type: 'STATUS', status }));
    },
  };
}

