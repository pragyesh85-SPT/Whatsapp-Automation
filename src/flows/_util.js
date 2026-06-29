const { tenant } = require('../config');

// Fill "{key}" placeholders from a data object; auto-injects center + signoff.
function fill(tpl, data = {}) {
  const all = { center: tenant.branding.displayName, signoff: tenant.branding.signoff, ...data };
  return String(tpl).replace(/\{(\w+)\}/g, (_, k) => (all[k] != null ? all[k] : `{${k}}`));
}

function monthLabel(d = new Date()) {
  return d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

module.exports = { fill, monthLabel };
