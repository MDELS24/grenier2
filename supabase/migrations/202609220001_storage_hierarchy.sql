-- Hiérarchie de rangement : étagères pour les caisses et boîtes placées dans les caisses.
begin;

alter table public.boxes add column created_at timestamptz not null default now();
alter table public.boxes add column shelf text not null default '' check(length(shelf)<=100);
alter table public.boxes add column shelf_position text not null default '' check(length(shelf_position)<=100);

-- Complète l'écriture des caisses sans modifier les fonctions des migrations précédentes.
alter function public.mutate_crate(text,jsonb) rename to mutate_crate_before_storage;
revoke all on function public.mutate_crate_before_storage(text,jsonb) from public,anon,authenticated;
create function public.mutate_crate(operation text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; shelf_value text; position_value text;
begin
 if payload ? 'shelf' and jsonb_typeof(payload->'shelf') is distinct from 'string' then raise exception 'L’étagère doit être du texte.';end if;
 if payload ? 'shelf_position' and jsonb_typeof(payload->'shelf_position') is distinct from 'string' then raise exception 'La position doit être du texte.';end if;
 shelf_value:=btrim(coalesce(payload->>'shelf',''));
 position_value:=btrim(coalesce(payload->>'shelf_position',''));
 if length(shelf_value)>100 or length(position_value)>100 then raise exception 'Étagère ou position trop longue.';end if;
 result:=public.mutate_crate_before_storage(operation,payload);
 if operation in ('POST','PUT') then
  update public.boxes set shelf=shelf_value,shelf_position=position_value
   where id=result->>'id' and owner_id=auth.uid() returning to_jsonb(boxes.*) into result;
 end if;
 return result;
end $$;
revoke all on function public.mutate_crate(text,jsonb) from public,anon;
grant execute on function public.mutate_crate(text,jsonb) to authenticated;

create sequence public.inner_box_code_sequence;
create function public.next_inner_box_code() returns text
language plpgsql security definer set search_path='' as $$
declare number text; candidate text;
begin
 loop
  number:=nextval('public.inner_box_code_sequence')::text;
  candidate:='B-'||lpad(number,greatest(6,length(number)),'0');
  exit when not exists(select 1 from public.inner_boxes where owner_id=auth.uid() and lower(code)=lower(candidate));
 end loop;
 return candidate;
end $$;

create table public.inner_boxes (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 code text not null default public.next_inner_box_code() check(length(btrim(code)) between 1 and 60),
 name text not null check(length(btrim(name)) between 1 and 100),
 home_crate_id text not null references public.boxes(id) on delete restrict,
 temporary_crate_id text references public.boxes(id) on delete restrict,
 temporary_location text check(length(btrim(temporary_location)) between 1 and 100),
 items text not null default '' check(length(items)<=10000),
 notes text not null default '' check(length(notes)<=2000),
 moved_at timestamptz,
 return_date date,
 move_note text not null default '' check(length(move_note)<=2000),
 revision integer not null default 0 check(revision>=0),
 created_at timestamptz not null default now(),
 constraint valid_inner_box_movement check (
  (temporary_crate_id is null and temporary_location is null and moved_at is null and return_date is null and move_note='') or
  (temporary_crate_id is not null and temporary_location is null and moved_at is not null and temporary_crate_id<>home_crate_id) or
  (temporary_crate_id is null and temporary_location is not null and moved_at is not null)
 )
);
create unique index inner_boxes_owner_code on public.inner_boxes(owner_id,lower(btrim(code)));
create index inner_boxes_owner_home on public.inner_boxes(owner_id,home_crate_id);
create index inner_boxes_owner_temporary on public.inner_boxes(owner_id,temporary_crate_id);
alter table public.inner_boxes enable row level security;
create policy inner_boxes_read on public.inner_boxes for select to authenticated using
 (owner_id=(select auth.uid()) and lower((select auth.jwt())->>'email')='lienmathieu2@gmail.com');
revoke all on public.inner_boxes from anon,authenticated;
grant select on public.inner_boxes to authenticated;
revoke all on function public.next_inner_box_code() from public,anon,authenticated;

-- Point d'écriture atomique des boîtes avec contrôle de propriété et de révision.
create function public.mutate_inner_box(operation text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_row public.inner_boxes; result public.inner_boxes; target_crate public.boxes;
 box_id uuid; chosen_code text; destination text; return_day date;
begin
 if auth.uid() is null or coalesce(lower(auth.jwt()->>'email'),'')<>'lienmathieu2@gmail.com' then raise exception 'Accès non autorisé.' using errcode='42501';end if;
 if jsonb_typeof(payload) is distinct from 'object' or operation not in ('POST','PUT','PATCH','DELETE') then raise exception 'Requête invalide.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1));
 if operation<>'POST' then
  begin box_id:=(payload->>'id')::uuid;exception when others then raise exception 'Boîte invalide.' using errcode='22023';end;
  select * into current_row from public.inner_boxes where id=box_id and owner_id=auth.uid() for update;
  if not found then raise exception 'Cette boîte n’existe plus.' using errcode='P0002';end if;
  if jsonb_typeof(payload->'revision') is distinct from 'number' or (payload->>'revision')::numeric<>current_row.revision then
   raise exception 'Cette boîte a changé sur un autre appareil. Fermez sa fiche puis rouvrez-la.' using errcode='40001';
  end if;
 end if;
 if operation in ('POST','PUT') then
  if jsonb_typeof(payload->'name') is distinct from 'string' or jsonb_typeof(payload->'home_crate_id') is distinct from 'string' or
     jsonb_typeof(payload->'items') is distinct from 'string' or jsonb_typeof(payload->'notes') is distinct from 'string' then
   raise exception 'Vérifiez le nom, la caisse de rangement et le contenu.' using errcode='22023';
  end if;
  select * into target_crate from public.boxes where id=payload->>'home_crate_id' and owner_id=auth.uid();
  if not found then raise exception 'La caisse de rangement est introuvable.';end if;
  chosen_code:=btrim(coalesce(payload->>'code',''));
  if chosen_code='' then chosen_code:=public.next_inner_box_code();end if;
  if length(chosen_code)>60 then raise exception 'Le repère est limité à 60 caractères.';end if;
  if exists(select 1 from public.inner_boxes where owner_id=auth.uid() and lower(btrim(code))=lower(chosen_code) and (operation='POST' or id<>box_id)) then
   raise exception 'Ce repère est déjà utilisé par une autre boîte.' using errcode='23505';
  end if;
  if operation='POST' then
   insert into public.inner_boxes(owner_id,code,name,home_crate_id,items,notes)
    values(auth.uid(),chosen_code,btrim(payload->>'name'),target_crate.id,btrim(payload->>'items'),btrim(payload->>'notes')) returning * into result;
  else
   if current_row.temporary_crate_id is not null or current_row.temporary_location is not null then
    if target_crate.id<>current_row.home_crate_id then raise exception 'Confirmez d’abord le retour avant de changer la caisse habituelle.';end if;
   end if;
   update public.inner_boxes set code=chosen_code,name=btrim(payload->>'name'),home_crate_id=target_crate.id,
    items=btrim(payload->>'items'),notes=btrim(payload->>'notes'),revision=revision+1
    where id=box_id and owner_id=auth.uid() returning * into result;
  end if;
 elsif operation='DELETE' then
  delete from public.inner_boxes where id=box_id and owner_id=auth.uid();
  return jsonb_build_object('ok',true);
 elsif payload->>'action'='return' then
  if current_row.temporary_crate_id is null and current_row.temporary_location is null then raise exception 'Cette boîte est déjà dans sa caisse habituelle.' using errcode='40001';end if;
  update public.inner_boxes set temporary_crate_id=null,temporary_location=null,moved_at=null,return_date=null,move_note='',revision=revision+1
   where id=box_id and owner_id=auth.uid() returning * into result;
 elsif payload->>'action'='relocate' then
  select * into target_crate from public.boxes where id=payload->>'destination_crate_id' and owner_id=auth.uid();
  if not found then raise exception 'La caisse de destination est introuvable.';end if;
  update public.inner_boxes set home_crate_id=target_crate.id,temporary_crate_id=null,temporary_location=null,moved_at=null,return_date=null,move_note='',revision=revision+1
   where id=box_id and owner_id=auth.uid() returning * into result;
 elsif payload->>'action' in ('move_crate','move_outside') then
  if not (payload ? 'return_date') or jsonb_typeof(payload->'move_note') is distinct from 'string' then raise exception 'Déplacement invalide.';end if;
  if payload->'return_date'<>'null'::jsonb then
   if jsonb_typeof(payload->'return_date') is distinct from 'string' or (payload->>'return_date') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'La date de retour est invalide.';end if;
   return_day:=(payload->>'return_date')::date;
  end if;
  if payload->>'action'='move_crate' then
   select * into target_crate from public.boxes where id=payload->>'destination_crate_id' and owner_id=auth.uid();
   if not found or target_crate.id=current_row.home_crate_id then raise exception 'Choisissez une autre caisse.';end if;
   update public.inner_boxes set temporary_crate_id=target_crate.id,temporary_location=null,moved_at=coalesce(moved_at,now()),
    return_date=return_day,move_note=btrim(payload->>'move_note'),revision=revision+1 where id=box_id and owner_id=auth.uid() returning * into result;
  else
   destination:=btrim(coalesce(payload->>'destination',''));
   if destination='' then raise exception 'Indiquez l’emplacement extérieur.';end if;
   update public.inner_boxes set temporary_crate_id=null,temporary_location=destination,moved_at=coalesce(moved_at,now()),
    return_date=return_day,move_note=btrim(payload->>'move_note'),revision=revision+1 where id=box_id and owner_id=auth.uid() returning * into result;
  end if;
 else raise exception 'Action inconnue.' using errcode='22023';end if;
 return to_jsonb(result);
end $$;
revoke all on function public.mutate_inner_box(text,jsonb) from public,anon;
grant execute on function public.mutate_inner_box(text,jsonb) to authenticated;

commit;
