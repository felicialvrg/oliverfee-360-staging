import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

test('release email readiness reports booleans without credentials or sending mail',async()=>{
 const names=['RESEND_API_KEY','EMAIL_FROM','SALES_EMAIL_ENCRYPTION_KEY'];
 const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(new URL('../src/app/api/release/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('require','module','exports',code)(name=>{assert.equal(name,'@/lib/config');return {authConfigured:()=>true,requestsConfigured:()=>true};},module,module.exports);
 try{
  Object.assign(process.env,{RESEND_API_KEY:'synthetic-private-key',EMAIL_FROM:'Oliver Fee 360 <invitations@oliverfee360.com>',SALES_EMAIL_ENCRYPTION_KEY:'a'.repeat(64)});
  const response=await module.exports.GET();const body=await response.text();
  assert.deepEqual(JSON.parse(body).checks.invitationEmail,{providerKeyPresent:true,senderMatches:true,encryptionKeyValid:true});
  assert.ok(!body.includes('synthetic-private-key'));assert.ok(!body.includes('a'.repeat(64)));assert.match(response.headers.get('Cache-Control'),/no-store/);
  Object.assign(process.env,{RESEND_API_KEY:' ',EMAIL_FROM:'wrong@example.test',SALES_EMAIL_ENCRYPTION_KEY:'invalid'});
  assert.deepEqual((await (await module.exports.GET()).json()).checks.invitationEmail,{providerKeyPresent:false,senderMatches:false,encryptionKeyValid:false});
 }finally{for(const name of names)if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}
});
