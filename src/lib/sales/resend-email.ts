import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {actor,SalesError} from './server';
import {uuid} from './validation';
import {findAuthUser,deliverSalesNotifications} from './notifications';

// Resend the existing record to its original recipient. Never accept email, HTML,
// financial amounts or account roles from the browser.
export async function resendSalesEmail(rawId:unknown,invitation=false){
 await actor(true);
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)throw new SalesError('Email delivery is not configured.',503);
 const service=createAdminClient(),id=uuid(rawId);
 let notificationId=id;
 if(invitation){
  const {data:rep,error}=await service.from('sales_representatives').select('user_id,email,status').eq('user_id',id).single();
  if(error||!rep||rep.status!=='invited')throw new SalesError('Only an invited salesperson can receive a new invitation. Active, suspended and removed accounts are not reset.',409);
  const user=await findAuthUser(rep.email);
  if(!user||user.id!==rep.user_id||user.last_sign_in_at)throw new SalesError('This account has already been used or needs administrator review. Use Forgot Password for existing accounts.',409);
  const {data:record,error:lookupError}=await service.from('sales_outbox').select('id').eq('dedupe_key','rep-invite:'+id).eq('kind','representative-invite').eq('recipient',rep.email).single();
  if(lookupError||!record)throw new SalesError('Original invitation record is unavailable.',409);
  notificationId=record.id;
 }
 const {data:item,error}=await service.from('sales_outbox').select('*').eq('id',notificationId).single();
 if(error||!item)throw new SalesError('Email record unavailable.',404);
 if(item.kind==='representative-invite'&&!invitation)throw new SalesError('Use Resend Invite on the salesperson record.',409);
 if(!invitation&&!['owner-sale','owner-refund','customer-welcome'].includes(item.kind))throw new SalesError('Use the original customer invoice, checkout or account invitation controls to resend this email.',409);
 if(item.kind==='customer-welcome'){
  const {data:application,error:applicationError}=await service.from('sales_applications').select('status,details').eq('id',uuid(item.application_id)).single();
  if(applicationError||!application||application.status!=='paid'||String(application.details?.email||'').toLowerCase()!==String(item.recipient).toLowerCase())throw new SalesError('Welcome email requires the original verified paid customer. No email sent.',409);
 }
 if(!['sent','failed','pending'].includes(item.status)||item.attempts>=10||item.lease_until&&Date.parse(item.lease_until)>Date.now()||item.sent_at&&Date.now()-Date.parse(item.sent_at)<60000)throw new SalesError('Email is processing, was just sent, was cancelled or reached its retry limit. Wait or review delivery history.',409);
 // Compare-and-set prevents double clicks/concurrent sends. The lease and attempt
 // remain persisted if the process stops; existing notification retries recover it.
 const {data:claimed,error:claimError}=await service.from('sales_outbox').update({status:'processing',attempts:item.attempts+1,lease_until:new Date(Date.now()+600000).toISOString(),last_error:null,...(invitation?{encrypted_link:null,link_created_at:null}:{})}).eq('id',item.id).eq('status',item.status).eq('attempts',item.attempts).select('*').single();
 if(claimError||!claimed)throw new SalesError('Another request changed this email. Refresh before resending.',409);
 const result=await deliverSalesNotifications(service,[claimed],true);
 return {...result,message:result.sent===1?'Resend accepted by the email provider. Inbox delivery is not yet confirmed.':'Resend was not confirmed. Review the email delivery record before retrying.'};
}
