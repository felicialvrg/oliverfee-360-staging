import {completeSalesSetup} from '@/lib/sales/account-setup';
import {sameOrigin,requestBody,salesFailure} from '@/lib/sales/server';
export async function POST(request:Request){try{
 sameOrigin(request);const result=await completeSalesSetup(await requestBody(request));
 return Response.json(result,{headers:{'Cache-Control':'no-store'}});
}catch(error){return salesFailure(error);}}
