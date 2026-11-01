// Most forms here put a <label> directly above its field without linking the two, so screen readers announce
// the field with no name (and clicking the label does not focus it). This links each such label to the one
// control that follows it. It never touches a label that already points somewhere, wraps a control, or sits
// before a block holding several controls, because guessing there could attach a label to the wrong field.
const CONTROL = 'input:not([type="hidden"]), select, textarea';
let counter = 0;

function controlAfter(label) {
  const next = label.nextElementSibling;
  if (!next) return null;
  if (next.matches(CONTROL)) return next;
  const inside = next.querySelectorAll(CONTROL);
  return inside.length === 1 ? inside[0] : null;
}

function labelOne(label) {
  if (label.htmlFor || label.querySelector(CONTROL)) return;
  const control = controlAfter(label);
  if (!control || control.closest('label') || control.getAttribute('aria-label') || control.getAttribute('aria-labelledby')) return;
  if (control.id && document.querySelector(`label[for="${CSS.escape(control.id)}"]`)) return;
  if (!control.id) control.id = `field-${++counter}`;
  label.htmlFor = control.id;
}

// A filter dropdown ("All Dispositions") has no visible label; its first option is the name people see.
function nameOne(control) {
  if (control.getAttribute('aria-label') || control.getAttribute('aria-labelledby') || control.title || control.closest('label')) return;
  if (control.id && document.querySelector(`label[for="${CSS.escape(control.id)}"]`)) return;
  if (control.tagName === 'SELECT') {
    const first = control.options?.[0]?.textContent?.trim();
    if (first) control.setAttribute('aria-label', first);
  } else if (control.placeholder) {
    control.setAttribute('aria-label', control.placeholder);
  }
}

function scan(root) {
  if (root.nodeType !== 1) return;
  if (root.matches('label')) labelOne(root);
  root.querySelectorAll('label').forEach(labelOne);
  const controls = root.matches(CONTROL) ? [root, ...root.querySelectorAll(CONTROL)] : [...root.querySelectorAll(CONTROL)];
  controls.forEach((control) => { if (control.type !== 'checkbox' && control.type !== 'radio') nameOne(control); });
}

export function startAssociatingLabels() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
  scan(document.body);
  const pending = new Set();
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    pending.forEach((node) => { if (node.isConnected) scan(node); });
    pending.clear();
  };
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) mutation.addedNodes.forEach((node) => { if (node.nodeType === 1) pending.add(node); });
    if (!scheduled && pending.size) { scheduled = true; requestAnimationFrame(flush); }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
