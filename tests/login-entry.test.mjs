import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
test('Sales login always renders the password form for existing Owner/Sales sessions and signed-out visitors',async()=>{
 const Login=()=>null;let sessionChecks=0;
 const imports={'@/components/sales/login-form':{default:Login},'react/jsx-runtime':{jsx:type=>({type})},'@/lib/sales/server':{salesEntryDestination:async()=>{sessionChecks++;throw Error('Existing session must not skip login');}},'next/navigation':{redirect:()=>{throw Error('Login entry must not redirect');}}};
 const loaded={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/app/sales/login/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>{assert.ok(imports[name],name);return imports[name];},loaded,loaded.exports);
 for(const registration of [undefined,'complete'])assert.equal((await loaded.exports.default({searchParams:Promise.resolve({registration})})).type,Login);
 assert.equal(sessionChecks,0);
 const form=fs.readFileSync('src/components/sales/login-form.tsx','utf8');assert.match(form,/signInWithIdentity/);assert.match(form,/type="password"/);
});
