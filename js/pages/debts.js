// بدهکاران و بستانکاران: همه‌ی طلب‌ها و بدهی‌ها (مشتری‌ها و تامین‌کننده‌ها) یک‌جا
import { h, fmt, sum } from '../util.js';
import { S } from '../store.js';
import { dtable, N, pill, kpi } from '../ui.js';
import { head, searchBox, match } from './common.js';

export function render() {
  let q = '';
  const box = h('div');
  const rows = () => {
    const owe = [], due = [];   // owe = باید به ما بدهند (بدهکاران) ، due = ما باید بدهیم (بستانکاران)
    (S.vCus || []).forEach(c => {
      if (c.outstanding > 0.5) owe.push({ kind: 'مشتری', name: c.name, amt: c.outstanding, over: c.overdue_amount || 0, go: '#/customers' });
      if (c.credit_bal > 0.5) due.push({ kind: 'مشتری (اعتبار)', name: c.name, amt: c.credit_bal, over: 0, go: '#/customers' });
    });
    (S.vSup || []).forEach(s => {
      if (s.balance > 0.5) due.push({ kind: 'تامین‌کننده', name: s.name, amt: s.balance, over: 0, go: '#/invoices' });
      if (s.balance < -0.5) owe.push({ kind: 'تامین‌کننده', name: s.name, amt: -s.balance, over: 0, go: '#/suppliers' });
    });
    const f = r => match(q, r.name);
    return { owe: owe.filter(f).sort((a, b) => b.amt - a.amt), due: due.filter(f).sort((a, b) => b.amt - a.amt) };
  };
  const cols = (who) => [
    { label: 'نام', main: true, render: r => r.name },
    { label: 'نوع', hm: true, render: r => pill(r.kind, who === 'owe' ? 'amber' : 'blue') },
    { label: 'مبلغ (ریال)', cls: 'num', render: r => N(r.amt) },
    ...(who === 'owe' ? [{ label: 'سررسید گذشته', cls: 'num', hm: true, render: r => r.over > 0.5 ? N(r.over, 'neg') : '' }] : [])
  ];
  const go = r => { location.hash = r.go; };
  function draw() {
    const all = (() => { const a = q; q = ''; const r = rows(); q = a; return r; })();
    const t1 = sum(all.owe, r => r.amt), t2 = sum(all.due, r => r.amt), over = sum(all.owe, r => r.over);
    const v = rows();
    box.replaceChildren(
      h('div', { class: 'kpis' },
        kpi('بدهکاران: باید به ما بدهند', N(t1), { sub: 'ریال · ' + fmt(all.owe.length) + ' نفر', tone: t1 > 0 ? 'warn' : '' }),
        kpi('بستانکاران: ما باید بدهیم', N(t2), { sub: 'ریال · ' + fmt(all.due.length) + ' نفر', tone: t2 > 0 ? 'warn' : '' }),
        kpi('خالص', N(t1 - t2), { sub: t1 - t2 >= 0 ? 'ریال · به نفع ما' : 'ریال · به ضرر ما' }),
        kpi('سررسید گذشته از مشتریان', N(over), { sub: 'ریال', tone: over > 0 ? 'bad' : '' })),
      h('section', { class: 'card' }, h('div', { class: 'ct' }, 'بدهکاران (باید به ما بدهند)'), dtable(cols('owe'), v.owe, { onRow: go, empty: 'کسی به ما بدهکار نیست' })),
      h('section', { class: 'card' }, h('div', { class: 'ct' }, 'بستانکاران (ما باید بدهیم)'), dtable(cols('due'), v.due, { onRow: go, empty: 'به کسی بدهکار نیستیم' })),
      h('p', { class: 'hint' }, 'مشتری بدهکار = فاکتور فروشِ پرداخت‌نشده. مشتری بستانکار = اعتبارِ مانده از مرجوعی. تامین‌کننده‌ی بستانکار = خریدِ پرداخت‌نشده. روی هر ردیف بزنی به صفحه‌ی همان حساب می‌روی.'));
  }
  const root = h('div', null, head('بدهکاران و بستانکاران', [], 'همه‌ی طلب‌ها و بدهی‌ها، هم مشتری‌ها و هم تامین‌کننده‌ها.'), searchBox(v => { q = v; draw(); }, 'جستجوی نام…'), box);
  draw();
  return root;
}
