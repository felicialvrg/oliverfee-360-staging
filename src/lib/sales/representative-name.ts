import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {actor,SalesError} from './server';
import {uuid} from './validation';

export async function renameRepresentative(rawId:unknown,rawName:unknown){
 await actor(true);
 const id=uuid(rawId);
 if(typeof rawName!=='string')throw new SalesError('Enter the salesperson name.');
 const name=rawName.trim();
 if(name.length<2||name.length>120||/[\u0000-\u001f\u007f]/.test(name))throw new SalesError('Use a name between 2 and 120 characters.');
 const {data,error}=await createAdminClient().from('sales_representatives').update({name,updated_at:new Date().toISOString()}).eq('user_id',id).select('user_id,name').single();
 if(error||!data||data.user_id!==id)throw new SalesError('Salesperson name was not confirmed saved. Refresh and try again.',409);
 return data;
}
