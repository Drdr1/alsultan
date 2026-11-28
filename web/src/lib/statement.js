// Debt statement ("كشف المديونية"): for each rep, which shops owe him how much, with the open invoices.
// Kept as an Excel file every day so the money can be traced even if the site is down.
import { TERM_DAYS, DAY, startOfDay } from './core.js';
const lateDays = (due, now) => Math.round((startOfDay(now) - startOfDay(due)) / DAY);

const d = (x) => (x ? new Date(x).toLocaleDateString('en-GB') : '');

export function statementSheets({ reps, customers, stats, agencyName = () => '' }) {
  const ofRep = (r) => customers.filter((c) => c.rep_id === r.id && (c.status || 'approved') === 'approved')
    .map((c) => ({ c, s: stats.get(c.id) || { balance: 0, openItems: [] } }))
    .filter((x) => x.s.balance > 0.009)
    .sort((a, b) => b.s.balance - a.s.balance);
  const now = Date.now();
  const summary = { name: 'الملخص', title: `كشف المديونية ${d(now)}`, head: ['المندوب', 'التوكيل', 'عدد المحلات', 'إجمالي المديونية', 'متأخر', 'حد الائتمان'],
    rows: reps.map((r) => { const l = ofRep(r); const late = l.reduce((a, x) => a + x.s.openItems.filter((o) => lateDays(o.due, now) > 0).reduce((b, o) => b + o.left, 0), 0);
      return [r.full_name, agencyName(r.agency_id), l.length, l.reduce((a, x) => a + x.s.balance, 0), Math.round(late * 100) / 100, Number(r.credit_limit) || 0]; }) };
  const used = new Set();
  const perRep = reps.map((r) => {
    const l = ofRep(r);
    let name = r.full_name.replace(/[\\/?*[\]:]/g, '').slice(0, 28); while (used.has(name)) name += '_'; used.add(name);
    const rows = [];
    l.forEach(({ c, s }) => {
      const items = s.openItems.length ? s.openItems : [{ t: null, left: s.balance, due: null }];
      items.forEach((o, i) => rows.push([
        i ? '' : c.code || '', i ? '' : c.name, i ? '' : c.owner_name || '', i ? '' : c.phone || '', i ? '' : c.location || '', i ? '' : s.balance,
        o.t?.kind === 'invoice' ? (o.t.invoice_no || 'فاتورة') : o.t ? 'رصيد افتتاحي' : '', o.t ? d(o.t.occurred_at) : '', o.left, o.due ? d(o.due) : '', o.due && lateDays(o.due, now) > 0 ? lateDays(o.due, now) : '',
      ]));
    });
    rows.push(['', 'الإجمالي', '', '', '', l.reduce((a, x) => a + x.s.balance, 0), '', '', '', '', '']);
    return { name, title: `${r.full_name} · كشف المديونية ${d(now)} · الأجل ${TERM_DAYS} يوم`, head: ['الكود', 'المحل', 'صاحب المحل', 'التليفون', 'العنوان', 'رصيد العميل', 'رقم الفاتورة', 'تاريخها', 'الباقي منها', 'تستحق', 'متأخرة (يوم)'], rows };
  });
  return [summary, ...perRep];
}
