// Tenant Ledger and Report actions: additive only.
// Uses the selected tenant's saved tenants.contact_number automatically.
(function () {
  'use strict';
  function esc(value){return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');}
  function text(value){return String(value==null?'':value).replace(/\s+/g,' ').trim();}
  // jsPDF's built-in Helvetica font does not contain the Indian Rupee glyph.
  // Render currency as INR in PDFs so amounts never appear as a broken glyph.
  function pdfText(value){return String(value==null?'':value).replace(/₹/g,'INR ');}

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

  function loadJsPdf(){
    if(window.jspdf?.jsPDF)return Promise.resolve(window.jspdf.jsPDF);
    if(window.__biznexcoJsPdfPromise)return window.__biznexcoJsPdfPromise;
    window.__biznexcoJsPdfPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload=()=>window.jspdf?.jsPDF?resolve(window.jspdf.jsPDF):reject(new Error('PDF library did not load.'));
      s.onerror=()=>reject(new Error('Unable to load the PDF library.'));
      document.head.appendChild(s);
    });
    return window.__biznexcoJsPdfPromise;
  }

  function safeFileName(value){
    return String(value||'tenant-report').replace(/[^a-z0-9_-]+/gi,'_').replace(/^_+|_+$/g,'').slice(0,70)||'tenant-report';
  }

  function addWrapped(doc,value,x,y,width,lineHeight){
    const lines=doc.splitTextToSize(String(value||''),width);
    doc.text(lines,x,y);
    return y+(lines.length*lineHeight);
  }

  function drawLedgerPdf(jsPDF,data){
    const doc=new jsPDF({unit:'pt',format:'a4'});
    const margin=36,pageW=doc.internal.pageSize.getWidth(),pageH=doc.internal.pageSize.getHeight(),contentW=pageW-(margin*2);
    let y=42;
    doc.setFont('helvetica','bold');doc.setFontSize(16);doc.text('BIZNEXCO Rent Management — Tenant Ledger',margin,y);y+=20;
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(80,90,105);
    doc.text('Tenant: '+data.tenantName+(data.asOf?'   |   As of: '+data.asOf:''),margin,y);y+=18;
    doc.setTextColor(15,23,42);
    if(data.summary.length){
      const cardW=(contentW-18)/4;
      data.summary.slice(0,4).forEach((s,i)=>{
        const x=margin+i*(cardW+6);
        doc.setDrawColor(220,226,235);doc.roundedRect(x,y,cardW,42,6,6,'S');
        doc.setFontSize(7);doc.setTextColor(100,110,125);doc.text(pdfText(s.label||''),x+7,y+13);
        doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(15,23,42);doc.text(pdfText(s.value||''),x+7,y+29,{maxWidth:cardW-14});
        doc.setFont('helvetica','normal');
      });
      y+=54;
    }
    const widths=[55,contentW-55-65-65-80,65,65,80];
    const headers=['Date','Particulars','Rent Due','Payment','Running Balance'];
    function header(){
      let x=margin;doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setFillColor(248,250,252);doc.setDrawColor(225,230,238);doc.rect(margin,y,contentW,20,'FD');
      headers.forEach((h,i)=>{doc.text(h,x+5,y+13);x+=widths[i];});y+=20;doc.setFont('helvetica','normal');
    }
    header();
    data.rows.forEach(row=>{
      const cells=[row[0]||'',row[1]||'',row[2]||'',row[3]||'',row[4]||''];
      const split=cells.map((v,i)=>doc.splitTextToSize(pdfText(v),widths[i]-10));
      const lines=Math.max.apply(null,split.map(a=>a.length));
      const rowH=Math.max(18,lines*9+7);
      if(y+rowH>pageH-margin){doc.addPage();y=42;header();}
      let x=margin;doc.setFontSize(7.5);doc.setDrawColor(232,235,240);
      split.forEach((arr,i)=>{doc.text(arr,x+5,y+12);x+=widths[i];});
      doc.line(margin,y+rowH,margin+contentW,y+rowH);y+=rowH;
    });
    return doc;
  }

  function drawReportPdf(jsPDF,data){
    const doc=new jsPDF({unit:'pt',format:'a4',orientation:'landscape'});
    const margin=28,pageW=doc.internal.pageSize.getWidth(),pageH=doc.internal.pageSize.getHeight(),contentW=pageW-(margin*2);
    let y=34;
    doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text('BIZNEXCO Rent Management — Rent Report',margin,y);y+=18;
    doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(80,90,105);doc.text('Tenant: '+data.tenantName+(data.asOf?'   |   As of: '+data.asOf:''),margin,y);y+=14;doc.setTextColor(15,23,42);
    if(data.summary.length){doc.setFontSize(8);doc.text(pdfText(data.summary.join('     ')),margin,y);y+=14;}
    const headers=['Tenant','Unit','Start','Monthly Rent','Accrued','Paid','Pending','Advance','Status'];
    const widths=[contentW*.18,contentW*.07,contentW*.10,contentW*.12,contentW*.10,contentW*.10,contentW*.10,contentW*.10,contentW*.13];
    function header(){
      let x=margin;doc.setFont('helvetica','bold');doc.setFontSize(7);doc.setFillColor(248,250,252);doc.setDrawColor(225,230,238);doc.rect(margin,y,contentW,19,'FD');
      headers.forEach((h,i)=>{doc.text(h,x+4,y+12);x+=widths[i];});y+=19;doc.setFont('helvetica','normal');
    }
    header();
    data.rows.forEach(row=>{
      const split=headers.map((_,i)=>doc.splitTextToSize(pdfText(row[i]||''),widths[i]-8));
      const lines=Math.max.apply(null,split.map(a=>a.length));
      const rowH=Math.max(17,lines*8+7);
      if(y+rowH>pageH-margin){doc.addPage();y=34;header();}
      let x=margin;doc.setFontSize(6.8);doc.setDrawColor(232,235,240);
      split.forEach((arr,i)=>{doc.text(arr,x+4,y+11);x+=widths[i];});
      doc.line(margin,y+rowH,margin+contentW,y+rowH);y+=rowH;
    });
    return doc;
  }

  async function createLedgerPdfBlob(){
    const data=getLedgerData();
    const jsPDF=await loadJsPdf();
    const doc=drawLedgerPdf(jsPDF,data);
    return {blob:doc.output('blob'),filename:'Tenant_Ledger_'+safeFileName(data.tenantName)+'.pdf',data};
  }

  async function createReportPdfBlob(){
    const data=getReportData();
    const jsPDF=await loadJsPdf();
    const doc=drawReportPdf(jsPDF,data);
    return {blob:doc.output('blob'),filename:'Rent_Report_'+safeFileName(data.tenantName)+'.pdf',data};
  }

  async function sharePdfWithWhatsApp(pdfInfo,number,message){
    const file=new File([pdfInfo.blob],pdfInfo.filename,{type:'application/pdf'});
    const shareData={files:[file],text:message,title:pdfInfo.filename};
    if(navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))){
      try{await navigator.share(shareData);return true;}catch(e){if(e?.name==='AbortError')return true;console.warn('Share cancelled/failed:',e);}
    }
    const a=document.createElement('a');a.href=URL.createObjectURL(pdfInfo.blob);a.download=pdfInfo.filename;document.body.appendChild(a);a.click();a.remove();
    window.open('https://wa.me/'+number+'?text='+encodeURIComponent(message),'_blank');
    alert('The PDF has been saved. WhatsApp is open for this tenant. Attach the saved PDF in the WhatsApp chat.');
    return false;
  }

  async function sendLedgerWhatsApp(){
    const d=getLedgerData();
    if(!d.rows.length&&!d.summary.length){alert('Please load the Tenant Ledger first.');return;}
    const tenant=await getTenantBySelectedControl('lTenant');
    const number=tenantNumber(tenant);
    if(!number){alert('No WhatsApp number is saved for '+(d.tenantName||'this tenant')+'. Please save the tenant WhatsApp number in the Tenant account first.');return;}
    try{
      const pdf=await createLedgerPdfBlob();
      await sharePdfWithWhatsApp(pdf,number,'BIZNEXCO Tenant Ledger — '+d.tenantName+(d.asOf?' — As of '+d.asOf:''));
    }catch(e){console.error(e);alert('Unable to create the Tenant Ledger PDF. Please try again.');}
  }

  async function sendReportWhatsApp(){
    const d=getReportData();
    if(!d.rows.length&&!d.summary.length){alert('Please generate the Rent Report first.');return;}
    if(!d.tenantId){alert('Please select a specific tenant in the Rent Report before sending it by WhatsApp.');return;}
    const tenant=await getTenantBySelectedControl('rTenant');
    const number=tenantNumber(tenant);
    if(!number){alert('No WhatsApp number is saved for '+(d.tenantName||'this tenant')+'. Please save the tenant WhatsApp number in the Tenant account first.');return;}
    try{
      const pdf=await createReportPdfBlob();
      await sharePdfWithWhatsApp(pdf,number,'BIZNEXCO Rent Report — '+d.tenantName+(d.asOf?' — As of '+d.asOf:''));
    }catch(e){console.error(e);alert('Unable to create the Rent Report PDF. Please try again.');}
  }

  async function saveLedgerPdf(){
    const data=getLedgerData();
    if(!data.rows.length&&!data.summary.length){alert('Please load the Tenant Ledger first.');return;}
    try{
      const pdf=await createLedgerPdfBlob();
      const url=URL.createObjectURL(pdf.blob);
      const a=document.createElement('a');a.href=url;a.download=pdf.filename;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1500);
    }catch(e){console.error(e);alert('Unable to create the Tenant Ledger PDF. Please try again.');}
  }

  function bindButton(id,handler){
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
      const wrap=document.createElement('div');wrap.className='report-actions no-print';wrap.id='ledgerExportActions';wrap.style.marginTop='8px';
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
      wrap=document.createElement('div');wrap.className='report-actions no-print';wrap.id='reportWhatsAppActions';wrap.style.marginTop='8px';
      wrap.innerHTML='<button type="button" class="secondary" id="rWhatsApp">💬 Send WhatsApp</button>';controls.appendChild(wrap);
    }
    bindButton('rWhatsApp',sendReportWhatsApp);
  }

  function addButtons(){addLedgerButtons();addReportButtons();}
  const observer=new MutationObserver(addButtons);
  function start(){
    const main=document.getElementById('main');
    if(!main)return;
    observer.observe(main,{childList:true,subtree:true});addButtons();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
