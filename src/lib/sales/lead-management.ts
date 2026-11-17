import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {actor,SalesError} from './server';
import {representativeRoster} from './representative-roster';
import {uuid} from './validation';
import {importProspects} from './csv';

export async function saveEmployeePosition(raw:Record<string,unknown>){
 await actor(true);const id=uuid(raw.id);if(typeof raw.job_title!=='string'||raw.job_title.trim().length<2||raw.job_title.trim().length>120||/[\u0000-\u001f\u007f]/.test(raw.job_title))throw new SalesError('Enter a job title of 2–120 characters.');
 const admin=createAdminClient(),rep=await admin.from('sales_representatives').select('user_id').eq('user_id',id).single();if(rep.error||!rep.data)throw new SalesError('Employee not found.',404);
 const user=await admin.auth.admin.getUserById(id);if(user.error||!user.data.user)throw new SalesError('Employee account unavailable.',503);
 const result=await admin.auth.admin.updateUserById(id,{user_metadata:{...user.data.user.user_metadata,job_title:raw.job_title.trim()}});if(result.error)throw new SalesError('Job title could not be saved.',503);return {saved:true};
}

export async function leadSummary(){
 await actor(true);const client=await createClient(),admin=createAdminClient();
 const roster=await representativeRoster(client);if(roster.error)throw new SalesError('Employee roster unavailable.',503);
 const people=await Promise.all((roster.data||[]).map(async r=>{
  const [leads,account]=await Promise.all([client.from('sales_prospects').select('id',{count:'exact',head:true}).eq('assigned_to',r.user_id),admin.auth.admin.getUserById(String(r.user_id))]);
  if(leads.error||leads.count===null||account.error)throw new SalesError('Employee counts could not be verified.',503);
  return {...r,assigned_count:leads.count,job_title:String(account.data.user?.user_metadata?.job_title||'Salesperson')};
 }));
 const free=await client.from('sales_prospects').select('id',{count:'exact',head:true}).is('assigned_to',null);
 if(free.error||free.count===null)throw new SalesError('Available lead count unavailable.',503);
 return {people,unassigned:free.count};
}

export async function previewLeadAllocation(raw:Record<string,unknown>){
 await actor(true);const target=uuid(raw.rep_id),source=raw.source_id?uuid(raw.source_id):null,quantity=Number(raw.quantity);
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>10000||target===source)throw new SalesError('Choose a different recipient and 1–10,000 leads.');
 const client=await createClient();const rep=await client.from('sales_representatives').select('status').eq('user_id',target).single();if(rep.error||rep.data?.status!=='active')throw new SalesError('Choose an active employee.',409);
 const leads:Record<string,unknown>[]=[];
 while(leads.length<quantity){let q=client.from('sales_prospects').select('id,company_name,usdot,assigned_to,revision').order('created_at').order('id').range(leads.length,Math.min(quantity,leads.length+500)-1);q=source?q.eq('assigned_to',source):q.is('assigned_to',null);const result=await q;if(result.error)throw new SalesError('Lead allocation could not be reviewed.',503);leads.push(...result.data||[]);if((result.data||[]).length<Math.min(500,quantity-(leads.length-(result.data||[]).length)))break;}
 return {leads,rep_id:target,source_id:source,requested:quantity};
}

export async function reviewUploadedLeads(csv:unknown){
 await actor(true);if(typeof csv!=='string')throw new SalesError('Choose the original CSV.');const parsed=importProspects(csv);
 if(parsed.errors.length||!parsed.rows.length||parsed.rows.length>200)throw new SalesError('Review up to 200 validated CSV rows at a time.');
 const result=await (await createClient()).from('sales_prospects').select('id,company_name,usdot,assigned_to,revision,disposition,follow_up_at,notes').in('usdot',parsed.rows.map(r=>r.usdot));
 if(result.error)throw new SalesError('Uploaded leads could not be reviewed.',503);
 const candidates=(result.data||[]).filter(r=>r.disposition==='Not Called'&&!r.follow_up_at&&r.notes.includes('Imported source columns:'));
 if(!candidates.length)return {leads:[],protected:(result.data||[]).length};
 const client=await createClient(),ids=candidates.map(r=>r.id);
 const [apps,activity]=await Promise.all([client.from('sales_applications').select('prospect_id').in('prospect_id',ids),client.from('sales_activity').select('prospect_id').in('prospect_id',ids).neq('action','assign')]);
 if(apps.error||activity.error)throw new SalesError('Lead history could not be checked.',503);
 const protectedIds=new Set([...(apps.data||[]),...(activity.data||[])].map(r=>r.prospect_id));
 const leads=candidates.filter(r=>!protectedIds.has(r.id)).map(({id,company_name,usdot,assigned_to,revision})=>({id,company_name,usdot,assigned_to,revision}));
 return {leads,protected:(result.data||[]).length-leads.length};
}

export async function deleteUploadedLeads(raw:Record<string,unknown>){
 const who=await actor(true);if(raw.confirm!==true||!Array.isArray(raw.leads)||!raw.leads.length||raw.leads.length>20)throw new SalesError('Review and confirm 1–20 uploaded leads per request.');
 const admin=createAdminClient();let deleted=0;const skipped:string[]=[];
 for(const item of raw.leads){
  const id=uuid(item?.id);if(!Number.isSafeInteger(item.revision)||item.revision<0)throw new SalesError('Review the CSV again before deleting.');
  const current=await admin.from('sales_prospects').select('*').eq('id',id).maybeSingle();if(current.error)throw new SalesError('Deletion interrupted. Review the file again.',503);
  if(!current.data)continue;const p=current.data;
  if(p.revision!==item.revision||p.assigned_to!==item.assigned_to||p.disposition!=='Not Called'||p.follow_up_at||!p.notes.includes('Imported source columns:')){skipped.push(id);continue;}
  const [apps,history]=await Promise.all([admin.from('sales_applications').select('id').eq('prospect_id',id).limit(1),admin.from('sales_activity').select('id,action,details').eq('prospect_id',id)]);
  if(apps.error||history.error)throw new SalesError('Lead history could not be verified.',503);
  if(apps.data?.length||history.data?.some(a=>a.action!=='assign')){skipped.push(id);continue;}
  // Preserve the original lead and assignment audit before removing a pristine
  // imported record. Work/application references also prevent physical deletion.
  const archive=await admin.from('sales_activity').insert({actor_id:who.id,action:'uploaded-lead-delete-reviewed',details:{original_prospect_id:id,lead:p}});if(archive.error)throw new SalesError('Lead archive could not be saved. No deletion attempted.',503);
  for(const event of history.data||[]){const detached=await admin.from('sales_activity').update({prospect_id:null,details:{...event.details,original_prospect_id:id}}).eq('id',event.id).eq('prospect_id',id).eq('action','assign');if(detached.error)throw new SalesError('Assignment history could not be preserved.',503);}
  let q=admin.from('sales_prospects').delete().eq('id',id).eq('revision',item.revision).eq('disposition','Not Called').is('follow_up_at',null);q=p.assigned_to?q.eq('assigned_to',p.assigned_to):q.is('assigned_to',null);const result=await q.select('id');
  if(result.error||!result.data?.length){skipped.push(id);continue;}deleted++;
 }
 return {deleted,skipped};
}
