import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function load(file,imports){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{assert.ok(Object.hasOwn(imports,name),name);return imports[name];},module,module.exports);return module.exports;}
class SalesError extends Error{constructor(message,status=400){super(message);this.status=status;}}
function fixture(options={}){
 const state={user:{id:'rep1',email:'rep@example.test',email_confirmed_at:'2026-11-17'},rep:{user_id:'rep1',email:'rep@example.test',rep_code:'TEMP-private-id',status:'invited'},profile:{id:'rep1',role:'carrier',carrier_id:null},matches:[],passwordCalls:[],updates:[],...options};
 const service={from(table){let patch,filters=[];const query={select(){return query;},eq(key,value){filters.push([key,value]);return query;},ilike(key,value){state.lookup={key,value};return Promise.resolve({data:state.matches,error:null});},update(value){patch=value;return query;},async single(){return {data:structuredClone(table==='profiles'?state.profile:state.rep),error:null};},async maybeSingle(){state.updates.push({patch,filters});const matches=filters.every(([k,v])=>state.rep[k]===v);if(!matches||state.saveFails)return {data:null,error:null};Object.assign(state.rep,patch);return {data:{user_id:state.rep.user_id},error:null};}};return query;}};
 const client={auth:{getUser:async()=>({data:{user:state.user},error:null}),updateUser:async value=>{state.passwordCalls.push(value);if(state.concurrentStatus)state.rep.status=state.concurrentStatus;return {error:state.passwordFails?Error('Private provider failure'):null};}}};
 const api=load('src/lib/sales/account-setup.ts',{'server-only':{},'@/lib/supabase/server':{createClient:async()=>client},'@/lib/supabase/admin':{createAdminClient:()=>service},'./server':{SalesError}});return {state,api};
}
test('invited salesperson chooses a normalized private login and opens Sales without changing identity or commission',async()=>{
 const {state,api}=fixture();state.rep.commission_value=1200;
 assert.deepEqual(await api.completeSalesSetup({username:' My_Name ',password:'Synthetic-password-only!'}),{destination:'/sales'});
 assert.equal(state.rep.rep_code,'my_name');assert.equal(state.rep.status,'active');assert.equal(state.rep.user_id,'rep1');assert.equal(state.rep.commission_value,1200);assert.equal(state.lookup.value,'my\\_name');assert.equal(state.passwordCalls.length,1);assert.ok(state.updates[0].filters.some(([k,v])=>k==='user_id'&&v==='rep1'));
});
test('username rules, duplicate aliases and invalid passwords stop before credential or account changes',async()=>{
 for(const username of ['x','bad name','person@example.test','temp-secret','%','_starts','a'.repeat(33)]){const {state,api}=fixture();await assert.rejects(api.completeSalesSetup({username,password:'Synthetic-password-only!'}));assert.equal(state.passwordCalls.length,0);assert.equal(state.updates.length,0);}
 for(const password of ['short','x'.repeat(129),null]){const {state,api}=fixture();await assert.rejects(api.completeSalesSetup({username:'valid_name',password}));assert.equal(state.passwordCalls.length,0);}
 const {state,api}=fixture({matches:[{user_id:'another-rep'}]});await assert.rejects(api.completeSalesSetup({username:'Taken',password:'Synthetic-password-only!'}),/taken/);assert.equal(state.passwordCalls.length,0);
});
test('anonymous, unverified, administrator, linked carrier, suspended and removed accounts cannot self-activate',async()=>{
 for(const options of [{user:null},{user:{id:'rep1',email:'rep@example.test'}},{user:{id:'rep1',email:'rep@example.test',email_confirmed_at:'now',is_anonymous:true}},{profile:{id:'rep1',role:'admin',carrier_id:null}},{profile:{id:'rep1',role:'carrier',carrier_id:'company1'}},{rep:{user_id:'rep1',email:'rep@example.test',status:'suspended'}},{rep:{user_id:'rep1',email:'rep@example.test',status:'inactive'}},{rep:{user_id:'rep1',email:'other@example.test',status:'invited'}}]){const {state,api}=fixture(options);await assert.rejects(api.completeSalesSetup({username:'personal',password:'Synthetic-password-only!'}));assert.equal(state.passwordCalls.length,0);assert.equal(state.updates.length,0);}
});
test('failed password save never activates and concurrent Owner removal wins over setup',async()=>{
 let f=fixture({passwordFails:true});await assert.rejects(f.api.completeSalesSetup({username:'personal',password:'Synthetic-password-only!'}),/password could not be saved/);assert.equal(f.state.rep.status,'invited');assert.equal(f.state.updates.length,0);
 f=fixture({concurrentStatus:'inactive'});await assert.rejects(f.api.completeSalesSetup({username:'personal',password:'Synthetic-password-only!'}),/password was saved/);assert.equal(f.state.rep.status,'inactive');assert.equal(f.state.rep.rep_code,'TEMP-private-id');
});
test('existing active salesperson can change only their own login and retry the same chosen username',async()=>{
 const {state,api}=fixture({matches:[{user_id:'rep1'}]});state.rep.status='active';state.rep.rep_code='personal';await api.completeSalesSetup({username:'personal',password:'Synthetic-password-only!'});assert.equal(state.rep.status,'active');assert.equal(state.rep.user_id,'rep1');
});
test('username sign-in resolves privately, checks the password, preserves email login and never returns the email',async()=>{
 const calls=[];let found=true,reject=false;const action=load('src/app/actions/sign-in.ts',{'@/lib/supabase/admin':{createAdminClient:()=>({from:()=>({select:()=>({ilike:(_,value)=>({maybeSingle:async()=>{calls.push({lookup:value});return {data:found?{email:'private@example.test'}:null,error:null};}})})})})},'@/lib/supabase/server':{createClient:async()=>({auth:{signInWithPassword:async value=>{calls.push(value);return {error:reject?Error('Provider secret detail'):null};}}})}});
 assert.deepEqual(await action.signInWithIdentity('My_Name','Chosen-password!'),{error:null});assert.equal(calls[0].lookup,'my\\_name');assert.deepEqual(calls[1],{email:'private@example.test',password:'Chosen-password!'});
 assert.deepEqual(await action.signInWithIdentity('OWNER@EXAMPLE.TEST','Chosen-password!'),{error:null});assert.equal(calls.at(-1).email,'owner@example.test');
 reject=true;const known=await action.signInWithIdentity('My_Name','wrong');found=false;const unknown=await action.signInWithIdentity('Unknown','wrong');assert.deepEqual(known,unknown);assert.doesNotMatch(JSON.stringify(unknown),/private@example|Provider secret/);assert.equal(calls.at(-1).email,'unknown-username@invalid.invalid');
});
