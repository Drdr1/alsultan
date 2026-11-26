import { Fragment } from 'react';
import { useApp } from './lib/store.jsx';
import { Layout } from './components/layout.jsx';
import { RepHome, AdminHome, RepsPage, CustomersPage, OverduePage, ApprovalsPage, AccountsPage, SettingsPage, ReportPage, RepDetail, CustomerPage, LoginPage, InactivePage } from './pages.jsx';

export default function App() {
  const { boot, me, view } = useApp();
  if (!boot.ready) return <div className="grid h-full place-items-center text-sm text-muted-foreground">جاري التحميل…</div>;
  if (boot.error) return <div className="grid h-full place-items-center p-6 text-center"><div><h1 className="text-lg font-semibold">تعذر التشغيل</h1><p className="mt-2 text-sm text-muted-foreground">{boot.error}</p></div></div>;
  if (!me) return <LoginPage />;
  if (!me.active) return <InactivePage />;
  let page;
  if (view.name === 'customer') page = <CustomerPage id={view.id} />;
  else if (me.role === 'admin') page = ({ rep: <RepDetail id={view.id} />, reps: <RepsPage />, customers: <CustomersPage />, overdue: <OverduePage />, approvals: <ApprovalsPage />, accounts: <AccountsPage />, report: <ReportPage />, settings: <SettingsPage /> })[view.name] || <AdminHome />;
  else page = view.name === 'overdue' ? <OverduePage /> : <RepHome />;
  return <Layout><Fragment key={view.name + (view.id || '')}>{page}</Fragment></Layout>;
}
