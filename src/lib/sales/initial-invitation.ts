import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {actor} from './server';
import {uuid} from './validation';
import {deliverSalesNotifications} from './notifications';

// Initial creation must never drain unrelated recipients or resend a used link.
// Read private queue columns server-side, not with authenticated browser grants.
export async function sendInitialInvitation(rawId:unknown){
 await actor(true);
 const pending={processed:0,sent:0,failed:0,pending:true};
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)return pending;
 const id=uuid(rawId),service=createAdminClient();
 const {data:rep,error:repError}=await service.from('sales_representatives').select('user_id,email,status').eq('user_id',id).single();
 if(repError||!rep||rep.status!=='invited')return pending;
 const {data:item,error}=await service.from('sales_outbox').select('*').eq('dedupe_key','rep-invite:'+id).eq('kind','representative-invite').eq('recipient',rep.email).single();
 if(error||!item)return pending;
 if(item.status==='sent')return {...pending,pending:false,alreadySent:true};
 if(item.status!=='pending'||item.attempts!==0||item.sent_at||item.lease_until&&Date.parse(item.lease_until)>Date.now())return pending;
 const {data:claimed,error:claimError}=await service.from('sales_outbox').update({status:'processing',attempts:1,lease_until:new Date(Date.now()+600000).toISOString(),last_error:null}).eq('id',item.id).eq('status','pending').eq('attempts',0).is('sent_at',null).select('*').single();
 if(claimError||!claimed)return pending;
 return deliverSalesNotifications(service,[claimed]);
}
