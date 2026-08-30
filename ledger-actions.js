// Tenant Ledger and Report actions: additive only.
// Uses the selected tenant's saved tenants.contact_number automatically.
(function () {
  'use strict';
  function esc(value){return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function text(value){return String(value==null?'':value).replace(/\s+/g,' ').trim();}

  function normalizeWhatsAppNumber(value){
    let n=String(value||'').replace(/\D/g,'');
    if(n.length===10) n='91'+n;
    else if(n.length===11 && n.startsWith('0')) n='91'+n.slice(1);
    return n;
  }

  async function getTenantBySelectedControl(selectId){
    const select=document.getElementById(selectId);
    if(!select || !select.value) return null;
    const tenantId=select.value;
    try{
      if(window.BiznexcoData?.getTenantById){
        const row=await window.BiznexcoData.getTenantById(tenantId);
        if(row) return row;
      }
    }catch(e){console.warn('Unable to load selected tenant:',e);}
    return null;
  }

  function tenantNumber(row){
    return normalizeWhatsAppNumber(row?.contact_number || row?.contactNumber || row?.whatsapp_number || row?.whatsappNumber || row?.phone || row?.mobile || '');
  }

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

  function buildLedgerText(){
    const d=getLedgerData();
    let m='BIZNEXCO RENT MANAGEMENT\nTENANT LEDGER\n';
    if(d.tenantName)m+='Tenant: '+d.tenantName+'\n';
    if(d.asOf)m+='As of: '+d.asOf+'\n';
    if(d.summary.length){m+='\nSUMMARY\n';d.summary.forEach(x=>{m+=(x.label?x.label+': ':'')+x.value+'\n';});}
    m+='\nLEDGER\nDate | Particulars | Rent Due | Payment | Running Balance\n';
    d.rows.forEach(r=>{m+=r.join(' | ')+'\n';});
    if(!d.rows.length)m+='No ledger entries found.\n';
    return m;
  }

  async function sendLedgerWhatsApp(){
    const d=getLedgerData();
    if(!d.rows.length&&!d.summary.length){alert('Please load the Tenant Ledger first.');return;}
    const tenant=await getTenantBySelectedControl('lTenant');
    const number=tenantNumber(tenant);
    if(!number){
      alert('No WhatsApp number is saved for '+(d.tenantName||'this tenant')+'. Please save the tenant WhatsApp number in the Tenant account first.');
      return;
    }
    window.open('https://wa.me/'+number+'?text='+encodeURIComponent(buildLedgerText()),'_blank');
  }

  function getReportData(){
    const select=document.getElementById('rTenant');
    const date=document.getElementById('rDate');
    const tenantName=select&&select.options[select.selectedIndex]?text(select.options[select.selectedIndex].textContent):'All Tenants';
    const tenantId=select?.value||'';
    const asOf=date?.value||'';
    const summary=[];
    ['rA','rP','rB','rV'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) summary.push(text(el.parentElement?.querySelector('.label')?.textContent||id)+': '+text(el.textContent));
    });
    const rows=[];
    document.querySelector('#rRows')?.closest('table')?.querySelectorAll('tbody tr').forEach(tr=>{
      const cells=Array.from(tr.cells).map(td=>text(td.textContent));
      if(cells.length) rows.push(cells);
    });
    return {tenantId,tenantName,asOf,summary,rows};
  }

  function buildReportText(){
    const d=getReportData();
    let m='BIZNEXCO RENT MANAGEMENT\nRENT REPORT\n';
    m+='Tenant: '+d.tenantName+'\n';
    if(d.asOf)m+='As of: '+d.asOf+'\n';
    if(d.summary.length)m+='\nSUMMARY\n'+d.summary.join('\n')+'\n';
    m+='\nTENANT-WISE REPORT\nTenant | Unit | Start | Monthly Rent | Accrued | Paid | Pending | Advance | Status\n';
    d.rows.forEach(r=>{m+=r.join(' | ')+'\n';});
    if(!d.rows.length)m+='No report rows found. Generate the report first.\n';
    return m;
  }

  async function sendReportWhatsApp(){
    const d=getReportData();
    if(!d.rows.length&&!d.summary.length){alert('Please generate the Rent Report first.');return;}
    if(!d.tenantId){alert('Please select a specific tenant in the Rent Report before sending it by WhatsApp.');return;}
    const tenant=await getTenantBySelectedControl('rTenant');
    const number=tenantNumber(tenant);
    if(!number){
      alert('No WhatsApp number is saved for '+(d.tenantName||'this tenant')+'. Please save the tenant WhatsApp number in the Tenant account first.');
      return;
    }
    window.open('https://wa.me/'+number+'?text='+encodeURIComponent(buildReportText()),'_blank');
  }

  function saveLedgerPdf(){
    const data=getLedgerData();
    if(!data.rows.length&&!data.summary.length){alert('Please load the Tenant Ledger first.');return;}
    const popup=window.open('','_blank','width=1000,height=800');
    if(!popup){alert('Please allow pop-ups for this site to save the ledger as PDF.');return;}
    const summaryHtml=data.summary.length?'<div class="summary">'+data.summary.map(x=>'<div class="card"><div class="label">'+esc(x.label)+'</div><div class="value">'+esc(x.value)+'</div></div>').join('')+'</div>':'';
    const rows=data.rows.map(r=>'<tr>'+r.map(c=>'<td>'+esc(c)+'</td>').join('')+'</tr>').join('');
    popup.document.open();
    popup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Tenant Ledger - '+esc(data.tenantName)+'</title><style>*{box-sizing:border-box}body{margin:0;padding:28px;font-family:Arial,sans-serif;color:#0f172a;background:#fff}h1{font-size:24px;margin:0 0 6px}.meta{font-size:12px;color:#64748b;margin-bottom:18px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}.card{border:1px solid #e2e8f0;border-radius:10px;padding:12px}.label{font-size:11px;color:#64748b}.value{font-size:18px;font-weight:800;margin-top:5px}table{width:100%;border-collapse:collapse}th,td{padding:9px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:12px;vertical-align:top}th{background:#f8fafc;color:#475569}@media print{body{padding:12mm}.card{break-inside:avoid}tr{break-inside:avoid}.summary{grid-template-columns:repeat(4,1fr)}}</style></head><body><h1>BIZNEXCO Rent Management — Tenant Ledger</h1><div class="meta">Tenant: '+esc(data.tenantName)+(data.asOf?' &nbsp;|&nbsp; As of: '+esc(data.asOf): '')+'</div>'+summaryHtml+'<table><thead><tr><th>Date</th><th>Particulars</th><th>Rent Due</th><th>Payment</th><th>Running Balance</th></tr></thead><tbody>'+rows+'</tbody></table><script>window.onload=function(){setTimeout(function(){window.print()},250)};<\/script></body></html>');
    popup.document.close();
  }

  function bindButton(id, handler){
    const btn=document.getElementById(id);
    if(!btn)return false;
    if(btn.dataset.biznexcoBound==='1')return true;
    const replacement=btn.cloneNode(true);
    Array.from(replacement.attributes).forEach(a=>{if(/^on/i.test(a.name))replacement.removeAttribute(a.name);});
    replacement.dataset.biznexcoBound='1';
    btn.replaceWith(replacement);
    replacement.addEventListener('click',function(e){e.preventDefault();e.stopImmediatePropagation();handler();});
    return true;
  }

  function addLedgerButtons(){
    const refresh=document.getElementById('lRefresh');
    if(!refresh)return;
    if(!document.getElementById('ledgerExportActions')){
      const wrap=document.createElement('div');
      wrap.className='report-actions no-print';
      wrap.id='ledgerExportActions';
      wrap.style.marginTop='8px';
      wrap.innerHTML='<button type="button" class="secondary" id="lSavePdf">📄 Save PDF</button><button type="button" class="secondary" id="lWhatsApp">💬 Send WhatsApp</button>';
      refresh.parentElement?.appendChild(wrap);
      document.getElementById('lSavePdf')?.addEventListener('click',saveLedgerPdf);
    }
    bindButton('lWhatsApp',sendLedgerWhatsApp);
  }

  function addReportButtons(){
    const refresh=document.getElementById('rRefresh');
    const controls=document.getElementById('reportControls');
    if(!refresh||!controls)return;
    let wrap=document.getElementById('reportWhatsAppActions');
    if(!wrap){
      wrap=document.createElement('div');
      wrap.className='report-actions no-print';
      wrap.id='reportWhatsAppActions';
      wrap.style.marginTop='8px';
      wrap.innerHTML='<button type="button" class="secondary" id="rWhatsApp">💬 Send WhatsApp</button>';
      controls.appendChild(wrap);
    }
    bindButton('rWhatsApp',sendReportWhatsApp);
  }

  function addButtons(){addLedgerButtons();addReportButtons();}
  const observer=new MutationObserver(addButtons);
  function start(){
    const main=document.getElementById('main');
    if(!main)return;
    observer.observe(main,{childList:true,subtree:true});
    addButtons();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
