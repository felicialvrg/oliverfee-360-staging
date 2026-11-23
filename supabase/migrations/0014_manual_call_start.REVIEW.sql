-- Manual marker only: no phone provider interaction or verified connection.
create function public.sales_start_manual_call(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare activity_id uuid;
begin
 if not public.sales_is_active() then raise exception 'Active salesperson required' using errcode='42501'; end if;
 if not exists(select 1 from public.sales_prospects where id=p_id and assigned_to=auth.uid() and disposition <> 'Do Not Contact') then raise exception 'Assigned available lead required' using errcode='42501'; end if;
 insert into public.sales_activity(actor_id,prospect_id,action,details) values(auth.uid(),p_id,'manual-call-start',jsonb_build_object('status','salesperson-reported','description','Manual call attempt started; connection not verified')) returning id into activity_id;
 return jsonb_build_object('activity_id',activity_id,'status','salesperson-reported');
end $$;
revoke all on function public.sales_start_manual_call(uuid) from public,anon;
grant execute on function public.sales_start_manual_call(uuid) to authenticated;
