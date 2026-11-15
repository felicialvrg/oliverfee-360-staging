import 'server-only';
import {createHash} from 'node:crypto';
import {ownerIdentity} from '@/lib/admin/owner';
import {salesIdentity,SalesError} from '@/lib/sales/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import lesson from './lesson.json';
export const slug='honey-lesson-1';
export async function trainingActor(ownerOnly=false){
 if(process.env.PRIVATE_TRAINING_ENABLED!=='true')throw new SalesError('Private training is awaiting storage and access verification.',503);
 if(process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://dgjqwnewuhpwitadppkv.supabase.co')throw new SalesError('Existing production connection verification required.',503);
 const owner=await ownerIdentity();if(owner)return {id:owner.id,owner:true};
 if(!ownerOnly){const rep=await salesIdentity();if(rep)return {id:rep.user_id,owner:false};}
 throw new SalesError('Training access required.',403);
}
export async function trainingData(){
 const who=await trainingActor(),client=await createClient();
 const [lessons,assignments,completions]=await Promise.all([client.from('training_lessons').select('slug,title,status,version,object_path'),client.from('training_assignments').select('*'),client.from('training_completions').select('*')]);
 if([lessons,assignments,completions].some(r=>r.error))throw new SalesError('Training database setup is pending.',503);
 return {owner:who.owner,lessons:lessons.data||[],assignments:assignments.data||[],completions:completions.data||[]};
}
export async function playback(){
 await trainingActor();const client=await createClient();
 const allowed=await client.rpc('training_allowed',{p_slug:slug});if(allowed.error||allowed.data!==true)throw new SalesError('Active training assignment required.',403);
 const {data,error}=await client.from('training_lessons').select('object_path').eq('slug',slug).single();
 if(error||!data?.object_path)throw new SalesError('Approved training video has not been uploaded.',409);
 const signed=await createAdminClient().storage.from('employee-training').createSignedUrl(data.object_path,60);
 if(signed.error||!signed.data?.signedUrl)throw new SalesError('Private video playback is unavailable.',503);
 return {url:signed.data.signedUrl,expiresIn:60};
}
export async function prepareUpload(){
 await trainingActor(true);const service=createAdminClient(),object=slug+'/'+lesson.sha256+'.mp4';
 const signed=await service.storage.from('employee-training').createSignedUploadUrl(object,{upsert:false});
 if(signed.error||!signed.data)throw new SalesError('Private upload preparation failed. Do not overwrite an existing object.',409);
 return {path:signed.data.path,token:signed.data.token};
}
export async function uploadApproved(){
 await trainingActor(true);
 const service=createAdminClient(),object=slug+'/'+lesson.sha256+'.mp4';
 const existing=await service.from('training_lessons').select('sha256,object_path').eq('slug',slug).maybeSingle();
 if(existing.error)throw new SalesError('Lesson lookup unavailable.',503);
 if(existing.data&&(existing.data.sha256!==lesson.sha256||existing.data.object_path!==object))throw new SalesError('Canonical lesson needs owner review; refusing overwrite.',409);
 const stored=await service.storage.from('employee-training').download(object);
 if(stored.error||!stored.data)throw new SalesError('Upload the preserved approved MP4 first.',409);
 if(stored.data.size!==lesson.bytes)throw new SalesError('Stored video size differs from the approved Lesson 1. Owner review required; no automatic deletion.',409);
 const bytes=Buffer.from(await stored.data.arrayBuffer());
 if(createHash('sha256').update(bytes).digest('hex')!==lesson.sha256)throw new SalesError('Stored video differs from the approved Lesson 1. Owner review required; no automatic overwrite.',409);
 if(existing.data)return {preserved:true};
 const inserted=await service.from('training_lessons').insert({slug,title:'Honey — Lesson 1: Sales Dashboard',status:'Owner Approved',version:1,sha256:lesson.sha256,object_path:object});
 if(inserted.error)throw new SalesError('Video stored privately; lesson registration needs review. Do not upload another copy.',409);
 return {uploaded:true};
}
export async function assignTraining(user:string,revoke:boolean){
 await trainingActor(true);if(!/^[a-f0-9-]{36}$/i.test(user))throw new SalesError('Select an existing representative.',400);
 const service=createAdminClient(),rep=await service.from('sales_representatives').select('user_id,status').eq('user_id',user).single();
 if(rep.error||rep.data?.status!=='active')throw new SalesError('An existing active representative is required.',409);
 if(revoke){const result=await service.from('training_assignments').update({revoked_at:new Date().toISOString()}).eq('lesson_slug',slug).eq('user_id',user).select('user_id');if(result.error||!result.data?.length)throw new SalesError('Assignment not found or revocation failed.',409);}
 else {const result=await service.from('training_assignments').upsert({lesson_slug:slug,user_id:user,revoked_at:null},{onConflict:'lesson_slug,user_id'});if(result.error)throw new SalesError('Training assignment failed.',409);}
 return {saved:true};
}
