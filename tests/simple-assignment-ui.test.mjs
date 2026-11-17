import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import * as jsx from 'react/jsx-runtime';
for(const selectAll of [false,true])test('assignment needs only salesperson selection and automatically loads all unassigned leads: '+(selectAll?'whole team, multiple pages':'one salesperson'),async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test'});
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const prior=globalThis.fetch,calls=[];
 const rep={user_id:'rep1',name:'Synthetic Active',status:'active',rep_code:'TEST'},people=[rep,{user_id:'owner',name:'Felicia Oliver',rep_code:'OWNER'}];
 const leads=Array.from({length:selectAll?1003:3},(_,i)=>({id:'lead'+i,revision:0,assigned_to:selectAll&&i===999?'another-person':null}));
 globalThis.fetch=async(url,init)=>{calls.push({url,init});if(url.includes('salespeople'))return {ok:true,json:async()=>({salespeople:people})};if(init?.method!=='POST'){const p=new URL('https://example.test'+url).searchParams;assert.equal(p.get('unassigned'),'true');return {ok:true,json:async()=>({leads:leads.slice(Number(p.get('start'))-1,Number(p.get('end'))),total:leads.length})};}return {ok:true,json:async()=>({results:JSON.parse(init.body).leads.map(l=>({id:l.id,ok:true}))})};};
 const module={exports:{}};
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/components/sales/bulk-assignment.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(n=>n==='react'?React:jsx,module,module.exports);
 const root=createRoot(document.getElementById('root'));
 try{
  let refreshed=0;await act(async()=>root.render(React.createElement(module.exports.BulkLeadAssignment,{representatives:[rep,{...rep,user_id:'inactive',name:'Inactive',status:'inactive'}],preview:false,onComplete:async()=>refreshed++})));
  assert.equal(document.querySelectorAll('input[type="number"]').length,0);assert.equal(document.querySelector('[name="reassign"]'),null);assert.doesNotMatch(document.body.textContent,/Starting lead number|Ending lead number|range of saved leads/);
  assert.ok(!document.body.textContent.includes('Inactive'));assert.ok(document.body.textContent.includes('Felicia Oliver'));assert.equal(document.querySelector('button').disabled,true);
  await act(async()=>document.querySelector(selectAll?'[aria-label="Select all salespeople"]':'fieldset label:nth-of-type(2) input').click());
  await act(async()=>document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  const expected=selectAll?1002:3;assert.match(document.querySelector('[role="status"]').textContent,new RegExp(expected+' leads assigned'));assert.equal(refreshed,1);
  const reads=calls.filter(c=>c.url.includes('?start='));assert.equal(reads.length,selectAll?2:1);
  const writes=calls.filter(c=>c.init?.method==='POST').map(c=>JSON.parse(c.init.body));assert.ok(writes.every(w=>w.reassign===false&&w.leads.length<=20));
  const saved=writes.flatMap(w=>w.leads.map(l=>l.id));assert.equal(saved.length,expected);assert.equal(new Set(saved).size,expected);if(selectAll){assert.ok(!saved.includes('lead999'));assert.equal(writes.filter(w=>w.rep_id==='rep1').flatMap(w=>w.leads).length,501);assert.equal(writes.filter(w=>w.rep_id==='owner').flatMap(w=>w.leads).length,501);}else assert.ok(writes.every(w=>w.rep_id==='rep1'));
 }finally{await act(async()=>root.unmount());globalThis.fetch=prior;dom.window.close();}
});
