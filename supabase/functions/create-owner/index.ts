import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});}

Deno.serve(async (req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST') return json({error:'Method not allowed'},405);
  try{
    const authHeader=req.headers.get('Authorization')||'';
    const callerClient=createClient(SUPABASE_URL,ANON_KEY,{global:{headers:{Authorization:authHeader}}});
    const {data:userResp,error:userErr}=await callerClient.auth.getUser();
    if(userErr||!userResp?.user) return json({error:'Invalid session'},401);
    const adminClient=createClient(SUPABASE_URL,SERVICE_ROLE_KEY);
    const {data:caller}=await adminClient.from('profiles').select('role').eq('id',userResp.user.id).single();
    if(caller?.role!=='super_admin') return json({error:'Only Super Admin can create Owner accounts.'},403);

    const body=await req.json();
    const fullName=String(body.fullName||'').trim();
    const email=String(body.email||'').trim().toLowerCase();
    const password=String(body.password||'');
    if(!fullName||!email||!password||password.length<6) return json({error:'Full name, valid email, and a password of at least 6 characters are required.'},400);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({error:'Please enter a valid email address.'},400);

    const {data:existing}=await adminClient.from('profiles').select('id').eq('email',email).maybeSingle();
    if(existing) return json({error:'An account with this email already exists.'},409);

    const {data:newUser,error:createErr}=await adminClient.auth.admin.createUser({
      email,password,email_confirm:true,user_metadata:{full_name:fullName}
    });
    if(createErr) return json({error:createErr.message},400);

    const {error:updateErr}=await adminClient.from('profiles').update({
      role:'owner',full_name:fullName,email
    }).eq('id',newUser.user.id);
    if(updateErr){
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      return json({error:updateErr.message},500);
    }
    return json({success:true,owner:{id:newUser.user.id,full_name:fullName,email,role:'owner'}});
  }catch(e){return json({error:e instanceof Error?e.message:'Unexpected error'},500);}
});
