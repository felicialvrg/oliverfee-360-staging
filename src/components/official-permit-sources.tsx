"use client";
import {useState} from 'react';
import {statePermitSources,directoryReviewedOn,fhwaPermitDirectory,iftaJurisdictionDirectory} from '@/lib/official-permit-sources';
const references=[
 ['FMCSA authority requirements and filing fees','https://www.fmcsa.dot.gov/registration/get-mc-number-authority-operate'],
 ['UCR official fleet-size fee brackets','https://plan.ucr.gov/fee-brackets/'],
 ['IRS EIN application and requirements','https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number'],
 ['PHMSA hazardous materials registration and fees','https://www.phmsa.dot.gov/registration/registration-overview'],
 ['State oversize / overweight permit offices',fhwaPermitDirectory],
 ['IFTA jurisdiction tax agencies',iftaJurisdictionDirectory],
 ['IRP jurisdiction registration information','https://www.irponline.org/page/Jurisdiction_Info'],
 ['State revenue agency lookup','https://www.sba.gov/counseling/launch-your-business/department-of-revenue-lookup/'],
 ['Business registration and license guidance','https://www.sba.gov/counseling/launch-your-business/'],
] as const;
export function OfficialPermitSources({jurisdictions}:{jurisdictions:string[]}){
 const [filter,setFilter]=useState(''),[all,setAll]=useState(false);
 const selected=statePermitSources.filter(s=>jurisdictions.includes(s.code));
 const entries=(all||!selected.length?statePermitSources:selected).filter(s=>(s.code+' '+s.name).toLowerCase().includes(filter.trim().toLowerCase()));
 return <section className="card official-permit-sources" aria-label="Official permit and fee sources"><h2>Government permit &amp; fee lookup links</h2>
 <p>Open an official agency or program directory, verify the exact permit and charges, then return to the existing customer application and quote workflow. Links open in a new tab so your portal remains open.</p>
 <p>Directory references checked {directoryReviewedOn}. A directory listing does not verify a fee, complete application, route approval or government authorization. Local permits, trip/registration requirements and special operations can need additional agency confirmation.</p>
 <div className="permit-source-grid">{references.map(([label,url])=><a className="btn-secondary" key={url} href={url} target="_blank" rel="noopener noreferrer">{label} (opens new tab)</a>)}</div>
 <details open={selected.length>0}><summary>State permit and fuel-tax offices — all 50 states and Washington DC</summary>
 <label>Filter government offices by state<input className="field" value={filter} maxLength={100} onChange={e=>setFilter(e.target.value)}/></label>
 {selected.length>0&&<button type="button" className="btn-secondary" onClick={()=>setAll(v=>!v)}>{all?'Show selected states':'Browse all states'}</button>}
 <p role="status">{entries.length} jurisdiction offices</p><div className="permit-source-grid">{entries.map(s=><article key={s.code} data-state-source={s.code}><h3>{s.name} ({s.code})</h3>
 <p><a className="btn-secondary" href={s.oversize} target="_blank" rel="noopener noreferrer">{s.oversizeDirect?'Open state permit office':'Find permit office in FHWA directory'} (opens new tab)</a></p>
 <p><a className="btn-secondary" href={s.fuelTax} target="_blank" rel="noopener noreferrer">{s.fuelTaxDirect?'Open state fuel-tax agency':'Open IFTA jurisdiction directory'} (opens new tab)</a></p>
 {!s.iftaListed&&<p>IFTA participation and fuel/trip requirements require agency confirmation for this jurisdiction.</p>}
 <small>Office reference only. Official fee requires verification for the exact permit, year, vehicles and route.</small></article>)}</div>{!entries.length&&<p>No matching office. Check the state name or use the official directories above.</p>}</details>
 </section>;
}
