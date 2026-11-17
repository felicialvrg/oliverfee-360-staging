import {createClient} from '@/lib/supabase/server';
import {actor,sameOrigin,requestBody,command,SalesError,salesFailure} from '@/lib/sales/server';
import {uuid} from '@/lib/sales/validation';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 await actor(true);const url=new URL(request.url),start=Number(url.searchParams.get('start')||1),end=Number(url.searchParams.get('end')||100),q=(url.searchParams.get('q')||'').trim(),state=(url.searchParams.get('state')||'').toUpperCase();
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<1||end<start||end-start>=1000||end>1_000_000||q.length>120||state&&!/^[A-Z]{2}$/.test(state))throw new SalesError('Choose a range of up to 1,000 matching leads and a valid state.');
 let query=(await createClient()).from('sales_prospects').select('id,company_name,usdot,assigned_to,revision',{count:'exact'}).order('created_at').order('id').range(start-1,end-1);
 if(q)query=query.ilike('company_name','%'+q.replace(/[%_\\]/g,'')+'%');if(state)query=query.eq('state',state);if(url.searchParams.get('unassigned')==='true')query=query.is('assigned_to',null);
 const {data,error,count}=await query;if(error)throw new SalesError('Lead range could not be loaded.',503);
 return Response.json({leads:data||[],total:count,start,end},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return salesFailure(e);}}
export async function POST(request:Request){try{
 sameOrigin(request);await actor(true);const raw=await requestBody(request);if(!Array.isArray(raw.leads)||!raw.leads.length||raw.leads.length>20)throw new SalesError('Assign 1–20 leads per request.');
 const target=raw.rep_id===null?null:uuid(raw.rep_id),client=await createClient();
 if(target){const {data,error}=await client.from('sales_representatives').select('status').eq('user_id',target).single();if(error||data?.status!=='active')throw new SalesError('Choose an active salesperson.',409);}
 const results=[];for(const item of raw.leads){const id=uuid(item?.id);if(!Number.isSafeInteger(item?.revision)||item.revision<0)throw new SalesError('Refresh the lead list before assigning.');const {data,error}=await client.from('sales_prospects').select('assigned_to,revision').eq('id',id).single();if(error||!data){results.push({id,ok:false,message:'Lead unavailable.'});continue;}if(data.assigned_to===target){results.push({id,ok:true,unchanged:true});continue;}if(data.revision!==item.revision){results.push({id,ok:false,message:'Lead changed; reload before assigning.'});continue;}try{await command('assign',id,{rep_id:target});results.push({id,ok:true});}catch(e){results.push({id,ok:false,message:e instanceof Error?e.message:'Assignment failed.'});}}
 return Response.json({results},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return salesFailure(e);}}
