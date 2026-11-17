import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
import {database} from './helpers/import-sales-db.mjs';import {readImport,defaultMapping,planImport} from '../src/lib/sales/large-import.ts';import * as validation from '../src/lib/sales/validation.ts';import * as csv from '../src/lib/sales/csv.ts';
const owner='d5f443af-ac3a-42b2-8294-6fbf51f73beb',rep1='11111111-1111-4111-8111-111111111111',rep2='22222222-2222-4222-8222-222222222222';
class SalesError extends Error{constructor(message,status=400){super(message);this.status=status;}}
async function fixture(){
 const f=await database();let allowed=true;const accounts=new Map([[rep1,{user_metadata:{job_title:'Salesperson',other:'preserve'}}],[rep2,{user_metadata:{job_title:'Dispatcher'}}]]);
 const client={from(table){assert.match(table,/^sales_(representatives|prospects|applications|activity)$/);let fields='*',filters=[],params=[],op='select',patch,head=false,count=false,offset=0,limit,orders=[],one=false;
 const col=c=>{assert.match(c,/^[a-z_]+$/);return c;},param=v=>{params.push(v);return '$'+params.length;};
 const q={select(value='*',opts={}){fields=value;head=opts.head;count=opts.count;return q;},eq(k,v){filters.push(col(k)+'='+param(v));return q;},neq(k,v){filters.push(col(k)+'<>'+param(v));return q;},is(k,v){assert.equal(v,null);filters.push(col(k)+' is null');return q;},in(k,values){filters.push(col(k)+' in ('+values.map(param).join(',')+')');return q;},order(k){orders.push(col(k));return q;},range(a,b){offset=a;limit=b-a+1;return q;},limit(n){limit=n;return q;},single(){one=true;return q;},maybeSingle(){one=true;return q;},delete(){op='delete';return q;},update(p){op='update';patch=p;return q;},insert(p){op='insert';patch=p;return q;},async then(resolve,reject){try{const where=filters.length?' where '+filters.join(' and '):'';let sql;
 if(op==='select'){const cols=head?'count(*)::int as count':fields.split(',').map(c=>c==='*'?'*':col(c)).join(',');sql='select '+cols+' from '+table+where+(orders.length?' order by '+orders.join(','):'')+(limit!==undefined?' limit '+limit:'')+(offset?' offset '+offset:'');}
 if(op==='insert'){const rows=Array.isArray(patch)?patch:[patch],keys=Object.keys(rows[0]);sql='insert into '+table+'('+keys.map(col).join(',')+') values '+rows.map(row=>'('+keys.map(k=>param(typeof row[k]==='object'&&row[k]!==null?JSON.stringify(row[k]):row[k])).join(',')+')').join(',')+' returning *';}
 if(op==='update'){const set=Object.entries(patch).map(([k,v])=>col(k)+'='+param(typeof v==='object'&&v!==null?JSON.stringify(v):v)).join(',');sql='update '+table+' set '+set+where+' returning *';}
 if(op==='delete')sql='delete from '+table+where+' returning *';
 const result=await f.db.query(sql,params);resolve({data:head?null:one?result.rows[0]||null:result.rows,count:head?result.rows[0].count:count?result.rows.length:null,error:null});
 }catch(e){resolve({data:null,error:e,count:null});}}};return q;},auth:{admin:{async getUserById(id){return {data:{user:accounts.get(id)},error:null};},async updateUserById(id,patch){accounts.set(id,{...accounts.get(id),...patch});return {data:{user:accounts.get(id)},error:null};}}}};
 const imports={'server-only':{},'@/lib/supabase/server':{createClient:async()=>client},'@/lib/supabase/admin':{createAdminClient:()=>client},'./server':{actor:async()=>{if(!allowed)throw new SalesError('Owner required',403);return {id:owner};},command:(...args)=>f.command(owner,...args),SalesError},'./validation':validation,'./csv':csv,'./representative-roster':{representativeRoster:async()=>({data:(await f.db.query('select * from sales_representatives')).rows,error:null})}};
 const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/lib/sales/lead-management.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{assert.ok(imports[n],n);return imports[n];},module,module.exports);
 const assignedModule={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/lib/sales/import-assigned.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>imports[n],assignedModule,assignedModule.exports);
 const route={exports:{}};const server=imports['./server'];Object.assign(server,{sameOrigin:r=>{if(r.headers.get('origin')!==new URL(r.url).origin)throw new SalesError('Origin',403);},requestBody:r=>r.json(),salesFailure:e=>Response.json({error:e.message},{status:e.status||503})});const aliases={'@/lib/sales/server':server,'@/lib/sales/representative-roster':imports['./representative-roster'],'@/lib/sales/validation':validation};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/app/admin/api/sales/leads/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>aliases[n]||imports[n],route,route.exports);
 const assign=async body=>{const r=await route.exports.POST(new Request('https://test.example/admin/api/sales/leads',{method:'POST',headers:{origin:'https://test.example'},body:JSON.stringify(body)}));const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));return d;};
 return {...f,...module.exports,...assignedModule.exports,assign,accounts,deny(){allowed=false;}};
}
test('quantity allocation paginates the selected source and employee counts reflect all assigned leads',async()=>{
 const f=await fixture();try{await f.db.query("insert into sales_prospects(company_name,usdot,assigned_to) select 'Synthetic '||n,n::text,$1 from generate_series(1000000,1001202) n",[rep1]);await f.db.exec("insert into sales_prospects(company_name,usdot) values('Unassigned','9999999')");
 const summary=await f.leadSummary();assert.equal(summary.unassigned,1);assert.equal(summary.people.find(p=>p.user_id===rep1).assigned_count,1203);assert.equal(summary.people.find(p=>p.user_id===rep2).job_title,'Dispatcher');
 const selection=await f.previewLeadAllocation({rep_id:rep2,source_id:rep1,quantity:1101});assert.equal(selection.leads.length,1101);assert.ok(selection.leads.every(p=>p.assigned_to===rep1));assert.equal(new Set(selection.leads.map(p=>p.id)).size,1101);assert.equal((await f.previewLeadAllocation({rep_id:rep2,quantity:20})).leads.length,1);
 await assert.rejects(f.previewLeadAllocation({rep_id:rep1,source_id:rep1,quantity:10}));await assert.rejects(f.previewLeadAllocation({rep_id:rep2,quantity:0}));
 }finally{await f.db.close();}
});
test('CSV deletion reviews exact file, preserves worked leads and other files, archives assignments, and tolerates retries',async()=>{
 const f=await fixture();try{await f.command(owner,'import',null,{rows:Array.from({length:6},(_,i)=>({company_name:'Synthetic '+i,usdot:String(9100000+i),notes:'Imported source columns: {}'}))});const rows=(await f.db.query('select * from sales_prospects order by usdot')).rows;
 await f.command(owner,'assign',rows[0].id,{rep_id:rep1});await f.db.query("update sales_prospects set disposition='Do Not Contact' where id=$1",[rows[1].id]);await f.db.query("insert into sales_activity(actor_id,prospect_id,action) values($1,$2,'call')",[rep1,rows[2].id]);await f.db.query("insert into sales_applications(prospect_id,rep_id) values($1,$2)",[rows[3].id,rep1]);await f.db.query('update sales_prospects set follow_up_at=now() where id=$1',[rows[4].id]);
 const input='company_name,usdot\n'+rows.slice(0,5).map(p=>p.company_name+','+p.usdot).join('\n');const reviewed=await f.reviewUploadedLeads(input);assert.equal(reviewed.leads.length,1);assert.equal(reviewed.protected,4);
 await assert.rejects(f.deleteUploadedLeads({leads:reviewed.leads}));assert.deepEqual(await f.deleteUploadedLeads({confirm:true,leads:reviewed.leads}),{deleted:1,alreadyDeleted:0,skipped:[]});assert.equal((await f.db.query('select count(*)::int n from sales_prospects')).rows[0].n,5);assert.equal((await f.db.query("select count(*)::int n from sales_activity where action='assign' and prospect_id is null and details->>'original_prospect_id'=$1",[rows[0].id])).rows[0].n,1);assert.equal((await f.db.query("select count(*)::int n from sales_activity where action='uploaded-lead-delete-reviewed'")).rows[0].n,1);
 assert.deepEqual(await f.deleteUploadedLeads({confirm:true,leads:reviewed.leads}),{deleted:0,alreadyDeleted:1,skipped:[]});assert.equal((await f.reviewUploadedLeads(input)).leads.length,0);
 }finally{await f.db.close();}
});
test('changed lead revisions are protected; job titles preserve metadata and cannot grant roles; all management functions require owner',async()=>{
 const f=await fixture();try{await f.command(owner,'import',null,{rows:[{company_name:'Synthetic',usdot:'9990001',notes:'Imported source columns: {}'}]});const reviewed=await f.reviewUploadedLeads('company_name,usdot\nSynthetic,9990001');await f.db.query('update sales_prospects set revision=revision+1');assert.equal((await f.deleteUploadedLeads({confirm:true,leads:reviewed.leads})).skipped.length,1);
 await f.saveEmployeePosition({id:rep1,job_title:'Operations Manager',role:'admin'});assert.deepEqual(f.accounts.get(rep1).user_metadata,{job_title:'Operations Manager',other:'preserve'});assert.equal((await f.db.query('select role from profiles where id=$1',[rep1])).rows[0].role,'carrier');
 f.deny();for(const run of [()=>f.leadSummary(),()=>f.previewLeadAllocation({}),()=>f.reviewUploadedLeads(''),()=>f.deleteUploadedLeads({}),()=>f.saveEmployeePosition({})])await assert.rejects(run(),/Owner required/);
 }finally{await f.db.close();}
});

test('936-lead real database flow: upload, duplicate retry, exact redistribution, unassign, reassign, deletion retry and replacement upload',async()=>{
 const f=await fixture();try{
  await f.command(owner,'import',null,{rows:[{company_name:'Unrelated file stays',usdot:'7777777',notes:'Imported source columns: {}'}]});
  const unrelated=(await f.db.query("select id from sales_prospects where usdot='7777777'")).rows[0];await f.command(owner,'assign',unrelated.id,{rep_id:rep2});
  const input='Legal name,USDOT\n'+Array.from({length:936},(_,i)=>'Synthetic carrier '+i+','+(9200000+i)).join('\n');const parsed=readImport(input),plan=planImport(parsed.headers,parsed.rows,defaultMapping(parsed.headers));
  let imported=0;for(const batch of plan.batches)imported+=(await f.importAssignedLeads(batch.csv,rep1)).imported;assert.equal(imported,936);
  for(const batch of plan.batches){const result=await f.importAssignedLeads(batch.csv,rep1);assert.equal(result.imported,0);assert.equal(result.assigned,batch.count);}
  const count=async id=>(await f.leadSummary()).people.find(p=>p.user_id===id).assigned_count;assert.equal(await count(rep1),936);
  const move=await f.previewLeadAllocation({rep_id:rep2,source_id:rep1,quantity:100});assert.equal(move.leads.length,100);
  for(let i=0;i<move.leads.length;i+=20){const result=await f.assign({rep_id:rep2,reassign:true,leads:move.leads.slice(i,i+20)});assert.ok(result.results.every(r=>r.ok));}
  assert.equal(await count(rep1),836);assert.equal(await count(rep2),101);
  const release=await f.previewLeadAllocation({rep_id:null,source_id:rep1,quantity:36});for(let i=0;i<release.leads.length;i+=20)await f.assign({rep_id:null,reassign:true,leads:release.leads.slice(i,i+20)});
  assert.equal(await count(rep1),800);assert.equal((await f.leadSummary()).unassigned,36);
  const reclaim=await f.previewLeadAllocation({rep_id:rep1,quantity:36});for(let i=0;i<reclaim.leads.length;i+=20)await f.assign({rep_id:rep1,leads:reclaim.leads.slice(i,i+20)});assert.equal(await count(rep1),836);
  assert.equal((await f.as(rep1,'authenticated','select count(*)::int n from sales_prospects')).rows[0].n,836);
  const reviewed=[];for(const batch of plan.batches)reviewed.push(...(await f.reviewUploadedLeads(batch.csv)).leads);assert.equal(reviewed.length,936);
  const first=reviewed.slice(0,20);assert.equal((await f.deleteUploadedLeads({confirm:true,leads:first})).deleted,20);
  assert.deepEqual(await f.deleteUploadedLeads({confirm:true,leads:first}),{deleted:0,alreadyDeleted:20,skipped:[]});
  let deleted=20;for(let i=20;i<reviewed.length;i+=20){const result=await f.deleteUploadedLeads({confirm:true,leads:reviewed.slice(i,i+20)});deleted+=result.deleted;assert.equal(result.skipped.length,0);}
  assert.equal(deleted,936);assert.equal(await count(rep1),0);assert.equal(await count(rep2),1);assert.equal((await f.db.query('select count(*)::int n from sales_prospects')).rows[0].n,1);
  for(const batch of plan.batches)assert.equal((await f.reviewUploadedLeads(batch.csv)).leads.length,0);
  for(const batch of plan.batches)assert.equal((await f.importAssignedLeads(batch.csv,rep1)).imported,batch.count);
  assert.equal(await count(rep1),936);assert.equal(await count(rep2),1);assert.equal((await f.as(rep1,'authenticated','select count(*)::int n from sales_prospects')).rows[0].n,936);
 }finally{await f.db.close();}
});
