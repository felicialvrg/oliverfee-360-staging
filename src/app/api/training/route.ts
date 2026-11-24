import {sameOrigin,salesFailure,SalesError} from '@/lib/sales/server';
import {trainingActor,playback,prepareUpload,uploadApproved,assignTraining,slug} from '@/lib/training/server';
import {createClient} from '@/lib/supabase/server';
export const runtime='nodejs';
export async function POST(request:Request){try{
 sameOrigin(request);await trainingActor();
 if(Number(request.headers.get('content-length')||0)>2048)throw new SalesError('Request too large.',413);
 const raw=await request.text();if(raw.length>2048)throw new SalesError('Request too large.',413);
 let body;try{body=JSON.parse(raw);}catch{throw new SalesError('Invalid request.',400);}
 if(!body||typeof body!=='object')throw new SalesError('Invalid request.',400);
 let result;
 if(body.action==='play')result=await playback();
 else if(body.action==='prepare-upload')result=await prepareUpload();
 else if(body.action==='finalize-upload')result=await uploadApproved();
 else if(body.action==='assign'||body.action==='revoke')result=await assignTraining(String(body.user||''),body.action==='revoke');
 else if(body.action==='complete'){const who=await trainingActor();if(who.owner)throw new SalesError('Employee completion requires an assigned employee session.',403);const client=await createClient(),r=await client.rpc('training_complete',{p_slug:slug});if(r.error)throw new SalesError('Completion requires an active assignment.',403);result={completed:true};}
 else throw new SalesError('Unknown training action.',400);
 return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return salesFailure(e);}}
