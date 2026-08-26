-- Schéma de la base pour l'appli de gestion des stocks.
-- À exécuter dans Supabase : Dashboard > SQL Editor > coller ce fichier > Run.
-- Ce fichier est ré-exécutable sans risque : le relancer après une mise à jour
-- applique uniquement les changements manquants, sans toucher aux données existantes.

create extension if not exists pgcrypto;

-- =========================================================
-- Profils utilisateurs (NOM / Prénom liés au compte Auth)
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nom text not null,
  prenom text not null,
  email text,
  role text not null default 'vsc' check (role in ('respo_log', 'respo_autres', 'vsc')),
  created_at timestamptz not null default now()
);

-- Pour les bases créées avant l'ajout de l'email sur le profil.
alter table public.profiles add column if not exists email text;
-- Récupère (et resynchronise à chaque exécution) l'email depuis auth.users,
-- y compris pour les comptes déjà existants avant l'ajout de cette colonne.
update public.profiles p
  set email = u.email
  from auth.users u
  where u.id = p.id and p.email is distinct from u.email;

-- Migration pour les bases créées avant l'introduction des rôles respo_log /
-- respo_autres / vsc (l'ancien rôle "admin" devient respo_log — tous pouvoirs y
-- compris la gestion des rôles — et l'ancien "benevole" devient vsc, le rôle le
-- plus restreint : va ensuite dans l'onglet Utilisateurs pour promouvoir chacun
-- au bon rôle).
alter table public.profiles alter column role drop default;
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'respo_log' where role = 'admin';
update public.profiles set role = 'vsc' where role = 'benevole';
alter table public.profiles add constraint profiles_role_check
  check (role in ('respo_log', 'respo_autres', 'vsc'));
alter table public.profiles alter column role set default 'vsc';

-- Résout le rôle de l'utilisateur connecté ; utilisé par les policies RLS et
-- par les fonctions métier ci-dessous pour restreindre certaines actions par rôle.
create or replace function public.role_utilisateur()
returns text
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Formate systématiquement NOM en majuscules et Prénom avec 1ère lettre en majuscule,
-- pour ne jamais dépendre d'une saisie correcte de l'utilisateur.
create or replace function public.format_nom_prenom()
returns trigger
language plpgsql
as $$
begin
  new.nom := upper(trim(new.nom));
  new.prenom := initcap(trim(new.prenom));
  return new;
end;
$$;

drop trigger if exists trg_format_nom_prenom on public.profiles;
create trigger trg_format_nom_prenom
  before insert or update on public.profiles
  for each row execute function public.format_nom_prenom();

-- Crée automatiquement le profil à l'inscription, à partir des métadonnées
-- passées lors du signup (nom / prenom).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nom, prenom, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nom', ''),
    coalesce(new.raw_user_meta_data ->> 'prenom', ''),
    new.email
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================
-- Stocks (lieux)
-- =========================================================
create table if not exists public.stocks (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  created_at timestamptz not null default now()
);

-- =========================================================
-- Catégories (propres à chaque stock)
-- =========================================================
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid not null references public.stocks (id) on delete cascade,
  nom text not null,
  created_at timestamptz not null default now(),
  unique (stock_id, nom)
);

-- =========================================================
-- Sources (liste gérée, ex: BAPIF, Privé, Autre stock — on peut en ajouter)
-- =========================================================
create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  created_at timestamptz not null default now()
);

insert into public.sources (nom) values ('BAPIF'), ('Privé'), ('Autre stock')
  on conflict (nom) do nothing;

-- =========================================================
-- Produits
-- =========================================================
create table if not exists public.produits (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid not null references public.stocks (id) on delete cascade,
  categorie_id uuid not null references public.categories (id) on delete restrict,
  nom text not null,
  quantite integer not null default 0 check (quantite >= 0),
  source text not null,
  date_peremption date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stock_id, categorie_id, nom)
);

-- Pour les bases créées avant l'ajout de la date de péremption.
alter table public.produits add column if not exists date_peremption date;
-- Pour les bases créées avant l'introduction de la table "sources" : la source
-- d'un produit n'est plus limitée à 3 valeurs fixes, on peut en ajouter librement.
alter table public.produits drop constraint if exists produits_source_check;

-- =========================================================
-- Historique des mouvements (audit log, jamais modifié après coup)
-- Les noms sont dupliqués ("snapshot") pour que l'historique reste
-- lisible même si un produit/une catégorie/un stock est renommé ou supprimé.
-- =========================================================
create table if not exists public.mouvements (
  id uuid primary key default gen_random_uuid(),
  date_heure timestamptz not null default now(),
  type text not null check (
    type in ('ajout', 'retrait', 'transfert_sortie', 'transfert_entree', 'distribution_sortie', 'distribution_retour')
  ),
  quantite integer not null check (quantite > 0),
  produit_id uuid references public.produits (id) on delete set null,
  produit_nom text not null,
  stock_id uuid references public.stocks (id) on delete set null,
  stock_nom text not null,
  categorie_nom text not null,
  source text,
  transfert_id uuid,
  utilisateur_id uuid references public.profiles (id),
  utilisateur_nom text not null,
  annule boolean not null default false,
  annulation_de uuid references public.mouvements (id),
  commentaire text,
  restaure_categorie_id uuid references public.categories (id) on delete set null,
  restaure_date_peremption date,
  restaure_source text
);

-- Pour les bases créées avant l'ajout de l'annulation de mouvements.
alter table public.mouvements add column if not exists annule boolean not null default false;
alter table public.mouvements add column if not exists annulation_de uuid references public.mouvements (id);
-- Pour les bases créées avant l'ajout du commentaire libre sur un mouvement.
alter table public.mouvements add column if not exists commentaire text;
-- Pour les bases créées avant la suppression d'un produit à quantité 0 : ces
-- colonnes ne sont renseignées QUE sur le mouvement qui a vidé (et donc
-- supprimé) un produit, pour pouvoir le recréer à l'identique si annulé.
alter table public.mouvements add column if not exists restaure_categorie_id uuid references public.categories (id) on delete set null;
alter table public.mouvements add column if not exists restaure_date_peremption date;
alter table public.mouvements add column if not exists restaure_source text;

-- Pour les bases créées avant l'ajout des mouvements de distribution.
alter table public.mouvements drop constraint if exists mouvements_type_check;
alter table public.mouvements add constraint mouvements_type_check check (
  type in ('ajout', 'retrait', 'transfert_sortie', 'transfert_entree', 'distribution_sortie', 'distribution_retour')
);

create index if not exists idx_mouvements_date on public.mouvements (date_heure desc);
create index if not exists idx_mouvements_stock on public.mouvements (stock_id);
create index if not exists idx_produits_stock on public.produits (stock_id);
create index if not exists idx_categories_stock on public.categories (stock_id);

-- =========================================================
-- Distributions : sortie de stock pour une distribution du jour,
-- puis clôture avec ce qu'il reste (retour en stock).
-- =========================================================
create table if not exists public.distributions (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid not null references public.stocks (id) on delete cascade,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'terminee')),
  date_sortie timestamptz not null default now(),
  date_retour timestamptz,
  utilisateur_sortie_id uuid references public.profiles (id),
  utilisateur_sortie_nom text not null,
  utilisateur_retour_id uuid references public.profiles (id),
  utilisateur_retour_nom text,
  commentaire_sortie text,
  commentaire_retour text
);

-- Pour les bases créées avant l'ajout des commentaires de distribution.
alter table public.distributions add column if not exists commentaire_sortie text;
alter table public.distributions add column if not exists commentaire_retour text;

create table if not exists public.distribution_lignes (
  id uuid primary key default gen_random_uuid(),
  distribution_id uuid not null references public.distributions (id) on delete cascade,
  produit_id uuid references public.produits (id) on delete set null,
  produit_nom text not null,
  categorie_nom text not null,
  quantite_sortie integer not null check (quantite_sortie > 0),
  quantite_retour integer check (quantite_retour is null or quantite_retour >= 0),
  restaure_categorie_id uuid references public.categories (id) on delete set null,
  restaure_date_peremption date,
  restaure_source text
);

-- Pour les bases créées avant la suppression d'un produit à quantité 0 : ne sont
-- renseignées que si la sortie a vidé (et donc supprimé) le produit, pour
-- pouvoir le recréer si du reste est enregistré ensuite.
alter table public.distribution_lignes add column if not exists restaure_categorie_id uuid references public.categories (id) on delete set null;
alter table public.distribution_lignes add column if not exists restaure_date_peremption date;
alter table public.distribution_lignes add column if not exists restaure_source text;

create index if not exists idx_distributions_stock on public.distributions (stock_id);
create index if not exists idx_distributions_statut on public.distributions (statut);
create index if not exists idx_distribution_lignes_distribution on public.distribution_lignes (distribution_id);

-- =========================================================
-- Fonctions métier (atomiques : quantité + historique dans la même transaction)
-- =========================================================

-- Ajoute ou retire une quantité sur un produit existant, et journalise le mouvement.
-- Si un retrait vide le produit (quantité résultante = 0), le produit est
-- SUPPRIMÉ (plus affiché dans le stock). Les infos nécessaires pour le
-- recréer à l'identique (catégorie, source, péremption) sont alors capturées
-- sur la ligne d'historique, pour que annuler_mouvement puisse le restituer.
create or replace function public.ajuster_quantite(
  p_produit_id uuid,
  p_delta integer,
  p_type text,
  p_source text default null,
  p_commentaire text default null
)
returns public.produits
language plpgsql
security definer set search_path = public
as $$
declare
  v_produit public.produits;
  v_nom text;
  v_prenom text;
  v_new_qty integer;
  v_supprime boolean := false;
  v_produit_id_final uuid;
begin
  if p_type not in ('ajout', 'retrait') then
    raise exception 'type invalide: %', p_type;
  end if;

  if public.role_utilisateur() not in ('respo_log', 'respo_autres') then
    raise exception 'action non autorisée pour ce rôle';
  end if;

  select nom, prenom into v_nom, v_prenom from public.profiles where id = auth.uid();
  if v_nom is null then
    raise exception 'profil utilisateur introuvable';
  end if;

  select * into v_produit from public.produits where id = p_produit_id for update;
  if not found then
    raise exception 'produit introuvable';
  end if;

  v_new_qty := v_produit.quantite + p_delta;
  if v_new_qty < 0 then
    raise exception 'quantité insuffisante';
  end if;

  if p_type = 'retrait' and v_new_qty = 0 then
    delete from public.produits where id = p_produit_id;
    v_supprime := true;
    v_produit_id_final := null;
  else
    update public.produits
      set quantite = v_new_qty, updated_at = now()
      where id = p_produit_id
      returning * into v_produit;
    v_produit_id_final := v_produit.id;
  end if;

  insert into public.mouvements (
    type, quantite, produit_id, produit_nom, stock_id, stock_nom, categorie_nom,
    source, utilisateur_id, utilisateur_nom, commentaire,
    restaure_categorie_id, restaure_date_peremption, restaure_source
  )
  select
    p_type, abs(p_delta), v_produit_id_final, v_produit.nom, v_produit.stock_id, s.nom, c.nom,
    p_source, auth.uid(), v_nom || ' ' || v_prenom, nullif(trim(p_commentaire), ''),
    case when v_supprime then v_produit.categorie_id else null end,
    case when v_supprime then v_produit.date_peremption else null end,
    case when v_supprime then v_produit.source else null end
  from public.stocks s, public.categories c
  where s.id = v_produit.stock_id and c.id = v_produit.categorie_id;

  return v_produit;
end;
$$;

-- Transfère une quantité d'un produit vers un autre stock (crée le produit
-- destination s'il n'existe pas encore dans ce stock/cette catégorie, avec la
-- même date de péremption que la source). Si le transfert vide le produit
-- source (quantité résultante = 0), il est supprimé du stock d'origine ; les
-- infos pour le recréer à l'identique sont capturées sur le mouvement
-- "transfert_sortie" pour que annuler_mouvement puisse le restituer.
create or replace function public.transferer_produit(
  p_produit_id uuid,
  p_quantite integer,
  p_stock_dest_id uuid,
  p_categorie_dest_id uuid
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_source public.produits;
  v_dest public.produits;
  v_nom text;
  v_prenom text;
  v_transfert_id uuid := gen_random_uuid();
  v_stock_source_nom text;
  v_categorie_source_nom text;
  v_stock_dest_nom text;
  v_categorie_dest_nom text;
  v_new_qty integer;
  v_supprime boolean := false;
  v_source_id_final uuid;
begin
  if p_quantite <= 0 then
    raise exception 'quantité invalide';
  end if;

  if public.role_utilisateur() <> 'respo_log' then
    raise exception 'seul le respo log peut faire un transfert entre stocks';
  end if;

  select nom, prenom into v_nom, v_prenom from public.profiles where id = auth.uid();
  if v_nom is null then
    raise exception 'profil utilisateur introuvable';
  end if;

  select * into v_source from public.produits where id = p_produit_id for update;
  if not found then
    raise exception 'produit source introuvable';
  end if;
  if v_source.quantite < p_quantite then
    raise exception 'quantité insuffisante dans le stock source';
  end if;
  if v_source.stock_id = p_stock_dest_id then
    raise exception 'stock destination identique au stock source';
  end if;

  select nom into v_stock_source_nom from public.stocks where id = v_source.stock_id;
  select nom into v_categorie_source_nom from public.categories where id = v_source.categorie_id;
  select nom into v_stock_dest_nom from public.stocks where id = p_stock_dest_id;
  select nom into v_categorie_dest_nom from public.categories where id = p_categorie_dest_id;

  v_new_qty := v_source.quantite - p_quantite;
  if v_new_qty = 0 then
    delete from public.produits where id = p_produit_id;
    v_supprime := true;
    v_source_id_final := null;
  else
    update public.produits
      set quantite = v_new_qty, updated_at = now()
      where id = p_produit_id;
    v_source_id_final := p_produit_id;
  end if;

  select * into v_dest from public.produits
    where stock_id = p_stock_dest_id and categorie_id = p_categorie_dest_id and nom = v_source.nom
    for update;

  if found then
    update public.produits
      set quantite = quantite + p_quantite, updated_at = now()
      where id = v_dest.id
      returning * into v_dest;
  else
    insert into public.produits (stock_id, categorie_id, nom, quantite, source, date_peremption)
    values (p_stock_dest_id, p_categorie_dest_id, v_source.nom, p_quantite, 'Autre stock', v_source.date_peremption)
    returning * into v_dest;
  end if;

  insert into public.mouvements (
    type, quantite, produit_id, produit_nom, stock_id, stock_nom, categorie_nom,
    transfert_id, utilisateur_id, utilisateur_nom,
    restaure_categorie_id, restaure_date_peremption, restaure_source
  ) values (
    'transfert_sortie', p_quantite, v_source_id_final, v_source.nom, v_source.stock_id, v_stock_source_nom, v_categorie_source_nom,
    v_transfert_id, auth.uid(), v_nom || ' ' || v_prenom,
    case when v_supprime then v_source.categorie_id else null end,
    case when v_supprime then v_source.date_peremption else null end,
    case when v_supprime then v_source.source else null end
  );

  insert into public.mouvements (
    type, quantite, produit_id, produit_nom, stock_id, stock_nom, categorie_nom,
    transfert_id, utilisateur_id, utilisateur_nom
  ) values (
    'transfert_entree', p_quantite, v_dest.id, v_source.nom, p_stock_dest_id, v_stock_dest_nom, v_categorie_dest_nom,
    v_transfert_id, auth.uid(), v_nom || ' ' || v_prenom
  );
end;
$$;

-- Journalise la création d'un nouveau produit (appelée juste après l'insert côté client).
create or replace function public.journaliser_creation_produit(
  p_produit_id uuid,
  p_commentaire text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_produit public.produits;
  v_nom text;
  v_prenom text;
begin
  if public.role_utilisateur() not in ('respo_log', 'respo_autres') then
    raise exception 'action non autorisée pour ce rôle';
  end if;

  select nom, prenom into v_nom, v_prenom from public.profiles where id = auth.uid();
  select * into v_produit from public.produits where id = p_produit_id;

  insert into public.mouvements (
    type, quantite, produit_id, produit_nom, stock_id, stock_nom, categorie_nom,
    source, utilisateur_id, utilisateur_nom, commentaire
  )
  select
    'ajout', v_produit.quantite, v_produit.id, v_produit.nom, v_produit.stock_id, s.nom, c.nom,
    v_produit.source, auth.uid(), v_nom || ' ' || v_prenom, nullif(trim(p_commentaire), '')
  from public.stocks s, public.categories c
  where s.id = v_produit.stock_id and c.id = v_produit.categorie_id;
end;
$$;

-- Sortie de stock pour une distribution : décrémente chaque produit choisi et
-- ouvre une "distribution" en cours, dont on enregistrera le reste plus tard.
-- p_lignes : jsonb du type [{"produit_id": "...", "quantite": 3}, ...]
create or replace function public.creer_distribution(
  p_stock_id uuid,
  p_lignes jsonb,
  p_commentaire text default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_nom text;
  v_prenom text;
  v_stock_nom text;
  v_distribution_id uuid;
  v_ligne jsonb;
  v_produit public.produits;
  v_categorie_nom text;
  v_qte integer;
  v_new_qty integer;
  v_supprime boolean;
  v_produit_id_final uuid;
  v_lignes_creees integer := 0;
begin
  select nom, prenom into v_nom, v_prenom from public.profiles where id = auth.uid();
  if v_nom is null then
    raise exception 'profil utilisateur introuvable';
  end if;

  select nom into v_stock_nom from public.stocks where id = p_stock_id;
  if v_stock_nom is null then
    raise exception 'stock introuvable';
  end if;

  if p_lignes is null or jsonb_array_length(p_lignes) = 0 then
    raise exception 'aucune ligne de distribution';
  end if;

  insert into public.distributions (stock_id, utilisateur_sortie_id, utilisateur_sortie_nom, commentaire_sortie)
  values (p_stock_id, auth.uid(), v_nom || ' ' || v_prenom, nullif(trim(p_commentaire), ''))
  returning id into v_distribution_id;

  for v_ligne in select * from jsonb_array_elements(p_lignes)
  loop
    v_qte := (v_ligne ->> 'quantite')::integer;
    if v_qte is null or v_qte <= 0 then
      continue;
    end if;

    select * into v_produit from public.produits where id = (v_ligne ->> 'produit_id')::uuid for update;
    if not found then
      raise exception 'produit introuvable';
    end if;
    if v_produit.stock_id <> p_stock_id then
      raise exception 'produit hors du stock sélectionné';
    end if;
    if v_produit.quantite < v_qte then
      raise exception 'quantité insuffisante pour %', v_produit.nom;
    end if;

    select nom into v_categorie_nom from public.categories where id = v_produit.categorie_id;

    v_new_qty := v_produit.quantite - v_qte;
    v_supprime := v_new_qty = 0;
    if v_supprime then
      delete from public.produits where id = v_produit.id;
      v_produit_id_final := null;
    else
      update public.produits set quantite = v_new_qty, updated_at = now() where id = v_produit.id;
      v_produit_id_final := v_produit.id;
    end if;

    insert into public.distribution_lignes (
      distribution_id, produit_id, produit_nom, categorie_nom, quantite_sortie,
      restaure_categorie_id, restaure_date_peremption, restaure_source
    )
    values (
      v_distribution_id, v_produit_id_final, v_produit.nom, v_categorie_nom, v_qte,
      case when v_supprime then v_produit.categorie_id else null end,
      case when v_supprime then v_produit.date_peremption else null end,
      case when v_supprime then v_produit.source else null end
    );

    insert into public.mouvements (
      type, quantite, produit_id, produit_nom, stock_id, stock_nom, categorie_nom,
      utilisateur_id, utilisateur_nom, commentaire
    ) values (
      'distribution_sortie', v_qte, v_produit_id_final, v_produit.nom, p_stock_id, v_stock_nom, v_categorie_nom,
      auth.uid(), v_nom || ' ' || v_prenom, nullif(trim(p_commentaire), '')
    );

    v_lignes_creees := v_lignes_creees + 1;
  end loop;

  if v_lignes_creees = 0 then
    delete from public.distributions where id = v_distribution_id;
    raise exception 'aucune quantité valide saisie';
  end if;

  return v_distribution_id;
end;
$$;

-- Clôture une distribution en cours : enregistre ce qu'il reste (retour en stock)
-- pour chaque ligne. p_retours : jsonb du type [{"ligne_id": "...", "quantite_retour": 2}, ...]
create or replace function public.cloturer_distribution(
  p_distribution_id uuid,
  p_retours jsonb,
  p_commentaire text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_nom text;
  v_prenom text;
  v_stock_id uuid;
  v_stock_nom text;
  v_statut text;
  v_retour jsonb;
  v_ligne public.distribution_lignes;
  v_qte integer;
  v_produit_id_final uuid;
begin
  select nom, prenom into v_nom, v_prenom from public.profiles where id = auth.uid();
  if v_nom is null then
    raise exception 'profil utilisateur introuvable';
  end if;

  -- Verrouille la distribution avant de lire son statut : sans ce lock, deux
  -- clics simultanés sur "Clôturer" pourraient tous les deux se croire seuls,
  -- passer le contrôle "déjà clôturée", et recréditer le stock deux fois.
  select stock_id, statut into v_stock_id, v_statut
    from public.distributions where id = p_distribution_id for update;
  if v_stock_id is null then
    raise exception 'distribution introuvable';
  end if;
  if v_statut = 'terminee' then
    raise exception 'cette distribution est déjà clôturée';
  end if;
  select nom into v_stock_nom from public.stocks where id = v_stock_id;

  for v_retour in select * from jsonb_array_elements(coalesce(p_retours, '[]'::jsonb))
  loop
    select * into v_ligne from public.distribution_lignes where id = (v_retour ->> 'ligne_id')::uuid for update;
    if not found then
      continue;
    end if;

    v_qte := (v_retour ->> 'quantite_retour')::integer;
    if v_qte is null or v_qte < 0 then
      v_qte := 0;
    end if;
    if v_qte > v_ligne.quantite_sortie then
      raise exception 'le retour de % ne peut pas dépasser la quantité sortie', v_ligne.produit_nom;
    end if;

    update public.distribution_lignes set quantite_retour = v_qte where id = v_ligne.id;

    if v_qte > 0 then
      v_produit_id_final := v_ligne.produit_id;

      if v_produit_id_final is null then
        -- La sortie avait vidé (et donc supprimé) ce produit : on le recrée
        -- avec le reste rendu, en gardant sa catégorie/source/péremption d'origine.
        -- Si restaure_categorie_id est vide, ce n'est pas CETTE sortie qui a vidé
        -- le produit (elle avait laissé du stock) : une action plus récente et
        -- indépendante (retrait, transfert...) l'a fait disparaître depuis.
        if v_ligne.restaure_categorie_id is null then
          raise exception 'ce produit a été supprimé par une action plus récente sur ce même produit ; annule-la d''abord, ou vérifie la catégorie d''origine si elle a été supprimée';
        end if;
        begin
          insert into public.produits (stock_id, categorie_id, nom, quantite, source, date_peremption)
          values (
            v_stock_id, v_ligne.restaure_categorie_id, v_ligne.produit_nom, v_qte,
            v_ligne.restaure_source, v_ligne.restaure_date_peremption
          )
          returning id into v_produit_id_final;
        exception when unique_violation then
          raise exception 'un produit "%" existe déjà dans cette catégorie, restauration impossible', v_ligne.produit_nom;
        end;
        update public.distribution_lignes set produit_id = v_produit_id_final where id = v_ligne.id;
      else
        update public.produits set quantite = quantite + v_qte, updated_at = now() where id = v_produit_id_final;
      end if;

      insert into public.mouvements (
        type, quantite, produit_id, produit_nom, stock_id, stock_nom, categorie_nom,
        utilisateur_id, utilisateur_nom, commentaire
      ) values (
        'distribution_retour', v_qte, v_produit_id_final, v_ligne.produit_nom, v_stock_id, v_stock_nom, v_ligne.categorie_nom,
        auth.uid(), v_nom || ' ' || v_prenom, nullif(trim(p_commentaire), '')
      );
    end if;
  end loop;

  -- Toute ligne sans retour saisi est considérée comme entièrement distribuée (reste = 0).
  update public.distribution_lignes set quantite_retour = 0
    where distribution_id = p_distribution_id and quantite_retour is null;

  update public.distributions
    set statut = 'terminee',
        date_retour = now(),
        utilisateur_retour_id = auth.uid(),
        utilisateur_retour_nom = v_nom || ' ' || v_prenom,
        commentaire_retour = nullif(trim(p_commentaire), '')
    where id = p_distribution_id;
end;
$$;

-- Annule un mouvement (ajout, retrait ou transfert) : réservé au respo log.
-- Ne supprime jamais la ligne d'origine (elle est marquée "annule"), et ajoute
-- une nouvelle ligne d'historique qui compense l'effet, pour garder une trace
-- complète. Les mouvements de distribution ne sont pas annulables ici (la
-- comptabilité sortie/reste d'une distribution est gérée séparément).
create or replace function public.annuler_mouvement(p_mouvement_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_nom text;
  v_prenom text;
  v_mvt public.mouvements;
  v_autre public.mouvements;
  v_sortie public.mouvements;
  v_entree public.mouvements;
  v_produit_dest public.produits;
  v_produit_ajout public.produits;
  v_nouveau_id uuid;
begin
  if public.role_utilisateur() <> 'respo_log' then
    raise exception 'seul le respo log peut annuler un mouvement';
  end if;

  select nom, prenom into v_nom, v_prenom from public.profiles where id = auth.uid();
  if v_nom is null then
    raise exception 'profil utilisateur introuvable';
  end if;

  -- Verrouille la ligne avant de vérifier "déjà annulé" : sans ce lock, deux
  -- appels concurrents sur le même mouvement (double-clic, deux personnes) pourraient
  -- tous les deux passer le contrôle et compenser l'effet deux fois.
  select * into v_mvt from public.mouvements where id = p_mouvement_id for update;
  if not found then
    raise exception 'mouvement introuvable';
  end if;
  if v_mvt.annule then
    raise exception 'ce mouvement a déjà été annulé';
  end if;
  if v_mvt.annulation_de is not null then
    raise exception 'une annulation ne peut pas être annulée';
  end if;
  if v_mvt.type in ('distribution_sortie', 'distribution_retour') then
    raise exception 'les mouvements de distribution ne peuvent pas être annulés depuis l''historique';
  end if;

  if v_mvt.type = 'ajout' then
    if v_mvt.produit_id is null then
      raise exception 'le produit concerné a été supprimé, annulation impossible';
    end if;
    select * into v_produit_ajout from public.produits where id = v_mvt.produit_id for update;
    if not found or v_produit_ajout.quantite < v_mvt.quantite then
      raise exception 'quantité actuelle insuffisante pour annuler cet ajout';
    end if;
    update public.produits set quantite = quantite - v_mvt.quantite, updated_at = now()
      where id = v_mvt.produit_id;
    update public.mouvements set annule = true where id = v_mvt.id;
    insert into public.mouvements (
      type, quantite, produit_id, produit_nom, stock_id, stock_nom, categorie_nom,
      utilisateur_id, utilisateur_nom, annulation_de
    ) values (
      'retrait', v_mvt.quantite, v_mvt.produit_id, v_mvt.produit_nom, v_mvt.stock_id, v_mvt.stock_nom, v_mvt.categorie_nom,
      auth.uid(), v_nom || ' ' || v_prenom, v_mvt.id
    );

  elsif v_mvt.type = 'retrait' then
    v_nouveau_id := v_mvt.produit_id;
    if v_nouveau_id is null then
      -- Ce retrait avait vidé le produit à 0, ce qui l'avait supprimé : on le
      -- recrée à l'identique (nom, quantité, catégorie, source, péremption)
      -- avant de pouvoir compenser le mouvement. Si restaure_categorie_id est
      -- vide, ce n'est pas CE retrait qui a vidé le produit (il restait du
      -- stock après) : une action plus récente et indépendante l'a fait
      -- disparaître depuis — il faut d'abord annuler celle-là.
      if v_mvt.stock_id is null then
        raise exception 'le stock d''origine a été supprimé, restauration impossible';
      end if;
      if v_mvt.restaure_categorie_id is null then
        raise exception 'ce produit a été supprimé par une action plus récente sur ce même produit ; annule-la d''abord';
      end if;
      begin
        insert into public.produits (stock_id, categorie_id, nom, quantite, source, date_peremption)
        values (
          v_mvt.stock_id, v_mvt.restaure_categorie_id, v_mvt.produit_nom, v_mvt.quantite,
          v_mvt.restaure_source, v_mvt.restaure_date_peremption
        )
        returning id into v_nouveau_id;
      exception when unique_violation then
        raise exception 'un produit "%" existe déjà dans cette catégorie, restauration impossible', v_mvt.produit_nom;
      end;
    else
      update public.produits set quantite = quantite + v_mvt.quantite, updated_at = now()
        where id = v_nouveau_id;
    end if;
    update public.mouvements set annule = true where id = v_mvt.id;
    insert into public.mouvements (
      type, quantite, produit_id, produit_nom, stock_id, stock_nom, categorie_nom,
      utilisateur_id, utilisateur_nom, annulation_de
    ) values (
      'ajout', v_mvt.quantite, v_nouveau_id, v_mvt.produit_nom, v_mvt.stock_id, v_mvt.stock_nom, v_mvt.categorie_nom,
      auth.uid(), v_nom || ' ' || v_prenom, v_mvt.id
    );

  elsif v_mvt.type in ('transfert_sortie', 'transfert_entree') then
    if v_mvt.transfert_id is null then
      raise exception 'transfert incohérent';
    end if;
    -- Verrouille aussi l'autre moitié du transfert (sortie+entrée forment une
    -- paire) : sans ce lock, annuler les deux côtés en même temps pourrait
    -- passer les deux fois le contrôle "pas déjà annulé" avant que l'un des
    -- deux ne marque la paire comme annulée.
    select * into v_autre from public.mouvements
      where transfert_id = v_mvt.transfert_id and id <> v_mvt.id
      for update limit 1;
    if not found then
      raise exception 'le mouvement lié du transfert est introuvable';
    end if;
    if v_autre.annule then
      raise exception 'ce mouvement a déjà été annulé';
    end if;

    if v_mvt.type = 'transfert_sortie' then
      v_sortie := v_mvt; v_entree := v_autre;
    else
      v_sortie := v_autre; v_entree := v_mvt;
    end if;

    if v_entree.produit_id is null then
      raise exception 'le produit destination a depuis été supprimé, annulation impossible';
    end if;

    select * into v_produit_dest from public.produits where id = v_entree.produit_id for update;
    if not found or v_produit_dest.quantite < v_entree.quantite then
      raise exception 'quantité insuffisante dans le stock destination pour annuler ce transfert';
    end if;

    v_nouveau_id := v_sortie.produit_id;
    if v_nouveau_id is null then
      -- Ce transfert avait vidé le produit source à 0, ce qui l'avait
      -- supprimé du stock d'origine : on le recrée à l'identique. Si
      -- restaure_categorie_id est vide, ce n'est pas CE transfert qui a vidé
      -- le produit (il restait du stock après) : une action plus récente et
      -- indépendante l'a fait disparaître depuis — il faut d'abord annuler celle-là.
      if v_sortie.stock_id is null then
        raise exception 'le stock d''origine a été supprimé, restauration impossible';
      end if;
      if v_sortie.restaure_categorie_id is null then
        raise exception 'ce produit a été supprimé par une action plus récente sur ce même produit ; annule-la d''abord';
      end if;
      begin
        insert into public.produits (stock_id, categorie_id, nom, quantite, source, date_peremption)
        values (
          v_sortie.stock_id, v_sortie.restaure_categorie_id, v_sortie.produit_nom, v_sortie.quantite,
          v_sortie.restaure_source, v_sortie.restaure_date_peremption
        )
        returning id into v_nouveau_id;
      exception when unique_violation then
        raise exception 'un produit "%" existe déjà dans cette catégorie, restauration impossible', v_sortie.produit_nom;
      end;
    else
      update public.produits set quantite = quantite + v_sortie.quantite, updated_at = now()
        where id = v_nouveau_id;
    end if;

    update public.produits set quantite = quantite - v_entree.quantite, updated_at = now()
      where id = v_entree.produit_id;

    update public.mouvements set annule = true where id in (v_sortie.id, v_entree.id);

    insert into public.mouvements (
      type, quantite, produit_id, produit_nom, stock_id, stock_nom, categorie_nom,
      transfert_id, utilisateur_id, utilisateur_nom, annulation_de
    ) values (
      'transfert_entree', v_sortie.quantite, v_nouveau_id, v_sortie.produit_nom,
      v_sortie.stock_id, v_sortie.stock_nom, v_sortie.categorie_nom,
      v_sortie.transfert_id, auth.uid(), v_nom || ' ' || v_prenom, v_sortie.id
    );
    insert into public.mouvements (
      type, quantite, produit_id, produit_nom, stock_id, stock_nom, categorie_nom,
      transfert_id, utilisateur_id, utilisateur_nom, annulation_de
    ) values (
      'transfert_sortie', v_entree.quantite, v_entree.produit_id, v_entree.produit_nom,
      v_entree.stock_id, v_entree.stock_nom, v_entree.categorie_nom,
      v_entree.transfert_id, auth.uid(), v_nom || ' ' || v_prenom, v_entree.id
    );
  end if;
end;
$$;

-- =========================================================
-- Row Level Security
--
-- Rôles :
--   respo_log     : tout faire et tout voir, y compris changer le rôle de chaque compte.
--   respo_autres  : tout faire sauf les transferts entre stocks. Accès à l'historique.
--   vsc           : uniquement les sorties de stock pour une distribution (+ le reste
--                   ensuite). Accès à l'historique en lecture.
--
-- La lecture (stocks, catégories, produits, historique, distributions, profils) reste
-- ouverte à tout compte connecté quel que soit son rôle : tout le monde doit pouvoir
-- consulter l'état des stocks. Les écritures directes sur les tables sont restreintes
-- par rôle ci-dessous ; les écritures qui passent par les fonctions SECURITY DEFINER
-- (ajuster_quantite, transferer_produit, creer_distribution, cloturer_distribution,
-- journaliser_creation_produit) sont elles-mêmes gardées par un contrôle de rôle DANS
-- la fonction, car ces fonctions contournent RLS sur les tables qu'elles écrivent.
-- =========================================================
alter table public.profiles enable row level security;
alter table public.stocks enable row level security;
alter table public.categories enable row level security;
alter table public.produits enable row level security;
alter table public.mouvements enable row level security;
alter table public.distributions enable row level security;
alter table public.distribution_lignes enable row level security;
alter table public.sources enable row level security;

drop policy if exists "profiles: lecture par tous les connectés" on public.profiles;
create policy "profiles: lecture par tous les connectés" on public.profiles
  for select using (auth.role() = 'authenticated');
-- Pas de policy permettant à chacun de modifier son propre profil : ça permettrait
-- à n'importe qui de s'auto-promouvoir en changeant sa propre colonne "role".
drop policy if exists "profiles: chacun modifie son propre profil" on public.profiles;
drop policy if exists "profiles: admin modifie tous les profils" on public.profiles;
drop policy if exists "profiles: respo_log modifie tous les profils" on public.profiles;
create policy "profiles: respo_log modifie tous les profils" on public.profiles
  for update using (public.role_utilisateur() = 'respo_log');

drop policy if exists "stocks: lecture par tous les connectés" on public.stocks;
create policy "stocks: lecture par tous les connectés" on public.stocks
  for select using (auth.role() = 'authenticated');
drop policy if exists "stocks: création par tous les connectés" on public.stocks;
drop policy if exists "stocks: création par respo" on public.stocks;
create policy "stocks: création par respo" on public.stocks
  for insert with check (public.role_utilisateur() in ('respo_log', 'respo_autres'));
drop policy if exists "stocks: suppression par admin" on public.stocks;
drop policy if exists "stocks: suppression par respo" on public.stocks;
drop policy if exists "stocks: suppression par respo_log" on public.stocks;
create policy "stocks: suppression par respo_log" on public.stocks
  for delete using (public.role_utilisateur() = 'respo_log');
drop policy if exists "stocks: renommage par respo" on public.stocks;
create policy "stocks: renommage par respo" on public.stocks
  for update using (public.role_utilisateur() in ('respo_log', 'respo_autres'));

drop policy if exists "categories: lecture par tous les connectés" on public.categories;
create policy "categories: lecture par tous les connectés" on public.categories
  for select using (auth.role() = 'authenticated');
drop policy if exists "categories: création par tous les connectés" on public.categories;
drop policy if exists "categories: création par respo" on public.categories;
create policy "categories: création par respo" on public.categories
  for insert with check (public.role_utilisateur() in ('respo_log', 'respo_autres'));
drop policy if exists "categories: suppression par admin" on public.categories;
drop policy if exists "categories: suppression par respo" on public.categories;
create policy "categories: suppression par respo" on public.categories
  for delete using (public.role_utilisateur() in ('respo_log', 'respo_autres'));
drop policy if exists "categories: renommage par respo" on public.categories;
create policy "categories: renommage par respo" on public.categories
  for update using (public.role_utilisateur() in ('respo_log', 'respo_autres'));

drop policy if exists "produits: lecture par tous les connectés" on public.produits;
create policy "produits: lecture par tous les connectés" on public.produits
  for select using (auth.role() = 'authenticated');
drop policy if exists "produits: création par tous les connectés" on public.produits;
drop policy if exists "produits: création par respo" on public.produits;
create policy "produits: création par respo" on public.produits
  for insert with check (public.role_utilisateur() in ('respo_log', 'respo_autres'));
drop policy if exists "produits: modification par tous les connectés" on public.produits;
drop policy if exists "produits: modification par respo" on public.produits;
create policy "produits: modification par respo" on public.produits
  for update using (public.role_utilisateur() in ('respo_log', 'respo_autres'));

drop policy if exists "mouvements: lecture par tous les connectés" on public.mouvements;
create policy "mouvements: lecture par tous les connectés" on public.mouvements
  for select using (auth.role() = 'authenticated');
-- Les insertions dans mouvements passent uniquement par les fonctions SECURITY DEFINER
-- ci-dessus ; pas de policy d'insert directe pour empêcher un client de falsifier l'historique.

drop policy if exists "distributions: lecture par tous les connectés" on public.distributions;
create policy "distributions: lecture par tous les connectés" on public.distributions
  for select using (auth.role() = 'authenticated');

drop policy if exists "distribution_lignes: lecture par tous les connectés" on public.distribution_lignes;
create policy "distribution_lignes: lecture par tous les connectés" on public.distribution_lignes
  for select using (auth.role() = 'authenticated');
-- Écritures sur distributions / distribution_lignes uniquement via creer_distribution
-- et cloturer_distribution (SECURITY DEFINER, ouvertes aux 3 rôles), pour garder
-- l'historique fiable.

drop policy if exists "sources: lecture par tous les connectés" on public.sources;
create policy "sources: lecture par tous les connectés" on public.sources
  for select using (auth.role() = 'authenticated');
drop policy if exists "sources: création par respo" on public.sources;
create policy "sources: création par respo" on public.sources
  for insert with check (public.role_utilisateur() in ('respo_log', 'respo_autres'));
