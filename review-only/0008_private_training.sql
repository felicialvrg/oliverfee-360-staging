-- REVIEW ONLY. Requires approved existing production schema + Storage policy changes; no hosted execution.
do $$begin
 if current_setting('oliverfee.target_project',true) is distinct from 'dgjqwnewuhpwitadppkv' then raise exception 'Existing production project acknowledgement required';end if;
end$$;
create table public.training_lessons (
 slug text primary key check(slug='honey-lesson-1'),title text not null,
 version integer not null default 1 check(version=1),status text not null check(status='Owner Approved'),
 object_path text unique,sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now()
);
create table public.training_assignments (
 lesson_slug text references public.training_lessons(slug),user_id uuid references public.sales_representatives(user_id),
 assigned_at timestamptz not null default now(),revoked_at timestamptz,
 primary key(lesson_slug,user_id)
);
create table public.training_completions (
 lesson_slug text,user_id uuid,completed_at timestamptz not null default now(),
 primary key(lesson_slug,user_id),foreign key(lesson_slug,user_id) references public.training_assignments(lesson_slug,user_id)
);
create function public.training_allowed(p_slug text) returns boolean language sql stable security definer set search_path='' as $$
 select public.owner_account_enabled() and (public.owner_authorized() or (
 public.sales_is_active() and exists(select 1 from public.training_assignments a join public.training_lessons l on l.slug=a.lesson_slug
 where a.lesson_slug=p_slug and a.user_id=auth.uid() and a.revoked_at is null and l.status='Owner Approved')))
$$;
revoke all on function public.training_allowed(text) from public,anon;
grant execute on function public.training_allowed(text) to authenticated;
do $$declare t text;begin foreach t in array array['training_lessons','training_assignments','training_completions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop;end$$;
create policy training_lesson_read on public.training_lessons for select to authenticated using(public.training_allowed(slug));
create policy training_assignment_read on public.training_assignments for select to authenticated using(public.owner_account_enabled() and (public.owner_authorized() or (user_id=auth.uid() and public.training_allowed(lesson_slug))));
create policy training_completion_read on public.training_completions for select to authenticated using(public.owner_account_enabled() and (public.owner_authorized() or (user_id=auth.uid() and public.training_allowed(lesson_slug))));
create function public.training_complete(p_slug text) returns void language plpgsql security definer set search_path='' as $$begin
 if not public.sales_is_active() or not public.training_allowed(p_slug) then raise exception 'Active assignment required' using errcode='42501';end if;
 -- Serialize with revocation: no completion may be recorded after its commit.
 perform 1 from public.training_assignments where lesson_slug=p_slug and user_id=auth.uid() and revoked_at is null for update;
 if not found then raise exception 'Active assignment required' using errcode='42501';end if;
 insert into public.training_completions(lesson_slug,user_id) values(p_slug,auth.uid()) on conflict do nothing;
end$$;
revoke all on function public.training_complete(text) from public,anon;
grant execute on function public.training_complete(text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit) values('employee-training','employee-training',false,10485760);
-- Intentionally NO authenticated Storage object policy for this bucket.
-- Server signs only after checking the current session and assignment; URL lifetime 60 seconds.
-- Existing restrictive owner_disabled_storage policy remains in force.
-- Seed the canonical lesson separately from the preserved MP4's verified SHA-256.
