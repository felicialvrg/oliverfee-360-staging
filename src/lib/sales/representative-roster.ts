import type {SupabaseClient} from '@supabase/supabase-js';
export async function representativeRoster(client:SupabaseClient){
 const rows:Record<string,unknown>[]=[];
 for(let offset=0;;){
  const {data,error}=await client.from('sales_representatives').select('*').order('user_id').range(offset,offset+499);
  if(error)return {data:null,error};
  if(!data?.length)return {data:rows,error:null};
  rows.push(...data);offset+=data.length;
 }
}
