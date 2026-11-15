import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
import * as crypto from 'node:crypto';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://dgjqwnewuhpwitadppkv.supabase.co';
const slug='honey-lesson-1';
function service({owner=false,allowed=true,object=true}={}){
 let privileged=0,signed=0;const module={exports:{}};
 class SalesError extends Error{constructor(message,status){super(message);this.status=status;}}
 const imports={'server-only':{},'node:crypto':{},'./lesson.json':{bytes:10,sha256:'a'.repeat(64)},'@/lib/admin/owner':{ownerIdentity:async()=>owner?{id:'owner'}:null},'@/lib/sales/server':{salesIdentity:async()=>({user_id:'rep'}),SalesError},'@/lib/supabase/server':{createClient:async()=>({rpc:async()=>({data:allowed}),from:()=>({select:()=>({eq:()=>({single:async()=>({data:object?{object_path:slug+'/approved.mp4'}:null})})})})})},'@/lib/supabase/admin':{createAdminClient:()=>{privileged++;return {storage:{from:bucket=>{assert.equal(bucket,'employee-training');return {createSignedUrl:async(path,seconds)=>{assert.equal(path,slug+'/approved.mp4');assert.equal(seconds,60);signed++;return {data:{signedUrl:'https://signed-playback.example.test/signed-synthetic'}};}};}}};}}};
 const source=ts.transpileModule(fs.readFileSync(new URL('../src/lib/training/server.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',source)(name=>{assert.ok(name in imports,name);return imports[name];},module,module.exports);
 return {...module.exports,counts:()=>({privileged,signed})};
}
test('signing is gated off by default, denied for unassigned sessions, short lived for assigned sessions',async()=>{
 const before=process.env.PRIVATE_TRAINING_ENABLED;
 try{delete process.env.PRIVATE_TRAINING_ENABLED;const disabled=service();await assert.rejects(disabled.playback(),/awaiting storage/);assert.equal(disabled.counts().privileged,0);
 process.env.PRIVATE_TRAINING_ENABLED='true';const denied=service({allowed:false});await assert.rejects(denied.playback(),/Active training assignment/);assert.equal(denied.counts().privileged,0);
 const missing=service({object:false});await assert.rejects(missing.playback(),/not been uploaded/);assert.equal(missing.counts().privileged,0);
 const assigned=service();assert.equal((await assigned.playback()).expiresIn,60);assert.equal(assigned.counts().signed,1);
 await assert.rejects(assigned.prepareUpload(),/Training access/);assert.equal(assigned.counts().privileged,1);
 }finally{if(before===undefined)delete process.env.PRIVATE_TRAINING_ENABLED;else process.env.PRIVATE_TRAINING_ENABLED=before;}
});
test('finalization verifies stored bytes even for an existing canonical lesson; mismatch is never published',async()=>{
 const before=process.env.PRIVATE_TRAINING_ENABLED;process.env.PRIVATE_TRAINING_ENABLED='true';
 try{const original=Buffer.from('approved synthetic video'),hash=crypto.createHash('sha256').update(original).digest('hex');let corrupt=false,existing=false,inserts=0,downloads=0;
 const module={exports:{}},imports={'server-only':{},'node:crypto':crypto,'./lesson.json':{bytes:original.length,sha256:hash},'@/lib/admin/owner':{ownerIdentity:async()=>({id:'owner'})},'@/lib/sales/server':{SalesError:Error},'@/lib/supabase/server':{},'@/lib/supabase/admin':{createAdminClient:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:existing?{sha256:hash,object_path:slug+'/'+hash+'.mp4'}:null})})}),insert:async row=>{assert.equal(row.slug,slug);assert.equal(row.sha256,hash);inserts++;return {};}}),storage:{from:()=>({download:async()=>{downloads++;return {data:new Blob([corrupt?Buffer.alloc(original.length):original])};}})}})}};
 const source=ts.transpileModule(fs.readFileSync(new URL('../src/lib/training/server.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','module','exports',source)(n=>imports[n],module,module.exports);
 assert.deepEqual(await module.exports.uploadApproved(),{uploaded:true});assert.equal(inserts,1);existing=true;assert.deepEqual(await module.exports.uploadApproved(),{preserved:true});assert.equal(downloads,2);corrupt=true;await assert.rejects(module.exports.uploadApproved(),/Stored video differs/);assert.equal(inserts,1);
 }finally{if(before===undefined)delete process.env.PRIVATE_TRAINING_ENABLED;else process.env.PRIVATE_TRAINING_ENABLED=before;}
});
