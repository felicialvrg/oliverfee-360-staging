import 'server-only';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {createAdminClient} from '@/lib/supabase/admin';
import {sendEmail,inviteEmailHtml} from '@/lib/email';
import {salesOrigin} from './payments';
import {SalesError,command} from './server';
import {createClient} from '@/lib/supabase/server';
import {email,uuid} from './validation';
function encryptionKey(){const secret=process.env.SALES_EMAIL_ENCRYPTION_KEY||process.env.OLIVERFEE_PREVIEW_SECRET||'';if(!/^[a-f0-9]{64}$/i.test(secret))throw new SalesError('Configure server-side sales email encryption before sending setup links.',503);return createHash('sha256').update('oliverfee-sales-notifications:'+secret).digest();}
function encrypt(link:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);const body=Buffer.concat([cipher.update(link,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64');}
function decrypt(value:string){const b=Buffer.from(value,'base64'),decipher=createDecipheriv('aes-256-gcm',encryptionKey(),b.subarray(0,12));decipher.setAuthTag(b.subarray(12,28));return Buffer.concat([decipher.update(b.subarray(28)),decipher.final()]).toString('utf8');}
export async function findAuthUser(address:string){const service=createAdminClient();for(let page=1;page<=100;page++){const {data,error}=await service.auth.admin.listUsers({page,perPage:1000});if(error)throw new SalesError('Authentication lookup is unavailable.',503);const users=data.users.filter(u=>u.email?.toLowerCase()===address.toLowerCase());if(users.length>1)throw new SalesError('Account identity needs owner review.',409);if(users[0])return users[0];if(data.users.length<1000)return null;}throw new SalesError('Account lookup needs operator review.',503);}
export function representativeProfile(raw:Record<string,unknown>){
 const field=(key:string,max:number)=>{const value=raw[key];if(value===undefined||value===null)return '';if(typeof value!=='string'||value.trim().length>max)throw new SalesError('Invalid '+key+' field.');return value.trim();};
 const first=field('first_name',60),last=field('last_name',60),name=field('name',120)||[first,last].filter(Boolean).join(' '),phone=field('phone',40),notes=field('notes',2000),jobTitle=field('job_title',120)||'Salesperson',code=field('rep_code',32)||'TEMP-'+randomBytes(12).toString('hex'),address=email(raw.email);
 if(name.length<2||name.length>120||(first&&!last)||(!first&&last)||!(/^[A-Za-z0-9_-]{2,32}$/).test(code)||raw.role!==undefined&&raw.role!=='salesperson'||phone&&!/^[+0-9(). x-]{5,40}$/.test(phone))throw new SalesError('Enter a valid salesperson name, email and phone. Only the Salesperson role is allowed.');
 return {address,name,code,metadata:{full_name:name,first_name:first,last_name:last,phone,notes,job_title:jobTitle}};
}
export async function registerRepresentative(raw:Record<string,unknown>){
 const {address,name,code,metadata}=representativeProfile(raw);
 const service=createAdminClient();
 const [{data:existingCode,error:codeError},{data:existingRep,error:repError}]=await Promise.all([service.from('sales_representatives').select('user_id').eq('rep_code',code).maybeSingle(),service.from('sales_representatives').select('user_id').eq('email',address).maybeSingle()]);
 if(codeError||repError)throw new SalesError('Representative records could not be checked.',503);if(existingCode||existingRep)throw new SalesError('That representative ID or email is already registered. Update the existing record instead.',409);
 let user=await findAuthUser(address);if(user)throw new SalesError('This email already has an account. Existing accounts and administrator access were preserved. Use the existing representative controls or a separate test inbox.',409);
 if(!user){const {data,error}=await service.auth.admin.createUser({email:address,email_confirm:false,user_metadata:metadata});if(error)user=await findAuthUser(address);else user=data.user;}
 if(!user)throw new SalesError('The individual login could not be created.',503);
 return command('register-rep',user.id,{name,rep_code:code,email:address});
}
export async function sendCheckoutEmail(prospectId:string){
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)throw new SalesError('Email delivery is not configured. The secure checkout can still be copied.',503);
 const client=await createClient();const {data:app,error}=await client.from('sales_applications').select('id,details').eq('prospect_id',uuid(prospectId)).single();if(error||!app)throw new SalesError('Assigned application required.',403);
 const {data:checkout,error:checkoutError}=await client.from('sales_checkout_attempts').select('id,checkout_url,status').eq('application_id',app.id).eq('status','pending').single();if(checkoutError||!checkout?.checkout_url||new URL(checkout.checkout_url).origin!=='https://checkout.stripe.com')throw new SalesError('Generate a secure pending checkout first.',409);
 await command('checkout-email',prospectId,{});
 const recipient=email(app.details.email),sent=await sendEmail(recipient,'Your OliverFee 360 secure membership checkout',`<p>Thank you for speaking with OliverFee 360. Review your selected monthly membership and enter payment details directly on Stripe.</p><p><a href="${checkout.checkout_url.replaceAll('&','&amp;').replaceAll('"','&quot;')}">Review and pay securely on Stripe</a></p><p>No representative needs your card information. Government and third-party fees are separate.</p>`,'sales-checkout-'+checkout.id+'-'+Math.floor(Date.now()/60000));
 if(!sent)throw new SalesError('The email provider did not confirm acceptance. No successful send is reported.',502);return {accepted:true};
}
export async function drainSalesOutbox(){
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)return {processed:0,pending:true,reason:'Email delivery is not configured.'};
 const service=createAdminClient();const {data:items,error}=await service.rpc('sales_claim_outbox',{p_limit:2});if(error)throw new SalesError('Notification queue is unavailable.',503);return deliverSalesNotifications(service,items||[]);
}
type NotificationItem={id:string;kind:string;recipient:string;attempts:number;encrypted_link:string|null;link_created_at:string|null;sent_at?:string|null};
export async function deliverSalesNotifications(service:ReturnType<typeof createAdminClient>,items:NotificationItem[],resend=false){
 let sent=0,failed=0;
 for(const item of items||[]){try{
  let html:string,subject:string;let idempotency='sales-outbox-'+item.id+(item.sent_at?'-resend-'+item.sent_at:resend?'-resend-'+item.attempts:'');
  if(item.kind==='owner-sale'||item.kind==='owner-refund'){html='<p>A sales-assisted membership '+(item.kind==='owner-refund'?'refund':'payment')+' was verified. Review the record in your existing <a href="'+salesOrigin()+'/admin/sales">Sales Management</a> section.</p>';subject='OliverFee 360: verified sales '+(item.kind==='owner-refund'?'refund':'enrollment');}
  else if((resend||item.sent_at)&&item.kind==='customer-welcome'){subject='Welcome back to OliverFee 360';html='<p>Your OliverFee 360 membership account is available.</p><p><a href="'+salesOrigin()+'/login?portal=member">Log In to OliverFee 360</a></p><p>If you have not set your password or cannot remember it, use Forgot Password on the login page. Your existing account and payments are unchanged.</p>';}
  else{
   let link:string;
   if(item.encrypted_link&&item.link_created_at&&Date.now()-new Date(item.link_created_at).getTime()<45*60000){link=decrypt(item.encrypted_link);}
   else{
    const {data,error:linkError}=await service.auth.admin.generateLink({type:'recovery',email:item.recipient});
    if(linkError||!data.properties?.hashed_token)throw new Error('Secure account setup could not be generated.');
    const url=new URL(salesOrigin()+'/auth/confirm');url.searchParams.set('token_hash',data.properties.hashed_token);url.searchParams.set('type','recovery');url.searchParams.set('next',item.kind==='representative-invite'?'/set-password?portal=sales':'/set-password');link=url.href;
    item.link_created_at=new Date().toISOString();const {error:saveError}=await service.from('sales_outbox').update({encrypted_link:encrypt(link),link_created_at:item.link_created_at}).eq('id',item.id);if(saveError)throw new Error('Secure notification preparation could not be saved.');
   }
   idempotency+='-'+item.link_created_at;subject=item.kind==='representative-invite'?'Your individual OliverFee 360 sales login':'Welcome to OliverFee 360';
   html=inviteEmailHtml(item.kind==='representative-invite'?'OliverFee 360 Sales Representative':'your OliverFee 360 membership',link,item.kind==='representative-invite');
   if(item.kind==='representative-invite')html+='<p>Choose your personal username and password, then continue to your private Sales Dashboard. For future visits, sign in at <a href="'+salesOrigin()+'/login">OliverFee360.com</a> with your email or username.</p>';
  }
  if(!await sendEmail(item.recipient,subject,html,idempotency,item.kind==='representative-invite'?{replyTo:'oliverfee360@gmail.com'}:undefined))throw new Error('Email provider did not confirm acceptance.');
  const {error:saved}=await service.from('sales_outbox').update({status:'sent',sent_at:new Date().toISOString(),lease_until:null,last_error:null}).eq('id',item.id);if(saved)throw new Error('Delivery acceptance could not be recorded.');sent++;
 }catch{
  failed++;await service.from('sales_outbox').update({status:'failed',lease_until:new Date(Date.now()+60000).toISOString(),last_error:'Notification not confirmed. Check provider configuration and retry.'}).eq('id',item.id);
 }}return {processed:items?.length||0,sent,failed};
}
