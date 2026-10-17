import * as u from '../js/util.js';
const t = (a,b,l)=>console.log(a===b?'ok ':'BAD',l,a,b);
t(u.jstr('2026-10-17'),'1405/07/25','today');
t(u.jstr('2026-03-21'),'1405/01/01','nowruz 1405');
t(u.fromJ(1405,7,25),'2026-10-17','roundtrip');
t(u.jMonthLen(1403,12),30,'1403 leap'); t(u.jMonthLen(1405,12),29,'1405 esfand');
t(u.jlong('2026-10-17'),'شنبه 25 مهر 1405','long');
t(u.parseNum('۱۲,۳۴۵'),12345,'parse'); t(u.fmt(1234567.6),'1,234,568','fmt');
t(u.addDaysISO('2026-10-31',1),'2026-11-01','add');
