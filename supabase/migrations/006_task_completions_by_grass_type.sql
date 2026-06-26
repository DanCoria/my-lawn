-- ============================================================
-- My Lawn — Scope seasonal task completions by grass type
-- Run this in your Supabase SQL editor after 005
-- ============================================================

-- Add grass_type to checklist completions so changing grass types does not
-- carry completed tasks across different lawn schedules.
alter table task_completions
add column if not exists grass_type text;

-- Replace the old user + task uniqueness with user + grass + task uniqueness.
-- This has to happen before legacy backfill can duplicate existing rows.
alter table task_completions
drop constraint if exists task_completions_user_id_task_key_key;

-- Legacy completions were created before grass_type existed, so there is no
-- reliable historical way to know which grass type each completed task belonged to.
-- Preserve that old history by making legacy completions visible across every
-- supported grass type. New completions after this migration are grass-specific.
update task_completions
set grass_type = 'bermuda'
where grass_type is null;

with supported_grass_types(grass_type) as (
  values
    ('st-augustine'),
    ('zoysia'),
    ('centipede'),
    ('bahia'),
    ('kentucky-bluegrass'),
    ('tall-fescue'),
    ('perennial-ryegrass'),
    ('fine-fescue')
)
insert into task_completions (user_id, grass_type, task_key, completed_at)
select tc.user_id, sgt.grass_type, tc.task_key, tc.completed_at
from task_completions tc
cross join supported_grass_types sgt
where tc.grass_type = 'bermuda'
  and not exists (
    select 1
    from task_completions existing
    where existing.user_id = tc.user_id
      and existing.grass_type = sgt.grass_type
      and existing.task_key = tc.task_key
  );

alter table task_completions
alter column grass_type set not null;

alter table task_completions
add constraint task_completions_user_id_grass_type_task_key_key
unique (user_id, grass_type, task_key);

create index if not exists task_completions_user_grass_type_idx
on task_completions(user_id, grass_type);
