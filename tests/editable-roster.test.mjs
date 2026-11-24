import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function load(file,imports){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(key=>{assert.ok(key in imports,key);return imports[key];},module,module.exports);return module.exports;}
test('name changes require Owner and update only the selected representative display name',async()=>{
 let owner=false,patch,writes=0;const id='11111111-1111-4111-8111-111111111111';
 const {renameRepresentative}=load('src/lib/sales/representative-name.ts',{'server-only':{},'@/lib/supabase/admin':{createAdminClient:()=>({from(table){assert.equal(table,'sales_representatives');return {update(value){patch=value;writes++;return {eq(key,value){assert.equal(key,'user_id');assert.equal(value,id);return {select:()=>({single:async()=>({data:{user_id:id,name:patch.name},error:null})})};}};}};}})},'./server':{actor:async required=>{assert.equal(required,true);if(!owner)throw Error('Owner required');},SalesError:Error},'./validation':{uuid:value=>{assert.equal(value,id);return value;}}});
 await assert.rejects(renameRepresentative(id,'Chris Hudson'),/Owner required/);assert.equal(writes,0);owner=true;
 await assert.rejects(renameRepresentative(id,' '));await assert.rejects(renameRepresentative(id,'Bad\nName'));assert.equal(writes,0);
 assert.equal((await renameRepresentative(id,' Christopher Hudson ')).name,'Christopher Hudson');assert.deepEqual(Object.keys(patch).sort(),['name','updated_at']);assert.equal(writes,1);
});
test('roster loads beyond 500 representatives and fails rather than returning a partial roster',async()=>{
 const {representativeRoster}=load('src/lib/sales/representative-roster.ts',{});const all=Array.from({length:1203},(_,i)=>({user_id:String(i)})),ranges=[];
 const client={from:()=>({select:()=>({order:key=>{assert.equal(key,'user_id');return {range:async(a,b)=>{ranges.push([a,b]);return {data:all.slice(a,b+1),error:null};}};}})})};
 const result=await representativeRoster(client);assert.equal(result.data.length,1203);assert.deepEqual(ranges,[[0,499],[500,999],[1000,1499],[1203,1702]]);
 const failure=await representativeRoster({from:()=>({select:()=>({order:()=>({range:async()=>({data:null,error:Error('unavailable')})})})})});assert.equal(failure.data,null);assert.ok(failure.error);
});
