"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {readImport,defaultMapping,planImport,IMPORT_LIMITS} from '@/lib/sales/large-import';
type Person={user_id:string;name:string;status:string;assigned_count:number;job_title:string};
type Lead={id:string;company_name:string;usdot:string;assigned_to:string|null;revision:number};
type Job={kind:'assign'|'delete';leads:Lead[];cursor:number;success:number;skipped:number;absent:number;target:string|null;source:string;recipient:string};
const UNASSIGNED='__unassigned__';

export function LeadManagement({preview=false,onComplete,refreshToken}:{refreshToken?:unknown;preview?:boolean;onComplete:()=>Promise<void>}){
 const [people,setPeople]=useState<Person[]>([]),[unassigned,setUnassigned]=useState(0),[source,setSource]=useState(''),[target,setTarget]=useState(''),[quantity,setQuantity]=useState(100);
 const [allocation,setAllocation]=useState<Lead[]|null>(null),[deletion,setDeletion]=useState<Lead[]|null>(null),[protectedCount,setProtectedCount]=useState(0);
 const [busy,setBusy]=useState(false),[job,setJob]=useState<Job|null>(null),[error,setError]=useState(''),[warning,setWarning]=useState(''),[message,setMessage]=useState('');
 const running=useRef(false),pause=useRef(false),generation=useRef(0);
 const locked=busy||!!job;
 const load=useCallback(async(countsOnly=false)=>{
  if(preview)return;const version=++generation.current;
  const r=await fetch('/admin/api/sales/manage-leads'+(countsOnly?'?countsOnly=true':''),{cache:'no-store',signal:AbortSignal.timeout(30000)}),d=await r.json();
  if(!r.ok)throw Error(d.error||'Lead counts unavailable.');
  if(version===generation.current){setPeople(previous=>d.people.map((p:Person)=>({...p,job_title:p.job_title||previous.find(old=>old.user_id===p.user_id)?.job_title||'Salesperson'})));setUnassigned(d.unassigned);setWarning('');}
 },[preview]);
 useEffect(()=>{void load().catch(e=>setWarning(e.message));},[load,refreshToken]);
 useEffect(()=>()=>{pause.current=true;generation.current++;},[]);
 async function refreshCounts(countsOnly=false){try{await load(countsOnly);}catch{setWarning('Counts could not refresh. Your confirmed changes are saved; use Refresh counts.');}}
 async function post(body:Record<string,unknown>,url='/admin/api/sales/manage-leads'){
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)}),d=await r.json();
  if(!r.ok)throw Error(d.error||'Lead update failed.');return d;
 }
 async function work(fn:()=>Promise<void>){
  if(running.current)return;running.current=true;setBusy(true);setError('');setMessage('');
  try{if(preview){setMessage('Preview only. No live records changed.');return;}await fn();}
  catch(e){setError(e instanceof Error?e.message:'Update could not be confirmed.');}
  finally{running.current=false;setBusy(false);}
 }
 async function runJob(initial:Job){
  if(running.current)return;running.current=true;pause.current=false;setBusy(true);setError('');setMessage('');let next=initial;setJob(next);
  try{
   if(preview){setJob(null);setMessage('Preview only. No live records changed.');return;}
   while(next.cursor<next.leads.length&&!pause.current){
    const batch=next.leads.slice(next.cursor,next.cursor+20);
    if(next.kind==='delete'){
     const d=await post({action:'delete-upload',confirm:true,leads:batch});const absent=Number(d.alreadyDeleted||0);
     if(!Number.isSafeInteger(d.deleted)||d.deleted<0||!Number.isSafeInteger(absent)||absent<0||!Array.isArray(d.skipped)||d.deleted+absent+d.skipped.length!==batch.length)throw Error('Deletion response could not be confirmed. Resume safely to check this batch.');
     next={...next,cursor:next.cursor+batch.length,success:next.success+d.deleted,absent:next.absent+absent,skipped:next.skipped+d.skipped.length};
    }else{
     const d=await post({rep_id:next.target,reassign:!!next.source,leads:batch},'/admin/api/sales/leads');
     if(!Array.isArray(d.results)||d.results.length!==batch.length||d.results.some((r:{ok:unknown})=>typeof r.ok!=='boolean'))throw Error('Assignment response could not be confirmed. Resume safely to check this batch.');
     next={...next,cursor:next.cursor+batch.length,success:next.success+d.results.filter((r:{ok:boolean})=>r.ok).length,skipped:next.skipped+d.results.filter((r:{ok:boolean})=>!r.ok).length};
    }
    setJob(next);await refreshCounts(true);
   }
   if(next.cursor===next.leads.length){
    setJob(null);setMessage(next.kind==='delete'?'Deletion complete: '+next.success+' deleted; '+next.absent+' already absent; '+next.skipped+' changed or protected.':'Assignment complete: '+next.success+' assigned to '+next.recipient+'; '+next.skipped+' changed or unavailable.');
    try{await onComplete();}catch{setWarning('Changes are saved. Refresh the dashboard to reload the latest records.');}
   }else setMessage('Paused after '+next.cursor+' of '+next.leads.length+'. Confirmed changes are saved.');
  }catch(e){
   setJob(next);setError((e instanceof Error?e.message:'Connection interrupted.')+' Processing stopped after '+next.cursor+' of '+next.leads.length+' confirmed leads. Click Resume to retry the first unconfirmed batch.');await refreshCounts(true);
  }finally{running.current=false;setBusy(false);}
 }
 function begin(kind:'assign'|'delete',leads:Lead[]){
  if(kind==='delete'&&!window.confirm('Delete these '+leads.length+' untouched uploaded leads? This removes them from employee calling lists.'))return;
  const recipient=target===UNASSIGNED?'Unassigned leads':people.find(p=>p.user_id===target)?.name||'selected employee';
  setAllocation(null);setDeletion(null);void runJob({kind,leads,cursor:0,success:0,skipped:0,absent:0,target:target===UNASSIGNED?null:target,source,recipient});
 }
 const recipients=people.filter(p=>p.status==='active'&&p.user_id!==source);
 return <section className="sales-panel">
  <div className="sales-panel-title"><h2>Employee lead counts and assignments</h2><button className="sales-secondary" onClick={()=>void refreshCounts()}>Refresh counts</button></div>
  <p>Unassigned leads: <strong>{unassigned}</strong></p>
  <div className="sales-lead-table"><table><thead><tr><th>Employee</th><th>Position</th><th>Status</th><th>Total assigned leads</th></tr></thead><tbody>{people.map(p=><tr key={p.user_id}>
   <td>{p.name}</td><td><form onSubmit={e=>{e.preventDefault();const title=new FormData(e.currentTarget).get('job_title');void work(async()=>{await post({action:'employee-position',id:p.user_id,job_title:title});await refreshCounts();setMessage('Job position saved.');});}}><input aria-label={'Job position for '+p.name} name="job_title" defaultValue={p.job_title} key={p.job_title} minLength={2} maxLength={120} required disabled={locked}/><button className="sales-secondary" disabled={locked}>Save position</button></form></td><td><span className="sales-status">{p.status}</span></td><td><strong>{p.assigned_count}</strong></td>
  </tr>)}</tbody></table></div>
  {job&&<div className="sales-operation" aria-live="polite"><h3>{job.kind==='delete'?'Deleting reviewed leads':'Assigning reviewed leads'}</h3><p>Processed {job.cursor} / {job.leads.length} · {job.success} {job.kind==='delete'?'deleted':'assigned'} · {job.absent} already absent · {job.skipped} protected or unavailable</p><progress aria-label="Lead operation progress" value={job.cursor} max={job.leads.length}/><div className="sales-actions">{busy?<button className="sales-secondary" onClick={()=>{pause.current=true;setMessage('Pausing after the current batch finishes.');}}>Pause processing</button>:<><button className="sales-primary" onClick={()=>void runJob(job)}>Resume processing</button><button className="sales-secondary" onClick={()=>{setJob(null);setError('');setMessage('Stopped. Changes already confirmed are saved.');}}>Stop here</button></>}</div><p>Keep this page open. If you reload, review the same CSV again to continue with records that remain.</p></div>}
  <h3>Assign a specific number of leads</h3><p>Choose where the leads are now, who receives them, and how many. Review before confirming. Leads are never split automatically.</p>
  <div className="sales-form-grid">
   <label>Take leads from<select value={source} disabled={locked} onChange={e=>{setSource(e.target.value);setTarget('');setAllocation(null);}}><option value="">Unassigned leads ({unassigned})</option>{people.filter(p=>p.assigned_count>0||p.status==='active').map(p=><option key={p.user_id} value={p.user_id}>{p.name} ({p.assigned_count})</option>)}</select></label>
   <label>Give leads to<select value={target} disabled={locked} onChange={e=>{setTarget(e.target.value);setAllocation(null);}}><option value="">Choose employee or unassigned pool</option>{source&&<option value={UNASSIGNED}>Unassigned leads — return to pool</option>}{recipients.map(p=><option key={p.user_id} value={p.user_id}>{p.name}</option>)}</select></label>
   <label>Number of leads<input type="number" min={1} max={10000} value={quantity} disabled={locked} onChange={e=>{setQuantity(Number(e.target.value));setAllocation(null);}}/></label>
   <button className="sales-primary" disabled={locked||!target||target===source||!Number.isSafeInteger(quantity)||quantity<1||quantity>10000} onClick={()=>void work(async()=>{const d=await post({action:'preview-allocation',rep_id:target===UNASSIGNED?null:target,source_id:source||null,quantity});setAllocation(d.leads);setMessage(d.leads.length+' available of '+quantity+' requested.');})}>Review assignment</button>
  </div>
  {!recipients.length&&<p>No other active employee is available. You can return leads to the unassigned pool. <a href="/admin/employees/new">Add an employee</a>; invited employees become available after completing setup.</p>}
  {allocation&&<div><p>Assign {allocation.length} leads from {people.find(p=>p.user_id===source)?.name||'Unassigned leads'} to {target===UNASSIGNED?'Unassigned leads':people.find(p=>p.user_id===target)?.name}.</p><ul>{allocation.slice(0,5).map(l=><li key={l.id}>{l.company_name} · {l.usdot}</li>)}</ul><button className="sales-primary" disabled={locked||!allocation.length} onClick={()=>begin('assign',allocation)}>Confirm assignment of {allocation.length} leads</button></div>}
  <h3>Delete uploaded leads and replace a batch</h3><p>Choose the original CSV to review matching leads. Only untouched imported leads can be deleted. Calls, follow-ups, applications, payments and Do Not Contact records are protected. Assignment history is archived.</p>
  <label>CSV to review for deletion<input type="file" accept=".csv,text/csv" disabled={locked} onChange={e=>{
   const file=e.target.files?.[0];e.target.value='';setDeletion(null);
   if(file)void work(async()=>{
    if(file.size>IMPORT_LIMITS.maxBytes)throw Error('Choose a CSV of 25 MB or smaller.');
    const parsed=readImport(await file.text()),plan=planImport(parsed.headers,parsed.rows,defaultMapping(parsed.headers));const rows:Lead[]=[];let protectedRows=0;
    for(const [index,batch] of plan.batches.entries()){const d=await post({action:'review-delete',csv:batch.csv});rows.push(...d.leads);protectedRows+=d.protected;setMessage('Reviewing CSV: '+(index+1)+' of '+plan.batches.length+' batches.');}
    setDeletion(rows);setProtectedCount(protectedRows);setMessage('Review complete: '+rows.length+' matching untouched leads can be deleted; '+protectedRows+' protected leads will stay. '+plan.issues.length+' invalid or duplicate rows excluded.');
   });
  }}/></label>
  {deletion&&<div><p>Review: {deletion.length} leads to delete; {protectedCount} protected. {deletion.slice(0,5).map(l=>l.company_name).join(', ')}</p><button className="sales-secondary" disabled={locked||!deletion.length} onClick={()=>begin('delete',deletion)}>Delete {deletion.length} reviewed uploaded leads</button></div>}
  {message&&<p role="status">{message}</p>}{warning&&<p role="status">{warning}</p>}{error&&<p role="alert" className="sales-error">{error}</p>}
 </section>;
}
