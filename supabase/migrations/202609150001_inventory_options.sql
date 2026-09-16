-- Repères modifiables : l’identifiant interne reste stable pour les déplacements.
begin;
alter table public.boxes add column code text;
update public.boxes set code=id;
alter table public.boxes alter column code set not null;
alter table public.boxes add constraint boxes_code_length check(length(btrim(code)) between 1 and 60);
create unique index boxes_owner_code on public.boxes(owner_id,lower(btrim(code)));
create sequence public.box_code_sequence;

create table public.inventory_categories (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid references auth.users(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 60)
);
create unique index category_owner_name on public.inventory_categories(coalesce(owner_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(btrim(name)));
insert into public.inventory_categories(name) values
 ('Décoration'),('Vêtements'),('Souvenirs'),('Livres & papiers'),('Équipement'),('Autre'),
 ('Impression 3D'),('Informatique'),('Électronique'),('Outils & bricolage'),('Sport'),('Camping & voyage'),
 ('Cuisine'),('Jouets & jeux'),('Noël & fêtes'),('Jardin'),('Linge de maison'),('Archives');
alter table public.inventory_categories enable row level security;
create policy categories_read on public.inventory_categories for select to authenticated using
 ((owner_id is null or owner_id=auth.uid()) and lower(auth.jwt()->>'email')='lienmathieu2@gmail.com');
revoke all on public.inventory_categories from anon,authenticated;
grant select on public.inventory_categories to authenticated;
alter table public.boxes drop constraint boxes_category_check;

-- Conserve la logique de mouvements testée, inaccessible directement au navigateur.
alter function public.mutate_crate(text,jsonb) rename to mutate_crate_original;
revoke all on function public.mutate_crate_original(text,jsonb) from public,anon,authenticated;
-- Le client ancien reste compatible pendant le déploiement progressif.
create function public.next_box_code() returns text language plpgsql security definer set search_path='' as $$
declare number text; candidate text;
begin
 loop
  number:=nextval('public.box_code_sequence')::text;
  candidate:='G-'||lpad(number,greatest(6,length(number)),'0');
  exit when not exists(select 1 from public.boxes where owner_id=auth.uid() and lower(code)=lower(candidate));
 end loop;
 return candidate;
end $$;
revoke all on function public.next_box_code() from public,anon,authenticated;
alter table public.boxes alter column code set default public.next_box_code();

create function public.mutate_crate(operation text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; chosen text; existing public.boxes;
begin
 if auth.uid() is null or coalesce(lower(auth.jwt()->>'email'),'')<>'lienmathieu2@gmail.com' then raise exception 'Accès non autorisé.' using errcode='42501';end if;
 -- Sérialise les changements de catégories et les écritures pour éviter les orphelins.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if operation in ('POST','PUT') then
  if not exists(select 1 from public.inventory_categories where name=payload->>'category' and (owner_id is null or owner_id=auth.uid())) then raise exception 'Catégorie inconnue. Actualisez les catégories.';end if;
  if payload ? 'code' then
   if jsonb_typeof(payload->'code') is distinct from 'string' then raise exception 'Le repère doit être du texte.';end if;
   chosen:=btrim(payload->>'code');
   if length(chosen)>60 or (operation='PUT' and chosen='') then raise exception 'Indiquez un repère de 1 à 60 caractères.';end if;
   if chosen<>'' and exists(select 1 from public.boxes where owner_id=auth.uid() and lower(btrim(code))=lower(chosen) and (operation='POST' or id<>payload->>'id')) then raise exception 'Ce repère est déjà utilisé par une autre caisse.' using errcode='23505';end if;
  end if;
 end if;
 result:=public.mutate_crate_original(operation,payload);
 if operation in ('POST','PUT') and chosen is not null and chosen<>'' then
  update public.boxes set code=chosen where id=result->>'id' and owner_id=auth.uid() returning to_jsonb(boxes.*) into result;
 end if;
 return result;
end $$;
revoke all on function public.mutate_crate(text,jsonb) from public,anon;
grant execute on function public.mutate_crate(text,jsonb) to authenticated;

create function public.manage_category(action text,category_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target public.inventory_categories; affected integer;
begin
 if auth.uid() is null or coalesce(lower(auth.jwt()->>'email'),'')<>'lienmathieu2@gmail.com' then raise exception 'Accès non autorisé.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if action='add' then
  if category_name is null or length(btrim(category_name)) not between 1 and 60 then raise exception 'Indiquez un nom de 1 à 60 caractères.';end if;
  if exists(select 1 from public.inventory_categories where lower(name)=lower(btrim(category_name)) and (owner_id is null or owner_id=auth.uid())) then raise exception 'Cette catégorie existe déjà.';end if;
  insert into public.inventory_categories(owner_id,name) values(auth.uid(),btrim(category_name));
 elsif action='delete' then
  select * into target from public.inventory_categories where name=category_name and owner_id=auth.uid() for update;
  if not found then raise exception 'Seules vos catégories personnalisées peuvent être supprimées.';end if;
  update public.boxes set category='Autre',revision=revision+1 where category=target.name and owner_id=auth.uid();
  get diagnostics affected=row_count;
  delete from public.inventory_categories where id=target.id;
 else raise exception 'Action inconnue.';end if;
 return jsonb_build_object('ok',true,'reassigned',coalesce(affected,0));
end $$;
revoke all on function public.manage_category(text,text) from public,anon;
grant execute on function public.manage_category(text,text) to authenticated;
commit;
