// Configuration metadata only. Never return credential values or account IDs.
export function releaseReadiness(env:Record<string,string|undefined>){
 let supabaseProject:string|null=null,siteOrigin:string|null=null;
 try{const url=new URL(env.NEXT_PUBLIC_SUPABASE_URL||'');if(/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url.origin))supabaseProject=url.hostname.split('.')[0];}catch{}
 try{const url=new URL(env.NEXT_PUBLIC_SITE_URL||'');if(url.protocol==='https:')siteOrigin=url.origin;}catch{}
 const required=['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','SALES_STRIPE_ACCOUNT_ID','STRIPE_PRICE_BASIC','STRIPE_PRICE_PRO','STRIPE_PRICE_PREMIUM','STRIPE_PRICE_ULTIMATE','SALES_PAYMENTS_ENABLED'];
 return {supabaseProject,siteOrigin,stripe:{missingConfiguration:required.filter(key=>!env[key]?.trim()),testKeyConfigured:!!env.STRIPE_SECRET_KEY?.startsWith('sk_test_'),paymentsFlagEnabled:env.SALES_PAYMENTS_ENABLED==='true',liveChargesFlagEnabled:env.SALES_LIVE_CHARGES_APPROVED==='true',endToEndVerified:false}};
}
