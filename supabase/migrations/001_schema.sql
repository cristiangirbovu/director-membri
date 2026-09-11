-- =============================================================================
-- 001_schema.sql
-- Schema completa: tabele, tipuri, functii de acces, drepturi.
-- Se ruleaza O SINGURA DATA in Supabase > SQL Editor.
--
-- Principiu: browserul nu citeste si nu scrie NICIODATA direct in tabele.
-- Toate tabelele au RLS activ fara politici, deci sunt inchise pentru
-- anon si authenticated. Accesul trece exclusiv prin functiile de mai jos,
-- care verifica cine intreaba si intorc doar ce are voie sa vada.
-- =============================================================================

-- ------------------------------------------------------------------ tipuri
create type afisare_t as enum ('public', 'fara_telefon', 'intern');
create type verdict_t as enum ('acceptat', 'de_verificat', 'respins');
create type stare_t   as enum ('activ', 'inactiv', 'sters');

-- ------------------------------------------------------------- referinta
-- Copia listei publice a Ministerului. Fara telefoane, fara judet: doar ce
-- foloseste potrivirea. Se reimprospateaza lunar prin inlocuire completa.
create table referinta (
  id                bigint generated always as identity primary key,
  nume              text not null,
  numar_autorizatie text,
  limbi             text,              -- "Engleză, Franceză", exact ca la MJ
  curte_apel        text,
  nume_norm         text,
  nume_key          text,
  auth_norm         text,
  actualizat_la     timestamptz not null default now()
);
create index referinta_auth_idx on referinta (auth_norm);
create index referinta_key_idx  on referinta (nume_key);

-- ---------------------------------------------------------------- membri
create table membri (
  id                       uuid primary key default gen_random_uuid(),
  creat_la                 timestamptz not null default now(),

  -- ce a completat omul
  nume                     text not null,
  numar_autorizatie        text not null,
  limbi                    text[] not null,
  judet                    text not null,
  localitate               text not null,
  email                    text not null,
  telefon                  text,
  firma                    text,
  site                     text,
  consimtamant_prelucrare  boolean not null default false,
  afisare                  afisare_t not null default 'intern',

  -- ce a decis verificarea
  verdict                  verdict_t not null default 'de_verificat',
  motiv                    text,
  mj_nume                  text,
  mj_limbi                 text,
  mj_curte                 text,
  verificat_la             timestamptz,
  auth_norm                text,

  -- viata membrului
  confirmat_la             timestamptz not null default now(),
  stare                    stare_t not null default 'activ',
  auth_user_id             uuid references auth.users (id) on delete set null
);
create unique index membri_email_uniq on membri (lower(email));
create index membri_auth_norm_idx on membri (auth_norm);
create index membri_verdict_idx   on membri (verdict, stare);
create index membri_user_idx      on membri (auth_user_id);

-- --------------------------------------------------------- administratori
-- Cine poate intra in /admin. Se adauga manual, prin SQL, de catre Cristian.
create table administratori (
  email      text primary key,
  adaugat_la timestamptz not null default now()
);

-- --------------------------------------------------------------- invitati
-- Lista de contacte pentru invitatii. Tablou de bord intern, niciodata public.
create table invitati (
  id             bigint generated always as identity primary key,
  nume           text,
  nume_mj        text,
  autorizatie    text,
  limbi          text,
  ca             text,
  email          text,
  telefon        text,
  verificare_mj  text,
  observatii     text,
  invitat_la     date,
  a_raspuns      text
);

-- ------------------------------------------------------------------- RLS
-- Activ pe toate, FARA politici: nimeni in afara de service_role nu atinge
-- tabelele direct. Functiile de mai jos sunt "security definer", deci ruleaza
-- cu drepturile proprietarului si decid singure ce intorc.
alter table referinta      enable row level security;
alter table membri         enable row level security;
alter table administratori enable row level security;
alter table invitati       enable row level security;

-- ========================================================== functii de acces

-- Cine intreaba e membru acceptat si activ?
create or replace function este_membru()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from membri
    where auth_user_id = auth.uid()
      and verdict = 'acceptat'
      and stare   = 'activ'
  );
$$;

-- Cine intreaba e administrator?
create or replace function este_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from administratori a
    join auth.users u on lower(u.email) = lower(a.email)
    where u.id = auth.uid()
  );
$$;

-- Ce stie pagina despre cel conectat.
create or replace function eu()
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'nume',    (select nume    from membri where auth_user_id = auth.uid() limit 1),
    'verdict', (select verdict from membri where auth_user_id = auth.uid() limit 1),
    'membru',  este_membru(),
    'admin',   este_admin()
  );
$$;

-- -----------------------------------------------------------------------
-- DIRECTORUL. Singura cale prin care cineva vede lista membrilor.
-- Aici se aplica, intr-un singur loc, ce a bifat fiecare la afisare:
--   'intern'        -> nu apare deloc
--   'fara_telefon'  -> apare, telefonul e sters
--   'public'        -> apare complet
-- Daca cel care intreaba nu e membru acceptat si activ, intoarce zero randuri.
-- -----------------------------------------------------------------------
create or replace function director()
returns table (
  nume         text,
  limbi        text[],
  judet        text,
  localitate   text,
  firma        text,
  site         text,
  email        text,
  telefon      text,
  confirmat_la timestamptz
)
language sql stable security definer set search_path = public
as $$
  select
    m.nume, m.limbi, m.judet, m.localitate, m.firma, m.site, m.email,
    case when m.afisare = 'fara_telefon' then null else m.telefon end,
    m.confirmat_la
  from membri m
  where este_membru()
    and m.verdict = 'acceptat'
    and m.stare   = 'activ'
    and m.afisare <> 'intern'
  order by m.nume;
$$;

-- ======================================================= functii de admin
-- Toate verifica este_admin() si arunca eroare altfel.

create or replace function admin_lista(p_verdict verdict_t default null)
returns table (
  id uuid, creat_la timestamptz, nume text, numar_autorizatie text, limbi text[],
  judet text, localitate text, email text, telefon text, firma text, site text,
  afisare afisare_t, verdict verdict_t, motiv text, mj_nume text, mj_limbi text,
  stare stare_t, confirmat_la timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not este_admin() then
    raise exception 'acces refuzat';
  end if;
  return query
    select m.id, m.creat_la, m.nume, m.numar_autorizatie, m.limbi, m.judet,
           m.localitate, m.email, m.telefon, m.firma, m.site, m.afisare,
           m.verdict, m.motiv, m.mj_nume, m.mj_limbi, m.stare, m.confirmat_la
    from membri m
    where (p_verdict is null or m.verdict = p_verdict)
      and m.stare <> 'sters'
    order by m.creat_la desc;
end;
$$;

-- Decide un caz: 'acceptat' sau 'respins'.
create or replace function admin_decide(p_id uuid, p_verdict verdict_t, p_motiv text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not este_admin() then
    raise exception 'acces refuzat';
  end if;
  if p_verdict not in ('acceptat', 'respins') then
    raise exception 'verdict nevalid';
  end if;
  update membri
     set verdict      = p_verdict,
         motiv        = coalesce(p_motiv, motiv),
         verificat_la = now()
   where id = p_id;
end;
$$;

-- Schimba starea: 'activ', 'inactiv' sau 'sters' (la cerere de stergere).
create or replace function admin_stare(p_id uuid, p_stare stare_t)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not este_admin() then
    raise exception 'acces refuzat';
  end if;
  update membri set stare = p_stare where id = p_id;
end;
$$;

-- ------------------------------------------------------------- drepturi
-- Nimic pentru public. Doar cei conectati pot apela functiile, iar
-- functiile decid singure daca cel conectat are voie.
revoke all on function este_membru()                      from public;
revoke all on function este_admin()                       from public;
revoke all on function eu()                               from public;
revoke all on function director()                         from public;
revoke all on function admin_lista(verdict_t)             from public;
revoke all on function admin_decide(uuid, verdict_t, text) from public;
revoke all on function admin_stare(uuid, stare_t)         from public;

grant execute on function este_membru()                      to authenticated;
grant execute on function este_admin()                       to authenticated;
grant execute on function eu()                               to authenticated;
grant execute on function director()                         to authenticated;
grant execute on function admin_lista(verdict_t)             to authenticated;
grant execute on function admin_decide(uuid, verdict_t, text) to authenticated;
grant execute on function admin_stare(uuid, stare_t)         to authenticated;
