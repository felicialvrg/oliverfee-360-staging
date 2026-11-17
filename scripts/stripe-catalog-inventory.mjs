import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export const requestedPlans=[
 {name:'Basic',introCents:2500,regularCents:4999},
 {name:'Pro',introCents:3500,regularCents:6999},
 {name:'Premium',introCents:5000,regularCents:9999},
 {name:'Ultimate',introCents:9950,regularCents:19900},
];
function normalize(value){return typeof value==='string'?value.toLowerCase().replace(/[^a-z0-9]/g,''):'';}
export function matchesPlan(product,name){
 const plan=normalize(name),value=normalize(product.name);
 return [plan,plan+'plan',plan+'membership',plan+'membershipplan',plan+'officeinyourpocket',plan+'oliverfee360','oliverfee360'+plan,'oliverfee360'+plan+'plan','oliverfee360'+plan+'membership','officeinyourpocket'+plan].includes(value)
  ||normalize(product.metadata?.oliverfee_plan)===plan;
}
export function usablePrice(price,cents,live){return price.active===true&&price.livemode===live&&price.currency==='usd'&&price.unit_amount===cents&&price.type==='recurring'&&price.billing_scheme==='per_unit'&&!price.transform_quantity&&price.recurring?.interval==='month'&&price.recurring?.interval_count===1&&price.recurring?.usage_type==='licensed'&&!price.recurring?.trial_period_days;}

export async function inventory(env=process.env,transport=fetch){
 const missing=['STRIPE_SECRET_KEY','SALES_STRIPE_ACCOUNT_ID'].filter(k=>!env[k]?.trim());
 const base={schema:1,operation:'read-only-inventory',checkedAt:new Date().toISOString(),chargesCreated:0,subscriptionsChanged:0};
 if(missing.length)return {...base,status:'missing_configuration',missing};
 const key=env.STRIPE_SECRET_KEY.trim(),expected=env.SALES_STRIPE_ACCOUNT_ID.trim();
 if(!/^sk_(live|test)_/.test(key)||!/^acct_[A-Za-z0-9]+$/.test(expected))return {...base,status:'invalid_configuration_format'};
 const live=key.startsWith('sk_live_');
 async function get(path){
  const r=await transport('https://api.stripe.com/v1'+path,{method:'GET',headers:{Authorization:'Bearer '+key,'Stripe-Version':'2024-06-20'},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('stripe_http_'+r.status);
  return r.json();
 }
 async function list(path){
  const values=[];let cursor;
  for(let page=0;page<10;page++){
   const query=new URLSearchParams({limit:'100',...(cursor?{starting_after:cursor}:{})});
   const data=await get(path+(path.includes('?')?'&':'?')+query);
   if(!Array.isArray(data.data)||typeof data.has_more!=='boolean')throw Error('invalid_catalog_response');
   values.push(...data.data);if(!data.has_more)return values;
   const next=data.data.at(-1)?.id;if(typeof next!=='string'||next===cursor)throw Error('invalid_catalog_cursor');cursor=next;
  }
  throw Error('catalog_requires_manual_pagination_review');
 }
 try{
  const account=await get('/account');
  if(account.id!==expected)return {...base,status:'account_mismatch',accountVerified:false};
  const products=[...await list('/products?active=true'),...await list('/products?active=false')];
  const prices=[...await list('/prices?active=true&type=recurring'),...await list('/prices?active=false&type=recurring')];
  const plans=requestedPlans.map(plan=>({
   ...plan,promotionalMonthlyPeriods:12,
   candidates:products.filter(p=>matchesPlan(p,plan.name)).map(product=>({
    id:product.id,name:product.name,active:product.active,livemode:product.livemode,
    prices:prices.filter(p=>p.product===product.id).map(p=>({id:p.id,active:p.active,livemode:p.livemode,currency:p.currency,unitAmount:p.unit_amount,interval:p.recurring?.interval,intervalCount:p.recurring?.interval_count,billingScheme:p.billing_scheme,usageType:p.recurring?.usage_type,taxBehavior:p.tax_behavior,introMatch:usablePrice(p,plan.introCents,live),regularMatch:usablePrice(p,plan.regularCents,live)})),
   })),
  }));
  return {...base,status:'inspected',mode:live?'live':'test',accountVerified:true,chargesEnabled:account.charges_enabled===true,productsScanned:products.length,pricesScanned:prices.length,plans};
 }catch(error){const message=String(error?.message||'');return {...base,status:'inspection_failed',reason:/^(stripe_http_\d{3}|invalid_catalog_response|invalid_catalog_cursor|catalog_requires_manual_pagination_review)$/.test(message)?message:'provider_request_unavailable'};}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await inventory();await fs.mkdir('public',{recursive:true});
 // Only approved public plan names, catalog IDs and boolean checks are emitted.
 // Never write API keys, account IDs, customer records or arbitrary provider errors.
 await fs.writeFile('public/stripe-catalog-inventory.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({stripeCatalogInventory:result.status,accountVerified:result.accountVerified===true,mode:result.mode||null}));
}
