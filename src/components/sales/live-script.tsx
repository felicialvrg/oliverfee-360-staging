"use client";
import type {Prospect,Representative} from '@/lib/sales/types';

/** Read-only sales guidance. Recording consent is not claimed or stored here. */
export function LiveSalesScript({prospect,representative,busy,onRecord,open=false}:{prospect:Prospect;representative:Representative|null;busy:boolean;onRecord:(objection:string)=>void;open?:boolean}){
 const objections:[string,string][]=[
  ["I'm not interested.","I understand. Before I let you go, may I ask whether you're handling your permits and compliance yourself or have someone assisting you? If the customer clearly declines further conversation, politely end the call and record the disposition."],
  ["I already have somebody.","That's great! We're not asking you to replace anyone. OliverFee 360 can also help with individual permits, filings, or additional compliance services whenever you need extra support."],
  ["How much does it cost?","That's a good question. It depends on what your company needs. Different permits have different government fees, and our service fees depend on the services involved. We can prepare an itemized quote showing the government fees and OliverFee 360 service fees separately, so you know the cost before making a decision."],
  ["I'm busy.","No problem. I know you're busy keeping those trucks moving. Would later today or tomorrow be better for a quick conversation?"],
  ["I don't need permits.","You may already have everything you need. Permit requirements depend on where you're operating, your equipment, and what you're transporting. We can review your operation to see what may apply."],
  ["Is this the DOT?","No. OliverFee 360 is an independent third-party transportation and compliance service provider. We're not the DOT, FMCSA, or another government agency."],
  ["Send me information.","Absolutely. I'd be happy to send you information about our services. What's the best email address for you?"],
  ["I need to think about it.","Of course. We can prepare an itemized quote so you can review everything before making a decision."],
  ["I don't want to give my credit card information over the phone.","I understand completely. You don't have to give me your card information. We'll send you a secure payment link so you can enter it yourself."],
  ["Are there hidden fees?","We provide an itemized breakdown showing the applicable government fees, our service fees, and any additional charges before you pay."]
 ];
 return <details className="sales-live-script" open={open||undefined}><summary>Open sales script</summary>
  <p className="sales-notice">The script is guidance. Recording-consent capture and call-provider integration are not yet connected; no call recording is enabled here.</p>
  <h3>Recording permission</h3><p>Before we get started, I want to let you know that our calls may be recorded for quality assurance and training purposes. Do I have your permission to record this conversation?</p>
  <h3>Opening</h3><p>Hello, is this {prospect.company_name}? May I speak with {prospect.contact_name||'the owner or contact'}?</p><p>Hi, {prospect.contact_name||'[Customer Name]'}. My name is {representative?.name||'[Salesperson Name]'}, and I&apos;m calling from OliverFee 360. How are you doing today?</p><p>We help trucking companies with DOT drug and alcohol testing consortium services, transportation permits, MCS-150 filings, and DOT compliance support. We also help companies organize their transportation paperwork and identify requirements that may apply to their operations. Our goal is to make managing those requirements easier so you can focus on running your trucking business.</p>
  <h3>Qualification</h3><p>Are you currently operating your trucking business, or are you getting ready to start?</p><p>If operating: Are you operating interstate, crossing state lines, or primarily operating within one state?</p><p>If interstate: Are you operating for-hire or as a private carrier?</p><p>Do you currently have an active USDOT number and MC operating authority, if required for your business?</p><p>Are you currently enrolled in a DOT drug and alcohol testing consortium? Are your MCS-150 filings up to date? Are you handling your permits and compliance yourself, or does someone help you?</p>
  <h3>Carrier checklist transition</h3><p>Based on what you&apos;ve shared, there are a few things we can review to help you understand which permits and compliance services may apply to your operation. Do you have a few minutes for us to go through a carrier checklist together? It will help us prepare an itemized quote showing the services and fees, so you can review everything before making a decision.</p>
  <details><summary>View rebuttals</summary>{objections.map(([objection,response])=><div className="sales-script-objection" key={objection}><h4>{objection}</h4><p>{response}</p><button type="button" className="sales-secondary" disabled={busy||prospect.disposition==='Do Not Contact'} onClick={()=>onRecord(objection)}>Record objection in lead notes</button></div>)}</details>
 </details>;
}
