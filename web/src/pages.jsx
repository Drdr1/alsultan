import { useMemo, useState } from 'react';
import { Wallet, FileText, UserPlus, Store, AlertTriangle, Lock, TrendingDown, Users, Phone, MapPin, CalendarDays, PencilLine, Check, X, ClipboardCheck, Archive, ShieldCheck, Clock, Zap, BellRing, ChevronLeft, Search } from './components/icons.jsx';
import { money, fmtDate, fmtDT, monthKey, monthLabel, effect, KIND, TYPE, TERM_DAYS, parseAmount } from './lib/core.js';
import { useApp } from './lib/store.jsx';
import { useDialogs } from './components/dialogs.jsx';
import { Logo } from './components/layout.jsx';
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Avatar, Input, Field, FormError, useSubmit, Empty, Table, THead, TBody, TR, TH, TD, Select, cn } from './components/ui.jsx';
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
  const overdue = sum.customers.filter((c) => stats.get(c.id).overdue).length;
  return <>
    <Greeting name={me.full_name}>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => open({ type: 'customer' })}><UserPlus />عميل جديد</Button>
        <Button variant="outline" disabled={sum.over} onClick={() => open({ type: 'invoice' })} title={sum.over ? 'موقوف: تجاوز حد الائتمان' : ''}><FileText />فاتورة آجل</Button>
        <Button variant="success" onClick={() => open({ type: 'collect' })}><Wallet />تسجيل تحصيل</Button>
      </div>
    </Greeting>
    {sum.over && <div role="alert" className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger-soft p-4">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-danger text-white"><Lock className="size-4" /></span>
      <div><div className="font-semibold text-danger">تم إيقاف البيع الآجل</div><p className="mt-0.5 text-sm text-foreground/80">مديونيتك {money(sum.total)} ج.م تجاوزت حد الائتمان ({money(sum.limit)}) بمبلغ {money(sum.total - sum.limit)} ج.م. التحصيل متاح، وبمجرد ما المديونية تنزل تحت الحد هتقدر تسجل فواتير تاني.</p></div>
    </div>}
    <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
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
      <CardHeader><div><CardTitle>عملائي</CardTitle><CardDescription>مرتبين حسب التأخير ثم الرصيد</CardDescription></div></CardHeader>
      <CustomerTable list={sum.customers} onCollect={(id) => open({ type: 'collect', id })} emptyText='اضغط "عميل جديد" لتسجيل أول عميل والمبلغ اللي عليه.' />
    </Card>
  </>;
}

/* ================= admin ================= */
function useSums() {
  const { reps, summaryOf } = useApp();
  return reps.filter((r) => r.active).map((r) => ({ r, s: summaryOf(r) }));
}

export function AdminHome() {
  const { me, data, overdue, stats, go, nav, nameOf, reps } = useApp();
  const sums = useSums();
  const total = sums.reduce((a, x) => a + x.s.total, 0), month = sums.reduce((a, x) => a + x.s.month, 0);
  const stopped = sums.filter((x) => x.s.over).length;
  const overdueAmt = overdue.reduce((a, c) => a + stats.get(c.id).balance, 0);
  const pendTx = data.transactions.filter((t) => t.status === 'pending').length, pendAcc = reps.filter((r) => !r.active).length;
  const recent = data.transactions.filter((t) => t.status === 'approved' && t.kind === 'collection').sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at)).slice(0, 6);
  const [q, setQ] = useState('');
  return <>
    <Greeting name={me.full_name}>
      <form onSubmit={(e) => { e.preventDefault(); go({ name: 'customers', q }); }} className="relative w-full sm:w-80">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن عميل…" className="ps-9" type="search" />
      </form>
    </Greeting>
    {(pendTx > 0 || pendAcc > 0) && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4">
      <BellRing className="size-5 text-warning" />
      <div className="min-w-0 flex-1 text-sm"><span className="font-semibold">مطلوب مراجعتك: </span>{[pendTx ? `${pendTx} طلب تصحيح` : '', pendAcc ? `${pendAcc} حساب مندوب جديد` : ''].filter(Boolean).join(' و ')}</div>
      <div className="flex gap-2">{pendTx > 0 && <Button size="sm" variant="outline" onClick={() => nav('approvals')}>مراجعة الطلبات</Button>}{pendAcc > 0 && <Button size="sm" variant="outline" onClick={() => nav('accounts')}>تفعيل الحسابات</Button>}</div>
    </div>}
    <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
      <StatCard icon={Wallet} label="إجمالي الآجل في السوق" value={money(total)} sub={`${sums.length} مندوب نشط`} tone="brand" />
      <StatCard icon={TrendingDown} label="تحصيل الشهر" value={money(month)} sub={monthLabel(monthKey(Date.now()))} tone="success" />
      <StatCard icon={Lock} label="مناديب تجاوزوا الحد" value={stopped} sub={stopped ? 'موقوفين عن البيع الآجل' : 'الكل داخل الحد'} tone={stopped ? 'danger' : 'default'} />
      <StatCard icon={AlertTriangle} label="عملاء متأخرين" value={overdue.length} sub={`بإجمالي ${money(overdueAmt)} ج.م`} tone={overdue.length ? 'danger' : 'default'} />
    </div>
    <div className="grid gap-6 xl:grid-cols-2">
      <TrendCard txs={data.transactions} />
      <RepBarsCard sums={sums.slice().sort((a, b) => b.s.total - a.s.total)} onOpen={(id) => go({ name: 'rep', id })} />
    </div>
    <div>
      <div className="mb-3 flex items-center justify-between"><h3 className="text-[15px] font-semibold">المناديب</h3><Button variant="ghost" size="sm" onClick={() => nav('reps')}>عرض الكل<ChevronLeft /></Button></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sums.sort((a, b) => b.s.pct - a.s.pct).map(({ r, s }) => <RepCard key={r.id} r={r} s={s} onClick={() => go({ name: 'rep', id: r.id })} />)}</div>
    </div>
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader><div><CardTitle>أكثر العملاء تأخيراً</CardTitle><CardDescription>تجاوزوا {TERM_DAYS} يوم من الفاتورة</CardDescription></div><Button variant="outline" size="sm" onClick={() => nav('overdue')}>عرض الكل</Button></CardHeader>
        <CardContent className="grid gap-1">{overdue.length ? overdue.slice(0, 6).map((c) => { const s = stats.get(c.id); return <button key={c.id} onClick={() => go({ name: 'customer', id: c.id })} className="flex items-center gap-3 rounded-md p-2 text-start hover:bg-muted">
          <Avatar name={initials(c.name)} tone="danger" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{c.name}</div><div className="text-xs text-muted-foreground">{nameOf(c.rep_id)}</div></div>
          <div className="text-end"><div className="tnum text-sm font-semibold">{money(s.balance)}</div><div className="text-xs text-danger">متأخر {s.overdueDays} يوم</div></div></button>; }) : <Empty icon={Check} title="لا يوجد عملاء متأخرين" />}</CardContent>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>أحدث التحصيلات</CardTitle><CardDescription>تظهر هنا لحظة تسجيلها من المندوب</CardDescription></div></CardHeader>
        <CardContent className="grid gap-1">{recent.length ? recent.map((t) => { const c = data.customers.find((x) => x.id === t.customer_id); return <button key={t.id} onClick={() => go({ name: 'customer', id: t.customer_id })} className="flex items-center gap-3 rounded-md p-2 text-start hover:bg-muted">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-success-soft text-success"><TrendingDown className="size-4" /></span>
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{c?.name}</div><div className="text-xs text-muted-foreground">{nameOf(t.created_by)} · {fmtDT(t.occurred_at)}</div></div>
          <div className="tnum text-sm font-semibold text-success">+{money(t.amount)}</div></button>; }) : <Empty title="لا توجد تحصيلات بعد" />}</CardContent>
      </Card>
    </div>
  </>;
}

export function RepsPage() {
  const { go } = useApp();
  const sums = useSums().sort((a, b) => b.s.pct - a.s.pct);
  return sums.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sums.map(({ r, s }) => <RepCard key={r.id} r={r} s={s} onClick={() => go({ name: 'rep', id: r.id })} />)}</div>
    : <Card><Empty icon={Users} title="لا يوجد مناديب مفعّلين بعد">فعّل حسابات المناديب من صفحة الحسابات الجديدة.</Empty></Card>;
}

export function CustomersPage() {
  const { data, view } = useApp();
  return <Card className="pb-5"><CardHeader><div><CardTitle>كل العملاء</CardTitle><CardDescription>{data.customers.length} عميل عند كل المناديب</CardDescription></div></CardHeader>
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
  const { api, data, nameOf, me, toast, go } = useApp();
  const c = data.customers.find((x) => x.id === t.customer_id);
  const act = async (ok) => { try { await api.reviewTransaction(t.id, ok); toast(ok ? 'تمت الموافقة على التصحيح' : 'تم رفض الطلب'); } catch (e) { toast(e.message, 'err'); } };
  return <div className="flex flex-wrap items-center gap-4 rounded-lg border p-4">
    <span className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-full', t.amount < 0 ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}><PencilLine className="size-4" /></span>
    <div className="min-w-0 flex-1 sm:min-w-[220px]">
      <div className="flex flex-wrap items-center gap-2"><button className="font-semibold hover:underline" onClick={() => go({ name: 'customer', id: t.customer_id })}>{c?.name}</button><span className="text-xs text-muted-foreground">{nameOf(t.created_by)} · {fmtDT(t.created_at)}</span></div>
      <p className="mt-1 text-sm"><span className="font-medium">{t.amount < 0 ? 'تقليل المديونية' : 'زيادة المديونية'} {money(Math.abs(t.amount))} ج.م</span><span className="text-muted-foreground"> · {t.note}</span></p>
    </div>
    {t.status === 'pending' ? (me.role === 'admin' ? <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => act(false)}><X />رفض</Button><Button size="sm" onClick={() => act(true)}><Check />موافقة</Button></div> : <Badge variant="warning" dot>بانتظار الإدارة</Badge>)
      : <Badge variant={t.status === 'approved' ? 'success' : 'outline'} dot>{t.status === 'approved' ? 'تمت الموافقة' : 'مرفوض'}</Badge>}
  </div>;
}

export function ApprovalsPage() {
  const { data } = useApp();
  const pending = data.transactions.filter((t) => t.status === 'pending');
  const done = data.transactions.filter((t) => t.kind === 'correction' && t.status !== 'pending').sort((a, b) => new Date(b.reviewed_at || b.created_at) - new Date(a.reviewed_at || a.created_at)).slice(0, 20);
  return <>
    <Card><CardHeader><div><CardTitle>بانتظار موافقتك</CardTitle><CardDescription>المندوب لا يستطيع تعديل أو حذف أي حركة. التصحيح يُطبق فقط بعد موافقتك.</CardDescription></div></CardHeader>
      <CardContent className="grid gap-3">{pending.length ? pending.map((t) => <RequestRow key={t.id} t={t} />) : <Empty icon={ClipboardCheck} title="لا توجد طلبات معلقة" />}</CardContent></Card>
    {done.length > 0 && <Card><CardHeader><CardTitle>سجل التصحيحات</CardTitle></CardHeader><CardContent className="grid gap-3">{done.map((t) => <RequestRow key={t.id} t={t} />)}</CardContent></Card>}
  </>;
}

function ActivateRow({ r }) {
  const { api, toast } = useApp();
  const { busy, error, submit } = useSubmit(async (fd) => {
    const limit = parseAmount(fd.get('limit')); if (!(limit > 0)) throw new Error('اكتب حد الائتمان بالأرقام');
    await api.updateProfile(r.id, { credit_limit: limit, active: true }); toast(`تم تفعيل حساب ${r.full_name}`);
  });
  return <form onSubmit={submit} className="grid gap-3 rounded-lg border p-4">
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:min-w-[200px]"><Avatar name={r.full_name.charAt(0)} tone="brand" /><div><div className="font-semibold">{r.full_name}</div><div className="text-xs text-muted-foreground"><span dir="ltr">@{r.username}</span> · سجّل {fmtDate(r.created_at)}</div></div></div>
      <Field label="حد الائتمان (ج.م)"><Input name="limit" inputMode="decimal" placeholder="500,000" className="w-48 tnum" /></Field>
      <Button type="submit" disabled={busy}><Check />تفعيل الحساب</Button>
    </div>
    <FormError>{error}</FormError>
  </form>;
}

export function AccountsPage() {
  const { reps } = useApp();
  const list = reps.filter((r) => !r.active);
  return <Card><CardHeader><div><CardTitle>حسابات بانتظار التفعيل</CardTitle><CardDescription>حدد حد الائتمان لكل مندوب ثم فعّل الحساب.</CardDescription></div></CardHeader>
    <CardContent className="grid gap-3">{list.length ? list.map((r) => <ActivateRow key={r.id} r={r} />) : <Empty icon={UserPlus} title="لا توجد حسابات جديدة" />}</CardContent></Card>;
}

export function RepDetail({ id }) {
  const { data, summaryOf, api, toast, back } = useApp();
  const r = data.profiles.find((p) => p.id === id);
  const [confirmStop, setConfirmStop] = useState(false);
  const { busy, error, submit } = useSubmit(async (fd) => {
    const limit = parseAmount(fd.get('limit')); if (!(limit >= 0)) throw new Error('اكتب حد الائتمان بالأرقام');
    await api.updateProfile(id, { credit_limit: limit }); toast('تم حفظ حد الائتمان الجديد');
  });
  if (!r) return <Card><Empty title="المندوب غير موجود" /></Card>;
  const s = summaryOf(r);
  return <>
    <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
      <StatCard icon={TrendingDown} label="تحصيل الشهر" value={money(s.month)} sub={monthLabel(monthKey(Date.now()))} tone="success" />
      <StatCard icon={Store} label="العملاء" value={s.customers.length} />
      <StatCard icon={AlertTriangle} label="عملاء متأخرين" value={s.overdue} tone={s.overdue ? 'danger' : 'default'} />
      <StatCard icon={ShieldCheck} label="حالة الحساب" value={s.over ? 'موقوف' : 'نشط'} sub={s.over ? 'تجاوز حد الائتمان' : 'داخل الحد'} tone={s.over ? 'danger' : 'success'} />
    </div>
    <div className="grid gap-6 xl:grid-cols-5">
      <div className="xl:col-span-2"><CreditCard sum={s} title={`حد ائتمان ${r.full_name}`}>
        <form onSubmit={submit} className="mt-5 grid gap-2 border-t pt-4">
          <div className="flex items-end gap-2"><Field label="تعديل حد الائتمان"><Input name="limit" inputMode="decimal" defaultValue={money(r.credit_limit)} className="tnum" /></Field><Button type="submit" variant="outline" disabled={busy}>حفظ</Button></div>
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
const KIND_ICON = { opening: Archive, invoice: FileText, collection: TrendingDown, correction: PencilLine };
const KIND_TONE = { opening: 'bg-muted text-muted-foreground', invoice: 'bg-brand-soft text-brand', collection: 'bg-success-soft text-success', correction: 'bg-warning-soft text-warning' };

export function CustomerPage({ id }) {
  const { data, stats, me, nameOf, summaryOf } = useApp();
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
  return <>
    <Card className={cn(s.overdue && 'border-danger/40')}>
      <div className="flex flex-wrap items-center gap-3 p-4 sm:gap-4 sm:p-5">
        <Avatar name={initials(c.name)} tone={s.overdue ? 'danger' : 'brand'} size="lg" className="max-sm:size-11 max-sm:text-base" />
        <div className="min-w-0 flex-1 sm:min-w-[240px]">
          <div className="flex flex-wrap items-center gap-2"><h2 className={cn('text-lg font-bold sm:text-xl', s.overdue && 'text-danger')}>{c.name}</h2><Badge variant="outline">{TYPE[c.debt_type]}</Badge><DueBadge s={s} /></div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
            {c.phone && <span className="inline-flex items-center gap-1.5"><Phone className="size-3.5" /><span dir="ltr" className="select-all font-medium text-foreground">{c.phone}</span></span>}
            {c.location && <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" />{c.location}</span>}
            {!isRep && <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" />{nameOf(c.rep_id)}</span>}
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" />عميل منذ {fmtDate(c.created_at)}</span>
          </div>
        </div>
        <div className="grid w-full auto-cols-fr grid-flow-col gap-2 sm:flex sm:w-auto [&>button]:max-sm:px-2">
          {isRep ? <>
            <Button variant="outline" onClick={() => open({ type: 'correction', id })}><PencilLine />طلب تصحيح</Button>
            <Button variant="outline" disabled={repSum.over} onClick={() => open({ type: 'invoice', id })}><FileText />فاتورة آجل</Button>
            <Button variant="success" disabled={s.balance <= 0} onClick={() => open({ type: 'collect', id })}><Wallet />تحصيل</Button>
          </> : <Button variant="outline" onClick={() => open({ type: 'correction', id })}><PencilLine />تصحيح الرصيد</Button>}
        </div>
      </div>
      <div className="grid grid-cols-2 border-t md:grid-cols-4 [&>div]:px-4 [&>div]:py-3 sm:[&>div]:p-5 [&>div:not(:first-child)]:md:border-s [&>div:nth-child(2)]:border-s [&>div:nth-child(n+3)]:max-md:border-t [&>div:nth-child(4)]:max-md:border-s">
        <div className={s.overdue ? 'bg-danger-soft/60' : ''}><div className="text-xs text-muted-foreground">الرصيد المستحق</div><div className={cn('tnum mt-1 text-xl font-bold sm:text-2xl', s.overdue && 'text-danger')}>{money(s.balance)}</div></div>
        <div><div className="text-xs text-muted-foreground">تحصيل الشهر</div><div className="tnum mt-1 text-xl font-bold text-success sm:text-2xl">{money(s.monthCollected)}</div></div>
        <div><div className="text-xs text-muted-foreground">{s.overdue ? 'مدة التأخير' : 'آخر يوم في الأجل'}</div><div className={cn('mt-1 text-base font-semibold sm:text-lg', s.overdue && 'text-danger')}>{s.balance > 0 ? (s.overdue ? `${s.overdueDays} يوم` : fmtDate(s.dueDate)) : '—'}</div></div>
        <div><div className="text-xs text-muted-foreground">آخر تحصيل</div><div className="mt-1 text-base font-semibold sm:text-lg">{s.lastCollection ? fmtDate(s.lastCollection) : '—'}</div></div>
      </div>
    </Card>
    {pending.length > 0 && <Card><CardHeader><CardTitle>طلبات تصحيح معلقة</CardTitle></CardHeader><CardContent className="grid gap-3">{pending.map((t) => <RequestRow key={t.id} t={t} />)}</CardContent></Card>}
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader><div><CardTitle>كشف الحساب</CardTitle><CardDescription>{shown.length} حركة · كل حركة بتاريخها ومن سجّلها</CardDescription></div>
          <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-full sm:w-44"><option value="all">كل الفترات</option>{months.map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}</Select></CardHeader>
        <ul className="divide-y border-t md:hidden">{shown.map(({ t, run }) => { const e = t.kind === 'collection' ? -t.amount : Number(t.amount); const off = t.status !== 'approved'; const I = KIND_ICON[t.kind]; return (
          <li key={t.id} className={cn('flex items-center gap-3 px-4 py-3', off && 'opacity-60')}>
            <span className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-full', KIND_TONE[t.kind])}><I className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">{KIND[t.kind]}{t.status === 'pending' && <Badge variant="warning">معلق</Badge>}{t.status === 'rejected' && <Badge variant="outline">مرفوض</Badge>}</div>
              <div className="truncate text-xs text-muted-foreground">{fmtDT(t.occurred_at)}{t.note && t.note !== 'رصيد افتتاحي' ? ' · ' + t.note : ''}</div>
            </div>
            <div className="shrink-0 text-end">
              <div dir="ltr" className={cn('tnum text-sm font-semibold', e < 0 ? 'text-success' : '', off && 'line-through')}>{e < 0 ? '−' : '+'}{money(Math.abs(e))}</div>
              <div className="tnum text-[11px] text-muted-foreground">الرصيد {off ? '—' : money(run)}</div>
            </div>
          </li>); })}</ul>
        <div className="border-t max-md:hidden">
          <Table>
            <THead><TR className="bg-muted/40"><TH>التاريخ</TH><TH>البيان</TH><TH className="text-end">مدين</TH><TH className="text-end">دائن</TH><TH className="text-end">الرصيد</TH><TH className="max-md:hidden">بواسطة</TH></TR></THead>
            <TBody>{shown.map(({ t, run }) => { const e = t.kind === 'collection' ? -t.amount : Number(t.amount); const off = t.status !== 'approved'; const I = KIND_ICON[t.kind]; return (
              <TR key={t.id} className={off ? 'opacity-60' : ''}>
                <TD className="whitespace-nowrap text-xs text-muted-foreground">{fmtDT(t.occurred_at)}</TD>
                <TD><div className="flex items-center gap-2.5"><span className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-full', KIND_TONE[t.kind])}><I className="size-3.5" /></span>
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5 font-medium">{KIND[t.kind]}{t.status === 'pending' && <Badge variant="warning">معلق</Badge>}{t.status === 'rejected' && <Badge variant="outline">مرفوض</Badge>}</div>{t.note && t.note !== 'رصيد افتتاحي' && <div className="max-w-[260px] truncate text-xs text-muted-foreground">{t.note}</div>}</div></div></TD>
                <TD className={cn('text-end tnum', off && 'line-through')}>{e > 0 ? money(e) : ''}</TD>
                <TD className={cn('text-end tnum text-success', off && 'line-through')}>{e < 0 ? money(-e) : ''}</TD>
                <TD className="text-end tnum font-semibold">{off ? '—' : money(run)}</TD>
                <TD className="whitespace-nowrap text-muted-foreground max-md:hidden">{nameOf(t.created_by)}</TD>
              </TR>); })}</TBody>
          </Table>
        </div>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>الأرشيف الشهري</CardTitle><CardDescription>محفوظ دائماً ولا يُحذف</CardDescription></div></CardHeader>
        <CardContent className="grid gap-1">{byMonth.map((m) => <button key={m.k} onClick={() => setMonth(m.k === month ? 'all' : m.k)} className={cn('grid grid-cols-[1fr_auto_auto] items-center gap-4 rounded-md px-3 py-2.5 text-start text-sm', month === m.k ? 'bg-muted ring-1 ring-border' : 'hover:bg-muted/60')}>
          <span className="font-medium">{monthLabel(m.k)}</span>
          <span className="text-end"><span className="block text-[10px] text-muted-foreground">مدين</span><span className="tnum">{money(m.debit)}</span></span>
          <span className="text-end"><span className="block text-[10px] text-muted-foreground">محصّل</span><span className="tnum text-success">{money(m.credit)}</span></span>
        </button>)}</CardContent>
      </Card>
    </div>
  </>;
}

/* ================= auth ================= */
function AuthShell({ children }) {
  return <div className="grid min-h-full lg:grid-cols-2">
    <div className="flex items-center justify-center px-5 py-12">
      <div className="grid w-full max-w-sm gap-7">{children}</div>
    </div>
    <div className="relative hidden flex-col justify-between overflow-hidden border-s bg-sidebar p-10 lg:flex">
      <div className="flex items-center gap-3"><Logo /><div><div className="font-bold">السلطان للتوزيع</div><div className="text-xs text-muted-foreground">السويس</div></div></div>
      <div className="grid max-w-md gap-6">
        <div><h2 className="text-3xl font-bold leading-tight tracking-tight">دفتر مديونيات المناديب</h2><p className="mt-3 leading-relaxed text-muted-foreground">تسجيل العملاء والتحصيل اليومي، ومتابعة لحظية للإدارة، وأرشيف كامل لكل حركة لا يُحذف.</p></div>
        <div className="grid grid-cols-2 gap-3">
          {[[Zap, 'تحديث لحظي', 'بين المندوب والإدارة بدون إعادة تحميل', 'text-brand'], [ShieldCheck, 'حد ائتمان', 'إيقاف تلقائي للآجل عند التجاوز', 'text-success'], [Clock, `أجل ${TERM_DAYS} يوم`, 'تنبيه بالعملاء المتأخرين', 'text-danger'], [Archive, 'أرشيف دائم', 'كل حركة بتاريخها ومن سجّلها', 'text-warning']].map(([I, t, d, c]) => <div key={t} className="rounded-lg border bg-card p-4 shadow-card"><I className={cn('size-5', c)} /><div className="mt-3 text-sm font-semibold">{t}</div><div className="mt-0.5 text-xs text-muted-foreground">{d}</div></div>)}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} السلطان للتوزيع</p>
    </div>
  </div>;
}

export function LoginPage() {
  const { api, signIn } = useApp();
  const [tab, setTab] = useState('login');
  const [done, setDone] = useState('');
  const login = useSubmit(async (fd) => signIn(fd.get('username'), fd.get('password')));
  const signup = useSubmit(async (fd) => { await api.signUp(String(fd.get('username')), String(fd.get('password')), String(fd.get('full_name')).trim()); setTab('login'); setDone('تم إنشاء الحساب. الإدارة هتفعّله وبعدها تقدر تدخل.'); });
  return <AuthShell>
    <div className="flex items-center gap-3 lg:hidden"><Logo /><span className="font-bold">السلطان للتوزيع</span></div>
    <div><h1 className="text-2xl font-bold tracking-tight">{tab === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب مندوب'}</h1><p className="mt-1.5 text-sm text-muted-foreground">{tab === 'login' ? 'ادخل باسم المستخدم وكلمة المرور الخاصة بك.' : 'بعد التسجيل تفعّل الإدارة حسابك وتحدد حد الائتمان.'}</p></div>
    {done && <div className="rounded-md border border-success/30 bg-success-soft px-3 py-2.5 text-[13px] text-success">{done}</div>}
    {tab === 'login' ? <form onSubmit={login.submit} className="grid gap-4">
      <Field label="اسم المستخدم"><Input name="username" autoComplete="username" dir="ltr" required /></Field>
      <Field label="كلمة المرور"><Input name="password" type="password" autoComplete="current-password" dir="ltr" required /></Field>
      <FormError>{login.error}</FormError>
      <Button type="submit" size="lg" disabled={login.busy}>دخول</Button>
    </form> : <form onSubmit={signup.submit} className="grid gap-4">
      <Field label="الاسم بالكامل"><Input name="full_name" required /></Field>
      <Field label="اسم المستخدم" hint="حروف إنجليزية أو أرقام، 3 على الأقل"><Input name="username" dir="ltr" pattern="[A-Za-z0-9_.\-]{3,30}" required /></Field>
      <Field label="كلمة المرور"><Input name="password" type="password" dir="ltr" minLength={6} required /></Field>
      <FormError>{signup.error}</FormError>
      <Button type="submit" size="lg" disabled={signup.busy}>إنشاء الحساب</Button>
    </form>}
    <p className="text-center text-sm text-muted-foreground">{tab === 'login' ? <>مندوب جديد؟ <button className="font-medium text-foreground underline-offset-4 hover:underline" onClick={() => { setTab('signup'); setDone(''); }}>إنشاء حساب</button></> : <>لديك حساب؟ <button className="font-medium text-foreground underline-offset-4 hover:underline" onClick={() => setTab('login')}>تسجيل الدخول</button></>}</p>
    {api?.mode === 'demo' && <div className="rounded-lg border">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium"><Zap className="size-3.5 text-warning" />نسخة تجريبية · دخول سريع (كلمة المرور 1234)</div>
      <div className="grid grid-cols-2 gap-2 p-3">
        {[['sayed', 'سيد', 'مدير'], ['mohamed', 'محمد', 'مدير'], ['ahmed', 'أحمد', 'حد 1,000,000'], ['mahmoud', 'محمود', 'حد 500,000'], ['karim', 'كريم', 'حد 200,000 · موقوف']].map(([u, n, l]) =>
          <button key={u} data-u={u} onClick={() => signIn(u, '1234')} className="flex items-center gap-2.5 rounded-md border bg-card p-2.5 text-start shadow-card hover:border-foreground/30"><Avatar name={n.charAt(0)} size="sm" tone="brand" /><span className="min-w-0"><span className="block text-sm font-medium">{n}</span><span className="block truncate text-[11px] text-muted-foreground">{l}</span></span></button>)}
      </div>
    </div>}
  </AuthShell>;
}

export function InactivePage() {
  const { me, signOut } = useApp();
  return <AuthShell>
    <span className="inline-flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning"><Clock className="size-6" /></span>
    <div><h1 className="text-2xl font-bold">أهلاً {me.full_name}</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground">حسابك بانتظار التفعيل من الإدارة وتحديد حد الائتمان. هذه الصفحة هتتحدث تلقائياً أول ما يتفعل.</p></div>
    <Button variant="outline" onClick={signOut}>تسجيل الخروج</Button>
  </AuthShell>;
}
