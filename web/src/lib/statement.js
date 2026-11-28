// Debt statement ("كشف المديونية"): for each rep, which shops owe him how much, with the open invoices.
// Kept as an Excel file every day so the money can be traced even if the site is down.
import { TERM_DAYS, DAY, startOfDay } from './core.js';
const lateDays = (due, now) => Math.round((startOfDay(now) - startOfDay(due)) / DAY);

const d = (x) => (x ? new Date(x).toLocaleDateString('en-GB') : '');

export function statementSheets({ reps, customers, stats, agencyName = () => '', dayTx = [], day = '' }) {
  // collections of the chosen day, per rep and per shop
  const col = dayTx.filter((t) => t.kind === 'collection');
  const colRep = (id) => col.filter((t) => t.rep_id === id).reduce((a, t) => a + Number(t.amount), 0);
  const colCust = (id) => col.filter((t) => t.customer_id === id).reduce((a, t) => a + Number(t.amount), 0);
  const dl = day ? d(day + 'T12:00:00') : d(Date.now());
  const ofRep = (r) => customers.filter((c) => c.rep_id === r.id && (c.status || 'approved') === 'approved')
    .map((c) => ({ c, s: stats.get(c.id) || { balance: 0, openItems: [] } }))
    .filter((x) => x.s.balance > 0.009)
    .sort((a, b) => b.s.balance - a.s.balance);
  const now = Date.now();
  const summary = { name: 'الملخص', title: `كشف المديونية ${d(now)} · تحصيل يوم ${dl}`, head: ['المندوب', 'التوكيل', 'عدد المحلات', 'إجمالي المديونية', 'متأخر', 'حد الائتمان', `تحصيل يوم ${dl}`],
    rows: reps.map((r) => { const l = ofRep(r); const late = l.reduce((a, x) => a + x.s.openItems.filter((o) => lateDays(o.due, now) > 0).reduce((b, o) => b + o.left, 0), 0);
      return [r.full_name, agencyName(r.agency_id), l.length, l.reduce((a, x) => a + x.s.balance, 0), Math.round(late * 100) / 100, Number(r.credit_limit) || 0, colRep(r.id)]; }) };
  summary.rows.push(['الإجمالي', '', summary.rows.reduce((a, r) => a + r[2], 0), summary.rows.reduce((a, r) => a + r[3], 0), summary.rows.reduce((a, r) => a + r[4], 0), '', summary.rows.reduce((a, r) => a + r[6], 0)]);
  const used = new Set();
  const perRep = reps.map((r) => {
    const l = ofRep(r);
    let name = r.full_name.replace(/[\\/?*[\]:]/g, '').slice(0, 28); while (used.has(name)) name += '_'; used.add(name);
    const rows = [];
    l.forEach(({ c, s }) => {
      const items = s.openItems.length ? s.openItems : [{ t: null, left: s.balance, due: null }];
      items.forEach((o, i) => rows.push([
        i ? '' : c.code || '', i ? '' : c.name, i ? '' : c.owner_name || '', i ? '' : c.phone || '', i ? '' : c.location || '', i ? '' : s.balance, i ? '' : (colCust(c.id) || ''),
        o.t?.kind === 'invoice' ? (o.t.invoice_no || 'فاتورة') : o.t ? 'رصيد افتتاحي' : '', o.t ? d(o.t.occurred_at) : '', o.left, o.due ? d(o.due) : '', o.due && lateDays(o.due, now) > 0 ? lateDays(o.due, now) : '',
      ]));
    });
    // shops that paid today and owe nothing now still show up, so the day's collection is complete
    customers.filter((c) => c.rep_id === r.id && colCust(c.id) && !l.some((x) => x.c.id === c.id)).forEach((c) => rows.push([c.code || '', c.name, c.owner_name || '', c.phone || '', c.location || '', 0, colCust(c.id), 'خالص', '', '', '', '']));
    rows.push(['', 'الإجمالي', '', '', '', l.reduce((a, x) => a + x.s.balance, 0), colRep(r.id), '', '', '', '', '']);
    return { name, title: `${r.full_name} · كشف المديونية ${d(now)} · الأجل ${TERM_DAYS} يوم`, head: ['الكود', 'المحل', 'صاحب المحل', 'التليفون', 'العنوان', 'رصيد العميل', `تحصيل ${dl}`, 'رقم الفاتورة', 'تاريخها', 'الباقي منها', 'تستحق', 'متأخرة (يوم)'], rows };
  });
  const nameOf = (id) => reps.find((r) => r.id === id)?.full_name || '';
  const cust = new Map(customers.map((c) => [c.id, c]));
  const daySheet = { name: 'تحصيل اليوم', title: `تحصيل يوم ${dl}`, head: ['الوقت', 'المندوب', 'كود العميل', 'المحل', 'المبلغ'],
    rows: [...col].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map((t) => [new Date(t.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), nameOf(t.rep_id), cust.get(t.customer_id)?.code || '', cust.get(t.customer_id)?.name || '', Number(t.amount)]) };
  daySheet.rows.push(['', 'الإجمالي', '', '', col.reduce((a, t) => a + Number(t.amount), 0)]);
  return [summary, ...perRep, daySheet];
}
