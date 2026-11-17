import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import * as validation from '../src/lib/sales/validation.ts';
const id='11111111-1111-4111-8111-111111111119';
function fixture({owner=true,commandFails=false,cancelFails=false}={}){
 const calls=[],rep={user_id:id,email:'synthetic-remove@example.test',status:'active',commission_mode:'percent',commission_value:1200};
 class SalesError extends Error{constructor(message,status=400){super(message);this.status=status;}}
 const imports={'server-only':{},'./validation':validation,'./server':{SalesError,actor:async management=>{assert.equal(management,true);if(!owner)throw new SalesError('Owner required',403);},command:async(action,target,payload)=>{calls.push({action,target,payload});if(commandFails)throw Error('Removal failed');if(action==='rep-update')rep.status=payload.status;return {}; }},'@/lib/supabase/server':{createClient:async()=>({from:table=>({select:()=>({eq:(column,value)=>{assert.equal(value,id);return table==='sales_representatives'?{single:async()=>({data:{...rep}})}:Promise.resolve({data:[{slot:2}]});}})})})},'@/lib/supabase/admin':{createAdminClient:()=>({from:table=>{assert.equal(table,'sales_outbox');return {update:patch=>({eq:(kind,value)=>{assert.equal(kind,'kind');assert.equal(value,'representative-invite');return {eq:(key,address)=>{assert.equal(key,'recipient');assert.equal(address,rep.email);return {in:async(key,statuses)=>{calls.push({cancel:patch,statuses});assert.equal(key,'status');return {error:cancelFails?Error('Synthetic cancellation failure'):null};}};}};}})};}})}};
 const loaded={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/lib/sales/remove-representative.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{assert.ok(imports[name],name);return imports[name];},loaded,loaded.exports);
 return {remove:loaded.exports.removeRepresentative,calls,rep};
}
test('removal requires verified Owner and cannot be triggered by salesperson or malformed ID',async()=>{
 const denied=fixture({owner:false});await assert.rejects(denied.remove(id),/Owner required/);assert.equal(denied.calls.length,0);
 const invalid=fixture();await assert.rejects(invalid.remove('not-a-user-id'));assert.equal(invalid.calls.length,0);
});
test('removal revokes access first, preserves commission settings/history, clears position and cancels only queued invitations',async()=>{
 const f=fixture(),result=await f.remove(id);assert.equal(result.removed,true);assert.equal(result.cleanupPending,false);assert.equal(f.rep.status,'inactive');
 assert.deepEqual(f.calls[0],{action:'rep-update',target:id,payload:{status:'inactive',commission_mode:'percent',commission_value:1200}});
 assert.deepEqual(f.calls[1],{action:'team-slot',target:null,payload:{slot:2,rep_id:null}});
 assert.equal(f.calls[2].cancel.status,'cancelled');assert.equal(f.calls[2].cancel.encrypted_link,null);assert.deepEqual(f.calls[2].statuses,['pending','failed','processing']);
 assert.equal(f.calls.some(c=>c.action?.includes('delete')||c.action?.includes('commission')),false);
});
test('removal failures do not claim completion; cleanup failures report blocked access with review warning',async()=>{
 const blocked=fixture({commandFails:true});await assert.rejects(blocked.remove(id),/Removal failed/);assert.equal(blocked.rep.status,'active');assert.equal(blocked.calls.length,1);
 const partial=fixture({cancelFails:true}),result=await partial.remove(id);assert.equal(partial.rep.status,'inactive');assert.equal(result.cleanupPending,true);assert.match(result.message,/administrator review/);
});
