import {parseCsv,importProspects} from './csv.ts';
import {SalesInputError} from './input-error.ts';
export const IMPORT_LIMITS={maxBytes:25_000_000,maxRows:50_000};
export const IMPORT_FIELDS=['company_name','usdot','contact_name','phone','email','city','state','registration_date','fleet_size','notes'] as const;
export type ImportField=typeof IMPORT_FIELDS[number];
export type Mapping=Partial<Record<ImportField,number>>;
export type ImportIssue={row:number;message:string;cells:string[]};
export type ImportPlan={headers:string[];rows:string[][];valid:number;total:number;duplicates:number;issues:ImportIssue[];batches:{csv:string;count:number}[]};
const aliases:Record<ImportField,string[]>={company_name:['company_name','legal_name','legal name','company','company name'],usdot:['usdot','dot_number','usdot number','dot number','dot'],contact_name:['contact_name','contact person','contact','contact name'],phone:['phone','telephone','phone number'],email:['email','email_address','email address'],city:['city','phy_city'],state:['state','phy_state'],registration_date:['registration_date','add_date'],fleet_size:['fleet_size','nbr_power_unit','power_units'],notes:['notes','call notes']};
export function csvText(rows:unknown[][]){return rows.map(row=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')).join('\r\n');}
export function readImport(csv:string){const all=parseCsv(csv,IMPORT_LIMITS),headers=all[0].map(s=>s.trim());if(headers.some(h=>!h)||new Set(headers.map(h=>h.toLowerCase())).size!==headers.length)throw new SalesInputError('Use nonempty, unique column headers.');return {headers,rows:all.slice(1)};}
export function defaultMapping(headers:string[]):Mapping{return Object.fromEntries(IMPORT_FIELDS.map(key=>[key,headers.findIndex(h=>aliases[key].includes(h.trim().toLowerCase()))]));}
export function planImport(headers:string[],input:string[][],mapping:Mapping):ImportPlan{
 if(input.length>IMPORT_LIMITS.maxRows)throw new SalesInputError('Import at most 50,000 rows per file.');
 if(!Number.isInteger(mapping.company_name)||Number(mapping.company_name)<0||!Number.isInteger(mapping.usdot)||Number(mapping.usdot)<0)throw new SalesInputError('Map Company name and USDOT before validating.');
 const mapped=Object.values(mapping).filter(n=>Number(n)>=0);if(new Set(mapped).size!==mapped.length||mapped.some(n=>!Number.isInteger(n)||Number(n)>=headers.length))throw new SalesInputError('Each selected column can map to only one field.');
 const issues:ImportIssue[]=[],validRows:string[][]=[],seen=new Set<string>();let duplicates=0;
 input.forEach((cells,index)=>{try{
  if(cells.length!==headers.length)throw new SalesInputError('Column count differs from header.');
  const get=(key:ImportField)=>Number(mapping[key]??-1)<0?'':String(cells[Number(mapping[key])]??'').trim();
  const raw=IMPORT_FIELDS.map(get),notesIndex=IMPORT_FIELDS.indexOf('notes');
  // Preserve every original column (including MC/address/unknown fields) within
  // the existing private notes field; reject overflow rather than truncate it.
  const original=JSON.stringify(Object.fromEntries(headers.map((h,i)=>[h,cells[i]])));
  raw[notesIndex]=[get('notes'),'Imported source columns: '+original].filter(Boolean).join('\n');
  const max:Record<ImportField,number>={company_name:200,usdot:8,contact_name:120,phone:50,email:254,city:100,state:2,registration_date:30,fleet_size:7,notes:4000};
  IMPORT_FIELDS.forEach((key,i)=>{if(raw[i].length>max[key])throw new SalesInputError(key.replaceAll('_',' ')+' exceeds '+max[key]+' characters; original row retained in error report.');});
  if(get('state')&&!/^[A-Za-z]{2}$/.test(get('state')))throw new SalesInputError('State must be a two-letter abbreviation.');
  const checked=importProspects(csvText([[...IMPORT_FIELDS],raw]));if(checked.errors.length)throw new SalesInputError(checked.errors[0].message);
  const row=checked.rows[0];if(!row)throw new SalesInputError('No valid lead.');
  const dot=String(row.usdot);if(seen.has(dot)){duplicates++;issues.push({row:index+2,message:'Duplicate USDOT in this file; first valid row retained.',cells});return;}seen.add(dot);
  validRows.push(IMPORT_FIELDS.map(key=>String(row[key]??'')));
 }catch(error){issues.push({row:index+2,message:error instanceof Error?error.message:'Invalid row',cells});}});
 const batches:{csv:string;count:number}[]=[],encoder=new TextEncoder(),headerBytes=encoder.encode(csvText([[...IMPORT_FIELDS]])).length;let batch:string[][]=[],bytes=headerBytes;
 for(const row of validRows){const rowBytes=encoder.encode('\r\n'+csvText([row])).length;if(batch.length&&(batch.length>=200||bytes+rowBytes>600_000)){batches.push({csv:csvText([[...IMPORT_FIELDS],...batch]),count:batch.length});batch=[];bytes=headerBytes;}batch.push(row);bytes+=rowBytes;}
 if(batch.length)batches.push({csv:csvText([[...IMPORT_FIELDS],...batch]),count:batch.length});
 return {headers,rows:validRows,valid:validRows.length,total:input.length,duplicates,issues,batches};
}
export function importErrorReport(plan:ImportPlan){const safe=(value:string)=>/^[\s]*[=+\-@\t\r]/.test(value)?"'"+value:value;return csvText([['Source data row','Error',...plan.headers.map(safe)],...plan.issues.map(issue=>[issue.row,issue.message,...issue.cells.map(safe)])]);}
