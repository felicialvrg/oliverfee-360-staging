import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {actor,SalesError,salesFailure} from './server';
import {uuid} from './validation';
import {quoteDocument} from './quote-document';
export async function quoteDocumentApi(request:Request,management=false){try{
 await actor(management);const id=uuid(new URL(request.url).searchParams.get('quote')),client=await createClient();
 const quote=await client.from('sales_enrollment_quotes').select('*').eq('id',id).single();if(quote.error||!quote.data)throw new SalesError('Assigned customer quote required.',403);
 const application=await client.from('sales_applications').select('*').eq('id',quote.data.application_id).single();if(application.error||!application.data)throw new SalesError('Assigned customer application required.',403);
 let html;try{html=quoteDocument(quote.data,application.data);}catch{throw new SalesError('Quote changed or totals require review. Reload the customer application.',409);}
 return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",'X-Frame-Options':'DENY'}});
 }catch(e){return salesFailure(e);}}
