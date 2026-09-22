-- Durcissement multi-utilisateur et index couvrant les accès de l'application.
begin;

-- Les politiques de lecture mettent les appels auth dans un SELECT afin qu'ils
-- soient calculés une seule fois par requête, conformément aux recommandations Supabase.
drop policy owner_access on public.boxes;
create policy boxes_read on public.boxes for select to authenticated using (
  owner_id = (select auth.uid())
  and lower((select auth.jwt())->>'email') = 'lienmathieu2@gmail.com'
);

drop policy categories_read on public.inventory_categories;
create policy categories_read on public.inventory_categories for select to authenticated using (
  (owner_id is null or owner_id = (select auth.uid()))
  and lower((select auth.jwt())->>'email') = 'lienmathieu2@gmail.com'
);

-- Une boîte ne peut référencer qu'une caisse du même propriétaire, y compris
-- si une future fonction d'administration écrit directement dans les tables.
alter table public.boxes
  add constraint boxes_owner_id_key unique (owner_id, id);

alter table public.inner_boxes
  drop constraint inner_boxes_home_crate_id_fkey,
  drop constraint inner_boxes_temporary_crate_id_fkey,
  add constraint inner_boxes_home_crate_owner_fkey
    foreign key (owner_id, home_crate_id)
    references public.boxes(owner_id, id)
    on delete restrict,
  add constraint inner_boxes_temporary_crate_owner_fkey
    foreign key (owner_id, temporary_crate_id)
    references public.boxes(owner_id, id)
    on delete restrict;

-- Index couvrants pour les clés étrangères et les listes triées de l'interface.
create index categories_owner_idx
  on public.inventory_categories(owner_id);
create index boxes_owner_created_idx
  on public.boxes(owner_id, created_at desc, id);
create index inner_boxes_owner_created_idx
  on public.inner_boxes(owner_id, created_at desc, id);

commit;
