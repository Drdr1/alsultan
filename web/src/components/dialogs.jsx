import { createContext, useContext, useState } from 'react';
import { CalendarClock } from './icons.jsx';
import { money, parseAmount, fmtDate, TERM_DAYS, DAY, openDay } from '../lib/core.js';
import { useApp } from '../lib/store.jsx';
import { Dialog, Button, Input, MoneyInput, Select, Textarea, Field, FormError, useSubmit, Segmented, cn } from './ui.jsx';

const Ctx = createContext(() => {});
export const useDialogs = () => useContext(Ctx);

export function DialogsProvider({ children }) {
  const [d, setD] = useState(null);
  const close = () => setD(null);
  return <Ctx.Provider value={setD}>
    {children}
    {d?.type === 'collect' && <CollectDialog id={d.id} onClose={close} />}
    {d?.type === 'invoice' && <InvoiceDialog id={d.id} onClose={close} />}
    {d?.type === 'customer' && <AddCustomerDialog onClose={close} />}
    {d?.type === 'correction' && <CorrectionDialog id={d.id} onClose={close} />}
    {d?.type === 'return' && <ReturnDialog id={d.id} onClose={close} />}
    {d?.type === 'close-day' && <CloseDayDialog day={d.day} onClose={close} />}
  </Ctx.Provider>;
}

function Context({ label, value, tone }) {
  return <div className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-3">
    <span className="text-[0.875rem] text-muted-foreground">{label}</span>
    <span className={cn('tnum text-lg font-semibold', tone)}>{money(value)} <span className="text-xs font-normal text-muted-foreground">ج.م</span></span>
  </div>;
}

const AmountInput = (p) => <MoneyInput name="amount" placeholder="0" className="h-14 text-center !text-2xl font-bold" required {...p} />;

function CustomerPicker({ value, onChange, list, stats }) {
  return <Field label="العميل">
    <Select value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="">اختار العميل…</option>
      {list.map((c) => <option key={c.id} value={c.id}>{c.code ? c.code + ' · ' : ''}{c.name} · عليه {money(stats.get(c.id).balance)}</option>)}
    </Select>
  </Field>;
}

function CollectDialog({ id, onClose }) {
  const { api, data, stats, toast, me } = useApp();
  const mine = data.customers.filter((c) => c.status !== 'pending' && (me.role === 'admin' || c.rep_id === me.id) && stats.get(c.id).balance > 0).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const [cid, setCid] = useState(id || '');
  const [amt, setAmt] = useState('');
  const c = data.customers.find((x) => x.id === cid), s = c && stats.get(cid);
  const a = parseAmount(amt), left = s ? s.balance - (a > 0 ? a : 0) : 0;
  const { busy, error, submit } = useSubmit(async (fd) => {
    if (!c) throw new Error('اختار العميل');
    const amount = parseAmount(fd.get('amount'));
    if (!(amount > 0)) throw new Error('اكتب المبلغ بالأرقام');
    if (amount > s.balance) throw new Error(`المبلغ أكبر من رصيد العميل (${money(s.balance)})`);
    await api.addTransaction({ customer_id: c.id, rep_id: c.rep_id, kind: 'collection', amount, note: fd.get('note') });
    toast(`تم تسجيل تحصيل ${money(amount)} ج.م من ${c.name}`);
  }, onClose);
  return <Dialog open onClose={onClose} title={c && id ? `تحصيل من ${c.name}` : 'تسجيل تحصيل'} >
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {!id && <CustomerPicker value={cid} onChange={setCid} list={mine} stats={stats} />}
      {s && <Context label="الرصيد الحالي" value={s.balance} />}
      <Field label="المبلغ المستلم"><AmountInput value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
      {s && <p className="text-center text-[0.875rem] text-muted-foreground">الرصيد بعد التحصيل: <span className={cn('tnum font-semibold text-foreground', left < 0 && 'text-danger')}>{money(left)}</span></p>}
      <Field label="ملاحظة (اختياري)"><Input name="note" placeholder="كاش / شيك رقم …" /></Field>
      <FormError>{error}</FormError>
      <div className="flex gap-2"><Button type="submit" variant="success" className="flex-1" size="lg" disabled={busy}>تسجيل التحصيل</Button><Button type="button" variant="outline" size="lg" onClick={onClose}>إلغاء</Button></div>
    </form>
  </Dialog>;
}

function InvoiceDialog({ id, onClose }) {
  const { api, data, stats, toast, me, summaryOf } = useApp();
  const sum = summaryOf(me);
  const mine = data.customers.filter((c) => c.rep_id === me.id && c.status !== 'pending').sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const [cid, setCid] = useState(id || '');
  const c = data.customers.find((x) => x.id === cid);
  const { busy, error, submit } = useSubmit(async (fd) => {
    if (!c) throw new Error('اختار العميل');
    const amount = parseAmount(fd.get('amount'));
    if (!(amount > 0)) throw new Error('اكتب المبلغ بالأرقام');
    if (sum.total + amount > sum.limit) throw new Error(`مرفوض: المديونية هتبقى ${money(sum.total + amount)} وحد الائتمان ${money(sum.limit)}`);
    const no = String(fd.get('invoice_no') || '').trim(); if (!no) throw new Error('اكتب رقم الفاتورة');
    await api.addTransaction({ customer_id: c.id, rep_id: c.rep_id, kind: 'invoice', amount, invoice_no: no, note: fd.get('note') });
    toast(`تم تسجيل فاتورة ${money(amount)} ج.م على ${c.name}`);
  }, onClose);
  return <Dialog open onClose={onClose} title={c && id ? `فاتورة آجل · ${c.name}` : 'فاتورة آجل جديدة'} >
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {!id && <CustomerPicker value={cid} onChange={setCid} list={mine} stats={stats} />}
      <Context label="المتاح قبل الحد" value={Math.max(0, sum.limit - sum.total)} tone="text-success" />
      <Field label="قيمة الفاتورة"><AmountInput /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="رقم الفاتورة"><Input name="invoice_no" inputMode="numeric" dir="ltr" placeholder="1543" required /></Field>
        <Field label="ملاحظة (اختياري)"><Input name="note" /></Field>
      </div>
      <div className="flex items-center gap-2 rounded-md bg-brand-soft px-3 py-2.5 text-[0.875rem] text-brand"><CalendarClock className="size-4" />تاريخ الاستحقاق: {fmtDate(Date.now() + (TERM_DAYS - 1) * DAY)} (بعد {TERM_DAYS} يوم)</div>
      <FormError>{error}</FormError>
      <div className="flex gap-2"><Button type="submit" className="flex-1" size="lg" disabled={busy}>تسجيل الفاتورة</Button><Button type="button" variant="outline" size="lg" onClick={onClose}>إلغاء</Button></div>
    </form>
  </Dialog>;
}

function AddCustomerDialog({ onClose }) {
  const { api, data, toast, me, can } = useApp();
  const direct = me.role === 'admin' && can('coding');
  const today = new Date().toISOString().slice(0, 10), minD = new Date(Date.now() - 365 * DAY).toISOString().slice(0, 10);
  const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const dup = data.customers.find((c) => (name.trim() && c.name === name.trim()) || (phone.trim().length > 6 && c.phone === phone.trim()));
  const { busy, error, submit } = useSubmit(async (fd) => {
    const n = String(fd.get('name') || '').trim(); if (!n) throw new Error('اكتب اسم المحل');
    const owner = String(fd.get('owner_name') || '').trim(); if (!owner) throw new Error('اكتب اسم صاحب المحل');
    const opening = fd.get('opening') ? parseAmount(fd.get('opening')) : 0;
    if (!(opening >= 0)) throw new Error('الرصيد لازم يكون رقم');
    const d = fd.get('opening_date');
    await api.addCustomer({ name: n, owner_name: owner, phone: fd.get('phone'), location: fd.get('location'), opening, opening_date: d ? new Date(d + 'T12:00:00').toISOString() : null });
    toast(direct ? `تمت إضافة ${n}` : `اتبعت طلب تكويد ${n}، وهيتفعّل بعد موافقة الإدارة`);
  }, onClose);
  return <Dialog open onClose={onClose} title={direct ? 'إضافة عميل جديد' : 'طلب تكويد عميل جديد'} description={direct ? undefined : 'هيتفعّل بعد التكويد.'} width="max-w-lg">
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="اسم المحل"><Input name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: ماركت النور" required /></Field>
        <Field label="اسم صاحب المحل"><Input name="owner_name" placeholder="مثلاً: الحاج سعيد" required /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="رقم التليفون"><Input name="phone" inputMode="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="العنوان"><Input name="location" placeholder="المنطقة - الشارع" /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الرصيد الحالي (عليه كام)"><MoneyInput name="opening" placeholder="0" className="text-end" /></Field>
        <Field label="تاريخ أقدم فاتورة مفتوحة"><Input name="opening_date" type="date" defaultValue={today} min={minD} max={today} /></Field>
      </div>
      {dup && <p className="rounded-md bg-warning-soft px-3 py-2 text-[0.875rem] text-warning">تنبيه: فيه عميل مسجل باسم "{dup.name}"{dup.phone ? ` (${dup.phone})` : ''}</p>}
      <FormError>{error}</FormError>
      <div className="flex gap-2"><Button type="submit" className="flex-1" size="lg" disabled={busy}>{direct ? 'حفظ العميل' : 'إرسال طلب التكويد'}</Button><Button type="button" variant="outline" size="lg" onClick={onClose}>إلغاء</Button></div>
    </form>
  </Dialog>;
}

function CorrectionDialog({ id, onClose }) {
  const { api, data, stats, toast, me } = useApp();
  const admin = me.role === 'admin';
  const c = data.customers.find((x) => x.id === id), s = stats.get(id);
  const [dir, setDir] = useState('-1');
  const { busy, error, submit } = useSubmit(async (fd) => {
    const amount = parseAmount(fd.get('amount')), note = String(fd.get('note') || '').trim();
    if (!(amount > 0)) throw new Error('اكتب المبلغ بالأرقام');
    if (note.length < 4) throw new Error('اكتب سبب التصحيح');
    await api.addTransaction({ customer_id: id, rep_id: c.rep_id, kind: 'correction', amount: amount * Number(dir), note });
    toast(admin ? 'تم تطبيق التصحيح' : 'تم إرسال الطلب للإدارة');
  }, onClose);
  return <Dialog open onClose={onClose} title={(admin ? 'تصحيح رصيد · ' : 'طلب تصحيح · ') + c.name}
    description={admin ? undefined : 'هيتطبق بعد موافقة الإدارة.'}>
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <Context label="الرصيد الحالي" value={s.balance} />
      <Segmented value={dir} onChange={setDir} options={[['-1', 'تقليل المديونية'], ['1', 'زيادة المديونية']]} className="w-full [&>button]:flex-1 [&>button]:justify-center" />
      <Field label="قيمة التصحيح"><AmountInput /></Field>
      <Field label="السبب"><Textarea name="note" rows={2} placeholder="مثلاً: تحصيل 2000 يوم 12 اتسجل 20000 بالغلط" required /></Field>
      <FormError>{error}</FormError>
      <div className="flex gap-2"><Button type="submit" className="flex-1" size="lg" disabled={busy}>{admin ? 'تطبيق التصحيح' : 'إرسال للإدارة'}</Button><Button type="button" variant="outline" size="lg" onClick={onClose}>إلغاء</Button></div>
    </form>
  </Dialog>;
}

function ReturnDialog({ id, onClose }) {
  const { api, data, stats, toast, me, can } = useApp();
  const direct = me.role === 'admin';
  const mine = data.customers.filter((c) => c.status !== 'pending' && (direct || c.rep_id === me.id) && stats.get(c.id).balance > 0).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const [cid, setCid] = useState(id || '');
  const c = data.customers.find((x) => x.id === cid), s = c && stats.get(cid);
  const { busy, error, submit } = useSubmit(async (fd) => {
    if (!c) throw new Error('اختار العميل');
    const amount = parseAmount(fd.get('amount')), note = String(fd.get('note') || '').trim();
    if (!(amount > 0)) throw new Error('اكتب قيمة المرتجع بالأرقام');
    if (amount > s.balance) throw new Error(`المرتجع أكبر من رصيد العميل (${money(s.balance)})`);
    if (note.length < 3) throw new Error('اكتب الأصناف أو سبب المرتجع');
    await api.addTransaction({ customer_id: c.id, rep_id: c.rep_id, kind: 'return', amount, note });
    toast(direct ? `تم تسجيل مرتجع ${money(amount)} ج.م` : 'اتبعت المرتجع للإدارة، وهيتخصم بعد الموافقة');
  }, onClose);
  if (direct && !can('review')) return <Dialog open onClose={onClose} title="مرتجع"><p className="text-sm text-muted-foreground">تسجيل المرتجعات محتاج صلاحية "التصحيح والمرتجعات".</p></Dialog>;
  return <Dialog open onClose={onClose} title={c && id ? `مرتجع · ${c.name}` : 'تسجيل مرتجع'} description={direct ? undefined : 'هيتخصم بعد موافقة الإدارة.'}>
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {!id && <CustomerPicker value={cid} onChange={setCid} list={mine} stats={stats} />}
      {s && <Context label="الرصيد الحالي" value={s.balance} />}
      <Field label="قيمة المرتجع"><AmountInput /></Field>
      <Field label="الأصناف / السبب"><Textarea name="note" rows={2} placeholder="مثلاً: 5 كراتين منتهية الصلاحية" required /></Field>
      <FormError>{error}</FormError>
      <div className="flex gap-2"><Button type="submit" className="flex-1" size="lg" disabled={busy}>{direct ? 'تسجيل المرتجع' : 'إرسال للإدارة'}</Button><Button type="button" variant="outline" size="lg" onClick={onClose}>إلغاء</Button></div>
    </form>
  </Dialog>;
}

// Daily closing: no fixed hours, the day stays open until the rep closes it; the next day starts right after.
export function useToday() {
  const { data, me } = useApp();
  return openDay(data.closings, data.transactions, me.id);
}

function CloseDayDialog({ onClose }) {
  const { api, toast } = useApp();
  const t = useToday();
  const { busy, error, submit } = useSubmit(async () => { await api.closeDay(); toast('تم التقفيل'); }, onClose);
  return <Dialog open onClose={onClose} title={t.day ? `تقفيل يوم ${fmtDate(t.day + 'T12:00:00')}` : 'تقفيل اليوم'}>
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="grid gap-2">
        <Context label="التحصيل = التوريد" value={t.collections} tone="text-success" />
        <Context label="فواتير" value={t.invoices} />
        <Context label="مرتجعات" value={t.returns} />
      </div>
      <FormError>{error}</FormError>
      <div className="flex gap-2"><Button type="submit" variant="danger" className="flex-1" size="lg" disabled={busy || !t.count}>تقفيل نهائي</Button><Button type="button" variant="outline" size="lg" onClick={onClose}>إلغاء</Button></div>
    </form>
  </Dialog>;
}
