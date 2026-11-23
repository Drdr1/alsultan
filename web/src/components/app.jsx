import { useMemo, useState } from 'react';
import { Search, Store, Wallet, ChevronLeft, AlertTriangle } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell } from 'recharts';
import { money, TERM_DAYS, TYPE, DAY, startOfDay } from '../lib/core.js';
import { useApp } from '../lib/store.jsx';
import { Badge, Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Segmented, Table, THead, TBody, TR, TH, TD, Button, Avatar, Empty, Progress, cn } from './ui.jsx';

export const initials = (name) => String(name || '؟').replace(/^(سوبر ماركت|ماركت|كشك|بقالة|صيدلية|مخازن|هايبر)\s+/, '').replace(/^(د\.|الحاج|عم|أم|أبو)\s+/, '').replace(/^ال(?=\S{2})/, '').trim().charAt(0);
export const level = (s) => (s.over ? 'danger' : s.pct >= 0.85 ? 'warning' : 'brand');

export function DueBadge({ s }) {
  if (s.balance <= 0.009) return <Badge variant="success" dot>مسدد</Badge>;
  if (s.overdue) return <Badge variant="danger" dot>متأخر {s.overdueDays} يوم</Badge>;
  const left = TERM_DAYS - s.age + 1;
  return <Badge variant={left <= 3 ? 'warning' : 'outline'} dot>باقي {left} يوم</Badge>;
}

export function Money({ v, className, cur = true }) {
  return <span className={cn('tnum', className)}>{money(v)}{cur && <span className="ms-1 text-[0.7em] font-normal text-muted-foreground">ج.م</span>}</span>;
}

export function StatCard({ icon: Icon, label, value, sub, tone = 'default' }) {
  const t = { default: 'bg-muted text-foreground', success: 'bg-success-soft text-success', danger: 'bg-danger-soft text-danger', brand: 'bg-brand-soft text-brand', warning: 'bg-warning-soft text-warning' }[tone];
  return <Card className={cn('p-4 md:p-5', tone === 'danger' && 'border-danger/30')}>
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
      <span className={cn('inline-flex size-8 items-center justify-center rounded-md', t)}><Icon className="size-4" /></span>
    </div>
    <div className={cn('tnum mt-3 text-xl font-bold tracking-tight md:text-2xl', tone === 'danger' && 'text-danger')}>{value}</div>
    {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
  </Card>;
}

/* customers table with search + type filter */
export function CustomerTable({ list, showRep = false, onCollect, initialQuery = '', emptyText }) {
  const { stats, go, nameOf } = useApp();
  const [q, setQ] = useState(initialQuery);
  const [type, setType] = useState('all');
  const rows = useMemo(() => {
    let r = list.filter((c) => !q.trim() || c.name.includes(q.trim()) || (c.phone || '').includes(q.trim()) || (c.location || '').includes(q.trim()));
    if (type !== 'all') r = r.filter((c) => c.debt_type === type);
    return r.sort((a, b) => (stats.get(b.id).overdue - stats.get(a.id).overdue) || (stats.get(b.id).balance - stats.get(a.id).balance));
  }, [list, q, type, stats]);
  return <div className="grid gap-4">
    <div className="flex flex-wrap items-center gap-3 px-5">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو التليفون أو المنطقة" className="ps-9" type="search" />
      </div>
      <Segmented value={type} onChange={setType} options={[['all', 'الكل'], ['retail', 'قطاعي'], ['wholesale', 'جملة']]} />
    </div>
    {rows.length === 0 ? <Empty icon={Store} title={list.length ? 'لا توجد نتائج' : 'لا يوجد عملاء بعد'}>{list.length ? 'جرّب كلمة بحث تانية.' : emptyText}</Empty> : <>
      {/* desktop table */}
      <div className="hidden border-t md:block">
        <Table>
          <THead><TR className="bg-muted/40 hover:bg-muted/40"><TH>العميل</TH>{showRep && <TH>المندوب</TH>}<TH>النوع</TH><TH className="text-end">الرصيد المستحق</TH><TH className="text-end">تحصيل الشهر</TH><TH>حالة الأجل</TH><TH className="w-0" /></TR></THead>
          <TBody>{rows.map((c) => { const s = stats.get(c.id); return (
            <TR key={c.id} onClick={() => go({ name: 'customer', id: c.id })} className={cn('cursor-pointer', s.overdue ? 'bg-danger-soft/60 hover:bg-danger-soft' : 'hover:bg-muted/50')}>
              <TD><div className="flex items-center gap-3"><Avatar name={initials(c.name)} tone={s.overdue ? 'danger' : 'default'} /><div className="min-w-0"><div className={cn('font-medium', s.overdue && 'text-danger')}>{c.name}</div><div className="text-xs text-muted-foreground">{c.location}{c.phone && <> · <span dir="ltr">{c.phone}</span></>}</div></div></div></TD>
              {showRep && <TD className="text-muted-foreground">{nameOf(c.rep_id)}</TD>}
              <TD><Badge variant="outline">{TYPE[c.debt_type]}</Badge></TD>
              <TD className={cn('text-end font-semibold tnum', s.overdue && 'text-danger')}>{money(s.balance)}</TD>
              <TD className="text-end tnum text-muted-foreground">{s.monthCollected ? money(s.monthCollected) : '—'}</TD>
              <TD><div className="flex flex-wrap gap-1.5"><DueBadge s={s} />{s.pending > 0 && <Badge variant="warning">تصحيح معلق</Badge>}</div></TD>
              <TD className="text-end">{onCollect ? <Button size="sm" variant="outline" disabled={s.balance <= 0} onClick={(e) => { e.stopPropagation(); onCollect(c.id); }}><Wallet />تحصيل</Button> : <ChevronLeft className="size-4 text-muted-foreground" />}</TD>
            </TR>); })}</TBody>
        </Table>
      </div>
      {/* mobile list */}
      <ul className="grid gap-2 px-4 md:hidden">{rows.map((c) => { const s = stats.get(c.id); return (
        <li key={c.id} onClick={() => go({ name: 'customer', id: c.id })} className={cn('cursor-pointer rounded-lg border p-3.5', s.overdue ? 'border-danger/30 bg-danger-soft/60' : 'bg-card')}>
          <div className="flex items-start gap-3">
            <Avatar name={initials(c.name)} tone={s.overdue ? 'danger' : 'default'} />
            <div className="min-w-0 flex-1"><div className={cn('truncate font-medium', s.overdue && 'text-danger')}>{c.name}</div><div className="truncate text-xs text-muted-foreground">{showRep ? nameOf(c.rep_id) + ' · ' : ''}{c.location}</div></div>
            <div className={cn('tnum text-base font-semibold', s.overdue && 'text-danger')}>{money(s.balance)}</div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5"><DueBadge s={s} />{s.monthCollected > 0 && <span className="text-xs text-muted-foreground">حصّل {money(s.monthCollected)}</span>}</div>
            {onCollect && <Button size="sm" variant="success" disabled={s.balance <= 0} onClick={(e) => { e.stopPropagation(); onCollect(c.id); }}><Wallet />تحصيل</Button>}
          </div>
        </li>); })}</ul>
    </>}
  </div>;
}

/* credit limit gauge card */
export function CreditCard({ sum, title = 'حد الائتمان', children }) {
  const pct = Math.round(sum.pct * 100), lv = level(sum);
  const r = 46, C = 2 * Math.PI * r, p = Math.min(sum.pct, 1);
  const stroke = { brand: 'hsl(var(--brand))', warning: 'hsl(var(--warning))', danger: 'hsl(var(--danger))' }[lv];
  return <Card className={cn(sum.over && 'border-danger/40')}>
    <CardHeader>
      <div><CardTitle>{title}</CardTitle><CardDescription>المديونية الحالية مقابل الحد المسموح</CardDescription></div>
      {sum.over ? <Badge variant="solid">موقوف عن الآجل</Badge> : <Badge variant={lv === 'warning' ? 'warning' : 'success'} dot>{lv === 'warning' ? 'قريب من الحد' : 'داخل الحد'}</Badge>}
    </CardHeader>
    <CardContent>
      <div className="flex items-center gap-6">
        <div className="relative size-28 shrink-0">
          <svg viewBox="0 0 110 110" className="size-full -rotate-90"><circle cx="55" cy="55" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" /><circle cx="55" cy="55" r={r} fill="none" stroke={stroke} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${C * p} ${C}`} /></svg>
          <div className="absolute inset-0 grid place-content-center text-center"><span className={cn('tnum text-xl font-bold', sum.over && 'text-danger')}>{pct}%</span><span className="text-[11px] text-muted-foreground">من الحد</span></div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-muted-foreground">إجمالي المديونية</div>
          <div className={cn('tnum text-3xl font-bold tracking-tight', sum.over && 'text-danger')}>{money(sum.total)}<span className="ms-1 text-sm font-normal text-muted-foreground">ج.م</span></div>
          <div className="mt-1 text-[13px] text-muted-foreground">من حد <span className="tnum font-medium text-foreground">{money(sum.limit)}</span></div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 divide-x divide-x-reverse rounded-md border bg-muted/30 text-center">
        <div className="p-3"><div className="text-xs text-muted-foreground">{sum.over ? 'التجاوز' : 'المتاح'}</div><div className={cn('tnum mt-0.5 font-semibold', sum.over ? 'text-danger' : 'text-success')}>{money(Math.abs(sum.limit - sum.total))}</div></div>
        <div className="p-3"><div className="text-xs text-muted-foreground">قطاعي</div><div className="tnum mt-0.5 font-semibold">{money(sum.retail)}</div></div>
        <div className="p-3"><div className="text-xs text-muted-foreground">جملة</div><div className="tnum mt-0.5 font-semibold">{money(sum.wholesale)}</div></div>
      </div>
      {children}
    </CardContent>
  </Card>;
}

const fmtK = (n) => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : Math.abs(n) >= 1000 ? Math.round(n / 1000) + 'k' : String(Math.round(n)));
const dm = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'short' });

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-pop" dir="rtl">
    <div className="mb-1 font-medium">{label}</div>
    {payload.map((p) => <div key={p.dataKey} className="flex items-center gap-2 text-muted-foreground"><span className="size-2 rounded-sm" style={{ background: p.color }} />{p.name}: <span className="tnum font-medium text-foreground">{money(p.value)}</span></div>)}
  </div>;
}

function ChartLegend({ items }) {
  return <div className="flex flex-wrap gap-x-4 gap-y-1 px-5 pb-2 text-xs text-muted-foreground">{items.map(([c, l]) => <span key={l} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: c }} />{l}</span>)}</div>;
}

export function TrendCard({ txs, weeks = 10 }) {
  const rows = useMemo(() => {
    const now = startOfDay(Date.now()), start = now - (weeks * 7 - 1) * DAY;
    const out = Array.from({ length: weeks }, (_, i) => ({ label: 'أسبوع ' + dm.format(new Date(start + i * 7 * DAY)), col: 0, inv: 0 }));
    for (const t of txs) {
      if (t.status !== 'approved') continue;
      const d = startOfDay(t.occurred_at); if (d < start) continue;
      const i = Math.min(weeks - 1, Math.floor((d - start) / (7 * DAY)));
      if (t.kind === 'collection') out[i].col += Number(t.amount); else if (t.kind === 'invoice') out[i].inv += Number(t.amount);
    }
    return out;
  }, [txs, weeks]);
  const tc = rows.reduce((a, r) => a + r.col, 0), ti = rows.reduce((a, r) => a + r.inv, 0);
  return <Card>
    <CardHeader><div><CardTitle>التحصيل والفواتير الآجل</CardTitle><CardDescription>أسبوعياً · آخر {weeks} أسابيع</CardDescription></div>
      <div className="flex gap-6 text-end"><div><div className="text-xs text-muted-foreground">التحصيل</div><div className="tnum font-semibold text-success">{money(tc)}</div></div><div><div className="text-xs text-muted-foreground">الفواتير</div><div className="tnum font-semibold">{money(ti)}</div></div></div>
    </CardHeader>
    <ChartLegend items={[['var(--chart-1)', 'التحصيل'], ['var(--chart-2)', 'فواتير آجل']]} />
    <CardContent className="h-[240px] ps-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <defs><linearGradient id="gcol" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} /><stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" reversed tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(l) => l.replace('أسبوع ', '')} interval="preserveStartEnd" minTickGap={16} />
          <YAxis orientation="right" tickLine={false} axisLine={false} tickFormatter={fmtK} width={44} />
          <Tooltip content={<ChartTip />} cursor={{ stroke: 'hsl(var(--border))' }} />
          <Area type="monotone" dataKey="col" name="التحصيل" stroke="var(--chart-1)" strokeWidth={2} fill="url(#gcol)" dot={false} activeDot={{ r: 5 }} animationDuration={500} />
          <Area type="monotone" dataKey="inv" name="فواتير آجل" stroke="var(--chart-2)" strokeWidth={2} fill="transparent" dot={false} activeDot={{ r: 5 }} animationDuration={500} />
        </AreaChart>
      </ResponsiveContainer>
    </CardContent>
  </Card>;
}

export function RepBarsCard({ sums, onOpen }) {
  const rows = sums.map(({ r, s }) => ({ id: r.id, name: r.full_name.split(' ')[0], full: r.full_name, total: s.total, limit: s.limit, over: s.over }));
  return <Card>
    <CardHeader><div><CardTitle>المديونية حسب المندوب</CardTitle><CardDescription>العمود الأحمر = تجاوز حد الائتمان</CardDescription></div></CardHeader>
    <ChartLegend items={[['var(--chart-2)', 'المديونية'], ['hsl(var(--danger))', 'تجاوز الحد'], ['hsl(var(--muted-foreground) / 0.25)', 'حد الائتمان']]} />
    <CardContent className="h-[240px] ps-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={4}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="name" reversed tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis orientation="right" tickLine={false} axisLine={false} tickFormatter={fmtK} width={44} />
          <Tooltip content={<ChartTip />} cursor={{ fill: 'hsl(var(--muted))' }} />
          <Bar dataKey="total" name="المديونية" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={44} onClick={(d) => onOpen?.(d.id)} className="cursor-pointer">
            {rows.map((r) => <Cell key={r.id} fill={r.over ? 'hsl(var(--danger))' : 'var(--chart-2)'} />)}
          </Bar>
          <Bar dataKey="limit" name="حد الائتمان" fill="hsl(var(--muted-foreground) / 0.25)" radius={[4, 4, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </CardContent>
  </Card>;
}

export function RepCard({ r, s, onClick }) {
  const lv = level(s);
  return <button onClick={onClick} className={cn('group grid gap-4 rounded-lg border bg-card p-5 text-start shadow-card transition-colors hover:border-foreground/20', s.over && 'border-danger/40')}>
    <div className="flex items-center gap-3">
      <Avatar name={r.full_name.charAt(0)} tone={s.over ? 'danger' : 'brand'} />
      <div className="min-w-0 flex-1"><div className="truncate font-semibold">{r.full_name}</div><div className="text-xs text-muted-foreground" dir="ltr">@{r.username}</div></div>
      {s.over ? <Badge variant="solid">موقوف</Badge> : <Badge variant={lv === 'warning' ? 'warning' : 'success'} dot>{lv === 'warning' ? 'قريب من الحد' : 'نشط'}</Badge>}
    </div>
    <div>
      <div className={cn('tnum text-2xl font-bold tracking-tight', s.over && 'text-danger')}>{money(s.total)}<span className="ms-1 text-xs font-normal text-muted-foreground">ج.م</span></div>
      <div className="mt-2"><Progress value={s.pct * 100} tone={lv} /></div>
      <div className="tnum mt-1.5 flex justify-between text-xs text-muted-foreground"><span>{Math.round(s.pct * 100)}% من {money(s.limit)}</span><span className={s.over ? 'font-medium text-danger' : ''}>{s.over ? 'تجاوز ' + money(s.total - s.limit) : 'متاح ' + money(s.limit - s.total)}</span></div>
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
      <span>{s.customers.length} عميل</span><span>تحصيل الشهر <span className="tnum font-medium text-foreground">{money(s.month)}</span></span>
      {s.overdue > 0 && <span className="inline-flex items-center gap-1 font-medium text-danger"><AlertTriangle className="size-3" />{s.overdue} متأخر</span>}
    </div>
  </button>;
}
