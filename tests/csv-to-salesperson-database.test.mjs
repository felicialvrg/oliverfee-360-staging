import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
import {database} from './helpers/import-sales-db.mjs';import * as csv from '../src/lib/sales/csv.ts';import * as validation from '../src/lib/sales/validation.ts';
const owner='d5f443af-ac3a-42b2-8294-6fbf51f73beb',rep1='11111111-1111-4111-8111-111111111111',rep2='22222222-2222-4222-8222-222222222222';
class SalesError extends Error{constructor(message,status=400){super(message);this.status=status;}}
async function fixture(){
 const {db,as,command}=await database();let allowed=true,race=false,imports=0;
 const client={from(table){let user;return {select(){return this;},eq(_key,value){user=value;return this;},async maybeSingle(){return {data:(await as(owner,'authenticated','select status from sales_representatives where user_id=$1',[user])).rows[0]||null,error:null};},async in(key,values){assert.equal(table,'sales_prospects');assert.equal(key,'usdot');return {data:(await as(owner,'authenticated','select id,usdot,assigned_to,revision from sales_prospects where usdot=any($1::text[])',[values])).rows,error:null};}};}};
 const admin={from(table){let patch,ids,revision;const q={update(value){patch=value;return q;},in(key,values){assert.equal(key,'id');ids=values;return q;},eq(key,value){assert.equal(key,'revision');revision=value;return q;},is(key,value){assert.equal(key,'assigned_to');assert.equal(value,null);return q;},async select(){if(race){race=false;await db.query('update sales_prospects set assigned_to=$1,revision=revision+1 where id=any($2::uuid[])',[rep2,ids]);}return {data:(await db.query('update sales_prospects set assigned_to=$1,revision=$2,assigned_at=$3,updated_at=$4 where id=any($5::uuid[]) and revision=$6 and assigned_to is null returning id',[patch.assigned_to,patch.revision,patch.assigned_at,patch.updated_at,ids,revision])).rows,error:null};},async insert(rows){assert.equal(table,'sales_activity');for(const row of rows)await db.query('insert into sales_activity(actor_id,prospect_id,action,details) values($1,$2,$3,$4)',[row.actor_id,row.prospect_id,row.action,JSON.stringify(row.details)]);return {error:null};}};return q;}};
 const importsMap={'server-only':{},'@/lib/supabase/server':{createClient:async()=>client},'@/lib/supabase/admin':{createAdminClient:()=>admin},'./server':{SalesError,actor:async management=>{assert.equal(management,true);if(!allowed)throw new SalesError('Owner required',403);return {id:owner};},command:async(...args)=>{imports++;return command(owner,...args);}},'./validation':validation,'./csv':csv};
 const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/lib/sales/import-assigned.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{assert.ok(importsMap[name],name);return importsMap[name];},module,module.exports);
 return {db,as,command,run:module.exports.importAssignedLeads,deny(){allowed=false;},race(){race=true;},get imports(){return imports;}};
}
test('one CSV assigns only that file to one salesperson, preserves other files/owners/details, and safely retries without duplicates',async()=>{
 const f=await fixture();try{
  await f.command(owner,'import',null,{rows:[{company_name:'Existing unassigned in file',usdot:'9000001',notes:'Keep original notes'},{company_name:'Already with another rep',usdot:'9000002',notes:'Other rep notes'},{company_name:'Unrelated unassigned file',usdot:'9000003',notes:'Do not assign this'}]});
  const other=(await f.db.query("select id from sales_prospects where usdot='9000002'")).rows[0];await f.command(owner,'assign',other.id,{rep_id:rep2});
  const input='company_name,usdot,notes\nChanged name,9000001,Do not overwrite\nOther rep,9000002,Do not overwrite\nNew file lead,9000004,New notes';
  assert.deepEqual(await f.run(input,rep1),{imported:1,duplicates:2,assigned:2,protected:1});
  assert.deepEqual(await f.run(input,rep1),{imported:0,duplicates:3,assigned:2,protected:1});
  const saved=(await f.db.query('select usdot,assigned_to,notes,revision from sales_prospects order by usdot')).rows;
  assert.equal(saved.length,4);assert.equal(saved[0].assigned_to,rep1);assert.equal(saved[0].notes,'Keep original notes');assert.equal(saved[0].revision,1);assert.equal(saved[1].assigned_to,rep2);assert.equal(saved[1].notes,'Other rep notes');assert.equal(saved[2].assigned_to,null);assert.equal(saved[3].assigned_to,rep1);
  assert.deepEqual((await f.as(rep1,'authenticated','select usdot from sales_prospects order by usdot')).rows.map(r=>r.usdot),['9000001','9000004']);assert.deepEqual((await f.as(rep2,'authenticated','select usdot from sales_prospects')).rows.map(r=>r.usdot),['9000002']);
  assert.equal((await f.db.query("select count(*)::int n from sales_activity where details->>'source'='csv-upload'")).rows[0].n,2);
 }finally{await f.db.close();}
});
test('non-owner, inactive target, invalid CSV and excessive batch are rejected before any lead import',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.run('company_name,usdot\nSynthetic,12345','not-a-uuid'));
  await assert.rejects(f.run('company_name,usdot\nSynthetic,invalid',rep1));
  await assert.rejects(f.run('company_name,usdot\n'+Array.from({length:201},(_,i)=>'Synthetic,'+(9000000+i)).join('\n'),rep1));
  await f.command(owner,'rep-update',rep1,{status:'inactive',commission_mode:'none',commission_value:0});await assert.rejects(f.run('company_name,usdot\nSynthetic,12345',rep1),/active salesperson/);
  f.deny();await assert.rejects(f.run('company_name,usdot\nSynthetic,12345',rep2),/Owner required/);assert.equal(f.imports,0);assert.equal((await f.db.query('select count(*)::int n from sales_prospects')).rows[0].n,0);
 }finally{await f.db.close();}
});
test('a concurrent assignment to another salesperson wins over upload assignment',async()=>{
 const f=await fixture();try{f.race();assert.deepEqual(await f.run('company_name,usdot\nSynthetic race,9999911',rep1),{imported:1,duplicates:0,assigned:0,protected:1});assert.equal((await f.db.query("select assigned_to from sales_prospects where usdot='9999911'")).rows[0].assigned_to,rep2);}finally{await f.db.close();}
});
