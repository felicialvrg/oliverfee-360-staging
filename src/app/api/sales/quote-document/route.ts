import {quoteDocumentApi} from '@/lib/sales/quote-document-api';
export const dynamic='force-dynamic';
export async function GET(request:Request){return quoteDocumentApi(request);}
