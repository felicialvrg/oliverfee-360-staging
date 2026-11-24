"use server";
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';

// Resolve a username privately; never expose the associated email to the browser.
// Every attempt goes through Supabase password verification and its rate limits.
export async function signInWithIdentity(identity:unknown,password:unknown){
 const rejected={error:'Email, username or password was not accepted.'};
 if(typeof identity!=='string'||typeof password!=='string'||identity.length>254||!password||password.length>128)return rejected;
 try{
  const value=identity.trim().toLowerCase();let email=value;
  if(!value.includes('@')){
   if(!/^[a-z0-9_-]{2,32}$/.test(value))return rejected;
   const {data,error}=await createAdminClient().from('sales_representatives').select('email').ilike('rep_code',value.replaceAll('_','\\_')).maybeSingle();
   if(error)return rejected;
   email=data?.email||'unknown-username@invalid.invalid';
  }
  const {error}=await (await createClient()).auth.signInWithPassword({email,password});
  return error?rejected:{error:null};
 }catch{return rejected;}
}
