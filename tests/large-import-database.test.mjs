import test from 'node:test';import assert from 'node:assert/strict';
import {database} from './helpers/import-sales-db.mjs';
import {csvText,readImport,defaultMapping,planImport} from '../src/lib/sales/large-import.ts';
import {importProspects} from '../src/lib/sales/csv.ts';
const owner='d5f443af-ac3a-42b2-8294-6fbf51f73beb',rep1='11111111-1111-4111-8111-111111111111',rep2='22222222-2222-4222-8222-222222222222';
test('1,203 synthetic leads import across interruption/retry, preserve MC/address and enforce assigned-only/reassignment access',async()=>{
 const {db,command,as}=await database();try{
 const csv=csvText([['LEGAL_NAME','DOT_NUMBER','MC_NUMBER','address'],...Array.from({length:1203},(_,i)=>['SYNTHETIC Import '+i,String(80000000+i),'MC'+i,'123 Synthetic Street'])]),source=readImport(csv),plan=planImport(source.headers,source.rows,defaultMapping(source.headers));
 let imported=0;const send=async batch=>{const rows=importProspects(batch.csv).rows;return command(owner,'import',null,{rows});};
 for(const batch of plan.batches.slice(0,2))imported+=(await send(batch)).imported;
 const retry=await send(plan.batches[0]);assert.equal(retry.imported,0);assert.equal(retry.duplicates,200);
 for(const batch of plan.batches.slice(2))imported+=(await send(batch)).imported;assert.equal(imported,1203);
 const records=(await db.query('select * from sales_prospects order by usdot')).rows;assert.equal(records.length,1203);assert.match(records[0].notes,/MC_NUMBER/);assert.match(records[0].notes,/123 Synthetic Street/);
 for(const record of records.slice(0,1000))await command(owner,'assign',record.id,{rep_id:rep1});
 assert.equal((await as(rep1,'authenticated','select id from sales_prospects')).rows.length,1000);assert.equal((await as(rep2,'authenticated','select id from sales_prospects')).rows.length,0);
 for(const record of records.slice(0,10))await command(owner,'assign',record.id,{rep_id:rep2});for(const record of records.slice(10,20))await command(owner,'assign',record.id,{rep_id:null});
 assert.equal((await as(rep1,'authenticated','select id from sales_prospects')).rows.length,980);assert.equal((await as(rep2,'authenticated','select id from sales_prospects')).rows.length,10);
 await assert.rejects(command(rep1,'assign',records[0].id,{rep_id:rep1}),/Owner required/);
 }finally{await db.close();}
});
