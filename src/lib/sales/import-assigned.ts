import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {actor,command,SalesError} from './server';
import {uuid} from './validation';
import {importProspects} from './csv';

// One bounded CSV batch, one explicitly selected recipient. Never select the
// general unassigned pool: matching USDOTs must come from this exact file.
export async function importAssignedLeads(csv:unknown,rawRep:unknown){
 const who=await actor(true),target=uuid(rawRep);
 if(typeof csv!=='string')throw new SalesError('Choose a CSV file.');
 const parsed=importProspects(csv);
 if(parsed.errors.length||parsed.duplicates||!parsed.rows.length||parsed.rows.length>200)throw new SalesError('Use a validated upload batch of up to 200 unique leads.');
 const client=await createClient(),admin=createAdminClient();
 let {data:rep,error:repError}=await client.from('sales_representatives').select('status').eq('user_id',target).maybeSingle();
 if(!repError&&!rep&&target===who.id){
  const saved=await admin.from('sales_representatives').upsert({user_id:who.id,name:'Felicia Oliver',email:'felicialvrg@gmail.com',rep_code:'OWNER-FELICIA',status:'active',commission_mode:'none',commission_value:0},{onConflict:'user_id',ignoreDuplicates:true});
  if(saved.error)throw new SalesError('Owner assignment option could not be prepared.',503);
  const check=await client.from('sales_representatives').select('status').eq('user_id',target).maybeSingle();rep=check.data;repError=check.error;
 }
 if(repError||rep?.status!=='active')throw new SalesError('Select an active salesperson before uploading.',409);
 const imported=await command('import',null,{rows:parsed.rows}) as {imported:number;duplicates:number};
 if(!Number.isSafeInteger(imported?.imported)||!Number.isSafeInteger(imported?.duplicates)||imported.imported<0||imported.duplicates<0||imported.imported+imported.duplicates!==parsed.rows.length)throw new SalesError('Import result could not be confirmed. Retry this same file safely.',503);
 const dots=parsed.rows.map(row=>String(row.usdot)),requested=new Set(dots);
 const {data,error}=await client.from('sales_prospects').select('id,usdot,assigned_to,revision').in('usdot',dots);
 if(error||!data||data.length!==dots.length||new Set(data.map(l=>l.usdot)).size!==dots.length||data.some(l=>!requested.has(l.usdot)||!Number.isSafeInteger(l.revision)||l.revision<0))throw new SalesError('Uploaded leads could not be confirmed. Retry this same file safely.',503);
 let assigned=data.filter(l=>l.assigned_to===target).length;
 const groups=new Map<number,string[]>();
 for(const lead of data){if(lead.assigned_to)continue;groups.set(lead.revision,[...(groups.get(lead.revision)||[]),lead.id]);}
 for(const [revision,ids] of groups){
  const {data:saved,error:saveError}=await admin.from('sales_prospects').update({assigned_to:target,assigned_at:new Date().toISOString(),revision:revision+1,updated_at:new Date().toISOString()}).in('id',ids).eq('revision',revision).is('assigned_to',null).select('id');
  if(saveError||!saved||saved.some(l=>!ids.includes(l.id)))throw new SalesError('Upload saved, but assignment was interrupted. Retry the same file and salesperson.',503);
  assigned+=saved.length;
  if(saved.length)await admin.from('sales_activity').insert(saved.map(l=>({actor_id:who.id,prospect_id:l.id,action:'assign',details:{assigned_to:target,previous_assigned_to:null,revision:revision+1,source:'csv-upload'}})));
 }
 return {...imported,assigned,protected:parsed.rows.length-assigned};
}
