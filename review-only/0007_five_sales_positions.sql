-- REVIEW ONLY. Production backup/recovery evidence and explicit schema-change approval required.
-- Existing owner identity, profile roles and production integrations are preserved.
-- Explicit acknowledgement below is NOT proof of the actual database connection.
do $$begin
 if current_setting('oliverfee.target_project',true) is distinct from 'dgjqwnewuhpwitadppkv' then raise exception 'Existing production project acknowledgement required';end if;
end$$;
alter table public.sales_team_slots drop constraint sales_team_slots_slot_check;
alter table public.sales_team_slots add constraint sales_team_slots_slot_check check(slot between 1 and 5);
insert into public.sales_team_slots(slot) values(5);
do $$declare definition text;begin
 definition=pg_get_functiondef('public.sales_command_v2(text,uuid,jsonb)'::regprocedure);
 if position('not between 1 and 4' in definition)=0 then raise exception 'Unexpected command definition; review required';end if;
 execute replace(replace(definition,'not between 1 and 4','not between 1 and 5'),'four team positions','five team positions');
end$$;
-- No Auth account, owner mapping or profile-role changes.
