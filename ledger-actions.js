// Tenant Ledger actions: additive only. This file does not alter ledger calculations,
// Supabase data, navigation, or existing controls.
(function () {
  'use strict';
  function esc(value){return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function text(value){return String(value==null?'':value).replace(/\s+/g,' ').trim();}
  function getLedgerData(){
    const s=document.getElementById('lTenant'),d=document.getElementById('lDate');
    const tenantName=s&&s.options[s.selectedIndex]?text(s.options[s.selectedIndex].textContent):'';
    const tenantId=s?.value||'';
    const asOf=d?d.value:'';
    const table=document.querySelector('#lRows')?.closest('table');
    const rows=[];
    table?.querySelectorAll('tbody tr').forEach(tr=>{const cells=Array.from(tr.querySelectorAll('td')).map(td=>text(td.textContent));if(cells.length)rows.push(cells);});
    const summary=[];const box=document.getElementById('lSummary');
    box?.querySelectorAll('.card').forEach(card=>{const label=text(card.querySelector('.label')?.textContent||'');const value=text(card.querySelector('.value')?.textContent||'');if(label||value)summary.push({label,value});});
    return {tenantId,tenantName,asOf,rows,summary};
  }
  async function getSelectedTenantRecord(){
    const d=getLedgerData();
    try{
      // Primary source: the exact tenant selected in Tenant Ledger.
      if(window.BiznexcoData?.getTenantById && d.tenantId){
        const row=await window.BiznexcoData.getTenantById(d.tenantId);
        if(row) return row;
      }
      // Secondary source: active tenant list, matching by ID or name.
      if(window.BiznexcoData?.listActiveTenants){
        const rows=await window.BiznexcoData.listActiveTenants();
        const match=(rows||[]).find(r=>String(r.id)===String(d.tenantId)||text(r.name)===d.tenantName);
        if(match) return match;
      }
      // Final source: the authenticated Supabase client, still restricted to
      // the exact selected tenant. This keeps WhatsApp lookup tied to the
      // saved tenant account and does not use a manually entered number.
      const supabase=window.BiznexcoAuth?.supabase;
      if(supabase && d.tenantId){
        const {data,error}=await supabase.from('tenants').select('id,name,contact_number').eq('id',d.tenantId).maybeSingle();
        if(!error && data) return data;
      }
    }catch(e){console.warn('Unable to load tenant WhatsApp number:',e);}
    return null;
  }
  function normalizeWhatsAppNumber(value){
    let n=String(value||'').replace(/\D/g,'');
    if(n.length===10) n='91'+n;
    else if(n.length===11 && n.startsWith('0')) n='91'+n.slice(1);
    return n;
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
  async function sendLedgerWhatsApp(){
    const d=getLedgerData();
    if(!d.rows.length&&!d.summary.length){alert('Please load the Tenant Ledger first.');return;}
    const tenant=await getSelectedTenantRecord();
    const rawNumber=tenant?.contact_number || tenant?.contactNumber || tenant?.whatsapp_number || tenant?.whatsappNumber || tenant?.phone || tenant?.mobile || '';
    const number=normalizeWhatsAppNumber(rawNumber);
    if(!number){
      alert('No WhatsApp number is saved for '+(d.tenantName||'this tenant')+'. Please save the tenant WhatsApp number in the Tenant account first.');
      return;
    }
    window.open('https://wa.me/'+number+'?text='+encodeURIComponent(buildWhatsAppText()),'_blank');
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
