import {requireOwner} from '@/lib/admin/owner';
import {OfficialPermitSources} from '@/components/official-permit-sources';
export const dynamic='force-dynamic';
export default async function Page(){await requireOwner();return <main className="card"><h1>Permit &amp; Fee Lookup Center</h1><OfficialPermitSources jurisdictions={[]}/><p>Official fee requires verification. This directory does not create or save a customer estimate.</p><a className="btn" href="/admin/sales#application">Open existing customer quotes</a><p>Saved Smart Permit estimates and their invoice integration await verified database schema. Existing quotes and pricing are unchanged.</p></main>;}
