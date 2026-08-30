import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const URL=Deno.env.get('SUPABASE_URL')!, SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, ANON=Deno.env.get('SUPABASE_ANON_KEY')!;
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const auth=req.headers.get('Authorization')||'';
  const caller=createClient(URL,ANON,{global:{headers:{Authorization:auth}}});
  const {data:u,error:ue}=await caller.auth.getUser();
  if(ue||!u?.user)return json({error:'Invalid session'},401);
  const admin=createClient(URL,SERVICE);
  const {data:p}=await admin.from('profiles').select('role').eq('id',u.user.id).single();
  if(p?.role!=='super_admin')return json({error:'Only Super Admin can manage tenants.'},403);
  const body=await req.json(), id=String(body.tenantId||''), action=String(body.action||'');
  if(!id)return json({error:'Tenant id is required'},400);
  const {data:t}=await admin.from('tenants').select('id,profile_id,is_active').eq('id',id).single();
  if(!t)return json({error:'Tenant not found'},404);
  if(action==='reset_password'){
    if(!t.profile_id)return json({error:'Tenant has no linked login account'},400);
    const pw=String(body.newPassword||''); if(pw.length<6)return json({error:'New password must contain at least 6 characters.'},400);
    const {error}=await admin.auth.admin.updateUserById(t.profile_id,{password:pw});
    if(error)return json({error:error.message},400); return json({success:true});
  }
  if(action==='deactivate'||action==='reactivate'){
    const active=action==='reactivate';
    const {error}=await admin.from('tenants').update({is_active:active}).eq('id',id);
    if(error)return json({error:error.message},500);
    if(t.profile_id){
      const {error:ae}=await admin.auth.admin.updateUserById(t.profile_id,{ban_duration:active?'none':'876000h'});
      if(ae)return json({error:ae.message},400);
    }
    return json({success:true,active});
  }
  return json({error:'Unsupported action'},400);
 }catch(e){return json({error:e instanceof Error?e.message:'Unexpected error'},500);}
});
