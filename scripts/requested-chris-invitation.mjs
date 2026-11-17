// Temporary, deployment-only operator task for the user's explicit request.
// No web endpoint; no credentials, setup tokens or account details are output.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import ts from 'typescript';
const ADDRESS='solarwithhudson@gmail.com',ACTION='requested-chris-invitation-20261117';

export async function requestedInvitation(service,deliver){
 const checked=async query=>{const result=await query;if(result.error)throw Error('record_check_failed');return result.data;};
 const prior=await checked(service.from('sales_activity').select('id').eq('action',ACTION).limit(1));
 if(prior?.length)return {status:'already_sent'};
 let user=null;
 for(let page=1;page<=100;page++){
  const {data,error}=await service.auth.admin.listUsers({page,perPage:1000});if(error)throw Error('account_lookup_failed');
  const matches=data.users.filter(u=>u.email?.toLowerCase()===ADDRESS);
  if(matches.length>1||user&&matches.length)throw Error('ambiguous_account');user=matches[0]||user;
  if(data.users.length<1000)break;if(page===100)throw Error('account_lookup_incomplete');
 }
 let rep=await checked(service.from('sales_representatives').select('user_id,email,status').eq('email',ADDRESS).maybeSingle());
 if(rep&&(!user||rep.user_id!==user.id))throw Error('existing_identity_conflict');if(rep&&!['invited','active'].includes(rep.status))throw Error(rep.status==='inactive'?'salesperson_removed':rep.status==='suspended'?'salesperson_suspended':'existing_account_needs_review');
 if(!user){
  const created=await service.auth.admin.createUser({email:ADDRESS,email_confirm:false,user_metadata:{full_name:'Chris Hudson',first_name:'Chris',last_name:'Hudson'}});
  if(created.error||created.data.user?.email?.toLowerCase()!==ADDRESS)throw Error('account_creation_not_confirmed');user=created.data.user;
 }
 const profile=await checked(service.from('profiles').select('id,email,role,carrier_id').eq('id',user.id).single());
 if(!profile||profile.id!==user.id||profile.email?.toLowerCase()!==ADDRESS||profile.role!=='carrier'||profile.carrier_id)throw Error('conflicting_permissions');
 if(!rep){
  rep=await checked(service.from('sales_representatives').insert({user_id:user.id,name:'Chris Hudson',email:ADDRESS,rep_code:'TEMP-'+randomBytes(12).toString('hex'),status:'invited',commission_mode:'none',commission_value:0}).select('user_id,email,status').single());
 }
 const key='rep-invite:'+user.id;
 let item=await checked(service.from('sales_outbox').select('*').eq('dedupe_key',key).maybeSingle());
 if(!item)item=await checked(service.from('sales_outbox').insert({dedupe_key:key,kind:'representative-invite',recipient:ADDRESS}).select('*').single());
 if(item.kind!=='representative-invite'||item.recipient.toLowerCase()!==ADDRESS||!['pending','failed','sent'].includes(item.status)||item.attempts>=10||item.lease_until&&Date.parse(item.lease_until)>Date.now()||item.sent_at&&Date.now()-Date.parse(item.sent_at)<60000)throw Error('invitation_busy_or_recent');
 const claimed=await checked(service.from('sales_outbox').update({status:'processing',attempts:item.attempts+1,lease_until:new Date(Date.now()+600000).toISOString(),encrypted_link:null,link_created_at:null,last_error:null}).eq('id',item.id).eq('status',item.status).eq('attempts',item.attempts).select('*').maybeSingle());
 if(!claimed)throw Error('invitation_claim_changed');
 const result=await deliver(service,[claimed],true);
 if(result.sent!==1)throw Error('email_not_confirmed');
 await checked(service.from('sales_activity').insert({actor_id:user.id,action:ACTION,details:{representative_id:user.id,provider_accepted:true}}));
 return {status:'sent'};
}

function loadServerModule(file,imports){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{if(!Object.hasOwn(imports,name))throw Error('Unexpected operator dependency');return imports[name];},module,module.exports);return module.exports;}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href&&process.env.VERCEL_ENV==='production'){
 let report;
 try{
  const env=process.env;
  if(env.NEXT_PUBLIC_SUPABASE_URL!=='https://dgjqwnewuhpwitadppkv.supabase.co'||new URL(env.NEXT_PUBLIC_SITE_URL).origin!=='https://oliverfee360.com'||!env.SUPABASE_SERVICE_ROLE_KEY||!env.RESEND_API_KEY||!env.EMAIL_FROM||! /^[a-f0-9]{64}$/i.test(env.SALES_EMAIL_ENCRYPTION_KEY||env.OLIVERFEE_PREVIEW_SECRET||''))throw Error('configuration_not_verified');
  const service=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const email=loadServerModule('src/lib/email.ts',{'server-only':{}});
  const notifications=loadServerModule('src/lib/sales/notifications.ts',{'server-only':{},'node:crypto':await import('node:crypto'),'@/lib/supabase/admin':{createAdminClient:()=>service},'@/lib/supabase/server':{},'@/lib/email':email,'./payments':{salesOrigin:()=> 'https://oliverfee360.com'},'./server':{SalesError:Error},'./validation':{}});
  report=await requestedInvitation(service,notifications.deliverSalesNotifications);
 }catch(error){report={status:'blocked',reason:['record_check_failed','account_lookup_failed','ambiguous_account','account_lookup_incomplete','existing_account_needs_review','existing_identity_conflict','salesperson_removed','salesperson_suspended','account_creation_not_confirmed','conflicting_permissions','invitation_busy_or_recent','invitation_claim_changed','email_not_confirmed','configuration_not_verified'].includes(error.message)?error.message:'operator_check_failed'};}
 fs.mkdirSync('public',{recursive:true});fs.writeFileSync('public/requested-invitation-result.json',JSON.stringify(report));
 console.log(JSON.stringify({requestedSalesInvitation:report.status}));
}
