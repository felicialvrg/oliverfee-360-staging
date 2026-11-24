import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {IMPORT_LIMITS,readImport,defaultMapping,planImport,csvText,importErrorReport} from '../src/lib/sales/large-import.ts';
import {importProspects} from '../src/lib/sales/csv.ts';
test('50,000-row large file preserves every source column and produces bounded server-valid batches',()=>{
 const headers=['LEGAL_NAME','DOT_NUMBER','telephone','email','MC_NUMBER','PHY_STREET','CITY','STATE','custom note'];
 const data=Array.from({length:50_000},(_,i)=>['SYNTHETIC Carrier '+i,String(70000000+i),'2025550199','synthetic'+i+'@example.test','MC'+i,'100 Synthetic Street','Atlanta','GA','Synthetic data only '+'.'.repeat(220)]);
 const csv=csvText([headers,...data]),bytes=new TextEncoder().encode(csv).length;assert.ok(bytes>1_500_000&&bytes<=IMPORT_LIMITS.maxBytes);
 const source=readImport(csv),plan=planImport(source.headers,source.rows,defaultMapping(source.headers));assert.equal(plan.valid,50_000);assert.equal(plan.issues.length,0);assert.equal(plan.batches.reduce((n,b)=>n+b.count,0),50_000);
 for(const batch of plan.batches){assert.ok(batch.count<=200);assert.ok(new TextEncoder().encode(batch.csv).length<=600_000);const result=importProspects(batch.csv);assert.equal(result.errors.length,0);assert.equal(result.rows.length,batch.count);}
 const first=importProspects(plan.batches[0].csv).rows[0];assert.match(first.notes,/MC_NUMBER/);assert.match(first.notes,/100 Synthetic Street/);assert.match(first.notes,/custom note/);
 fs.writeFileSync('large-import-capacity-result.json',JSON.stringify({synthetic:true,sourceBytes:bytes,sourceRows:data.length,batches:plan.batches.length,valid:plan.valid,errors:plan.issues.length,maxBatchRows:Math.max(...plan.batches.map(b=>b.count)),maxBatchBytes:Math.max(...plan.batches.map(b=>new TextEncoder().encode(b.csv).length))},null,2));
});
test('mapping, invalid-first duplicate, malformed values and oversized metadata never silently discard leads',()=>{
 const headers=['Business','DOT','Email','MC','Address'];const rows=[['Bad','101','bad','1','x'],['Valid','101','valid@example.test','2','x'],['Duplicate','101','','3','x'],['=FORMULA','102','bad','4','x'],['Long','103','','5','x'.repeat(4100)]];
 const plan=planImport(headers,rows,{company_name:0,usdot:1,email:2});assert.equal(plan.valid,1);assert.equal(plan.duplicates,1);assert.equal(plan.issues.length,4);assert.equal(plan.total,5);assert.ok(importErrorReport(plan).includes("'=FORMULA"));assert.ok(importErrorReport(plan).includes('x'.repeat(4100)));
 assert.throws(()=>planImport(headers,rows,{company_name:0,usdot:0}),/only one/);assert.throws(()=>planImport(headers,rows,{}),/CSV headers must include/);assert.throws(()=>readImport('name,name\na,b'),/unique/);
});
