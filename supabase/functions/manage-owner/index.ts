import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY=Deno.env.get('SUPABASE_ANON_KEY')!;
const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST') return json({error:'Method not allowed'},405);
  try{
    const authHeader=req.headers.get('Authorization')||'';
    const callerClient=createClient(SUPABASE_URL,ANON_KEY,{global:{headers:{Authorization:authHeader}}});
    const {data:userResp,error:userErr}=await callerClient.auth.getUser();
    if(userErr||!userResp?.user) return json({error:'Invalid session'},401);
    const adminClient=createClient(SUPABASE_URL,SERVICE_ROLE_KEY);
    const {data:caller}=await adminClient.from('profiles').select('role').eq('id',userResp.user.id).single();
    if(caller?.role!=='super_admin') return json({error:'Only Super Admin can manage Owner accounts.'},403);

    const body=await req.json();
    const ownerId=String(body.ownerId||'');
    const action=String(body.action||'');
    if(!ownerId) return json({error:'Owner id is required'},400);
    const {data:owner}=await adminClient.from('profiles').select('id,role').eq('id',ownerId).single();
    if(!owner||owner.role!=='owner') return json({error:'Owner account not found'},404);

    if(action==='reset_password'){
      const password=String(body.newPassword||'');
      if(password.length<6) return json({error:'New password must contain at least 6 characters.'},400);
      const {error}=await adminClient.auth.admin.updateUserById(ownerId,{password});
      if(error)return json({error:error.message},400);
      return json({success:true,passwordChanged:true});
    }
    if(action==='deactivate'){
      const {error}=await adminClient.auth.admin.updateUserById(ownerId,{ban_duration:'876000h'});
      if(error)return json({error:error.message},400);
      return json({success:true,deactivated:true});
    }
    if(action==='activate'){
      const {error}=await adminClient.auth.admin.updateUserById(ownerId,{ban_duration:'none'});
      if(error)return json({error:error.message},400);
      return json({success:true,activated:true});
    }
    return json({error:'Unsupported action'},400);
  }catch(e){return json({error:e instanceof Error?e.message:'Unexpected error'},500);}
});
