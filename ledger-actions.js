// Tenant Ledger actions: additive only. This file does not alter ledger calculations,
// Supabase data, navigation, or existing controls.
(function () {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function text(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function money(value) {
    const n = Number(String(value == null ? 0 : value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n.toFixed(2) : '0.00';
  }

  function getLedgerData() {
    const tenantSelect = document.getElementById('lTenant');
    const dateInput = document.getElementById('lDate');
    const tenantName = tenantSelect && tenantSelect.options[tenantSelect.selectedIndex]
      ? text(tenantSelect.options[tenantSelect.selectedIndex].textContent)
      : '';
    const asOf = dateInput ? dateInput.value : '';
    const table = document.querySelector('#lRows')?.closest('table');
    const rows = [];

    if (table) {
      table.querySelectorAll('tbody tr').forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('td')).map(td => text(td.textContent));
        if (cells.length) rows.push(cells);
      });
    }

    const summary = [];
    const summaryBox = document.getElementById('lSummary');
    if (summaryBox) {
      summaryBox.querySelectorAll('.card').forEach(card => {
        const label = text(card.querySelector('.label')?.textContent || '');
        const value = text(card.querySelector('.value')?.textContent || '');
        if (label || value) summary.push({ label, value });
      });
    }

    return { tenantName, asOf, rows, summary };
  }

  function buildWhatsAppText() {
    const data = getLedgerData();
    let message = 'BIZNEXCO RENT MANAGEMENT\n';
    message += 'Tenant Ledger\n';
    if (data.tenantName) message += 'Tenant: ' + data.tenantName + '\n';
    if (data.asOf) message += 'As of: ' + data.asOf + '\n';

    if (data.summary.length) {
      message += '\nSUMMARY\n';
      data.summary.forEach(item => {
        if (item.label || item.value) message += (item.label ? item.label + ': ' : '') + item.value + '\n';
      });
    }

    message += '\nLEDGER\n';
    message += 'Date | Particulars | Rent Due | Payment | Balance\n';
    data.rows.forEach(row => {
      message += row.join(' | ') + '\n';
    });

    if (!data.rows.length) message += 'No ledger entries found.\n';
    return message;
  }

  function saveLedgerPdf() {
    const source = document.querySelector('#lSummary')?.parentElement;
    const table = document.querySelector('#lRows')?.closest('.card');
    const tenantSelect = document.getElementById('lTenant');
    const dateInput = document.getElementById('lDate');
    const tenantName = tenantSelect && tenantSelect.options[tenantSelect.selectedIndex]
      ? text(tenantSelect.options[tenantSelect.selectedIndex].textContent)
      : 'Tenant';
    const asOf = dateInput?.value || '';

    if (!table) {
      alert('Please open the Tenant Ledger and load the ledger first.');
      return;
    }

    const popup = window.open('', '_blank', 'noopener,noreferrer,width=1000,height=800');
    if (!popup) {
      alert('Please allow pop-ups for this site to save the ledger as PDF.');
      return;
    }

    const summaryHtml = source ? source.outerHTML : '';
    const tableHtml = table.outerHTML;
    popup.document.open();
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Tenant Ledger - ${esc(tenantName)}</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:28px;font-family:Arial,sans-serif;color:#0f172a;background:#fff}
h1{font-size:24px;margin:0 0 5px}.meta{font-size:12px;color:#64748b;margin-bottom:18px}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:12px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.label{font-size:11px;color:#64748b}.value{font-size:19px;font-weight:800;margin-top:5px}
table{width:100%;border-collapse:collapse}th,td{padding:9px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:12px;vertical-align:top}th{background:#f8fafc;color:#475569}
@media print{body{padding:12mm}.card{break-inside:avoid}tr{break-inside:avoid}h1{font-size:21px}}
</style></head><body>
<h1>BIZNEXCO Rent Management — Tenant Ledger</h1>
<div class="meta">Tenant: ${esc(tenantName)}${asOf ? ' &nbsp;|&nbsp; As of: ' + esc(asOf) : ''}</div>
${summaryHtml}${tableHtml}
<script>window.onload=function(){setTimeout(function(){window.print()},250)};<\/script>
</body></html>`);
    popup.document.close();
  }

  function sendLedgerWhatsApp() {
    const data = getLedgerData();
    if (!data.rows.length && !data.summary.length) {
      alert('Please load the Tenant Ledger first.');
      return;
    }
    const url = 'https://wa.me/?text=' + encodeURIComponent(buildWhatsAppText());
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function addButtons() {
    const refresh = document.getElementById('lRefresh');
    if (!refresh || document.getElementById('lSavePdf') || document.getElementById('lWhatsApp')) return;

    const wrap = document.createElement('div');
    wrap.className = 'report-actions no-print';
    wrap.id = 'ledgerExportActions';
    wrap.style.marginTop = '8px';
    wrap.innerHTML = '<button type="button" class="secondary" id="lSavePdf">📄 Save PDF</button>' +
      '<button type="button" class="secondary" id="lWhatsApp">💬 Send WhatsApp</button>';

    const host = refresh.parentElement;
    if (host) host.appendChild(wrap);

    document.getElementById('lSavePdf')?.addEventListener('click', saveLedgerPdf);
    document.getElementById('lWhatsApp')?.addEventListener('click', sendLedgerWhatsApp);
  }

  const observer = new MutationObserver(addButtons);
  function start() {
    const main = document.getElementById('main');
    if (!main) return;
    observer.observe(main, { childList: true, subtree: true });
    addButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
