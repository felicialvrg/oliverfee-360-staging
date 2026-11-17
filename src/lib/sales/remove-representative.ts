import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {actor,command,SalesError} from './server';
import {uuid} from './validation';

export async function removeRepresentative(rawId:unknown) {
 await actor(true);
 const id=uuid(rawId),client=await createClient();
 const {data:rep,error}=await client.from('sales_representatives').select('user_id,email,status,commission_mode,commission_value').eq('user_id',id).single();
 if(error||!rep||rep.user_id!==id)throw new SalesError('Salesperson could not be verified. No removal was made.',404);
 // Reuse the existing audited Owner command. Preserve all financial settings/history.
 await command('rep-update',id,{status:'inactive',commission_mode:rep.commission_mode,commission_value:rep.commission_value});
 let cleanupPending=false;
 const {data:slots,error:slotError}=await client.from('sales_team_slots').select('slot').eq('rep_id',id);
 if(slotError)cleanupPending=true;
 else for(const slot of slots||[])try{await command('team-slot',null,{slot:slot.slot,rep_id:null});}catch{cleanupPending=true;}
 try{
  const {error:cancelError}=await createAdminClient().from('sales_outbox').update({status:'cancelled',encrypted_link:null,link_created_at:null,lease_until:null,last_error:'Salesperson removed by Owner.'}).eq('kind','representative-invite').eq('recipient',rep.email).in('status',['pending','failed','processing']);
  if(cancelError)cleanupPending=true;
 }catch{cleanupPending=true;}
 return {removed:true,cleanupPending,message:'Salesperson removed from active access. Sales and payment history is preserved.'+(cleanupPending?' Access is blocked, but team-position or queued-invitation cleanup needs administrator review.':' Team position cleared and queued invitations cancelled.')};
}
