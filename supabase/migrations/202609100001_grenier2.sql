-- Migration initiale : exécuter une seule fois sur un projet Supabase vide.
begin;
create table public.boxes (
 id text primary key default ('G-' || upper(substr(gen_random_uuid()::text,1,8))),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 100),
 location text not null check(length(btrim(location)) between 1 and 100),
 category text not null check(category in ('Décoration','Vêtements','Souvenirs','Livres & papiers','Équipement','Autre')),
 items text not null default '' check(length(items)<=10000),
 notes text not null default '' check(length(notes)<=2000),
 temporary_location text check(length(btrim(temporary_location)) between 1 and 100),
 moved_at timestamptz,
 return_date date,
 move_note text not null default '' check(length(move_note)<=2000),
 revision integer not null default 0 check(revision>=0),
 constraint valid_movement check (
  (temporary_location is null and moved_at is null and return_date is null and move_note='') or
  (temporary_location is not null and moved_at is not null and lower(btrim(temporary_location))<>lower(btrim(location)))
 )
);
create index boxes_owner_idx on public.boxes(owner_id);
alter table public.boxes enable row level security;
-- La lecture est limitée au propriétaire authentifié et à l’adresse autorisée.
create policy owner_access on public.boxes for all to authenticated
 using (owner_id=(select auth.uid()) and lower((select auth.jwt())->>'email')='lienmathieu2@gmail.com')
 with check (owner_id=(select auth.uid()) and lower((select auth.jwt())->>'email')='lienmathieu2@gmail.com');
revoke all on public.boxes from anon,authenticated;
grant select on public.boxes to authenticated;

-- Seul point d’écriture : contrôle d’identité, de propriété et de révision.
-- SECURITY DEFINER exige ces contrôles explicites et un search_path vide.
create function public.mutate_crate(operation text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 current_box public.boxes;
 result public.boxes;
 box_id text;
 destination text;
 return_day date;
begin
 if auth.uid() is null or coalesce(lower(auth.jwt()->>'email'),'')<>'lienmathieu2@gmail.com' then
  raise exception 'Accès non autorisé.' using errcode='42501';
 end if;
 if jsonb_typeof(payload) is distinct from 'object' or operation not in ('POST','PUT','PATCH','DELETE') then
  raise exception 'Requête invalide.' using errcode='22023';
 end if;
 if operation<>'POST' then
  box_id:=payload->>'id';
  -- Le verrou empêche deux appareils de modifier la même révision simultanément.
  select * into current_box from public.boxes where id=box_id and owner_id=auth.uid() for update;
  if not found then raise exception 'Cette caisse n’existe plus.' using errcode='P0002';end if;
  if jsonb_typeof(payload->'revision') is distinct from 'number' or (payload->>'revision')::numeric<>current_box.revision then
   raise exception 'Cette caisse a changé sur un autre appareil. Fermez la fiche puis rouvrez-la pour réessayer.' using errcode='40001';
  end if;
 end if;
 if operation in ('POST','PUT') then
  if jsonb_typeof(payload->'name') is distinct from 'string' or
     jsonb_typeof(payload->'location') is distinct from 'string' or
     jsonb_typeof(payload->'category') is distinct from 'string' or
     jsonb_typeof(payload->'items') is distinct from 'string' or
     jsonb_typeof(payload->'notes') is distinct from 'string' then
    raise exception 'Vérifiez le nom, la place habituelle et le contenu.' using errcode='22023';
  end if;
  if operation='POST' then
   insert into public.boxes(owner_id,name,location,category,items,notes)
    values(auth.uid(),btrim(payload->>'name'),btrim(payload->>'location'),payload->>'category',btrim(payload->>'items'),btrim(payload->>'notes')) returning * into result;
  else
   if current_box.temporary_location is not null and lower(current_box.temporary_location)=lower(btrim(payload->>'location')) then
    raise exception 'Confirmez d’abord le retour avant de changer sa place habituelle.' using errcode='22023';
   end if;
   update public.boxes set name=btrim(payload->>'name'),location=btrim(payload->>'location'),category=payload->>'category',items=btrim(payload->>'items'),notes=btrim(payload->>'notes'),revision=revision+1 where id=box_id and owner_id=auth.uid() returning * into result;
  end if;
 elsif operation='DELETE' then
  delete from public.boxes where id=box_id and owner_id=auth.uid();return jsonb_build_object('ok',true);
 elsif payload->>'action'='return' then
  if current_box.temporary_location is null then raise exception 'Cette caisse est déjà à sa place habituelle.' using errcode='40001';end if;
  update public.boxes set temporary_location=null,moved_at=null,return_date=null,move_note='',revision=revision+1 where id=box_id and owner_id=auth.uid() returning * into result;
 elsif payload->>'action'='move' then
  if jsonb_typeof(payload->'destination') is distinct from 'string' or jsonb_typeof(payload->'move_note') is distinct from 'string' then raise exception 'Déplacement invalide.' using errcode='22023';end if;
  destination:=btrim(payload->>'destination');
  if lower(destination)=lower(current_box.location) then raise exception 'Choisissez un autre emplacement ou utilisez « Remettre à sa place ».' using errcode='22023';end if;
  if not (payload ? 'return_date') then raise exception 'Date de retour manquante.' using errcode='22023';end if;
  if payload->'return_date'<>'null'::jsonb then
   if jsonb_typeof(payload->'return_date') is distinct from 'string' or (payload->>'return_date') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'La date de retour est invalide.' using errcode='22023';end if;
   return_day:=(payload->>'return_date')::date;
  end if;
  update public.boxes set temporary_location=destination,moved_at=coalesce(moved_at,now()),return_date=return_day,move_note=btrim(payload->>'move_note'),revision=revision+1 where id=box_id and owner_id=auth.uid() returning * into result;
 else
  raise exception 'Action invalide.' using errcode='22023';
 end if;
 return to_jsonb(result);
end;
$$;
revoke all on function public.mutate_crate(text,jsonb) from public,anon;
grant execute on function public.mutate_crate(text,jsonb) to authenticated;
commit;
