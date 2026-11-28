import { useEffect, useMemo, useState } from 'react';
import { Wallet, FileText, UserPlus, Store, AlertTriangle, Lock, TrendingDown, Users, Phone, MapPin, CalendarDays, PencilLine, Check, X, ClipboardCheck, Archive, ShieldCheck, Clock, Zap, BellRing, ChevronLeft, ChevronRight, Search, ArrowRight, Download } from './components/icons.jsx';
import { money, fmtDate, fmtDT, monthKey, monthLabel, effect, signed, dueOf, dayKey, dayLabeler, missingFor, KIND, PERMS, TYPE, REP_TYPE, TERM_DAYS, DAY, parseAmount } from './lib/core.js';
import { useApp } from './lib/store.jsx';
import { downloadXLSX } from './lib/export.js';
import { statementSheets } from './lib/statement.js';
import { useDialogs, useToday } from './components/dialogs.jsx';
import { ThemeToggle } from './components/layout.jsx';
import { Segmented, MoneyInput, Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Avatar, Input, Field, FormError, useSubmit, Empty, Table, THead, TBody, TR, TH, TD, Select, cn } from './components/ui.jsx';
import { CustomerTable, CreditCard, TrendCard, RepBarsCard, RepCard, StatCard, DueBadge, initials } from './components/app.jsx';

const Greeting = ({ name, children }) => {
  const h = new Date().getHours();
  return <div className="flex flex-wrap items-end justify-between gap-4">
    <div><h2 className="text-2xl font-bold tracking-tight">{h < 12 ? 'صباح الخير' : 'مساء الخير'}، {name.split(' ')[0]}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</p></div>
    {children}
  </div>;
};

/* ================= rep ================= */
export function RepHome() {
  const { me, data, summaryOf, nav, stats } = useApp();
  const open = useDialogs();
  const sum = summaryOf(me);
  const today = useToday();
  const late = today.day && today.day < dayKey();
  const overdue = sum.customers.filter((c) => stats.get(c.id).overdue).length;
  return <>
    <Greeting name={me.full_name}>
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
        <Button variant="outline" onClick={() => open({ type: 'customer' })}><UserPlus />عميل جديد</Button>
        <Button variant="outline" disabled={sum.over} onClick={() => open({ type: 'invoice' })} title={sum.over ? 'موقوف: تجاوز حد الائتمان' : ''}><FileText />فاتورة آجل</Button>
        <Button variant="outline" onClick={() => open({ type: 'return' })}><ArrowRight />مرتجع</Button>
        <Button variant="success" onClick={() => open({ type: 'collect' })}><Wallet />تسجيل تحصيل</Button>
      </div>
    </Greeting>
    {!today.count && today.last ? <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-4">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background"><Lock className="size-4" /></span>
      <div className="min-w-0 flex-[1_1_240px] text-sm"><div className="font-semibold">آخر تقفيل {new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(today.last.created_at))}</div>
        <div className="mt-0.5 text-muted-foreground">التوريد <span className="tnum font-medium text-foreground">{money(today.last.remitted)}</span> ج.م</div></div>
    </div> : <div className={cn('flex flex-wrap items-center gap-3 rounded-lg border p-4', late && 'border-warning/40 bg-warning-soft')}>
      <div className="min-w-0 flex-[1_1_260px]">
        {late && <div className="mb-2 text-sm font-semibold text-warning">يوم {fmtDate(today.day + 'T12:00:00')} لسه مفتوح</div>}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div><div className="text-xs text-muted-foreground">تحصيل اليوم</div><div className="tnum font-semibold text-success">{money(today.collections)}</div></div>
          <div><div className="text-xs text-muted-foreground">فواتير اليوم</div><div className="tnum font-semibold">{money(today.invoices)}</div></div>
          <div><div className="text-xs text-muted-foreground">مرتجعات</div><div className="tnum font-semibold">{money(today.returns)}</div></div>
        </div>
      </div>
      <Button variant={late ? 'danger' : 'outline'} className="max-sm:w-full" disabled={!today.count} onClick={() => open({ type: 'close-day' })}><Lock />تقفيل اليوم</Button>
    </div>}
    {sum.over && <div role="alert" className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger-soft p-4">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-danger text-white"><Lock className="size-4" /></span>
      <div><div className="font-semibold text-danger">تم إيقاف البيع الآجل</div><p className="mt-0.5 text-sm text-foreground/80">عديت الحد بـ {money(sum.total - sum.limit)} ج.م. التحصيل متاح.</p></div>
    </div>}
    <div className="grid grid-cols-2 gap-3 md:gap-4 min-[1400px]:grid-cols-4">
      <StatCard icon={TrendingDown} label="تحصيل الشهر" value={money(sum.month)} sub={monthLabel(monthKey(Date.now()))} tone="success" />
      <StatCard icon={Store} label="العملاء" value={sum.customers.length} sub="عميل مسجل" />
      <StatCard icon={AlertTriangle} label="عملاء متأخرين" value={overdue} sub={`تجاوزوا ${TERM_DAYS} يوم`} tone={overdue ? 'danger' : 'default'} />
      <StatCard icon={Clock} label="مدة الأجل" value={`${TERM_DAYS} يوم`} sub="من تاريخ الفاتورة" />
    </div>
    <div className="grid gap-6 xl:grid-cols-5">
      <div className="xl:col-span-2"><CreditCard sum={sum} /></div>
      <div className="xl:col-span-3"><TrendCard txs={data.transactions} /></div>
    </div>
    <Card className="pb-5">
      <CardHeader><div><CardTitle>عملائي</CardTitle></div></CardHeader>
      <CustomerTable list={sum.customers} onCollect={(id) => open({ type: 'collect', id })}  />
    </Card>
  </>;
}

/* ================= admin ================= */
function useSums() {
  const { reps, summaryOf } = useApp();
  return reps.filter((r) => r.active).map((r) => ({ r, s: summaryOf(r) }));
}

export function AdminHome() {
  const { me, data, raw, overdue, stats, go, nav, nameOf, reps, agencies, agency } = useApp();
  const sums = useSums();
  const sumWhere = (f) => money(sums.filter(({ r }) => f(r)).reduce((a, { s }) => a + s.total, 0));
  const totalSub = `قطاعي ${sumWhere((r) => r.rep_type !== 'wholesale')} · جملة ${sumWhere((r) => r.rep_type === 'wholesale')}`;
  const total = sums.reduce((a, x) => a + x.s.total, 0), month = sums.reduce((a, x) => a + x.s.month, 0);
  const stopped = sums.filter((x) => x.s.over).length;
  const overdueAmt = overdue.reduce((a, c) => a + stats.get(c.id).balance, 0);
  const pendTx = data.transactions.filter((t) => t.status === 'pending').length + data.customers.filter((c) => c.status === 'pending').length, pendAcc = raw.profiles.filter((r) => r.role === 'rep' && !r.active).length;
  const todayKey = dayKey(); const todayCol = data.transactions.filter((t) => t.kind === 'collection' && t.status === 'approved' && dayKey(t.occurred_at) === todayKey).reduce((a, t) => a + Number(t.amount), 0);
  const recent = data.transactions.filter((t) => t.status === 'approved' && t.kind === 'collection').sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at)).slice(0, 6);
  const [q, setQ] = useState('');
  return <>
    <Greeting name={me.full_name}>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <form onSubmit={(e) => { e.preventDefault(); go({ name: 'customers', q }); }} className="relative flex-[1_1_220px] sm:w-80 sm:flex-none">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن عميل…" className="ps-9" type="search" />
      </form>
      <Button variant="outline" onClick={() => nav('report')} className="max-sm:w-full"><CalendarDays />النتيجة اليومية</Button>
      </div>
    </Greeting>
    {(pendTx > 0 || pendAcc > 0) && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4">
      <BellRing className="size-5 shrink-0 text-warning" />
      <div className="min-w-0 flex-[1_1_220px] text-sm"><span className="font-semibold">مطلوب مراجعتك: </span>{[pendTx ? `${pendTx} طلب (تصحيح أو مرتجع أو تكويد)` : '', pendAcc ? `${pendAcc} حساب مندوب جديد` : ''].filter(Boolean).join(' و ')}</div>
      <div className="flex w-full gap-2 sm:w-auto [&>button]:max-sm:h-10 [&>button]:max-sm:flex-1">{pendTx > 0 && <Button size="sm" variant="outline" onClick={() => nav('approvals')}>مراجعة الطلبات</Button>}{pendAcc > 0 && <Button size="sm" variant="outline" onClick={() => nav('accounts')}>تفعيل الحسابات</Button>}</div>
    </div>}
    <div className="grid grid-cols-2 gap-3 md:gap-4 min-[1400px]:grid-cols-4">
      <StatCard icon={Wallet} label="إجمالي الآجل في السوق" value={money(total)} sub={totalSub} tone="brand" />
      <StatCard icon={TrendingDown} label="تحصيل النهارده" value={money(todayCol)} sub={`الشهر: ${money(month)}`} tone="success" />
      <StatCard icon={Lock} label="مناديب تجاوزوا الحد" value={stopped} sub={stopped ? 'موقوفين عن البيع الآجل' : 'الكل داخل الحد'} tone={stopped ? 'danger' : 'default'} />
      <StatCard icon={AlertTriangle} label="عملاء متأخرين" value={overdue.length} sub={`بإجمالي ${money(overdueAmt)} ج.م`} tone={overdue.length ? 'danger' : 'default'} />
    </div>
    <div className="grid gap-6 xl:grid-cols-2">
      <TrendCard txs={data.transactions} />
      <RepBarsCard sums={sums.slice().sort((a, b) => b.s.total - a.s.total)} onOpen={(id) => go({ name: 'rep', id })} />
    </div>
    <div>
      <div className="mb-3 flex items-center justify-between"><h3 className="text-[0.9375rem] font-semibold">المناديب</h3><Button variant="ghost" size="sm" onClick={() => nav('reps')}>عرض الكل<ChevronLeft /></Button></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sums.sort((a, b) => b.s.pct - a.s.pct).map(({ r, s }) => <RepCard key={r.id} r={r} s={s} onClick={() => go({ name: 'rep', id: r.id })} />)}</div>
    </div>
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader><div><CardTitle>أكثر العملاء تأخيراً</CardTitle></div><Button variant="outline" size="sm" onClick={() => nav('overdue')}>عرض الكل</Button></CardHeader>
        <CardContent className="grid gap-1">{overdue.length ? overdue.slice(0, 6).map((c) => { const s = stats.get(c.id); return <button key={c.id} onClick={() => go({ name: 'customer', id: c.id })} className="flex items-center gap-3 rounded-md p-2 text-start hover:bg-muted">
          <Avatar name={initials(c.name)} tone="danger" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{c.name}</div><div className="text-xs text-muted-foreground">{nameOf(c.rep_id)}</div></div>
          <div className="text-end"><div className="tnum text-sm font-semibold">{money(s.balance)}</div><div className="text-xs text-danger">متأخر {s.overdueDays} يوم</div></div></button>; }) : <Empty icon={Check} title="لا يوجد عملاء متأخرين" />}</CardContent>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>أحدث التحصيلات</CardTitle></div></CardHeader>
        <CardContent className="grid gap-1">{recent.length ? recent.map((t) => { const c = data.customers.find((x) => x.id === t.customer_id); return <button key={t.id} onClick={() => go({ name: 'customer', id: t.customer_id })} className="flex items-center gap-3 rounded-md p-2 text-start hover:bg-muted">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-success-soft text-success"><TrendingDown className="size-4" /></span>
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{c?.name}</div><div className="text-xs text-muted-foreground">{nameOf(t.created_by)} · {fmtDT(t.occurred_at)}</div></div>
          <div className="tnum text-sm font-semibold text-success">+{money(t.amount)}</div></button>; }) : <Empty title="لا توجد تحصيلات بعد" />}</CardContent>
      </Card>
    </div>
  </>;
}

function AgenciesCard() {
  const { api, raw, agencies, agency, setAgency, toast, owner } = useApp();
  const [adding, setAdding] = useState(false);
  const { busy, error, submit } = useSubmit(async (fd) => { const a = await api.addAgency(fd.get('name')); toast(`تمت إضافة توكيل ${a.name}`); setAdding(false); });
  const count = (id) => raw.profiles.filter((p) => p.role === 'rep' && p.active && p.agency_id === id).length;
  if (!owner) return null; // managers only see the agencies the owner gave them
  return <Card>
    <CardHeader><div><CardTitle>التوكيلات</CardTitle></div>
      {!adding && <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Store />توكيل جديد</Button>}</CardHeader>
    <CardContent className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {agencies.map((a) => ({ ...a, n: count(a.id) })).map((a) =>
          <button key={a.id} onClick={() => setAgency(a.id)} className={cn('inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors', agency === a.id ? 'border-foreground bg-foreground text-background' : 'bg-card hover:bg-muted')}>
            <span className="font-medium">{a.name}</span><span className={cn('tnum text-xs', agency === a.id ? 'opacity-70' : 'text-muted-foreground')}>{a.n} مندوب</span></button>)}
      </div>
      {adding && <form onSubmit={submit} className="grid gap-2 rounded-md border bg-muted/30 p-3">
        <div className="flex flex-wrap items-end gap-2"><div className="flex-[1_1_200px]"><Field label="اسم التوكيل"><Input name="name" placeholder="مثلاً: جهينة" autoFocus /></Field></div>
          <Button type="submit" disabled={busy}><Check />إضافة</Button><Button type="button" variant="ghost" onClick={() => setAdding(false)}>إلغاء</Button></div>
        <FormError>{error}</FormError>
      </form>}
    </CardContent>
  </Card>;
}

export function RepsPage() {
  const { go } = useApp();
  const sums = useSums().sort((a, b) => b.s.pct - a.s.pct);
  return <>
    <AgenciesCard />
    {sums.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sums.map(({ r, s }) => <RepCard key={r.id} r={r} s={s} onClick={() => go({ name: 'rep', id: r.id })} />)}</div>
      : <Card><Empty icon={Users} title="لا يوجد مناديب مفعّلين"></Empty></Card>}
  </>;
}

export function CustomersPage() {
  const { data, view } = useApp();
  return <Card className="pb-5"><CardHeader><div><CardTitle>كل العملاء</CardTitle><CardDescription>{data.customers.length} عميل</CardDescription></div></CardHeader>
    <CustomerTable list={data.customers} showRep initialQuery={view.q || ''} /></Card>;
}

export function OverduePage() {
  const { overdue, stats, me } = useApp();
  const open = useDialogs();
  const amt = overdue.reduce((a, c) => a + stats.get(c.id).balance, 0);
  return <Card className="pb-5"><CardHeader><div><CardTitle>عملاء تجاوزوا {TERM_DAYS} يوم</CardTitle><CardDescription>{overdue.length} عميل بإجمالي {money(amt)} ج.م</CardDescription></div></CardHeader>
    {overdue.length ? <CustomerTable list={overdue} showRep={me.role === 'admin'} onCollect={me.role === 'rep' ? (id) => open({ type: 'collect', id }) : undefined} /> : <Empty icon={Check} title="لا يوجد عملاء متأخرين" />}</Card>;
}

function RequestRow({ t }) {
  const { api, data, nameOf, me, toast, go, can } = useApp();
  const c = data.customers.find((x) => x.id === t.customer_id);
  const isRet = t.kind === 'return';
  const act = async (ok) => { try { await api.reviewTransaction(t.id, ok); toast(ok ? (isRet ? 'تمت الموافقة على المرتجع' : 'تمت الموافقة على التصحيح') : 'تم رفض الطلب'); } catch (e) { toast(e.message, 'err'); } };
  return <div className="flex flex-wrap items-center gap-4 rounded-lg border p-4">
    <span className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-full', isRet ? 'bg-brand-soft text-brand' : t.amount < 0 ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}>{isRet ? <ArrowRight className="size-4" /> : <PencilLine className="size-4" />}</span>
    <div className="min-w-0 flex-[1_1_220px]">
      <div className="flex flex-wrap items-center gap-2"><button className="font-semibold hover:underline" onClick={() => go({ name: 'customer', id: t.customer_id })}>{c?.name}</button><span className="text-xs text-muted-foreground">{nameOf(t.created_by)} · {fmtDT(t.created_at)}</span></div>
      <p className="mt-1 text-sm"><span className="font-medium">{isRet ? 'مرتجع' : t.amount < 0 ? 'تصحيح: تقليل المديونية' : 'تصحيح: زيادة المديونية'} {money(Math.abs(t.amount))} ج.م</span><span className="text-muted-foreground"> · {t.note}</span></p>
    </div>
    {t.status === 'pending' ? (me.role === 'admin' && can('review') ? <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto"><Button size="sm" variant="outline" className="max-sm:h-10" onClick={() => act(false)}><X />رفض</Button><Button size="sm" className="max-sm:h-10" onClick={() => act(true)}><Check />موافقة</Button></div> : <Badge variant="warning" dot>{me.role === 'admin' ? 'بانتظار المحاسب' : 'بانتظار الإدارة'}</Badge>)
      : <Badge variant={t.status === 'approved' ? 'success' : 'outline'} dot>{t.status === 'approved' ? 'تمت الموافقة' : 'مرفوض'}</Badge>}
  </div>;
}

function ShopPhoto({ c, className }) {
  const { api } = useApp();
  const [src, setSrc] = useState(null);
  useEffect(() => { let on = true; api.photoUrl?.(c).then((u) => on && setSrc(u)).catch(() => {}); return () => { on = false; }; }, [api, c]);
  if (!c.photo) return null;
  return <a href={src || undefined} target="_blank" rel="noreferrer" className={cn('block shrink-0 overflow-hidden rounded-md border bg-muted', className)}>{src && <img src={src} alt={'صورة ' + c.name} className="size-full object-cover" />}</a>;
}

function CodingRow({ c }) {
  const { api, nameOf, toast, can, data, go } = useApp();
  const next = String(Math.max(1000, ...data.customers.map((x) => Number(x.code) || 0)) + 1);
  const [code, setCode] = useState(next);
  const [busy, setBusy] = useState(false);
  const miss = missingFor(c);
  const act = async (ok) => { setBusy(true); try { await api.codeCustomer(c.id, ok, code); toast(ok ? `اتكوّد ${c.name} بكود ${code}` : `اترفض طلب ${c.name}`); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); } };
  return <div className="flex flex-wrap items-center gap-4 rounded-lg border p-4" data-coding={c.id}>
    {c.photo ? <ShopPhoto c={c} className="size-14" /> : <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"><UserPlus className="size-4" /></span>}
    <div className="min-w-0 flex-[1_1_220px]">
      <div className="flex flex-wrap items-center gap-2"><button className="font-semibold hover:underline" onClick={() => go({ name: 'customer', id: c.id })}>{c.name}</button><span className="text-xs text-muted-foreground">{nameOf(c.created_by)} · {fmtDT(c.created_at)}</span></div>
      <p className="mt-1 text-sm text-muted-foreground">{[c.owner_name, c.location, c.phone].filter(Boolean).join(' · ')}{Number(c.opening_amount) > 0 && <> · رصيد افتتاحي <span className="tnum font-medium text-foreground">{money(c.opening_amount)}</span></>}</p>
      {miss.length > 0 && <p className="mt-1 text-sm font-medium text-danger">ناقص: {miss.join('، ')}</p>}
    </div>
    {can('coding') ? <div className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 sm:flex sm:w-auto">
      <Input aria-label="كود العميل" value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" className="text-center sm:w-28" />
      <Button size="sm" variant="outline" className="max-sm:h-10" disabled={busy} onClick={() => act(false)}><X />رفض</Button>
      <Button size="sm" className="max-sm:h-10" disabled={busy || miss.length > 0} onClick={() => act(true)}><Check />تكويد</Button>
    </div> : <Badge variant="warning" dot>بانتظار المحاسب</Badge>}
  </div>;
}

export function ApprovalsPage() {
  const { data } = useApp();
  const pending = data.transactions.filter((t) => t.status === 'pending');
  const coding = data.customers.filter((c) => c.status === 'pending');
  const done = data.transactions.filter((t) => (t.kind === 'correction' || t.kind === 'return') && t.status !== 'pending' && t.reviewed_at).sort((a, b) => new Date(b.reviewed_at || b.created_at) - new Date(a.reviewed_at || a.created_at)).slice(0, 20);
  return <>
    <Card><CardHeader><div><CardTitle>تكويد عملاء جدد</CardTitle></div></CardHeader>
      <CardContent className="grid gap-3">{coding.length ? coding.map((c) => <CodingRow key={c.id} c={c} />) : <Empty icon={UserPlus} title="مفيش طلبات تكويد" />}</CardContent></Card>
    <Card><CardHeader><div><CardTitle>تصحيحات ومرتجعات</CardTitle></div></CardHeader>
      <CardContent className="grid gap-3">{pending.length ? pending.map((t) => <RequestRow key={t.id} t={t} />) : <Empty icon={ClipboardCheck} title="لا توجد طلبات معلقة" />}</CardContent></Card>
    {done.length > 0 && <Card><CardHeader><CardTitle>سجل المراجعات</CardTitle></CardHeader><CardContent className="grid gap-3">{done.map((t) => <RequestRow key={t.id} t={t} />)}</CardContent></Card>}
  </>;
}

function ActivateRow({ r }) {
  const { api, toast, agencies, agency, can } = useApp();
  const { busy, error, submit } = useSubmit(async (fd) => {
    const limit = parseAmount(fd.get('limit')); if (!(limit > 0)) throw new Error('اكتب حد الائتمان بالأرقام');
    await api.updateProfile(r.id, { credit_limit: limit, rep_type: fd.get('rep_type'), agency_id: fd.get('agency_id') || null, active: true }); toast(`تم تفعيل حساب ${r.full_name}`);
  });
  return <form onSubmit={submit} className="grid gap-3 rounded-lg border p-4">
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex min-w-0 flex-[1_1_200px] items-center gap-3"><Avatar name={r.full_name.charAt(0)} tone="brand" /><div><div className="font-semibold">{r.full_name}</div><div className="text-xs text-muted-foreground"><span dir="ltr">@{r.username}</span> · سجّل {fmtDate(r.created_at)}</div></div></div>
      <div className="max-sm:w-full"><Field label="نوع المندوب"><Select name="rep_type" defaultValue={r.rep_type || 'retail'} className="w-full sm:w-36"><option value="retail">قطاعي</option><option value="wholesale">جملة</option></Select></Field></div>
      <div className="max-sm:w-full"><Field label="التوكيل"><Select name="agency_id" defaultValue={r.agency_id || agency} className="w-full sm:w-40">{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field></div>
      {can('credit') ? <><div className="max-sm:w-full"><Field label="حد الائتمان (ج.م)"><MoneyInput name="limit" placeholder="500,000" className="w-full text-end sm:w-48" /></Field></div>
      <Button type="submit" className="max-sm:w-full" disabled={busy}><Check />تفعيل الحساب</Button></>
        : <p className="text-sm text-muted-foreground">التفعيل للمحاسب.</p>}
    </div>
    <FormError>{error}</FormError>
  </form>;
}

export function AccountsPage() {
  const { raw } = useApp();
  const list = raw.profiles.filter((r) => r.role === 'rep' && !r.active);
  return <Card><CardHeader><div><CardTitle>حسابات بانتظار التفعيل</CardTitle></div></CardHeader>
    <CardContent className="grid gap-3">{list.length ? list.map((r) => <ActivateRow key={r.id} r={r} />) : <Empty icon={UserPlus} title="لا توجد حسابات جديدة" />}</CardContent></Card>;
}

export function RepDetail({ id }) {
  const { data, summaryOf, api, toast, back, agencies, agency, agencyName, can, stats } = useApp();
  const r = data.profiles.find((p) => p.id === id);
  const kashf = () => downloadXLSX(`kashf-${r.username || r.id}-${dayKey()}`, statementSheets({ reps: [r], customers: data.customers, stats, agencyName, dayTx: data.transactions.filter((t) => t.rep_id === r.id && t.status === 'approved' && dayLabeler(data.closings, data.transactions, r.id)(t) === dayKey()), day: dayKey() }).slice(1));
  const [confirmStop, setConfirmStop] = useState(false);
  const { busy, error, submit } = useSubmit(async (fd) => {
    const patch = { rep_type: fd.get('rep_type'), agency_id: fd.get('agency_id') || null };
    if (can('credit')) { const limit = parseAmount(fd.get('limit')); if (!(limit >= 0)) throw new Error('اكتب حد الائتمان بالأرقام'); patch.credit_limit = limit; }
    await api.updateProfile(id, patch); toast('تم حفظ بيانات المندوب');
  });
  if (!r) return <Card><Empty title="المندوب غير موجود" /></Card>;
  const s = summaryOf(r);
  return <>
    <div className="flex flex-wrap gap-2 print:hidden [&>*]:max-sm:flex-1"><Button variant="outline" onClick={kashf}><Download />كشف المديونية Excel</Button><Button variant="outline" onClick={() => window.print()}><FileText />طباعة</Button></div>
    <div className="grid grid-cols-2 gap-3 md:gap-4 min-[1400px]:grid-cols-4">
      <StatCard icon={TrendingDown} label="تحصيل الشهر" value={money(s.month)} sub={monthLabel(monthKey(Date.now()))} tone="success" />
      <StatCard icon={Store} label="العملاء" value={s.customers.length} />
      <StatCard icon={AlertTriangle} label="عملاء متأخرين" value={s.overdue} tone={s.overdue ? 'danger' : 'default'} />
      <StatCard icon={ShieldCheck} label="حالة الحساب" value={s.over ? 'موقوف' : 'نشط'} sub={s.over ? 'تجاوز حد الائتمان' : 'داخل الحد'} tone={s.over ? 'danger' : 'success'} />
    </div>
    <div className="grid gap-6 xl:grid-cols-5">
      <div className="xl:col-span-2"><CreditCard sum={s} title={`${r.full_name} · ${REP_TYPE[r.rep_type] || 'مندوب'}${agencyName(r.agency_id) ? ' · ' + agencyName(r.agency_id) : ''}`}>
        <form onSubmit={submit} className="mt-5 grid gap-2 border-t pt-4">
          <div className="flex flex-wrap items-end gap-2"><div className="flex-[1_1_140px]"><Field label={can('credit') ? 'حد الائتمان' : 'حد الائتمان (للمحاسب بس)'}><MoneyInput name="limit" className="text-end" defaultValue={money(r.credit_limit)} disabled={!can('credit')} /></Field></div><div className="flex-[1_1_110px]"><Field label="نوع المندوب"><Select name="rep_type" defaultValue={r.rep_type || 'retail'}><option value="retail">قطاعي</option><option value="wholesale">جملة</option></Select></Field></div><div className="flex-[1_1_110px]"><Field label="التوكيل"><Select name="agency_id" defaultValue={r.agency_id || agency}>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field></div><Button type="submit" variant="outline" disabled={busy}>حفظ</Button></div>
          <FormError>{error}</FormError>
        </form>
        <div className="mt-4 border-t pt-4">{confirmStop ? <div className="flex flex-wrap items-center gap-2 text-sm"><span className="flex-1">إيقاف الحساب يمنع المندوب من الدخول. متأكد؟</span><Button size="sm" variant="danger" onClick={async () => { await api.updateProfile(id, { active: false }); toast('تم إيقاف حساب ' + r.full_name); back(); }}>إيقاف</Button><Button size="sm" variant="outline" onClick={() => setConfirmStop(false)}>إلغاء</Button></div>
          : <Button size="sm" variant="danger-outline" onClick={() => setConfirmStop(true)}><Lock />إيقاف حساب المندوب</Button>}</div>
      </CreditCard></div>
      <div className="xl:col-span-3"><TrendCard txs={data.transactions.filter((t) => t.rep_id === id)} /></div>
    </div>
    <Card className="pb-5"><CardHeader><div><CardTitle>عملاء {r.full_name}</CardTitle><CardDescription>{s.customers.length} عميل</CardDescription></div></CardHeader><CustomerTable list={s.customers} /></Card>
  </>;
}

/* ================= customer ================= */
const KIND_ICON = { opening: Archive, invoice: FileText, collection: TrendingDown, return: ArrowRight, correction: PencilLine };
const KIND_TONE = { opening: 'bg-muted text-muted-foreground', invoice: 'bg-brand-soft text-brand', collection: 'bg-success-soft text-success', return: 'bg-brand-soft text-brand', correction: 'bg-warning-soft text-warning' };
const txTitle = (t) => (t.kind === 'invoice' && t.invoice_no ? `فاتورة رقم ${t.invoice_no}` : KIND[t.kind]);
const txSub = (t) => [t.kind === 'invoice' && `تستحق ${fmtDate(dueOf(t))}`, t.note && t.note !== 'رصيد افتتاحي' && t.note].filter(Boolean).join(' · ');

export function CustomerPage({ id }) {
  const { data, stats, me, nameOf, summaryOf, can } = useApp();
  const open = useDialogs();
  const [month, setMonth] = useState('all');
  const c = data.customers.find((x) => x.id === id);
  const s = c && stats.get(id);
  const { rows, months, byMonth } = useMemo(() => {
    if (!s) return { rows: [], months: [], byMonth: [] };
    let run = 0; const rows = s.list.map((t) => { run += effect(t); return { t, run }; });
    const months = [...new Set(s.list.map((t) => monthKey(t.occurred_at)))].sort().reverse();
    const byMonth = months.map((k) => { const ts = s.list.filter((t) => t.status === 'approved' && monthKey(t.occurred_at) === k); return { k, debit: ts.filter((t) => effect(t) > 0).reduce((a, t) => a + effect(t), 0), credit: ts.filter((t) => effect(t) < 0).reduce((a, t) => a - effect(t), 0) }; });
    return { rows, months, byMonth };
  }, [s]);
  if (!c) return <Card><Empty title="العميل غير موجود" /></Card>;
  const isRep = me.role === 'rep';
  const repSum = summaryOf(data.profiles.find((p) => p.id === c.rep_id) || me);
  const shown = rows.filter((x) => month === 'all' || monthKey(x.t.occurred_at) === month).reverse();
  const pending = s.list.filter((t) => t.status === 'pending');
  const waiting = c.status === 'pending';
  const locked = waiting;
  return <>
    <Card className={cn(s.overdue && 'border-danger/40')}>
      <div className="flex flex-wrap items-center gap-3 p-4 sm:gap-4 sm:p-5">
        <Avatar name={initials(c.name)} tone={s.overdue ? 'danger' : 'brand'} size="lg" className="max-sm:size-11 max-sm:text-base" />
        <div className="min-w-0 flex-[1_1_240px]">
          <div className="flex flex-wrap items-center gap-2"><h2 className={cn('text-lg font-bold sm:text-xl', s.overdue && 'text-danger')}>{c.name}</h2>{waiting ? <Badge variant="brand" dot>بانتظار التكويد</Badge> : <DueBadge s={s} />}{c.code && <Badge variant="outline">كود {c.code}</Badge>}</div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[0.875rem] text-muted-foreground">
            {c.owner_name && <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" />صاحب المحل: <span className="font-medium text-foreground">{c.owner_name}</span></span>}
            {c.phone && <span className="inline-flex items-center gap-1.5"><Phone className="size-3.5" /><span dir="ltr" className="select-all font-medium text-foreground">{c.phone}</span></span>}
            {c.location && <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" />{c.location}</span>}
            {!isRep && <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" />المندوب: {nameOf(c.rep_id)}</span>}
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" />عميل منذ {fmtDate(c.created_at)}</span>
          </div>
        </div>
        <div className="grid w-full auto-cols-fr grid-flow-col gap-2 sm:flex sm:w-auto [&>button]:max-sm:px-2">
          {isRep ? <>
            <Button variant="outline" disabled={locked} onClick={() => open({ type: 'correction', id })}><PencilLine />تصحيح</Button>
            <Button variant="outline" disabled={locked || s.balance <= 0} onClick={() => open({ type: 'return', id })}><ArrowRight />مرتجع</Button>
            <Button variant="outline" disabled={locked || repSum.over} onClick={() => open({ type: 'invoice', id })}><FileText />فاتورة</Button>
            <Button variant="success" disabled={locked || s.balance <= 0} onClick={() => open({ type: 'collect', id })}><Wallet />تحصيل</Button>
          </> : can('review') && !waiting ? <>
            <Button variant="outline" disabled={s.balance <= 0} onClick={() => open({ type: 'return', id })}><ArrowRight />مرتجع</Button>
            <Button variant="outline" onClick={() => open({ type: 'correction', id })}><PencilLine />تصحيح الرصيد</Button>
          </> : null}
        </div>
      </div>
      <div className="grid grid-cols-2 border-t md:grid-cols-4 [&>div]:px-4 [&>div]:py-3 sm:[&>div]:p-5 [&>div:not(:first-child)]:md:border-s [&>div:nth-child(2)]:border-s [&>div:nth-child(n+3)]:max-md:border-t [&>div:nth-child(4)]:max-md:border-s">
        <div className={s.overdue ? 'bg-danger-soft/60' : ''}><div className="text-xs text-muted-foreground">الرصيد المستحق</div><div className={cn('tnum mt-1 text-xl font-bold sm:text-2xl', s.overdue && 'text-danger')}>{money(s.balance)}</div></div>
        <div><div className="text-xs text-muted-foreground">تحصيل الشهر</div><div className="tnum mt-1 text-xl font-bold text-success sm:text-2xl">{money(s.monthCollected)}</div></div>
        <div><div className="text-xs text-muted-foreground">{s.overdue ? 'مدة التأخير' : 'آخر يوم في الأجل'}</div><div className={cn('mt-1 text-base font-semibold sm:text-lg', s.overdue && 'text-danger')}>{s.balance > 0 ? (s.overdue ? `${s.overdueDays} يوم` : fmtDate(s.dueDate)) : '—'}</div></div>
        <div><div className="text-xs text-muted-foreground">آخر تحصيل</div><div className="mt-1 text-base font-semibold sm:text-lg">{s.lastCollection ? fmtDate(s.lastCollection) : '—'}</div></div>
      </div>
    </Card>
    {waiting && <div className="flex items-start gap-3 rounded-lg border border-brand/30 bg-brand-soft p-4 text-sm"><UserPlus className="mt-0.5 size-5 shrink-0 text-brand" /><div>العميل ده طلب تكويد جديد{Number(c.opening_amount) > 0 && <> برصيد افتتاحي <span className="tnum font-semibold">{money(c.opening_amount)}</span> ج.م</>}.</div></div>}
    {c.photo && <ShopPhoto c={c} className="h-48 w-full sm:w-80" />}
    {s.openItems.length > 0 && <Card>
      <CardHeader><div><CardTitle>الفواتير المفتوحة</CardTitle></div></CardHeader>
      <ul className="divide-y border-t">{s.openItems.map(({ t, left, due }) => { const late = Date.now() > due + DAY; return <li key={t.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3', late && 'bg-danger-soft/50')}>
        <div className="min-w-0 flex-[1_1_160px]"><div className="font-medium">{txTitle(t)}</div><div className="text-xs text-muted-foreground">بتاريخ {fmtDate(t.occurred_at)}</div></div>
        <div className={cn('text-sm', late ? 'font-semibold text-danger' : 'text-muted-foreground')}>تستحق {fmtDate(due)}{late && ` · متأخرة ${Math.floor((Date.now() - due) / DAY)} يوم`}</div>
        <div className="tnum ms-auto text-end font-semibold">{money(left)} <span className="text-xs font-normal text-muted-foreground">ج.م باقي</span></div>
      </li>; })}</ul>
    </Card>}
    {pending.length > 0 && <Card><CardHeader><CardTitle>طلبات معلقة</CardTitle></CardHeader><CardContent className="grid gap-3">{pending.map((t) => <RequestRow key={t.id} t={t} />)}</CardContent></Card>}
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader><div><CardTitle>كشف الحساب</CardTitle><CardDescription>{shown.length} حركة</CardDescription></div>
          <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-full sm:w-44"><option value="all">كل الفترات</option>{months.map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}</Select></CardHeader>
        <ul className="divide-y border-t md:hidden">{shown.map(({ t, run }) => { const e = signed(t); const off = t.status !== 'approved'; const I = KIND_ICON[t.kind]; return (
          <li key={t.id} className={cn('flex items-center gap-3 px-4 py-3', off && 'opacity-60')}>
            <span className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-full', KIND_TONE[t.kind])}><I className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">{txTitle(t)}{t.status === 'pending' && <Badge variant="warning">معلق</Badge>}{t.status === 'rejected' && <Badge variant="outline">مرفوض</Badge>}</div>
              <div className="truncate text-xs text-muted-foreground">{fmtDT(t.occurred_at)}{txSub(t) ? ' · ' + txSub(t) : ''}</div>
            </div>
            <div className="shrink-0 text-end">
              <div dir="ltr" className={cn('tnum text-sm font-semibold', e < 0 ? 'text-success' : '', off && 'line-through')}>{e < 0 ? '−' : '+'}{money(Math.abs(e))}</div>
              <div className="tnum text-[0.75rem] text-muted-foreground">الرصيد {off ? '—' : money(run)}</div>
            </div>
          </li>); })}</ul>
        <div className="border-t max-md:hidden">
          <Table>
            <THead><TR className="bg-muted/40"><TH>التاريخ</TH><TH>البيان</TH><TH className="text-end">مدين</TH><TH className="text-end">دائن</TH><TH className="text-end">الرصيد</TH><TH className="max-md:hidden">بواسطة</TH></TR></THead>
            <TBody>{shown.map(({ t, run }) => { const e = signed(t); const off = t.status !== 'approved'; const I = KIND_ICON[t.kind]; return (
              <TR key={t.id} className={off ? 'opacity-60' : ''}>
                <TD className="whitespace-nowrap text-xs text-muted-foreground">{fmtDT(t.occurred_at)}</TD>
                <TD><div className="flex items-center gap-2.5"><span className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-full', KIND_TONE[t.kind])}><I className="size-3.5" /></span>
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5 font-medium">{txTitle(t)}{t.status === 'pending' && <Badge variant="warning">معلق</Badge>}{t.status === 'rejected' && <Badge variant="outline">مرفوض</Badge>}</div>{txSub(t) && <div className="max-w-[260px] truncate text-xs text-muted-foreground">{txSub(t)}</div>}</div></div></TD>
                <TD className={cn('text-end tnum', off && 'line-through')}>{e > 0 ? money(e) : ''}</TD>
                <TD className={cn('text-end tnum text-success', off && 'line-through')}>{e < 0 ? money(-e) : ''}</TD>
                <TD className="text-end tnum font-semibold">{off ? '—' : money(run)}</TD>
                <TD className="whitespace-nowrap text-muted-foreground max-md:hidden">{nameOf(t.created_by)}</TD>
              </TR>); })}</TBody>
          </Table>
        </div>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>الأرشيف الشهري</CardTitle></div></CardHeader>
        <CardContent className="grid gap-1">{byMonth.map((m) => <button key={m.k} onClick={() => setMonth(m.k === month ? 'all' : m.k)} className={cn('grid grid-cols-[1fr_auto_auto] items-center gap-4 rounded-md px-3 py-2.5 text-start text-sm', month === m.k ? 'bg-muted ring-1 ring-border' : 'hover:bg-muted/60')}>
          <span className="font-medium">{monthLabel(m.k)}</span>
          <span className="text-end"><span className="block text-[0.75rem] text-muted-foreground">مدين</span><span className="tnum">{money(m.debit)}</span></span>
          <span className="text-end"><span className="block text-[0.75rem] text-muted-foreground">محصّل</span><span className="tnum text-success">{money(m.credit)}</span></span>
        </button>)}</CardContent>
      </Card>
    </div>
  </>;
}

/* ================= auth ================= */
function AuthShell({ children }) {
  return <div className="relative grid min-h-full lg:grid-cols-2">
    <ThemeToggle className="absolute end-4 top-4 z-10 lg:end-auto lg:start-4" />
    <div className="flex items-center justify-center px-5 pb-12 pt-20 lg:py-12">
      <div className="grid w-full max-w-sm gap-7">{children}</div>
    </div>
    <div className="relative hidden flex-col items-center justify-center gap-10 overflow-hidden border-s bg-sidebar p-10 pb-16 lg:flex">
      <img src="./logo-banner.jpg" alt="شركة السلطان" className="w-full max-w-md rounded-xl shadow-card" />
      <div className="grid w-full max-w-md gap-6">
        <div><h2 className="text-3xl font-bold leading-tight tracking-tight">دفتر مديونيات المناديب</h2></div>
        <div className="grid grid-cols-2 gap-3">
          {[[Zap, 'تحديث لحظي', 'بين المندوب والإدارة بدون إعادة تحميل', 'text-brand'], [ShieldCheck, 'حد ائتمان', 'إيقاف تلقائي للآجل عند التجاوز', 'text-success'], [Clock, `أجل ${TERM_DAYS} يوم`, 'تنبيه بالعملاء المتأخرين', 'text-danger'], [Archive, 'أرشيف دائم', 'كل حركة بتاريخها ومن سجّلها', 'text-warning']].map(([I, t, d, c]) => <div key={t} className="rounded-lg border bg-card p-4 shadow-card"><I className={cn('size-5', c)} /><div className="mt-3 text-sm font-semibold">{t}</div></div>)}
        </div>
      </div>
      <p className="absolute inset-x-0 bottom-6 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} السلطان للتوزيع</p>
    </div>
  </div>;
}

export function LoginPage() {
  const { api, signIn } = useApp();
  const [ags, setAgs] = useState([]);
  useEffect(() => { api?.listAgencies?.().then(setAgs).catch(() => {}); }, [api]);
  const [tab, setTab] = useState('login');
  const [done, setDone] = useState('');
  const login = useSubmit(async (fd) => signIn(fd.get('username'), fd.get('password')));
  const signup = useSubmit(async (fd) => { if (ags.length && !fd.get('agency_id')) throw new Error('اختار التوكيل اللي شغال فيه'); if (!fd.get('rep_type')) throw new Error('اختار نوع المندوب: قطاعي ولا جملة'); await api.signUp(String(fd.get('username')), String(fd.get('password')), String(fd.get('full_name')).trim(), String(fd.get('rep_type')), fd.get('agency_id') || null); setTab('login'); setDone('تم إنشاء الحساب. الإدارة هتفعّله وبعدها تقدر تدخل.'); });
  return <AuthShell>
    <img src="./logo-banner.jpg" alt="شركة السلطان" className="w-full rounded-xl lg:hidden" />
    <div><h1 className="text-2xl font-bold tracking-tight">{tab === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب مندوب'}</h1></div>
    {done && <div className="rounded-md border border-success/30 bg-success-soft px-3 py-2.5 text-[0.875rem] text-success">{done}</div>}
    {tab === 'login' ? <form onSubmit={login.submit} className="grid gap-4">
      <Field label="اسم المستخدم"><Input name="username" autoComplete="username" dir="ltr" required /></Field>
      <Field label="كلمة المرور"><Input name="password" type="password" autoComplete="current-password" dir="ltr" required /></Field>
      <FormError>{login.error}</FormError>
      <Button type="submit" size="lg" disabled={login.busy}>دخول</Button>
    </form> : <form onSubmit={signup.submit} className="grid gap-4">
      <Field label="الاسم بالكامل"><Input name="full_name" required /></Field>
      {ags.length > 0 && <Field label="التوكيل"><Select name="agency_id" defaultValue="" required><option value="" disabled>اختار التوكيل…</option>{ags.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>}
      <div className="grid gap-1.5 text-[0.875rem] font-medium"><span>نوع المندوب</span>
        <div className="grid grid-cols-2 gap-2">{[['retail', 'قطاعي', 'محلات وأكشاك'], ['wholesale', 'جملة', 'تجار ومخازن']].map(([v, l, h]) => <label key={v} className="flex cursor-pointer items-center gap-2.5 rounded-md border bg-card p-3 shadow-card has-[:checked]:border-foreground has-[:checked]:ring-1 has-[:checked]:ring-foreground"><input type="radio" name="rep_type" value={v} required className="accent-current" /><span><span className="block font-semibold">{l}</span><span className="block text-xs font-normal text-muted-foreground">{h}</span></span></label>)}</div>
      </div>
      <Field label="اسم المستخدم" hint="حروف إنجليزية أو أرقام، 3 على الأقل"><Input name="username" dir="ltr" pattern="[A-Za-z0-9_.\-]{3,30}" required /></Field>
      <Field label="كلمة المرور"><Input name="password" type="password" dir="ltr" minLength={6} required /></Field>
      <FormError>{signup.error}</FormError>
      <Button type="submit" size="lg" disabled={signup.busy}>إنشاء الحساب</Button>
    </form>}
    <p className="text-center text-sm text-muted-foreground">{tab === 'login' ? <>مندوب جديد؟ <button className="font-medium text-foreground underline-offset-4 hover:underline" onClick={() => { setTab('signup'); setDone(''); }}>إنشاء حساب</button></> : <>لديك حساب؟ <button className="font-medium text-foreground underline-offset-4 hover:underline" onClick={() => setTab('login')}>تسجيل الدخول</button></>}</p>
    {api?.mode === 'demo' && <div className="rounded-lg border">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium"><Zap className="size-3.5 text-warning" />نسخة تجريبية · دخول سريع (كلمة المرور 1234)</div>
      <div className="grid grid-cols-2 gap-2 p-3">
        {[['sayed', 'سيد', 'مدير عام'], ['mohamed', 'محمد', 'مدير عام'], ['barqi', 'محمد البرقي', 'مدير فرع تايجر'], ['younis', 'محمد يونس', 'مشرف تجزئة'], ['aref', 'أحمد عارف', 'مشرف جملة'], ['mokhtar', 'محمد مختار', 'محاسب الفرع'], ['ezzat', 'محمد عزت', 'محاسب'], ['gomaa', 'محمود جمعة', 'محاسب'], ['ahmed', 'أحمد', 'مندوب تايجر · جملة'], ['karim', 'كريم', 'مندوب تايجر · قطاعي'], ['mahmoud', 'محمود', 'مندوب مولفيكس · قطاعي']].map(([u, n, l]) =>
          <button key={u} data-u={u} onClick={() => signIn(u, '1234')} className="flex items-center gap-2.5 rounded-md border bg-card p-2.5 text-start shadow-card hover:border-foreground/30"><Avatar name={n.charAt(0)} size="sm" tone="brand" /><span className="min-w-0"><span className="block text-sm font-medium">{n}</span><span className="block truncate text-[0.75rem] text-muted-foreground">{l}</span></span></button>)}
      </div>
    </div>}
  </AuthShell>;
}

export function InactivePage() {
  const { me, signOut } = useApp();
  return <AuthShell>
    <span className="inline-flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning"><Clock className="size-6" /></span>
    <div><h1 className="text-2xl font-bold">أهلاً {me.full_name}</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground">حسابك بانتظار التفعيل من الإدارة.</p></div>
    <Button variant="outline" onClick={signOut}>تسجيل الخروج</Button>
  </AuthShell>;
}

/* ================= settings (owners only) ================= */
function ScopeChip({ on, onClick, children, disabled }) {
  return <button type="button" disabled={disabled} aria-pressed={on} onClick={onClick} className={cn('inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors disabled:opacity-50', on ? 'border-foreground bg-foreground text-background' : 'bg-card text-muted-foreground hover:bg-muted')}>
    {on ? <Check className="size-4" /> : <span className="size-4" />}{children}</button>;
}

function ManagerRow({ m }) {
  const { api, toast, raw } = useApp();
  const [busy, setBusy] = useState(false);
  const save = async (patch, msg) => { setBusy(true); try { await api.updateProfile(m.id, patch); if (msg) toast(msg); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); } };
  const scopes = m.scopes || [];
  const has = (a, t) => scopes.some((x) => x.agency_id === a && x.rep_type === t);
  const toggle = (a, t) => save({ scopes: has(a, t) ? scopes.filter((x) => !(x.agency_id === a && x.rep_type === t)) : [...scopes, { agency_id: a, rep_type: t }] });
  return <div className="grid gap-3 rounded-lg border p-4" data-manager={m.username}>
    <div className="flex flex-wrap items-center gap-3">
      <Avatar name={m.full_name.charAt(0)} tone="brand" />
      <div className="min-w-0 flex-1"><div className="font-semibold">{m.full_name}</div><div className="text-xs text-muted-foreground"><span dir="ltr">@{m.username}</span>{!m.active && ' · موقوف'}</div></div>
      <Input aria-label="المسمّى الوظيفي" key={m.title || ''} defaultValue={m.title || ''} placeholder="المسمّى (مثلاً: مشرف جملة)" disabled={busy} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (m.title || '')) save({ title: v }, 'تم حفظ المسمّى'); }} className="w-full sm:w-56" />
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => save({ active: !m.active }, m.active ? `تم إيقاف ${m.full_name}` : `تم تفعيل ${m.full_name}`)}>{m.active ? 'إيقاف' : 'تفعيل'}</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => save({ role: 'rep', scopes: [], perms: [], active: false }, `${m.full_name} رجع حساب مندوب (موقوف)`)}>إلغاء الإدارة</Button>
    </div>
    <div className="grid gap-2">
      {raw.agencies.map((a) => <div key={a.id} className="flex flex-wrap items-center gap-2">
        <span className="w-24 shrink-0 text-sm font-medium">{a.name}</span>
        <ScopeChip disabled={busy} on={has(a.id, 'retail')} onClick={() => toggle(a.id, 'retail')}>قطاعي</ScopeChip>
        <ScopeChip disabled={busy} on={has(a.id, 'wholesale')} onClick={() => toggle(a.id, 'wholesale')}>جملة</ScopeChip>
      </div>)}
    </div>
    {!scopes.length && <p className="text-xs text-warning">مش شايف أي حاجة لحد ما تختارله توكيل.</p>}
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      <span className="w-24 shrink-0 text-sm font-medium">يقدر</span>
      {Object.entries(PERMS).map(([k, label]) => { const on = (m.perms || []).includes(k); return <ScopeChip key={k} disabled={busy} on={on} onClick={() => save({ perms: on ? (m.perms || []).filter((x) => x !== k) : [...(m.perms || []), k] })}>{label}</ScopeChip>; })}
    </div>
  </div>;
}

function RepAccessRow({ r }) {
  const { api, toast, raw, agencyName } = useApp();
  const save = async (patch) => { try { await api.updateProfile(r.id, patch); toast(`تم تعديل ${r.full_name}`); } catch (e) { toast(e.message, 'err'); } };
  const n = raw.customers.filter((c) => c.rep_id === r.id).length;
  return <TR>
    <TD><div className="font-medium">{r.full_name}</div><div className="text-xs text-muted-foreground"><span dir="ltr">@{r.username}</span> · {n} عميل{!r.active && ' · موقوف'}</div></TD>
    <TD><Select aria-label="التوكيل" value={r.agency_id || ''} onChange={(e) => save({ agency_id: e.target.value })} className="w-32">{!r.agency_id && <option value="">—</option>}{raw.agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></TD>
    <TD><Select aria-label="النوع" value={r.rep_type || 'retail'} onChange={(e) => save({ rep_type: e.target.value })} className="w-28"><option value="retail">قطاعي</option><option value="wholesale">جملة</option></Select></TD>
    <TD className="text-xs text-muted-foreground max-md:hidden">{raw.profiles.filter((m) => m.role === 'admin' && (m.is_owner || (m.scopes || []).some((x) => x.agency_id === r.agency_id && x.rep_type === r.rep_type))).map((m) => m.full_name).join('، ') || agencyName(r.agency_id)}</TD>
  </TR>;
}

export function SettingsPage() {
  const { raw, owner, api, toast } = useApp();
  const [pick, setPick] = useState('');
  if (!owner) return <Empty icon={Lock} title="الصفحة دي للمدير العام بس" />;
  const owners = raw.profiles.filter((p) => p.role === 'admin' && p.is_owner);
  const managers = raw.profiles.filter((p) => p.role === 'admin' && !p.is_owner);
  const reps = raw.profiles.filter((p) => p.role === 'rep');
  const promotable = reps.filter((r) => !raw.customers.some((c) => c.rep_id === r.id));
  const promote = async () => { const r = reps.find((x) => x.id === pick); if (!r) return; try { await api.updateProfile(r.id, { role: 'admin', active: true, scopes: [], perms: [], title: 'مشرف' }); toast(`${r.full_name} بقى مدير، اختارله هيشوف إيه`); setPick(''); } catch (e) { toast(e.message, 'err'); } };
  return <>
    <Card>
      <CardHeader><div><CardTitle>المديرين</CardTitle></div></CardHeader>
      <CardContent className="grid gap-3">
        {managers.length ? managers.map((m) => <ManagerRow key={m.id} m={m} />) : <Empty icon={Users} title="مفيش مديرين لسه" />}
        <div className="grid gap-2 rounded-lg border border-dashed p-4">
          <div className="text-sm font-medium">إضافة مدير</div>
          
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-[1_1_220px]"><Select aria-label="اختار الحساب" value={pick} onChange={(e) => setPick(e.target.value)}><option value="">اختار الحساب…</option>{promotable.map((r) => <option key={r.id} value={r.id}>{r.full_name} (@{r.username})</option>)}</Select></div>
            <Button type="button" disabled={!pick} onClick={promote}><Check />خليه مدير</Button>
          </div>
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><div><CardTitle>المناديب</CardTitle></div></CardHeader>
      <CardContent className="p-0"><Table><THead><TR><TH>المندوب</TH><TH>التوكيل</TH><TH>النوع</TH><TH className="max-md:hidden">بيشوفه</TH></TR></THead>
        <TBody>{reps.map((r) => <RepAccessRow key={r.id} r={r} />)}</TBody></Table></CardContent>
    </Card>
    <Card>
      <CardHeader><div><CardTitle>المديرين العامين</CardTitle></div></CardHeader>
      <CardContent className="flex flex-wrap gap-3">{owners.map((o) => <div key={o.id} className="flex items-center gap-2 rounded-md border px-3 py-2"><Avatar name={o.full_name.charAt(0)} size="sm" tone="brand" /><span className="text-sm font-medium">{o.full_name}</span></div>)}</CardContent>
    </Card>
  </>;
}

/* ================= daily debt report (any day from the calendar) ================= */
export function ReportPage() {
  const { data, raw, stats, owner, can, reps, agencyName, agency, go, nameOf } = useApp();
  const todayK = dayKey();
  const [day, setDay] = useState(todayK);
  const isToday = day === todayK;
  const end = new Date(day + 'T00:00:00').getTime() + DAY;
  const rows = reps.filter((r) => r.active).map((r) => {
    const label = dayLabeler(data.closings, data.transactions, r.id), onDay = (t) => label(t) === day; // a rep's day = what he closed as that day
    const tx = data.transactions.filter((t) => t.rep_id === r.id && t.status === 'approved');
    const total = tx.filter((t) => new Date(t.occurred_at).getTime() <= end).reduce((a, t) => a + effect(t), 0); // debt at the end of that day
    const td = tx.filter(onDay);
    const sum = (k) => td.filter((t) => t.kind === k).reduce((a, t) => a + Number(t.amount), 0);
    const cls = (data.closings || []).filter((x) => x.rep_id === r.id && x.day === day);
    const closing = cls.length ? { ...cls[cls.length - 1], remitted: cls.reduce((a, x) => a + Number(x.remitted), 0) } : null;
    const limit = Number(r.credit_limit) || 0;
    return { r, total, limit, over: total > limit, pct: limit ? total / limit : 0, inv: sum('invoice'), col: sum('collection'), ret: sum('return'), td, moves: td.filter((t) => t.kind === 'invoice' || t.kind === 'collection').length, closing };
  }).sort((a, b) => b.pct - a.pct);
  const tot = (k) => rows.reduce((a, x) => a + (typeof k === 'function' ? k(x) : x[k]), 0);
  const total = tot('total'), col = tot('col'), remitted = tot((x) => Number(x.closing?.remitted) || 0);
  // shortfall only counts reps who already closed (the others haven't handed in yet)
  const short = tot((x) => (x.closing ? Math.max(0, x.col - Number(x.closing.remitted)) : 0)), closedN = rows.filter((x) => x.closing).length;
  const stopped = rows.filter((x) => x.over);
  const idle = rows.filter((x) => !x.moves);
  const [tab, setTab] = useState('collection');
  const repIds = new Set(rows.map((x) => x.r.id));
  const dayTx = rows.flatMap((x) => x.td).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const newCust = data.customers.filter((c) => repIds.has(c.rep_id) && dayKey(c.created_at) === day).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const shift = (n) => { const d = new Date(day + 'T12:00:00'); d.setDate(d.getDate() + n); const k = dayKey(d); setDay(k > todayK ? todayK : k); };
  const custName = (id) => data.customers.find((c) => c.id === id)?.name || '—';
  const time = (x) => new Intl.DateTimeFormat('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' }).format(new Date(x));
  const list = tab === 'customers' ? null : dayTx.filter((t) => t.kind === tab);
  const [backing, setBacking] = useState(false);
  const backup = async () => {
    setBacking(true);
    try {
      const src = data; // only the agency on screen (agencies are kept separate)
      const pn = (id) => src.profiles.find((p) => p.id === id)?.full_name || '';
      const ag = (id) => agencyName(id) || '';
      const cu = new Map(src.customers.map((c) => [c.id, c]));
      const dt = (x) => (x ? new Date(x).toLocaleString('en-GB', { hour12: false }) : '');
      const st = { approved: 'معتمد', pending: 'معلق', rejected: 'مرفوض' };
      await downloadXLSX(`kashf-${agency}-${todayK}`, [
        ...statementSheets({ reps: src.profiles.filter((p) => p.role === 'rep'), customers: src.customers, stats, agencyName: ag, dayTx, day }),
        { name: 'كل العملاء', head: ['الكود', 'المحل', 'صاحب المحل', 'التليفون', 'العنوان', 'المندوب', 'التوكيل', 'النوع', 'الحالة', 'الرصيد', 'متأخر (يوم)', 'تاريخ التسجيل'],
          rows: src.customers.map((c) => { const x = stats.get(c.id) || {}; return [c.code || '', c.name, c.owner_name || '', c.phone || '', c.location || '', pn(c.rep_id), ag(c.agency_id), TYPE[c.debt_type] || '', st[c.status || 'approved'] || c.status, x.balance ?? '', x.overdue ? x.overdueDays : '', dt(c.created_at)]; }) },
        { name: 'كل الحركات', head: ['التاريخ', 'النوع', 'كود العميل', 'العميل', 'المندوب', 'رقم الفاتورة', 'المبلغ', 'أثره على الرصيد', 'الحالة', 'ملاحظة', 'سجّلها', 'وقت التسجيل', 'راجعها'],
          rows: [...src.transactions].sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at)).map((t) => { const c = cu.get(t.customer_id) || {}; return [dt(t.occurred_at), KIND[t.kind] || t.kind, c.code || '', c.name || '', pn(t.rep_id), t.invoice_no || '', Number(t.amount), t.status === 'approved' ? effect(t) : 0, st[t.status] || t.status, t.note || '', pn(t.created_by), dt(t.created_at), pn(t.reviewed_by)]; }) },
        { name: 'التقفيلات', head: ['المندوب', 'اليوم', 'وقت التقفيل', 'تحصيل', 'فواتير', 'مرتجعات', 'توريد'],
          rows: [...(src.closings || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map((x) => [pn(x.rep_id), x.day, dt(x.created_at), Number(x.collections), Number(x.invoices), Number(x.returns), Number(x.remitted)]) },
      ]);
    } finally { setBacking(false); }
  };  return <>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-2xl font-bold tracking-tight">النتيجة اليومية</h2>
        <p className="mt-1 text-sm text-muted-foreground">{agency !== 'all' && agencyName(agency) ? `توكيل ${agencyName(agency)} · ` : ''}{new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(day + 'T12:00:00'))}{!isToday && <> · <button className="font-medium text-brand hover:underline print:hidden" onClick={() => setDay(todayK)}>النهارده</button></>}</p></div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto print:hidden">
        <div className="grid min-w-0 flex-[1_1_220px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
          <Button variant="outline" size="icon" aria-label="اليوم اللي فات" onClick={() => shift(-1)}><ChevronRight /></Button>
          <div className="min-w-0 overflow-hidden rounded-md"><Input type="date" value={day} max={todayK} onChange={(e) => setDay(e.target.value || todayK)} aria-label="اختار اليوم" className="block w-full min-w-0 appearance-none sm:w-44" /></div>
          <Button variant="outline" size="icon" aria-label="اليوم اللي بعده" disabled={isToday} onClick={() => shift(1)}><ChevronLeft /></Button>
        </div>
        <div className="flex flex-wrap gap-2 max-sm:w-full [&>*]:max-sm:flex-1">
          <Button variant="outline" onClick={() => window.print()}><FileText />طباعة</Button>
          {(owner || can('credit')) && <Button variant="outline" disabled={backing} onClick={backup}><Archive />كشف المديونية</Button>}
        </div>
      </div>
    </div>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-4">
      <StatCard label={isToday ? 'إجمالي المديونية' : 'المديونية آخر اليوم'} value={money(total)} sub={`${rows.length} مندوب`} icon={Wallet} />
      <StatCard label={isToday ? 'تحصيل النهارده' : 'تحصيل اليوم'} value={money(col)} sub={tot('ret') ? `مرتجعات ${money(tot('ret'))}` : undefined} icon={TrendingDown} tone="success" />
      <StatCard label="توريدات اليوم" value={money(remitted)} sub={short > 0.009 ? `ناقص ${money(short)} عند اللي قفلوا` : `${closedN} من ${rows.length} قفلوا اليوم`} icon={Archive} tone={short > 0.009 ? 'warning' : undefined} />
      <StatCard label="موقوفين عن البضاعة" value={stopped.length} sub={stopped.length ? stopped.map((x) => x.r.full_name).join('، ') : 'كله تحت الحد'} icon={Lock} tone={stopped.length ? 'danger' : undefined} />
      <StatCard label={isToday ? 'مسجلوش حركة النهارده' : 'مسجلوش حركة اليوم ده'} value={idle.length} sub={idle.length ? idle.map((x) => x.r.full_name).join('، ') : 'كله اشتغل'} icon={Clock} tone={idle.length ? 'warning' : undefined} />
    </div>
    <Card>
      <CardHeader><CardTitle>المناديب</CardTitle></CardHeader>
      <CardContent className="p-0">{rows.length ? <Table><THead><TR><TH>المندوب</TH><TH className="text-end">المديونية</TH><TH className="text-end">الحد</TH><TH className="text-end">فواتير</TH><TH className="text-end">تحصيل</TH><TH className="text-end">مرتجع</TH><TH className="text-end">توريد</TH><TH>الحالة</TH></TR></THead>
        <TBody>{rows.map(({ r, total, limit, over, pct, inv, col, ret, moves, closing }) => <TR key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => go({ name: 'rep', id: r.id })}>
          <TD><div className="font-medium">{r.full_name}</div><div className="text-xs text-muted-foreground">{REP_TYPE[r.rep_type] || ''}</div></TD>
          <TD className={cn('tnum text-end font-semibold', over && 'text-danger')}>{money(total)}</TD>
          <TD className="tnum text-end text-muted-foreground">{money(limit)}</TD>
          <TD className="tnum text-end">{inv ? money(inv) : '—'}</TD>
          <TD className="tnum text-end">{col ? money(col) : '—'}</TD>
          <TD className="tnum text-end">{ret ? money(ret) : '—'}</TD>
          <TD className={cn('tnum text-end', closing && Number(closing.remitted) < col - 0.009 && 'font-semibold text-warning')}>{closing ? money(closing.remitted) : '—'}</TD>
          <TD><div className="flex flex-wrap gap-1">{over ? <Badge variant="danger" dot>موقوف عن البضاعة</Badge> : pct >= 0.9 ? <Badge variant="warning" dot>قرب من الحد</Badge> : <Badge variant="success" dot>متاح</Badge>}
            {closing ? <Badge variant="outline">قفل {new Intl.DateTimeFormat('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' }).format(new Date(closing.created_at))}</Badge> : <Badge variant="default">مقفلش</Badge>}
            {!moves && <Badge variant="warning">مفيش حركة</Badge>}</div>
            {closing?.note && <div className="mt-1 text-xs text-muted-foreground">{closing.note}</div>}</TD>
        </TR>)}</TBody>
          <tfoot><TR className="border-t-2 bg-muted/50 font-bold hover:bg-muted/50">
            <TD>الإجمالي</TD>
            <TD className="tnum text-end">{money(total)}</TD>
            <TD className="tnum text-end text-muted-foreground">{money(tot('limit'))}</TD>
            <TD className="tnum text-end">{money(tot('inv'))}</TD>
            <TD className="tnum text-end text-success">{money(col)}</TD>
            <TD className="tnum text-end">{money(tot('ret'))}</TD>
            <TD className={cn('tnum text-end', short > 0.009 && 'text-warning')}>{money(remitted)}</TD>
            <TD className="text-xs font-normal text-muted-foreground">{closedN} من {rows.length} قفلوا{short > 0.009 ? ` · ناقص ${money(short)}` : ''}</TD>
          </TR></tfoot></Table> : <Empty icon={Users} title="لا يوجد مناديب مفعّلين" />}</CardContent>
    </Card>
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3"><CardTitle>حركة اليوم</CardTitle>
        <div className="max-w-full overflow-x-auto"><Segmented className="[&_button]:whitespace-nowrap [&_button]:px-2.5" value={tab} onChange={setTab} options={[['collection', `تحصيل (${dayTx.filter((t) => t.kind === 'collection').length})`], ['invoice', `فواتير (${dayTx.filter((t) => t.kind === 'invoice').length})`], ['return', `مرتجع (${dayTx.filter((t) => t.kind === 'return').length})`], ['customers', `عملاء جدد (${newCust.length})`]]} /></div></CardHeader>
      <CardContent className="p-0">
        {list ? (list.length ? <div className="divide-y">{list.map((t) => <button key={t.id} onClick={() => go({ name: 'customer', id: t.customer_id })} className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-muted/50 sm:px-6">
          <div className="min-w-0 flex-1"><div className="truncate font-medium">{custName(t.customer_id)}</div>
            <div className="truncate text-xs text-muted-foreground">{nameOf(t.rep_id)} · {time(t.created_at)}{t.invoice_no ? ` · فاتورة ${t.invoice_no}` : ''}</div></div>
          <div className={cn('tnum shrink-0 font-semibold', t.kind === 'collection' && 'text-success')}>{money(t.amount)}</div>
        </button>)}
          <div className="flex items-center justify-between bg-muted/50 px-4 py-3 font-bold sm:px-6"><span>الإجمالي</span><span className="tnum">{money(list.reduce((a, t) => a + Number(t.amount), 0))}</span></div></div>
          : <Empty icon={CalendarDays} title="مفيش حركة" />)
          : (newCust.length ? <div className="divide-y">{newCust.map((c) => <button key={c.id} onClick={() => go({ name: 'customer', id: c.id })} className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-muted/50 sm:px-6">
            <div className="min-w-0 flex-1"><div className="truncate font-medium">{c.name}</div><div className="truncate text-xs text-muted-foreground">{[c.owner_name, nameOf(c.rep_id), time(c.created_at)].filter(Boolean).join(' · ')}</div></div>
            {c.status === 'pending' ? <Badge variant="warning">بانتظار التكويد</Badge> : c.status === 'rejected' ? <Badge variant="outline">مرفوض</Badge> : <Badge variant="outline">كود {c.code}</Badge>}
          </button>)}</div> : <Empty icon={UserPlus} title="مفيش عملاء جدد" />)}
      </CardContent>
    </Card>
  </>;
}
