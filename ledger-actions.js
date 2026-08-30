// Tenant Ledger actions: additive only. This file does not alter ledger calculations,
// Supabase data, navigation, or existing controls.
(function () {
  'use strict';
  function esc(value){return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function text(value){return String(value==null?'':value).replace(/\s+/g,' ').trim();}
  function getLedgerData(){
    const s=document.getElementById('lTenant'),d=document.getElementById('lDate');
    const tenantName=s&&s.options[s.selectedIndex]?text(s.options[s.selectedIndex].textContent):'';
    const asOf=d?d.value:'';
    const table=document.querySelector('#lRows')?.closest('table');
    const rows=[];
    table?.querySelectorAll('tbody tr').forEach(tr=>{const cells=Array.from(tr.querySelectorAll('td')).map(td=>text(td.textContent));if(cells.length)rows.push(cells);});
    const summary=[];const box=document.getElementById('lSummary');
    box?.querySelectorAll('.card').forEach(card=>{const label=text(card.querySelector('.label')?.textContent||'');const value=text(card.querySelector('.value')?.textContent||'');if(label||value)summary.push({label,value});});
    return {tenantName,asOf,rows,summary};
  }
  function buildWhatsAppText(){
    const d=getLedgerData();let m='BIZNEXCO RENT MANAGEMENT\nTenant Ledger\n';
    if(d.tenantName)m+='Tenant: '+d.tenantName+'\n';if(d.asOf)m+='As of: '+d.asOf+'\n';
    if(d.summary.length){m+='\nSUMMARY\n';d.summary.forEach(x=>{m+=(x.label?x.label+': ':'')+x.value+'\n';});}
    m+='\nLEDGER\nDate | Particulars | Rent Due | Payment | Balance\n';
    d.rows.forEach(r=>{m+=r.join(' | ')+'\n';});if(!d.rows.length)m+='No ledger entries found.\n';return m;
  }
  function saveLedgerPdf(){
    const data=getLedgerData();
    if(!data.rows.length&&!data.summary.length){alert('Please load the Tenant Ledger first.');return;}
    const popup=window.open('','_blank','width=1000,height=800');
    if(!popup){alert('Please allow pop-ups for this site to save the ledger as PDF.');return;}
    const summaryHtml=data.summary.length?'<div class="summary">'+data.summary.map(x=>'<div class="card"><div class="label">'+esc(x.label)+'</div><div class="value">'+esc(x.value)+'</div></div>').join('')+'</div>':'';
    const rows=data.rows.map(r=>'<tr>'+r.map(c=>'<td>'+esc(c)+'</td>').join('')+'</tr>').join('');
    popup.document.open();
    popup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Tenant Ledger - '+esc(data.tenantName)+'</title><style>*{box-sizing:border-box}body{margin:0;padding:28px;font-family:Arial,sans-serif;color:#0f172a;background:#fff}h1{font-size:24px;margin:0 0 6px}.meta{font-size:12px;color:#64748b;margin-bottom:18px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}.card{border:1px solid #e2e8f0;border-radius:10px;padding:12px}.label{font-size:11px;color:#64748b}.value{font-size:18px;font-weight:800;margin-top:5px}table{width:100%;border-collapse:collapse}th,td{padding:9px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:12px;vertical-align:top}th{background:#f8fafc;color:#475569} @media print{body{padding:12mm}.card{break-inside:avoid}tr{break-inside:avoid}.summary{grid-template-columns:repeat(4,1fr)}} </style></head><body><h1>BIZNEXCO Rent Management — Tenant Ledger</h1><div class="meta">Tenant: '+esc(data.tenantName)+(data.asOf?' &nbsp;|&nbsp; As of: '+esc(data.asOf): '')+'</div>'+summaryHtml+'<table><thead><tr><th>Date</th><th>Particulars</th><th>Rent Due</th><th>Payment</th><th>Running Balance</th></tr></thead><tbody>'+rows+'</tbody></table><script>window.onload=function(){setTimeout(function(){window.print()},250)};<\/script></body></html>');
    popup.document.close();
  }
  function sendLedgerWhatsApp(){
    const d=getLedgerData();if(!d.rows.length&&!d.summary.length){alert('Please load the Tenant Ledger first.');return;}
    window.open('https://wa.me/?text='+encodeURIComponent(buildWhatsAppText()),'_blank');
  }
  function addButtons(){
    const refresh=document.getElementById('lRefresh');if(!refresh||document.getElementById('lSavePdf')||document.getElementById('lWhatsApp'))return;
    const wrap=document.createElement('div');wrap.className='report-actions no-print';wrap.id='ledgerExportActions';wrap.style.marginTop='8px';
    wrap.innerHTML='<button type="button" class="secondary" id="lSavePdf">📄 Save PDF</button><button type="button" class="secondary" id="lWhatsApp">💬 Send WhatsApp</button>';
    refresh.parentElement?.appendChild(wrap);document.getElementById('lSavePdf')?.addEventListener('click',saveLedgerPdf);document.getElementById('lWhatsApp')?.addEventListener('click',sendLedgerWhatsApp);
  }
  const observer=new MutationObserver(addButtons);function start(){const main=document.getElementById('main');if(!main)return;observer.observe(main,{childList:true,subtree:true});addButtons();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
