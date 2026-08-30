(function(){
  'use strict';

  let busy = false;

  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function isSuperAdmin(){
    try{
      const p = await window.BiznexcoAuth?.fetchOwnProfile?.();
      return p?.role === 'super_admin';
    }catch(_){ return false; }
  }

  async function callAdmin(body){
    const client = window.BiznexcoAuth?.supabase;
    if(!client) throw new Error('Secure administration service is not ready.');
    const {data,error} = await client.functions.invoke('super-admin-manage',{body});
    if(error) throw new Error(error.message || 'Super Admin operation failed.');
    if(data?.error) throw new Error(data.error);
    return data;
  }

  function currentType(){
    const b = document.querySelector('#nav button.active');
    const p = b?.dataset?.page || '';
    if(p === 'admin_owners') return 'owners';
    if(p === 'admin_tenants') return 'tenants';
    if(p === 'admin_payments') return 'payments';
    return '';
  }

  function addActionButton(cell, className, text, id, handler){
    if(!cell || cell.querySelector('.'+className)) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className === 'saDeleteBtn' ? 'danger saDeleteBtn' : 'secondary saEditBtn';
    b.textContent = text;
    b.dataset.id = String(id || '');
    b.style.marginLeft = '6px';
    b.addEventListener('click', handler);
    cell.appendChild(b);
  }

  async function editOwner(r){
    const name = prompt('Owner name:', r.full_name || '');
    if(name === null) return;
    const email = prompt('Owner email:', r.email || '');
    if(email === null) return;
    await callAdmin({action:'update_owner',id:r.id,full_name:name.trim(),email:email.trim()});
    alert('Owner updated successfully.');
    await refreshPage();
  }

  async function editTenant(r){
    const name = prompt('Tenant name:', r.name || '');
    if(name === null) return;
    const unit = prompt('Unit / Shop:', r.unit_label || '');
    if(unit === null) return;
    const rent = prompt('Monthly rent:', r.monthly_rent ?? 0);
    if(rent === null) return;
    const start = prompt('Rent start date (YYYY-MM-DD):', r.rent_start_date || '');
    if(start === null) return;
    const phone = prompt('Contact number:', r.contact_number || '');
    if(phone === null) return;
    const active = confirm('Keep this tenant Active? Click Cancel for Inactive.');
    await callAdmin({
      action:'update_tenant', id:r.id, name:name.trim(), unit_label:unit.trim(),
      monthly_rent:Number(rent || 0), rent_start_date:start,
      contact_number:phone.trim(), is_active:active
    });
    alert('Tenant updated successfully.');
    await refreshPage();
  }

  async function editPayment(r){
    const date = prompt('Payment date (YYYY-MM-DD):', r.date || '');
    if(date === null) return;
    const amount = prompt('Amount:', r.amount ?? 0);
    if(amount === null) return;
    const bank = prompt('Bank:', r.bank || '');
    if(bank === null) return;
    const ref = prompt('Reference:', r.ref || '');
    if(ref === null) return;
    const status = prompt('Status:', r.status || 'Recorded');
    if(status === null) return;
    const note = prompt('Note:', r.note || '');
    if(note === null) return;
    await callAdmin({action:'update_payment',id:r.id,date,amount:Number(amount || 0),bank,ref,status,note});
    alert('Payment updated successfully.');
    await refreshPage();
  }

  async function deleteRecord(type,r){
    const label = type === 'owners' ? (r.full_name || r.email) : type === 'tenants' ? r.name : `Payment ${r.amount}`;
    const warning = type === 'owners'
      ? "This will permanently remove the Owner and the Owner's related tenants, properties, units and payments."
      : type === 'tenants'
      ? "This will permanently remove the Tenant and the Tenant's payment records."
      : 'This will permanently remove the payment record.';
    if(!confirm(`Delete ${label}?\n\n${warning}\n\nThis cannot be undone.`)) return;
    await callAdmin({action:type === 'owners' ? 'delete_owner' : type === 'tenants' ? 'delete_tenant' : 'delete_payment', id:r.id});
    alert('Record deleted successfully.');
    await refreshPage();
  }

  async function refreshPage(){
    const b = document.querySelector('#nav button.active');
    if(b) await b.click();
  }

  async function enhance(){
    if(busy) return;
    const type = currentType();
    if(!type) return;
    if(!(await isSuperAdmin())) return;

    const main = document.getElementById('main');
    if(!main) return;
    busy = true;
    try{
      const out = await callAdmin({action:'list',type});
      const rows = out?.data || [];
      const tableRows = Array.from(main.querySelectorAll('table tbody tr'));

      tableRows.forEach((tr,index)=>{
        const r = rows[index];
        if(!r) return;
        const cells = tr.querySelectorAll('td');
        if(!cells.length) return;
        const actionCell = cells[cells.length - 1];
        if(type === 'payments' && !actionCell.querySelector('button')) actionCell.innerHTML = '';
        const handlerEdit = async()=>{try{await (type==='owners'?editOwner(r):type==='tenants'?editTenant(r):editPayment(r));}catch(e){alert(e.message || 'Unable to update record.');}};
        const handlerDelete = async()=>{try{await deleteRecord(type,r);}catch(e){alert(e.message || 'Unable to delete record.');}};
        addActionButton(actionCell,'saEditBtn','Edit',r.id,handlerEdit);
        addActionButton(actionCell,'saDeleteBtn','Delete',r.id,handlerDelete);
      });
    }catch(e){
      console.debug('Super Admin record controls:',e);
    }finally{
      busy = false;
    }
  }

  function bind(){
    const nav = document.getElementById('nav');
    if(!nav || nav.dataset.saControlsBound === '1') return;
    nav.dataset.saControlsBound = '1';
    nav.addEventListener('click',()=>setTimeout(enhance,150));
    setTimeout(enhance,500);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded',bind,{once:true});
  }else bind();

  window.addEventListener('biznexco-auth-ready',()=>setTimeout(bind,200));
})();
