import {requireSales,salesData} from '@/lib/sales/server';
import {SalesWorkspace} from '@/components/sales/workspace';
import {FederalLookups} from '@/components/sales/federal-lookups';
import './sales.css';
export const dynamic='force-dynamic';
export default async function Sales(){await requireSales();try{return <><FederalLookups/><a className="btn" href="/sales/permit-lookup">Look Up Permits &amp; Fees</a><a className="btn" href="/sales/training">Training Center</a><SalesWorkspace initial={await salesData()}/></>;}catch{return <><FederalLookups/><a className="btn" href="/sales/permit-lookup">Look Up Permits &amp; Fees</a><main className="auth-wrap"><h1>Sales workspace unavailable</h1><p>Your sales account was checked, but the sales database is not ready or could not be loaded. Contact the administrator.</p><form action="/auth/signout" method="post"><button className="btn-secondary">Sign out</button></form></main></>;}}
