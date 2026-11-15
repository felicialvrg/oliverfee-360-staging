import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
import * as validation from '../src/lib/sales/validation.ts';
const require=createRequire(import.meta.url);
function load(file,imports={}){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(name=>Object.hasOwn(imports,name)?imports[name]:require(name),module,module.exports);return module.exports;}
test('production-only mail patch retries existing queue entries with exact sender/Reply-To and encrypted, idempotent account setup; no account creation',async()=>{
 const names=['RESEND_API_KEY','EMAIL_FROM','SALES_EMAIL_ENCRYPTION_KEY'];const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));const originalFetch=globalThis.fetch;
 Object.assign(process.env,{RESEND_API_KEY:'synthetic-provider-key',EMAIL_FROM:'Oliver Fee 360 <invitations@oliverfee360.com>',SALES_EMAIL_ENCRYPTION_KEY:'a'.repeat(64)});
 const queue=[1,2].map(n=>({id:'synthetic-queue-'+n,kind:'representative-invite',recipient:'synthetic-rep-'+n+'@example.test',status:'pending',encrypted_link:null,link_created_at:null}));
 const requests=[];let generated=0,allowSecond=false;
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');const body=JSON.parse(options.body);requests.push({body,key:options.headers['Idempotency-Key']});return {ok:body.to===queue[0].recipient||allowSecond,status:503};};
 const service={rpc:async(name)=>{assert.equal(name,'sales_claim_outbox');return {data:queue.filter(row=>row.status!=='sent').map(row=>({...row})),error:null};},auth:{admin:{createUser:async()=>{throw Error('Duplicate account creation forbidden');},generateLink:async()=>{generated++;return {data:{properties:{hashed_token:'synthetic-setup-'+generated}},error:null};}}},from:()=>({update:patch=>({eq:async(_,id)=>{Object.assign(queue.find(row=>row.id===id),patch);return {error:null};}})})};
 const base='src/lib/';const email=load(base+'email.ts',{'server-only':{}});
 const notifications=load(base+'sales/notifications.ts',{'server-only':{},'@/lib/supabase/admin':{createAdminClient:()=>service},'@/lib/supabase/server':{},'@/lib/email':email,'./payments':{salesOrigin:()=> 'https://oliverfee360.com'},'./server':{SalesError:Error,command:async()=>{throw Error('Role or account mutation forbidden');}},'./validation':validation});
 try{
 const first=await notifications.drainSalesOutbox();assert.equal(first.sent,1);assert.equal(first.failed,1);assert.equal(generated,2);
 for(const request of requests){assert.equal(request.body.from,'Oliver Fee 360 <invitations@oliverfee360.com>');assert.equal(request.body.reply_to,'oliverfee360@gmail.com');assert.match(request.body.html,/https:\/\/oliverfee360.com\/auth\/confirm\?/);assert.match(request.body.html,/sales\/login/);assert.doesNotMatch(request.body.html,/sales-test|supabase.com\/dashboard/);}
 assert.ok(queue.every(row=>row.encrypted_link&&!row.encrypted_link.includes('synthetic-setup')));
 allowSecond=true;const retried=await notifications.drainSalesOutbox();assert.equal(retried.sent,1);assert.equal(generated,2);assert.equal(requests[1].key,requests[2].key);assert.equal(queue.length,2);
 // Unrelated email paths retain their previous headers.
 await email.sendEmail('synthetic-customer@example.test','Synthetic unrelated notice','Sample');assert.equal(requests.at(-1).body.reply_to,undefined);
 }finally{globalThis.fetch=originalFetch;for(const name of names)if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}
});
