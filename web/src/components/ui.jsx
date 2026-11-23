import { useEffect, useRef, useState, createContext, useContext, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, AlertCircle, Radio } from './icons.jsx';

export const cn = (...a) => a.filter(Boolean).join(' ');

/* ---------- Button ---------- */
const BTN = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-card',
  brand: 'bg-brand text-white hover:bg-brand/90 shadow-card',
  success: 'bg-success text-white hover:bg-success/90 shadow-card',
  outline: 'border bg-card hover:bg-muted text-foreground shadow-card',
  secondary: 'bg-muted text-foreground hover:bg-muted/70',
  ghost: 'hover:bg-muted text-foreground',
  danger: 'bg-danger text-white hover:bg-danger/90',
  'danger-outline': 'border border-danger/30 text-danger hover:bg-danger-soft bg-card',
};
const SIZE = { default: 'h-9 px-4 text-sm', sm: 'h-8 px-3 text-[13px]', lg: 'h-11 px-5 text-[15px]', icon: 'h-9 w-9' };
export function Button({ variant = 'default', size = 'default', className, ...p }) {
  return <button className={cn('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[18px] [&_svg]:shrink-0', BTN[variant], SIZE[size], className)} {...p} />;
}

/* ---------- Card ---------- */
export const Card = ({ className, ...p }) => <div className={cn('rounded-lg border bg-card shadow-card', className)} {...p} />;
export const CardHeader = ({ className, ...p }) => <div className={cn('flex flex-wrap items-start justify-between gap-3 p-5 pb-3', className)} {...p} />;
export const CardTitle = ({ className, ...p }) => <h3 className={cn('text-[15px] font-semibold leading-tight', className)} {...p} />;
export const CardDescription = ({ className, ...p }) => <p className={cn('mt-1 text-[13px] text-muted-foreground', className)} {...p} />;
export const CardContent = ({ className, ...p }) => <div className={cn('p-5 pt-0', className)} {...p} />;

/* ---------- Badge ---------- */
const BADGE = {
  default: 'bg-muted text-foreground',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  brand: 'bg-brand-soft text-brand',
  outline: 'border text-muted-foreground',
  solid: 'bg-danger text-white',
};
export function Badge({ variant = 'default', dot, className, children }) {
  return <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', BADGE[variant], className)}>
    {dot && <span className="size-1.5 rounded-full bg-current" />}{children}
  </span>;
}

/* ---------- Form controls ---------- */
export const Input = ({ className, ...p }) => <input className={cn('flex h-9 w-full rounded-md border bg-card px-3 text-sm shadow-card transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring disabled:opacity-50', className)} {...p} />;
export const Textarea = ({ className, ...p }) => <textarea className={cn('flex min-h-[72px] w-full rounded-md border bg-card px-3 py-2 text-sm shadow-card placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring', className)} {...p} />;
export const Select = ({ className, ...p }) => <select className={cn('flex h-9 w-full rounded-md border bg-card px-3 text-sm shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30', className)} {...p} />;
export const Label = ({ className, ...p }) => <label className={cn('grid gap-1.5 text-[13px] font-medium', className)} {...p} />;
export const Field = ({ label, hint, children }) => <Label>{label}{children}{hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}</Label>;

/* ---------- Segmented tabs ---------- */
export function Segmented({ value, onChange, options, className }) {
  return <div className={cn('inline-flex h-9 items-center rounded-md bg-muted p-1 text-muted-foreground', className)} role="tablist">
    {options.map(([k, l]) => <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
      className={cn('inline-flex h-7 items-center rounded-sm px-3 text-[13px] font-medium transition-all', value === k ? 'bg-card text-foreground shadow-card' : 'hover:text-foreground')}>{l}</button>)}
  </div>;
}

/* ---------- Progress ---------- */
export function Progress({ value, tone = 'brand', className }) {
  const c = { brand: 'bg-brand', warning: 'bg-warning', danger: 'bg-danger', success: 'bg-success' }[tone];
  return <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}><div className={cn('h-full rounded-full transition-all', c)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

/* ---------- Avatar ---------- */
export function Avatar({ name, tone = 'default', size = 'md', className }) {
  const t = { default: 'bg-muted text-foreground', brand: 'bg-brand-soft text-brand', danger: 'bg-danger-soft text-danger', success: 'bg-success-soft text-success' }[tone];
  const s = { sm: 'size-8 text-xs', md: 'size-9 text-sm', lg: 'size-14 text-xl' }[size];
  return <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', t, s, className)}>{name}</span>;
}

/* ---------- Table ---------- */
export const Table = ({ className, ...p }) => <div className="relative w-full overflow-x-auto"><table className={cn('w-full caption-bottom text-sm', className)} {...p} /></div>;
export const THead = (p) => <thead className="[&_tr]:border-b" {...p} />;
export const TBody = (p) => <tbody className="[&_tr:last-child]:border-0" {...p} />;
export const TR = ({ className, ...p }) => <tr className={cn('border-b transition-colors', className)} {...p} />;
export const TH = ({ className, ...p }) => <th className={cn('h-10 whitespace-nowrap px-4 text-start align-middle text-xs font-medium text-muted-foreground', className)} {...p} />;
export const TD = ({ className, ...p }) => <td className={cn('px-4 py-3 align-middle', className)} {...p} />;

/* ---------- Empty ---------- */
export function Empty({ icon: Icon, title, children }) {
  return <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
    {Icon && <span className="mb-1 inline-flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><Icon className="size-5" /></span>}
    <p className="text-sm font-medium">{title}</p>
    {children && <p className="max-w-sm text-[13px] text-muted-foreground">{children}</p>}
  </div>;
}

/* ---------- Dialog ---------- */
export function Dialog({ open, onClose, title, description, children, width = 'max-w-md' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    setTimeout(() => ref.current?.querySelector('input:not([type=hidden]):not([type=radio]),select,textarea')?.focus(), 30);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(<div dir="rtl" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 animate-fade" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={cn('relative grid max-h-full w-full gap-5 overflow-auto rounded-lg border bg-card p-6 shadow-pop animate-in', width)}>
      <div className="pe-8"><h2 className="text-lg font-semibold leading-tight">{title}</h2>{description && <p className="mt-1.5 text-[13px] text-muted-foreground">{description}</p>}</div>
      <button onClick={onClose} aria-label="إغلاق" className="absolute end-4 top-4 rounded-sm p-1 text-muted-foreground opacity-70 hover:opacity-100"><X className="size-4" /></button>
      {children}
    </div>
  </div>, document.body);
}

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setItems((x) => [...x, { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4200);
  }, []);
  const Icon = { ok: CheckCircle2, err: AlertCircle, live: Radio };
  return <ToastCtx.Provider value={push}>{children}
    {createPortal(<div dir="rtl" className="pointer-events-none fixed bottom-4 start-4 z-[60] grid w-[min(380px,calc(100vw-32px))] gap-2 max-md:bottom-20" aria-live="polite">
      {items.map((t) => { const I = Icon[t.kind] || CheckCircle2; return <div key={t.id} className="flex items-start gap-3 rounded-lg border bg-card p-3.5 text-sm shadow-pop animate-in">
        <I className={cn('mt-0.5 size-4 shrink-0', t.kind === 'err' ? 'text-danger' : t.kind === 'live' ? 'text-brand' : 'text-success')} /><span>{t.text}</span></div>; })}
    </div>, document.body)}
  </ToastCtx.Provider>;
}

/* ---------- Form helper: async submit with inline error ---------- */
export function useSubmit(fn, onDone) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e?.preventDefault(); setError(''); setBusy(true);
    try { await fn(new FormData(e.currentTarget)); onDone?.(); } catch (err) { setError(err.message || String(err)); } finally { setBusy(false); }
  };
  return { busy, error, submit, setError };
}
export const FormError = ({ children }) => children ? <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger"><AlertCircle className="mt-0.5 size-4 shrink-0" />{children}</div> : null;
