import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {SalesError} from './server';

export function personalUsername(value:unknown){
 if(typeof value!=='string')throw new SalesError('Choose a username.');
 const name=value.trim().toLowerCase();
 if(!/^[a-z][a-z0-9_-]{2,31}$/.test(name)||name.startsWith('temp-'))throw new SalesError('Use 3–32 characters: start with a letter, then use letters, numbers, hyphens or underscores.');
 return name;
}

// The invitation proves email ownership. Only that invited, unlinked salesperson
// can complete setup; suspended, removed, carrier and admin accounts cannot activate.
export async function completeSalesSetup(raw:Record<string,unknown>){
 const username=personalUsername(raw.username),password=raw.password;
 if(typeof password!=='string'||password.length<10||password.length>128)throw new SalesError('Use a password between 10 and 128 characters.');
 const client=await createClient(),service=createAdminClient();
 const {data:{user},error}=await client.auth.getUser();
 if(error||!user?.email_confirmed_at||user.is_anonymous)throw new SalesError('Open your private invitation link first.',401);
 const [{data:rep,error:repError},{data:profile,error:profileError}]=await Promise.all([
  service.from('sales_representatives').select('user_id,email,rep_code,status').eq('user_id',user.id).single(),
  service.from('profiles').select('id,role,carrier_id').eq('id',user.id).single()
 ]);
 if(repError||profileError||!rep||rep.email.toLowerCase()!==user.email?.toLowerCase()||profile?.role!=='carrier'||profile.carrier_id||!['invited','active'].includes(rep.status))throw new SalesError('This account cannot complete salesperson setup. Contact the owner.',403);
 // Escape SQL LIKE wildcards: underscores are literal username characters.
 const {data:matches,error:lookupError}=await service.from('sales_representatives').select('user_id').ilike('rep_code',username.replaceAll('_','\\_'));
 if(lookupError)throw new SalesError('Username availability could not be checked. Try again.',503);
 if(matches?.some(p=>p.user_id!==user.id))throw new SalesError('That username is taken. Choose another.',409);
 const {error:passwordError}=await client.auth.updateUser({password});
 if(passwordError)throw new SalesError('Your password could not be saved. Request a new setup link if needed.',400);
 // Compare status and code so a concurrent owner suspension/removal wins.
 const {data:saved,error:saveError}=await service.from('sales_representatives').update({rep_code:username,status:'active',updated_at:new Date().toISOString()}).eq('user_id',user.id).eq('status',rep.status).eq('rep_code',rep.rep_code).select('user_id').maybeSingle();
 if(saveError||!saved)throw new SalesError('Your password was saved, but username setup could not finish. Retry or contact the owner.',409);
 return {destination:'/sales'};
}
