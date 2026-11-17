import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {requestedPlans,matchesPlan,usablePrice} from './stripe-catalog-inventory.mjs';

// Operator-only catalog task. No customer, checkout, subscription, payment or
// refund endpoint is permitted. Existing products/prices are never updated.
export async function completeMembershipCatalog(env=process.env,transport=fetch){
 const key=env.STRIPE_SECRET_KEY||'',accountId=env.SALES_STRIPE_ACCOUNT_ID||'';
 if(!/^sk_live_/.test(key)||!/^acct_[A-Za-z0-9]+$/.test(accountId)||env.SALES_PAYMENTS_ENABLED!=='false'||env.SALES_LIVE_CHARGES_APPROVED==='true'||!['https://oliverfee360.com','https://oliverfee360.com/'].includes(env.NEXT_PUBLIC_SITE_URL))throw Error('catalog_configuration_guard');
 const writes=[];
 async function request(path,method='GET',body,idempotency){
  const endpoint=path.split('?')[0];
  if(method==='GET'&&!['/account','/products','/prices'].includes(endpoint)||method==='POST'&&!['/products','/prices'].includes(endpoint)||!['GET','POST'].includes(method))throw Error('catalog_endpoint_guard');
  const response=await transport('https://api.stripe.com/v1'+path,{method,headers:{Authorization:'Bearer '+key,'Stripe-Version':'2024-06-20',...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotency?{'Idempotency-Key':idempotency}:{})},body,signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('catalog_stripe_http_'+response.status);
  return response.json();
 }
 async function list(path){
  const rows=[];let cursor;
  for(let page=0;page<20;page++){
   const query=new URLSearchParams({limit:'100',...(cursor?{starting_after:cursor}:{})});
   const result=await request(path+'&'+query);
   if(!Array.isArray(result.data)||typeof result.has_more!=='boolean')throw Error('catalog_invalid_list');
   rows.push(...result.data);if(!result.has_more)return rows;
   const next=result.data.at(-1)?.id;if(typeof next!=='string'||next===cursor)throw Error('catalog_invalid_cursor');cursor=next;
  }
  throw Error('catalog_pagination_review');
 }
 const account=await request('/account');if(account.id!==accountId)throw Error('catalog_account_mismatch');
 // Fresh active AND archived catalog inspection completes before any writes.
 const products=[...await list('/products?active=true'),...await list('/products?active=false')];
 const prices=[...await list('/prices?active=true'),...await list('/prices?active=false')];
 for(const plan of requestedPlans){const candidates=products.filter(p=>matchesPlan(p,plan.name));if(candidates.length>1)throw Error('catalog_ambiguous_product_'+plan.name);if(candidates.length&&(!candidates[0].active||!candidates[0].livemode))throw Error('catalog_existing_product_needs_review_'+plan.name);}
 const result=[];
 for(const plan of requestedPlans){
  let product=products.find(p=>matchesPlan(p,plan.name));let productCreated=false;
  if(!product){
   const description=`$${(plan.introCents/100).toFixed(2)}/month for the first 12 successful monthly payments, then $${(plan.regularCents/100).toFixed(2)}/month. Government and third-party fees are separate.`;
   product=await request('/products','POST',new URLSearchParams({name:'OliverFee 360 '+plan.name,description,'metadata[oliverfee_plan]':plan.name,'metadata[catalog_version]':'membership-v1','metadata[website_payments]':'disabled'}),'oliverfee-catalog-live-v1-product-'+plan.name.toLowerCase());
   if(typeof product.id!=='string'||!product.id.startsWith('prod_')||product.active!==true||product.livemode!==true)throw Error('catalog_invalid_created_product');
   products.push(product);productCreated=true;writes.push({kind:'product',plan:plan.name,id:product.id});
  }
  const phases={};
  for(const [phase,cents] of [['intro',plan.introCents],['regular',plan.regularCents]]){
   let price=prices.filter(p=>p.product===product.id&&usablePrice(p,cents,true)).sort((a,b)=>String(a.id).localeCompare(String(b.id)))[0];let created=false;
   if(!price){
    const form=new URLSearchParams({product:product.id,currency:'usd',unit_amount:String(cents),billing_scheme:'per_unit','recurring[interval]':'month','recurring[interval_count]':'1','recurring[usage_type]':'licensed',lookup_key:'oliverfee360_'+plan.name.toLowerCase()+'_'+phase+'_usd_monthly_v1',nickname:plan.name+' '+(phase==='intro'?'introductory - first 12 successful monthly payments':'regular monthly'),'metadata[oliverfee_plan]':plan.name,'metadata[billing_phase]':phase,'metadata[promotion_successful_payments]':'12','metadata[promotion_automation]':'not_implemented'});
    price=await request('/prices','POST',form,'oliverfee-catalog-live-v1-price-'+plan.name.toLowerCase()+'-'+phase+'-'+cents);
    if(typeof price.id!=='string'||!price.id.startsWith('price_')||price.product!==product.id||!usablePrice(price,cents,true))throw Error('catalog_invalid_created_price');
    prices.push(price);created=true;writes.push({kind:'price',plan:plan.name,phase,id:price.id});
   }
   phases[phase]={id:price.id,cents,created};
  }
  result.push({plan:plan.name,productId:product.id,productCreated,...phases});
 }
 return {status:'complete',checkedAt:new Date().toISOString(),accountVerified:true,mode:'live',paymentsEnabled:false,chargesCreated:0,subscriptionsChanged:0,refundsCreated:0,plans:result,writes,currentApplicationPriceIds:Object.fromEntries(result.map(p=>['STRIPE_PRICE_'+p.plan.toUpperCase(),p.regular.id])),promotionalPriceIds:Object.fromEntries(result.map(p=>[p.plan,p.intro.id])),promotionAutomationImplemented:false,vercelEnvironmentConfigured:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href&&process.argv.includes('--apply')&&process.env.VERCEL_ENV==='production'){
 let report;
 try{report=await completeMembershipCatalog();}catch(error){report={status:'blocked',reason:/^catalog_[A-Za-z0-9_]+$/.test(String(error.message))?error.message:'catalog_operator_failed',chargesCreated:0,subscriptionsChanged:0,refundsCreated:0};}
 await fs.mkdir('public',{recursive:true});await fs.writeFile('public/membership-catalog-result.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({membershipCatalog:report.status}));
}
