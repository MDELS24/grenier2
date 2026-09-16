-- L’import est une transaction unique : aucune caisse partielle en cas d’erreur.
begin;
alter table public.boxes add column itemlist_data jsonb not null default '[]'::jsonb check(jsonb_typeof(itemlist_data)='array');
alter table public.boxes add column source_key text;
create unique index boxes_source_key on public.boxes(owner_id,source_key) where source_key is not null;
create function public.import_inventory(entries jsonb,skip_duplicates boolean default true) returns jsonb
language plpgsql security definer set search_path='' as $$
declare entry jsonb; result jsonb; category_value text; added integer:=0; skipped integer:=0;
begin
 if auth.uid() is null or coalesce(lower(auth.jwt()->>'email'),'')<>'lienmathieu2@gmail.com' then raise exception 'Accès non autorisé.' using errcode='42501';end if;
 if jsonb_typeof(entries) is distinct from 'array' or jsonb_array_length(entries) not between 1 and 1000 then raise exception 'Import limité à 1 000 caisses.';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 for entry in select value from jsonb_array_elements(entries) loop
  if jsonb_typeof(entry) is distinct from 'object' then raise exception 'Caisse invalide.';end if;
  if exists(select 1 from public.boxes where owner_id=auth.uid() and (lower(code)=lower(btrim(entry->>'code')) or (source_key is not null and source_key=entry->>'source_key'))) then
   if skip_duplicates then skipped:=skipped+1;continue;else raise exception 'Repère déjà présent : %',entry->>'code';end if;
  end if;
  category_value:=coalesce(nullif(btrim(entry->>'category'),''),'Autre');
  select name into category_value from public.inventory_categories where lower(name)=lower(category_value) and (owner_id is null or owner_id=auth.uid()) limit 1;
  if category_value is null then category_value:=btrim(entry->>'category');perform public.manage_category('add',category_value);end if;
  result:=public.mutate_crate('POST',entry||jsonb_build_object('category',category_value));
  if coalesce(entry->>'temporary_location','')<>'' then
   result:=public.mutate_crate('PATCH',jsonb_build_object('id',result->>'id','revision',result->'revision','action','move','destination',entry->>'temporary_location','return_date',nullif(entry->>'return_date',''),'move_note',coalesce(entry->>'move_note','')));
   if coalesce(entry->>'moved_at','')<>'' then update public.boxes set moved_at=(entry->>'moved_at')::timestamptz where id=result->>'id' and owner_id=auth.uid();end if;
  end if;
  update public.boxes set itemlist_data=coalesce(entry->'itemlist_data','[]'::jsonb),source_key=nullif(entry->>'source_key','') where id=result->>'id' and owner_id=auth.uid();
  added:=added+1;
 end loop;
 return jsonb_build_object('added',added,'skipped',skipped);
end $$;
revoke all on function public.import_inventory(jsonb,boolean) from public,anon;
grant execute on function public.import_inventory(jsonb,boolean) to authenticated;
commit;
