(function(){
  'use strict';
  let busy = false;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  async function isSuperAdmin(){
    try{const p=await window.BiznexcoAuth?.fetchOwnProfile?.();return p?.role==='super_admin';}catch(_){return false;}
  }
  async function callAdmin(body){
    const client=window.BiznexcoAuth?.supabase;
    if(!client)throw new Error('Secure administration service is not ready.');
    const {data,error}=await client.functions.invoke('super-admin-manage',{body});
    if(error)throw new Error(error.message||'Super Admin operation failed.');
    if(data?.error)throw new Error(data.error); return data;
  }
  function currentType(){
    const b=document.querySelector('#nav button.active'),p=b?.dataset?.page||'';
    if(p==='admin_owners')return'owners'; if(p==='admin_tenants')return'tenants'; if(p==='admin_payments')return'payments'; return'';
  }
  function ensurePaymentActionsColumn(){
    const table=document.querySelector('#main table'); if(!table)return;
    const head=table.querySelector('thead tr'); if(head&&!head.querySelector('.saActionsHead')){const th=document.createElement('th');th.className='saActionsHead';th.textContent='Actions';head.appendChild(th);}
    table.querySelectorAll('tbody tr').forEach(tr=>{if(tr.children.length===6){const td=document.createElement('td');td.className='saActionsCell';tr.appendChild(td);}});
  }
  function actionButton(cell,cls,text,handler){
    if(!cell||cell.querySelector('.'+cls))return;
    const b=document.createElement('button');b.type='button';b.className=cls==='saDeleteBtn'?'danger saDeleteBtn':'secondary saEditBtn';b.textContent=text;b.style.marginLeft='6px';b.onclick=handler;cell.appendChild(b);
  }
  function cellText(tr,index){return String(tr?.children?.[index]?.textContent||'').trim();}
  function norm(v){return String(v??'').trim().toLowerCase().replace(/\s+/g,' ');}
  function findTenantRecord(tr,rows){
    const name=norm(cellText(tr,0));
    const username=norm(cellText(tr,1));
    const owner=norm(cellText(tr,2));
    const unit=norm(cellText(tr,3));
    const exact=rows.find(r=>
      norm(r?.name)===name &&
      norm(r?.username)===username &&
      norm(r?.unit_label)===unit &&
      (owner==='—' || owner==='-' || owner==='' || norm(r?.owner_name)===owner || norm(r?.owner_email)===owner)
    );
    if(exact)return exact;
    return rows.find(r=>norm(r?.name)===name && norm(r?.username)===username && norm(r?.unit_label)===unit) ||
           rows.find(r=>norm(r?.name)===name && norm(r?.username)===username) ||
           rows.find(r=>norm(r?.name)===name && norm(r?.unit_label)===unit);
  }
  function findOwnerRecord(tr,rows){
    const name=norm(cellText(tr,0)),email=norm(cellText(tr,1));
    return rows.find(r=>norm(r?.full_name)===name && norm(r?.email)===email) ||
           rows.find(r=>norm(r?.email)===email) ||
           rows.find(r=>norm(r?.full_name)===name);
  }
  function findPaymentRecord(tr,rows){
    const date=norm(cellText(tr,0)),tenant=norm(cellText(tr,1)),owner=norm(cellText(tr,2)),amount=norm(cellText(tr,3)),bank=norm(cellText(tr,4)),ref=norm(cellText(tr,5));
    return rows.find(r=>
      norm(r?.date)===date && norm(r?.tenant_name)===tenant &&
      norm(r?.amount)===amount && norm(r?.bank)===bank && norm(r?.ref||'')===ref
    ) || rows.find(r=>norm(r?.date)===date && norm(r?.tenant_name)===tenant && norm(r?.amount)===amount && norm(r?.bank)===bank);
  }
  async function editOwner(r){
    const name=prompt('Owner name:',r.full_name||'');if(name===null)return;const email=prompt('Owner email:',r.email||'');if(email===null)return;
    await callAdmin({action:'update_owner',id:r.id,full_name:name.trim(),email:email.trim()});alert('Owner updated successfully.');await refreshPage();
  }
  async function editTenant(r){
    const name=prompt('Tenant name:',r.name||'');if(name===null)return;const unit=prompt('Unit / Shop:',r.unit_label||'');if(unit===null)return;const rent=prompt('Monthly rent:',r.monthly_rent??0);if(rent===null)return;const start=prompt('Rent start date (YYYY-MM-DD):',r.rent_start_date||'');if(start===null)return;const phone=prompt('Contact number:',r.contact_number||'');if(phone===null)return;const active=confirm('Keep this tenant Active? Click Cancel for Inactive.');
    await callAdmin({action:'update_tenant',id:r.id,name:name.trim(),unit_label:unit.trim(),monthly_rent:Number(rent||0),rent_start_date:start,contact_number:phone.trim(),is_active:active});alert('Tenant updated successfully.');await refreshPage();
  }
  async function editPayment(r){
    const date=prompt('Payment date (YYYY-MM-DD):',r.date||'');if(date===null)return;const amount=prompt('Amount:',r.amount??0);if(amount===null)return;const bank=prompt('Bank:',r.bank||'');if(bank===null)return;const ref=prompt('Reference:',r.ref||'');if(ref===null)return;const status=prompt('Status:',r.status||'Recorded');if(status===null)return;const note=prompt('Note:',r.note||'');if(note===null)return;
    await callAdmin({action:'update_payment',id:r.id,date,amount:Number(amount||0),bank,ref,status,note});alert('Payment updated successfully.');await refreshPage();
  }
  async function deleteRecord(type,r){
    const label=type==='owners'?(r.full_name||r.email):type==='tenants'?r.name:`Payment ${r.amount}`;
    const warning=type==='owners'?"This permanently removes the Owner and related tenants, properties, units and payments.":type==='tenants'?"This permanently removes the Tenant and related payment records.":'This permanently removes the payment record.';
    if(!confirm(`Delete ${label}?\n\n${warning}\n\nThis cannot be undone.`))return;
    await callAdmin({action:type==='owners'?'delete_owner':type==='tenants'?'delete_tenant':'delete_payment',id:r.id});alert('Record deleted successfully.');await refreshPage();
  }
  async function refreshPage(){const b=document.querySelector('#nav button.active');if(b)await b.click();}
  async function enhance(){
    if(busy)return;const type=currentType();if(!type||!(await isSuperAdmin()))return;const main=document.getElementById('main');if(!main)return;busy=true;
    try{
      if(type==='payments')ensurePaymentActionsColumn();
      const out=await callAdmin({action:'list',type}),rows=out?.data||[],trs=Array.from(main.querySelectorAll('table tbody tr'));
      trs.forEach((tr,index)=>{
        let r=type==='owners'?findOwnerRecord(tr,rows):type==='tenants'?findTenantRecord(tr,rows):findPaymentRecord(tr,rows);
        if(!r){r=rows[index];}
        if(!r||tr.querySelector('.muted'))return;
        let cells=tr.querySelectorAll('td');if(!cells.length)return;
        let actionCell=cells[cells.length-1];
        actionButton(actionCell,'saEditBtn','Edit',async()=>{try{if(type==='owners')await editOwner(r);else if(type==='tenants')await editTenant(r);else await editPayment(r);}catch(e){alert(e.message||'Unable to update record.');}});
        actionButton(actionCell,'saDeleteBtn','Delete',async()=>{try{await deleteRecord(type,r);}catch(e){alert(e.message||'Unable to delete record.');}});
      });
    }catch(e){console.debug('Super Admin record controls:',e);}finally{busy=false;}
  }
  function bind(){
    const nav=document.getElementById('nav');if(!nav||nav.dataset.saControlsBound==='1')return;nav.dataset.saControlsBound='1';
    nav.addEventListener('click',()=>setTimeout(enhance,200));setTimeout(enhance,700);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
  window.addEventListener('biznexco-auth-ready',()=>setTimeout(bind,250));
})();
