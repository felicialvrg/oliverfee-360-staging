import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
const owner='d5f443af-ac3a-42b2-8294-6fbf51f73beb',rep1='11111111-1111-4111-8111-111111111111',rep2='22222222-2222-4222-8222-222222222222',customer='33333333-3333-4333-8333-333333333333';
export async function database(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
 create table storage.objects(id uuid,bucket_id text,name text);alter table storage.objects enable row level security;
 create function storage.foldername(name text) returns text[] language sql as $$select string_to_array(name,'/')$$;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 grant select on auth.users to service_role;`);
 const initial=fs.readFileSync(new URL('../../supabase/migrations/0001_init.sql',import.meta.url),'utf8').replace('create extension if not exists "pgcrypto";','');await db.exec(initial);
 await db.exec(`grant select on all tables in schema public to authenticated;grant all on all tables in schema public to service_role;
 insert into auth.users values('${owner}','felicialvrg@gmail.com',now()),('${rep1}','rep1@example.test',now()),('${rep2}','rep2@example.test',now()),('${customer}','customer@example.test',null);
 update public.profiles set role='admin' where id='${owner}';`);
 await db.exec(fs.readFileSync(new URL('../../supabase/migrations/0002_sales.sql',import.meta.url),'utf8'));
 const as=async(id,role,sql,params=[])=>db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)",[id||'',role]);return tx.query(sql,params);});
 const command=(id,action,record,payload)=>as(id,'authenticated','select public.sales_command($1,$2,$3) as result',[action,record,JSON.stringify(payload)]).then(r=>r.rows[0].result);
 for(const [id,email,code] of [[rep1,'rep1@example.test','OF-01'],[rep2,'rep2@example.test','OF-02']]){await command(owner,'register-rep',id,{name:code,email,rep_code:code});await command(owner,'rep-update',id,{status:'active',commission_mode:'percent',commission_value:1000});}
 return {db,as,command};
}