// ارقام فارسی در تمام برنامه (۷.۶۵): داده و محاسبه همان لاتین می‌ماند؛ فقط «نمایش» فارسی می‌شود.
// ورودی‌ها (input/textarea) دست‌نخورده می‌مانند تا تایپ و محاسبه مثل قبل باشد؛ کپی‌کردن متن هم عدد لاتین می‌دهد.
const FA = '۰۱۲۳۴۵۶۷۸۹';
const SKIP = 'input,textarea,script,style,[contenteditable="true"],[data-latin]';
export const toFa = s => String(s).replace(/[0-9]/g, d => FA[d])
  .replace(/(?<=[۰-۹]),(?=[۰-۹])/g, '٬').replace(/(?<=[۰-۹])\.(?=[۰-۹])/g, '٫');
export const toEn = s => String(s).replace(/[۰-۹]/g, c => FA.indexOf(c)).replace(/٬/g, ',').replace(/٫/g, '.');
const off = () => { try { return localStorage.getItem('mara_digits') === 'en'; } catch { return false; } };

function fixText(n) {
  const v = n.nodeValue; if (!/[0-9]/.test(v)) return;
  const p = n.parentElement; if (p && p.closest(SKIP)) return;
  n.nodeValue = toFa(v);
}
function fixAttr(el) {
  for (const a of ['title', 'aria-label']) { const v = el.getAttribute && el.getAttribute(a); if (v && /[0-9]/.test(v)) { const t = toFa(v); if (t !== v) el.setAttribute(a, t); } }
}
function walk(root) {
  if (root.nodeType === 3) return fixText(root);
  if (root.nodeType !== 1 || /^(SCRIPT|STYLE|INPUT|TEXTAREA)$/.test(root.tagName)) return;
  if (root.closest(SKIP)) return;
  fixAttr(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) n.nodeType === 3 ? fixText(n) : fixAttr(n);
}

export function initDigits() {
  if (off() || window.__digitsOn) return; window.__digitsOn = true;
  walk(document.body);
  new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === 'childList') m.addedNodes.forEach(walk);
      else if (m.type === 'characterData') fixText(m.target);
      else if (m.type === 'attributes') fixAttr(m.target);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label'] });
  document.addEventListener('copy', e => {
    const ae = document.activeElement; if (ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName)) return;
    const s = String(getSelection()); if (!/[۰-۹]/.test(s)) return;
    e.clipboardData.setData('text/plain', toEn(s)); e.preventDefault();
  });
}
