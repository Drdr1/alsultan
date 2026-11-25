import { useEffect, useRef, useState } from 'react';
import { Storefront } from '@phosphor-icons/react';
import { LayoutDashboard, Users, Store, AlertTriangle, ClipboardCheck, UserPlus, Bell, LogOut, ChevronLeft, ArrowRight, Zap, Home, Archive, Moon, Sun, ShareIcon, BellRingingIcon as BellRinging } from './icons.jsx';
import { TERM_DAYS, money, REP_TYPE } from '../lib/core.js';
import { permission, enableNotifications, isIOS, isStandalone, canInstall, install, onPWAChange } from '../lib/notify.js';
import { useApp } from '../lib/store.jsx';
import { Avatar, Badge, Button, Select, cn } from './ui.jsx';

export function Logo({ className }) {
  return <span className={cn('inline-flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground', className)} aria-hidden="true">
    <Storefront weight="fill" className="size-5" />
  </span>;
}

export function ThemeToggle({ className }) {
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');
  const flip = () => {
    const next = !dark; setDark(next);
    if (next) document.documentElement.setAttribute('data-theme', 'dark'); else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('alsultan-theme', next ? 'dark' : 'light'); } catch (e) { /* storage blocked */ }
  };
  return <Button variant="outline" size="icon" className={className} onClick={flip} aria-label={dark ? 'الوضع الفاتح' : 'الوضع الليلي'} title={dark ? 'الوضع الفاتح' : 'الوضع الليلي'}>{dark ? <Sun /> : <Moon />}</Button>;
}

function NotifyPrompt() {
  const [, force] = useState(0);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('alsultan-notify-hide') === '1'; } catch { return false; } });
  useEffect(() => onPWAChange(() => force((n) => n + 1)), []);
  const hide = () => { setHidden(true); try { localStorage.setItem('alsultan-notify-hide', '1'); } catch { /* storage blocked */ } };
  const perm = permission();
  const iosBrowser = isIOS() && !isStandalone();
  if (hidden || perm === 'granted' || (perm === 'unsupported' && !iosBrowser)) return null;
  return <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4 shadow-card">
    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"><BellRinging className="size-5" /></span>
    <div className="min-w-0 flex-[1_1_240px] text-sm">
      <div className="font-semibold">خلّي التنبيهات توصلك على الموبايل</div>
      {(iosBrowser || perm === 'denied') && <div className="mt-0.5 text-muted-foreground">{iosBrowser
        ? <>على الآيفون: دوس زرار المشاركة <ShareIcon className="inline size-4 align-text-bottom" /> تحت، واختار «إضافة إلى الشاشة الرئيسية»، وافتح دفتر السلطان من الأيقونة اللي هتظهر، وبعدها فعّل الإشعارات من هنا.</>
        : perm === 'denied' ? 'الإشعارات مقفولة. افتح إعدادات المتصفح للموقع ده واسمح بالإشعارات.'
        : null}</div>}
    </div>
    <div className="flex w-full gap-2 sm:w-auto [&>button]:max-sm:flex-1">
      {canInstall() && <Button variant="outline" onClick={install}>تنزيل كأبلكيشن</Button>}
      {!iosBrowser && perm === 'default' && <Button onClick={() => enableNotifications()}>تفعيل الإشعارات</Button>}
      <Button variant="ghost" onClick={hide}>مش دلوقتي</Button>
    </div>
  </div>;
}

function AgencyPicker({ className }) {
  const { me, agencies, agency, setAgency } = useApp();
  if (me.role !== 'admin' || agencies.length < 2) return null;
  return <Select aria-label="التوكيل" value={agency} onChange={(e) => setAgency(e.target.value)} className={cn('font-medium border-foreground/40', className)}>
    {agencies.map((a) => <option key={a.id} value={a.id}>توكيل {a.name}</option>)}
  </Select>;
}

function useNav() {
  const { me, data, raw, overdue } = useApp();
  if (me.role === 'admin') return [
    ['home', LayoutDashboard, 'لوحة التحكم', 0],
    ['reps', Users, 'المناديب', 0],
    ['customers', Store, 'العملاء', 0],
    ['overdue', AlertTriangle, 'المتأخرين', overdue.length, 'danger'],
    ['approvals', ClipboardCheck, 'طلبات التصحيح', data.transactions.filter((t) => t.status === 'pending').length, 'warning'],
    ['accounts', UserPlus, 'حسابات جديدة', raw.profiles.filter((r) => r.role === 'rep' && !r.active).length, 'brand'],
  ];
  return [['home', Home, 'الرئيسية', 0], ['overdue', AlertTriangle, 'المتأخرين', overdue.length, 'danger']];
}

const SHORT = { home: 'الرئيسية', approvals: 'التصحيح', accounts: 'الحسابات' };
const TITLES = { home: 'لوحة التحكم', reps: 'المناديب', customers: 'العملاء', overdue: 'العملاء المتأخرين', approvals: 'طلبات التصحيح', accounts: 'حسابات جديدة' };

function BellMenu() {
  const { overdue, go, me, nameOf, stats, overLimit, agency } = useApp();
  const reps = overLimit.filter(({ r }) => me.role !== 'admin' || agency === 'all' || r.agency_id === agency);
  const count = overdue.length + reps.length;
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { const h = (e) => !ref.current?.contains(e.target) && setOpen(false); document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  return <div className="relative" ref={ref}>
    <Button variant="outline" size="icon" aria-label="التنبيهات" onClick={() => setOpen((o) => !o)} className="relative">
      <Bell />{count > 0 && <span className="absolute -end-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[0.75rem] font-bold text-white ring-2 ring-background">{count}</span>}
    </Button>
    {open && <div className="z-40 rounded-lg border bg-card shadow-pop animate-in max-sm:fixed max-sm:inset-x-3 max-sm:top-[68px] sm:absolute sm:end-0 sm:top-11 sm:w-[360px]">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="font-semibold">التنبيهات</div>
        {permission() === 'default' && <button className="text-xs font-medium text-brand hover:underline" onClick={() => enableNotifications()}>تفعيل الإشعارات</button>}
      </div>
      <div className="max-h-[60vh] overflow-auto p-2">
        {reps.map(({ r, s }) => <button key={r.id} onClick={() => { setOpen(false); if (me.role === 'admin') go({ name: 'rep', id: r.id }); }} className="flex w-full items-start gap-3 rounded-md p-2.5 text-start hover:bg-muted">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-warning" />
          <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate text-sm font-medium">{r.id === me.id ? 'انت' : r.full_name}</span><span className="shrink-0 text-xs font-medium text-warning">عدّى حد الائتمان</span></span><span className="block text-xs text-muted-foreground">المديونية {money(s.total)} من {money(s.limit)} ج.م</span></span>
        </button>)}
        {count ? overdue.slice(0, 30).map((c) => { const s = stats.get(c.id); return <button key={c.id} onClick={() => { setOpen(false); go({ name: 'customer', id: c.id }); }} className="flex w-full items-start gap-3 rounded-md p-2.5 text-start hover:bg-muted">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-danger" />
          <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate text-sm font-medium">{c.name}</span><span className="shrink-0 text-xs font-medium text-danger">متأخر {s.overdueDays} يوم</span></span><span className="block text-xs text-muted-foreground">عليه {money(s.balance)} ج.م{me.role === 'admin' ? ' · ' + nameOf(c.rep_id) : ''}</span></span>
        </button>; }) : <p className="p-6 text-center text-sm text-muted-foreground">لا توجد تنبيهات.</p>}
      </div>
    </div>}
  </div>;
}

export function Layout({ children }) {
  const { me, view, stack, nav, back, signOut, live, data, api, agencyName } = useApp();
  const items = useNav();
  const active = view.name === 'rep' ? 'reps' : view.name === 'customer' ? (stack[0]?.name || 'home') : view.name;
  const trail = [];
  if (stack.length) {
    trail.push(me.role === 'rep' && active === 'home' ? 'الرئيسية' : TITLES[active] || 'الرئيسية');
    if (view.name === 'rep') trail.push(data.profiles.find((p) => p.id === view.id)?.full_name);
    if (view.name === 'customer') {
      const c = data.customers.find((x) => x.id === view.id);
      if (c && stack.some((s) => s.name === 'rep')) trail.push(data.profiles.find((p) => p.id === c.rep_id)?.full_name);
      trail.push(c?.name);
    }
  }
  const title = stack.length ? trail[trail.length - 1] : (me.role === 'rep' && active === 'home' ? 'الرئيسية' : TITLES[active]);
  return <div className="flex min-h-full">
    {/* sidebar */}
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-e bg-sidebar lg:flex">
      <button onClick={() => nav('home')} className="flex items-center gap-3 px-5 py-5 text-start">
        <Logo /><span><span className="block font-bold leading-tight">السلطان للتوزيع</span><span className="block text-xs text-muted-foreground">دفتر المديونيات</span></span>
      </button>
      <nav className="grid gap-0.5 px-3">
        <div className="px-3 pb-2 pt-3 text-xs font-medium text-muted-foreground">{me.role === 'admin' ? 'الإدارة' : 'المندوب'}</div>
        {items.map(([k, I, l, n, tone]) => <button key={k} onClick={() => nav(k)} className={cn('flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors', active === k ? 'bg-card font-medium text-foreground shadow-card ring-1 ring-border' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
          <I className="size-5" /><span className="flex-1 text-start">{l}</span>{n > 0 && <Badge variant={tone === 'danger' ? 'solid' : tone}>{n}</Badge>}
        </button>)}
      </nav>
      <div className="mt-auto grid gap-3 p-3">
        <div className="flex items-center gap-2 px-3 text-xs text-muted-foreground"><span className={cn('size-2 rounded-full', live === 'SUBSCRIBED' ? 'bg-success animate-pulse' : 'bg-warning')} />{live === 'SUBSCRIBED' ? 'متصل · التحديث لحظي' : 'جاري إعادة الاتصال…'}</div>
        <div className="flex items-center gap-3 rounded-lg border bg-card p-2.5 shadow-card">
          <Avatar name={me.full_name.charAt(0)} tone="brand" />
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{me.full_name}</div><div className="text-xs text-muted-foreground">{me.role === 'admin' ? (me.agency_id ? 'مدير · ' + agencyName(me.agency_id) : 'مدير عام') : [REP_TYPE[me.rep_type] || 'مندوب مبيعات', agencyName(me.agency_id)].filter(Boolean).join(' · ')}</div></div>
          <Button variant="ghost" size="icon" onClick={signOut} title="تسجيل الخروج" aria-label="تسجيل الخروج"><LogOut /></Button>
        </div>
      </div>
    </aside>

    <div className="flex min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-2 sm:gap-3 border-b bg-background/85 px-4 backdrop-blur md:px-8">
        {!stack.length && <div className="lg:hidden"><Logo className="size-8" /></div>}
        {stack.length > 0 && <Button variant="outline" size="icon" onClick={back} aria-label="رجوع"><ArrowRight /></Button>}
        <div className="min-w-0 flex-1">
          {trail.length > 1 && <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">{trail.slice(0, -1).map((t, i) => <span key={i} className="inline-flex items-center gap-1">{t}<ChevronLeft className="size-3" /></span>)}</div>}
          <h1 className="truncate text-lg font-semibold leading-tight">{title}</h1>
        </div>
        <div className="hidden w-48 shrink-0 md:block"><AgencyPicker /></div>
        <ThemeToggle />
        <BellMenu />
        <Button variant="outline" size="icon" className="lg:hidden" onClick={signOut} aria-label="تسجيل الخروج"><LogOut /></Button>
      </header>
      <main className="mx-auto grid w-full grid-cols-[minmax(0,1fr)] max-w-[1800px] gap-4 px-3 pb-28 pt-4 sm:gap-6 sm:px-4 sm:pt-6 md:px-8 lg:pb-10">
        <AgencyPicker className="md:hidden" />
        {!stack.length && view.name === 'home' && <NotifyPrompt />}
        {children}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
          {api?.mode === 'demo' ? <><span className="inline-flex items-center gap-1.5"><Zap className="size-3.5 text-warning" />نسخة تجريبية: البيانات محفوظة على هذا الجهاز فقط.</span><button className="font-medium text-foreground hover:underline" onClick={() => api.resetDemo()}>استرجاع البيانات التجريبية</button></>
            : <span className="inline-flex items-center gap-1.5"><Archive className="size-3.5" />كل الحركات محفوظة في الأرشيف ولا تُحذف.</span>}
        </footer>
      </main>
    </div>

    {/* mobile bottom nav */}
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {items.map(([k, I, l, n]) => <button key={k} onClick={() => nav(k)} className={cn('relative flex min-w-0 flex-1 flex-col items-center gap-1 py-2.5 text-[0.75rem]', active === k ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
        <I className="size-5" /><span className="max-w-full truncate">{SHORT[k] || l}</span>
        {n > 0 && <span className="absolute top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[0.625rem] font-bold text-white" style={{ insetInlineStart: 'calc(50% + 4px)' }}>{n}</span>}
      </button>)}
    </nav>
  </div>;
}
