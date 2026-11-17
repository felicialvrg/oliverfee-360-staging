import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {createRequire} from 'node:module';import * as validation from '../src/lib/sales/validation.ts';
const require=createRequire(import.meta.url);
function compile(imports){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(new URL('../src/lib/sales/notifications.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(n=>imports[n]||require(n),module,module.exports);return module.exports;}

function profileApi(service={}){return compile({'server-only':{},'@/lib/supabase/admin':{createAdminClient:()=>service},'@/lib/supabase/server':{},'@/lib/email':{},'./payments':{},'./server':{SalesError:Error,command:async()=>{throw Error('Unexpected account mutation');}},'./validation':validation});}
test('manual salesperson profile validates role and fields without granting privileges',()=>{
 const api=profileApi(),raw={first_name:'Synthetic',last_name:'Representative',email:'SYNTHETIC@EXAMPLE.TEST',phone:'+1 (202) 555-0199',rep_code:'SYNTHETIC-01',role:'salesperson',notes:'Synthetic test only'};
 const p=api.representativeProfile(raw);assert.equal(p.name,'Synthetic Representative');assert.equal(p.address,'synthetic@example.test');assert.equal(p.metadata.phone,raw.phone);assert.equal(p.metadata.notes,raw.notes);assert.equal('role' in p.metadata,false);assert.equal('password' in p.metadata,false);
 for(const changes of [{role:'admin'},{phone:'invalid phone'},{notes:'x'.repeat(2001)},{first_name:'x'.repeat(61)},{last_name:''},{rep_code:'bad id!'}])assert.throws(()=>api.representativeProfile({...raw,...changes}));
 const generated=api.representativeProfile({first_name:'New',last_name:'Person',email:raw.email});assert.match(generated.code,/^TEMP-[a-f0-9]{24}$/);assert.notEqual(generated.code,api.representativeProfile({first_name:'New',last_name:'Person',email:raw.email}).code);
 assert.equal(api.representativeProfile({name:'Legacy Name',email:raw.email,rep_code:'LEGACY'}).name,'Legacy Name');
});
test('adding a salesperson never changes or reinvites an existing authentication account',async()=>{
 let mutations=0;const service={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})}),auth:{admin:{listUsers:async()=>({data:{users:[{id:'existing-admin',email:'owner@example.test'}]},error:null}),createUser:async()=>{mutations++;throw Error('Must not create');}}}};
 await assert.rejects(profileApi(service).registerRepresentative({name:'Preserved Owner',email:'owner@example.test',rep_code:'SYNTHETIC'}),/already has an account/);assert.equal(mutations,0);
});
test('failed welcome emails remain queued and reuse their encrypted single-use link and stable send idempotency key',async()=>{
 const saved={RESEND_API_KEY:process.env.RESEND_API_KEY,EMAIL_FROM:process.env.EMAIL_FROM,SALES_EMAIL_ENCRYPTION_KEY:process.env.SALES_EMAIL_ENCRYPTION_KEY};Object.assign(process.env,{RESEND_API_KEY:'synthetic',EMAIL_FROM:'test@example.test',SALES_EMAIL_ENCRYPTION_KEY:'a'.repeat(64)});
 const queue={id:'outbox-test',kind:'customer-welcome',recipient:'customer@example.test',encrypted_link:null,link_created_at:null,status:'pending'},mail=[];let generated=0,accepted=false;
 const service={rpc:async()=>({data:[{...queue}],error:null}),auth:{admin:{generateLink:async()=>{generated++;return {data:{properties:{hashed_token:'synthetic_private_hash'}},error:null};}}},from:()=>({update:patch=>({eq:async()=>{Object.assign(queue,patch);return {error:null};}})})};
 const api=compile({'server-only':{},'@/lib/supabase/admin':{createAdminClient:()=>service},'@/lib/supabase/server':{},'@/lib/email':{sendEmail:async(...args)=>{mail.push(args);return accepted;},inviteEmailHtml:(name,link)=>name+' '+link},'./payments':{salesOrigin:()=> 'https://oliverfee360.com'},'./server':{SalesError:Error,command:async()=>({})},'./validation':validation});
 try{const first=await api.drainSalesOutbox();assert.equal(first.failed,1);assert.equal(queue.status,'failed');assert.ok(queue.encrypted_link);assert.equal(JSON.stringify(queue).includes('synthetic_private_hash'),false);assert.equal(JSON.stringify(queue).includes('token_hash'),false);
  accepted=true;const second=await api.drainSalesOutbox();assert.equal(second.sent,1);assert.equal(queue.status,'sent');assert.equal(generated,1);assert.equal(mail[0][2],mail[1][2]);assert.equal(mail[0][3],mail[1][3]);
  process.env.RESEND_API_KEY='';const pending=await api.drainSalesOutbox();assert.equal(pending.pending,true);assert.equal(pending.processed,0);
 }finally{for(const [k,v]of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
