-- LOTE OUTUBRO/2026: amigo secreto + botão do banner configurável.
-- (O liga/desliga de produto não precisa de SQL: usa a coluna products.active que já existe.)
-- Rode DEPOIS de add_model_pricing_and_color_photos.sql. Pode rodar mais de uma vez.

-- =========================================================
-- 1) BOTÃO DO BANNER: texto e link por banner (sem link = sem botão)
-- =========================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'banners' and column_name = 'cta_link'
  ) then
    alter table banners add column cta_text text;
    alter table banners add column cta_link text;
    -- só na primeira vez: os banners que já existem continuam com o botão de hoje
    update banners set cta_text = 'Ver coleção', cta_link = '#colecao';
  end if;
end $$;

-- =========================================================
-- 2) AMIGO SECRETO
-- Nada aqui é lido direto pelo navegador: tudo passa pelas funções ss_*
-- abaixo, que conferem o link secreto de cada pessoa.
-- =========================================================

-- liga/desliga do módulo (Admin > Amigo secreto). Começa desligado.
insert into store_settings (key, value) values ('secret_santa_enabled', 'false')
on conflict (key) do nothing;

create table if not exists ss_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text unique not null,
  draw_mode text not null default 'manual' check (draw_mode in ('auto', 'manual')),
  draw_date date,
  exchange_date date,
  min_value numeric(10,2),
  max_value numeric(10,2),
  require_approval boolean not null default true,
  reveal_after_exchange boolean not null default true,
  drawn_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists ss_participants (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references ss_groups(id) on delete cascade,
  name text not null,
  tee_size text,
  hoodie_size text,
  token text unique not null,
  is_organizer boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  assigned_to uuid references ss_participants(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists ss_participants_group_idx on ss_participants(group_id);
-- recuperação do link sem o responsável conseguir espiar:
-- PIN de 4 números (guardado embaralhado), link de recuperação que só abre com o PIN,
-- e registro de quando o responsável trocou o link à força.
alter table ss_participants add column if not exists pin_hash text;
alter table ss_participants add column if not exists recovery_token text unique;
alter table ss_participants add column if not exists recovery_attempts integer not null default 0;
alter table ss_participants add column if not exists recovery_links integer not null default 0;
alter table ss_participants add column if not exists link_reset_at timestamptz;

create table if not exists ss_wishlist (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references ss_participants(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  model_label text not null,
  color text not null,
  size text not null,
  created_at timestamptz default now()
);
create index if not exists ss_wishlist_participant_idx on ss_wishlist(participant_id);

-- conversa entre quem tirou (giver) e quem foi tirado; from_giver diz o sentido
create table if not exists ss_messages (
  id uuid primary key default gen_random_uuid(),
  giver_id uuid not null references ss_participants(id) on delete cascade,
  from_giver boolean not null,
  body text not null check (char_length(body) between 1 and 280),
  reported boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz default now()
);
create index if not exists ss_messages_giver_idx on ss_messages(giver_id);

alter table ss_groups enable row level security;
alter table ss_participants enable row level security;
alter table ss_wishlist enable row level security;
alter table ss_messages enable row level security;
-- sem políticas para o público: só as funções abaixo mexem nessas tabelas.
-- o admin logado só consegue ler (números na tela do admin).
drop policy if exists "admin autenticado le grupos" on ss_groups;
create policy "admin autenticado le grupos" on ss_groups
  for select using (auth.role() = 'authenticated');
drop policy if exists "admin autenticado le participantes" on ss_participants;
create policy "admin autenticado le participantes" on ss_participants
  for select using (auth.role() = 'authenticated');

-- ---------- funções internas ----------

create or replace function public.ss_today() returns date
language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

create or replace function public.ss_enabled() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select value = 'true' from store_settings where key = 'secret_santa_enabled'), false)
$$;

create or replace function public.ss_new_token() returns text
language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

create or replace function public.ss_clean_size(p text) returns text
language sql immutable as $$
  select nullif(left(trim(coalesce(p, '')), 6), '')
$$;

create or replace function public.ss_me(p_token text) returns ss_participants
language plpgsql stable security definer set search_path = public as $$
declare v ss_participants;
begin
  select * into v from ss_participants where token = p_token;
  if v.id is null then
    raise exception 'Link inválido, ou você não faz mais parte desse grupo. Fale com quem organizou.';
  end if;
  return v;
end $$;

-- sorteio em roda: embaralha e cada um tira o próximo (ninguém tira a si mesmo)
create or replace function public.ss_run_draw(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_n integer;
  i integer;
begin
  perform 1 from ss_groups where id = p_group_id and drawn_at is null for update;
  if not found then return; end if;

  select array_agg(id order by random()) into v_ids
  from ss_participants where group_id = p_group_id and status = 'approved';
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n < 3 then
    raise exception 'O sorteio precisa de pelo menos 3 pessoas aprovadas.';
  end if;

  for i in 1..v_n loop
    update ss_participants set assigned_to = v_ids[(i % v_n) + 1] where id = v_ids[i];
  end loop;
  -- quem ainda estava esperando aprovação fica de fora
  delete from ss_participants where group_id = p_group_id and status = 'pending';
  update ss_groups set drawn_at = now() where id = p_group_id;
end $$;

-- sorteio automático: acontece quando alguém abre o grupo na data (ou depois)
create or replace function public.ss_maybe_auto_draw(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g ss_groups;
begin
  select * into g from ss_groups where id = p_group_id;
  if g.drawn_at is null and g.draw_mode = 'auto' and g.draw_date is not null
     and g.draw_date <= ss_today()
     and (select count(*) from ss_participants where group_id = g.id and status = 'approved') >= 3 then
    perform ss_run_draw(g.id);
  end if;
end $$;

-- ---------- funções chamadas pela loja ----------

create or replace function public.ss_create_group(
  p_name text,
  p_organizer_name text,
  p_tee_size text,
  p_hoodie_size text,
  p_draw_mode text,
  p_draw_date date,
  p_exchange_date date,
  p_min_value numeric,
  p_max_value numeric,
  p_require_approval boolean,
  p_reveal_after_exchange boolean
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_group_id uuid;
  v_code text;
  v_token text := ss_new_token();
begin
  if not ss_enabled() then raise exception 'O amigo secreto não está disponível no momento.'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 60 then
    raise exception 'Dê um nome para o grupo (até 60 letras).';
  end if;
  if char_length(trim(coalesce(p_organizer_name, ''))) not between 1 and 40 then
    raise exception 'Coloque seu nome (até 40 letras).';
  end if;
  if p_draw_mode not in ('auto', 'manual') then raise exception 'Escolha como vai ser o sorteio.'; end if;
  if p_draw_mode = 'auto' and (p_draw_date is null or p_draw_date < ss_today()) then
    raise exception 'Escolha uma data de sorteio a partir de hoje.';
  end if;
  if p_exchange_date is not null and p_exchange_date < ss_today() then
    raise exception 'A data da troca já passou.';
  end if;
  if p_draw_mode = 'auto' and p_exchange_date is not null and p_draw_date > p_exchange_date then
    raise exception 'O sorteio precisa ser antes da troca.';
  end if;
  if p_min_value is not null and p_min_value < 0 or p_max_value is not null and p_max_value < 0 then
    raise exception 'Valores não podem ser negativos.';
  end if;
  if p_min_value is not null and p_max_value is not null and p_min_value > p_max_value then
    raise exception 'O valor mínimo está maior que o máximo.';
  end if;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from ss_groups where join_code = v_code);
  end loop;

  insert into ss_groups (name, join_code, draw_mode, draw_date, exchange_date, min_value, max_value,
                         require_approval, reveal_after_exchange)
  values (trim(p_name), v_code, p_draw_mode, case when p_draw_mode = 'auto' then p_draw_date end,
          p_exchange_date, p_min_value, p_max_value, coalesce(p_require_approval, true),
          coalesce(p_reveal_after_exchange, true))
  returning id into v_group_id;

  insert into ss_participants (group_id, name, tee_size, hoodie_size, token, is_organizer, status)
  values (v_group_id, trim(p_organizer_name), ss_clean_size(p_tee_size), ss_clean_size(p_hoodie_size),
          v_token, true, 'approved');

  return v_token;
end $$;

-- o que aparece para quem abre o link do grupo
create or replace function public.ss_group_preview(p_join_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g ss_groups;
begin
  select * into g from ss_groups where join_code = upper(trim(p_join_code));
  if g.id is null then return null; end if;
  perform ss_maybe_auto_draw(g.id);
  select * into g from ss_groups where id = g.id;
  return jsonb_build_object(
    'name', g.name,
    'organizer', (select name from ss_participants where group_id = g.id and is_organizer limit 1),
    'count', (select count(*) from ss_participants where group_id = g.id and status = 'approved'),
    'draw_mode', g.draw_mode,
    'draw_date', g.draw_date,
    'exchange_date', g.exchange_date,
    'min_value', g.min_value,
    'max_value', g.max_value,
    'require_approval', g.require_approval,
    'drawn', g.drawn_at is not null,
    'open', g.drawn_at is null and ss_enabled()
  );
end $$;

create or replace function public.ss_pin_hash(p_participant_id uuid, p_pin text) returns text
language sql immutable as $$
  select encode(sha256(convert_to(p_participant_id::text || ':' || p_pin, 'UTF8')), 'hex')
$$;

drop function if exists public.ss_join(text, text, text, text);
create or replace function public.ss_join(
  p_join_code text, p_name text, p_tee_size text, p_hoodie_size text, p_pin text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  g ss_groups;
  v_token text := ss_new_token();
  v_id uuid;
begin
  if not ss_enabled() then raise exception 'O amigo secreto não está disponível no momento.'; end if;
  select * into g from ss_groups where join_code = upper(trim(p_join_code)) for update;
  if g.id is null then raise exception 'Grupo não encontrado.'; end if;
  if g.drawn_at is not null then raise exception 'Esse grupo já fez o sorteio e não aceita mais gente.'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 40 then
    raise exception 'Coloque seu nome (até 40 letras).';
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    raise exception 'Escolha um PIN de 4 números.';
  end if;
  if (select count(*) from ss_participants where group_id = g.id) >= 100 then
    raise exception 'Esse grupo chegou ao limite de 100 pessoas.';
  end if;

  insert into ss_participants (group_id, name, tee_size, hoodie_size, token, status)
  values (g.id, trim(p_name), ss_clean_size(p_tee_size), ss_clean_size(p_hoodie_size), v_token,
          case when g.require_approval then 'pending' else 'approved' end)
  returning id into v_id;
  update ss_participants set pin_hash = ss_pin_hash(v_id, p_pin) where id = v_id;
  return v_token;
end $$;

-- lista de desejos de uma pessoa, já com o preço do modelo
create or replace function public.ss_wishlist_json(p_participant_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', w.id,
    'product_slug', p.slug,
    'product_name', p.name,
    'model_label', w.model_label,
    'color', w.color,
    'size', w.size,
    'price', (select pv.price from product_variants pv
              where pv.product_id = p.id and pv.model_label = w.model_label
              order by (pv.size = w.size and pv.color = w.color) desc limit 1),
    'image_urls', p.image_urls,
    'image_url', p.image_url,
    'color_images', p.color_images
  ) order by w.created_at), '[]'::jsonb)
  from ss_wishlist w join products p on p.id = w.product_id
  where w.participant_id = p_participant_id
$$;

-- tudo o que a página secreta da pessoa mostra
create or replace function public.ss_my_page(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me ss_participants;
  g ss_groups;
  v_target ss_participants;
  v_giver_id uuid;
  v_reveal boolean;
  v_result jsonb;
begin
  me := ss_me(p_token);
  perform ss_maybe_auto_draw(me.group_id);
  select * into me from ss_participants where id = me.id;
  select * into g from ss_groups where id = me.group_id;
  v_reveal := g.drawn_at is not null and g.reveal_after_exchange
              and g.exchange_date is not null and ss_today() > g.exchange_date;

  v_result := jsonb_build_object(
    'me', jsonb_build_object('name', me.name, 'tee_size', me.tee_size, 'hoodie_size', me.hoodie_size,
                             'status', me.status, 'is_organizer', me.is_organizer,
                             'link_reset_at', me.link_reset_at),
    'group', jsonb_build_object('name', g.name, 'join_code', g.join_code, 'draw_mode', g.draw_mode,
                                'draw_date', g.draw_date, 'exchange_date', g.exchange_date,
                                'min_value', g.min_value, 'max_value', g.max_value,
                                'require_approval', g.require_approval,
                                'reveal_after_exchange', g.reveal_after_exchange,
                                'drawn', g.drawn_at is not null),
    'my_wishlist', ss_wishlist_json(me.id)
  );

  if g.drawn_at is not null and me.assigned_to is not null then
    select * into v_target from ss_participants where id = me.assigned_to;
    v_result := v_result || jsonb_build_object(
      'target', jsonb_build_object('name', v_target.name, 'tee_size', v_target.tee_size,
                                   'hoodie_size', v_target.hoodie_size,
                                   'wishlist', ss_wishlist_json(v_target.id)),
      -- conversa com quem eu tirei
      'chat_target', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', m.id, 'mine', m.from_giver, 'body', m.body, 'created_at', m.created_at
        ) order by m.created_at), '[]'::jsonb)
        from ss_messages m where m.giver_id = me.id and not m.hidden)
    );
  end if;

  if g.drawn_at is not null then
    select id into v_giver_id from ss_participants where assigned_to = me.id limit 1;
    v_result := v_result || jsonb_build_object(
      -- conversa com quem me tirou (sem dizer quem é)
      'chat_giver', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', m.id, 'mine', not m.from_giver, 'body', m.body, 'reported', m.reported,
          'created_at', m.created_at
        ) order by m.created_at), '[]'::jsonb)
        from ss_messages m where m.giver_id = v_giver_id and not m.hidden)
    );
  end if;

  if v_reveal then
    v_result := v_result || jsonb_build_object('reveal', (
      select coalesce(jsonb_agg(jsonb_build_object('giver', a.name, 'receiver', b.name) order by a.name), '[]'::jsonb)
      from ss_participants a join ss_participants b on b.id = a.assigned_to
      where a.group_id = g.id));
  end if;

  if me.is_organizer then
    v_result := v_result || jsonb_build_object(
      'participants', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', p.id, 'name', p.name, 'status', p.status, 'is_organizer', p.is_organizer,
          'tee_size', p.tee_size, 'hoodie_size', p.hoodie_size,
          'has_wishlist', exists (select 1 from ss_wishlist w where w.participant_id = p.id)
        ) order by p.created_at), '[]'::jsonb)
        from ss_participants p where p.group_id = g.id),
      'reported', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'body', m.body)
          order by m.created_at), '[]'::jsonb)
        from ss_messages m join ss_participants p on p.id = m.giver_id
        where p.group_id = g.id and m.reported and not m.hidden)
    );
  end if;

  return v_result;
end $$;

create or replace function public.ss_update_me(p_token text, p_name text, p_tee_size text, p_hoodie_size text)
returns void
language plpgsql security definer set search_path = public as $$
declare me ss_participants := ss_me(p_token);
begin
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 40 then
    raise exception 'Coloque seu nome (até 40 letras).';
  end if;
  update ss_participants
  set name = trim(p_name), tee_size = ss_clean_size(p_tee_size), hoodie_size = ss_clean_size(p_hoodie_size)
  where id = me.id;
end $$;

-- ---------- responsável ----------

create or replace function public.ss_organizer(p_token text) returns ss_participants
language plpgsql stable security definer set search_path = public as $$
declare me ss_participants := ss_me(p_token);
begin
  if not me.is_organizer then raise exception 'Só quem organizou o grupo pode fazer isso.'; end if;
  return me;
end $$;

-- p_action: 'approve' ou 'remove'
create or replace function public.ss_manage_participant(p_token text, p_participant_id uuid, p_action text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me ss_participants := ss_organizer(p_token);
  v ss_participants;
begin
  select * into v from ss_participants where id = p_participant_id and group_id = me.group_id;
  if v.id is null then raise exception 'Pessoa não encontrada no grupo.'; end if;
  if exists (select 1 from ss_groups where id = me.group_id and drawn_at is not null) then
    raise exception 'Depois do sorteio não dá mais para mexer na lista.';
  end if;
  if p_action = 'approve' then
    update ss_participants set status = 'approved' where id = v.id;
  elsif p_action = 'remove' then
    if v.is_organizer then raise exception 'Quem organiza não pode sair do grupo.'; end if;
    delete from ss_participants where id = v.id;
  else
    raise exception 'Ação inválida.';
  end if;
end $$;

-- versão antiga (mostrava o link pessoal ao responsável): removida
drop function if exists public.ss_participant_link(text, uuid);

-- link de recuperação para quem perdeu o próprio link: só abre com o PIN da pessoa.
-- até 3 links de recuperação por pessoa, com 5 tentativas cada (evita chutar o PIN).
create or replace function public.ss_recovery_link(p_token text, p_participant_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me ss_participants := ss_organizer(p_token);
  v ss_participants;
  v_code text := ss_new_token();
begin
  select * into v from ss_participants where id = p_participant_id and group_id = me.group_id;
  if v.id is null or v.is_organizer then raise exception 'Pessoa não encontrada no grupo.'; end if;
  if v.pin_hash is null then raise exception 'Essa pessoa não tem PIN. Use "Trocar link".'; end if;
  if v.recovery_links >= 3 then
    raise exception 'Limite de links de recuperação atingido. Use "Trocar link".';
  end if;
  update ss_participants
  set recovery_token = v_code, recovery_attempts = 0, recovery_links = recovery_links + 1
  where id = v.id;
  return v_code;
end $$;

-- a pessoa abre o link de recuperação e digita o PIN: recebe o link pessoal.
-- devolve {token} ou {error} (sem exception, para a contagem de tentativas ficar salva)
drop function if exists public.ss_recover(text, text);
create or replace function public.ss_recover(p_recovery_token text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v ss_participants;
begin
  select * into v from ss_participants where recovery_token = p_recovery_token for update;
  if v.id is null then
    return jsonb_build_object('error', 'Esse link de recuperação não vale mais. Peça outro para quem organizou.');
  end if;
  if v.pin_hash = ss_pin_hash(v.id, coalesce(p_pin, '')) then
    update ss_participants set recovery_token = null, recovery_attempts = 0 where id = v.id;
    return jsonb_build_object('token', v.token);
  end if;
  if v.recovery_attempts + 1 >= 5 then
    update ss_participants set recovery_token = null, recovery_attempts = 0 where id = v.id;
    return jsonb_build_object('error', 'PIN errado 5 vezes. Esse link parou de funcionar: peça outro para quem organizou.');
  end if;
  update ss_participants set recovery_attempts = recovery_attempts + 1 where id = v.id;
  return jsonb_build_object('error', case when v.recovery_attempts + 1 = 4 then 'PIN errado. Resta 1 tentativa.'
    else format('PIN errado. Restam %s tentativas.', 5 - (v.recovery_attempts + 1)) end);
end $$;

-- quando a pessoa esqueceu o PIN: o responsável troca o link à força.
-- o link antigo para de funcionar e a página da pessoa avisa que foi trocado.
create or replace function public.ss_reset_link(p_token text, p_participant_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me ss_participants := ss_organizer(p_token);
  v_new text := ss_new_token();
begin
  update ss_participants
  set token = v_new, recovery_token = null, recovery_attempts = 0, link_reset_at = now()
  where id = p_participant_id and group_id = me.group_id and not is_organizer;
  if not found then raise exception 'Pessoa não encontrada no grupo.'; end if;
  return v_new;
end $$;

create or replace function public.ss_draw_now(p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare me ss_participants := ss_organizer(p_token);
begin
  if exists (select 1 from ss_groups where id = me.group_id and drawn_at is not null) then
    raise exception 'O sorteio já foi feito.';
  end if;
  perform ss_run_draw(me.group_id);
end $$;

create or replace function public.ss_hide_message(p_token text, p_message_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me ss_participants := ss_organizer(p_token);
begin
  update ss_messages m set hidden = true
  from ss_participants p
  where m.id = p_message_id and p.id = m.giver_id and p.group_id = me.group_id;
end $$;

-- ---------- lista de desejos ----------

create or replace function public.ss_wishlist_add(
  p_token text, p_product_slug text, p_model_label text, p_color text, p_size text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  me ss_participants := ss_me(p_token);
  v_product_id uuid;
begin
  select pv.product_id into v_product_id
  from product_variants pv join products p on p.id = pv.product_id
  where p.slug = p_product_slug and pv.model_label = p_model_label
    and pv.color = p_color and pv.size = p_size
  limit 1;
  if v_product_id is null then raise exception 'Essa combinação do produto não existe mais.'; end if;
  if (select count(*) from ss_wishlist where participant_id = me.id) >= 20 then
    raise exception 'Sua lista já tem 20 itens. Tire algum para pôr outro.';
  end if;
  if exists (select 1 from ss_wishlist where participant_id = me.id and product_id = v_product_id
             and model_label = p_model_label and color = p_color and size = p_size) then
    return;
  end if;
  insert into ss_wishlist (participant_id, product_id, model_label, color, size)
  values (me.id, v_product_id, p_model_label, p_color, p_size);
end $$;

create or replace function public.ss_wishlist_remove(p_token text, p_item_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me ss_participants := ss_me(p_token);
begin
  delete from ss_wishlist where id = p_item_id and participant_id = me.id;
end $$;

-- ---------- mensagens secretas ----------

-- p_to: 'target' (quem eu tirei) ou 'giver' (quem me tirou)
create or replace function public.ss_send_message(p_token text, p_to text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me ss_participants := ss_me(p_token);
  v_giver_id uuid;
  v_body text := trim(coalesce(p_body, ''));
begin
  if char_length(v_body) not between 1 and 280 then
    raise exception 'A mensagem precisa ter de 1 a 280 letras.';
  end if;
  if v_body ~* '(https?://|www\.|\.com|\.br\b|\.net\b)' then
    raise exception 'Mensagens não podem ter links.';
  end if;
  if not exists (select 1 from ss_groups where id = me.group_id and drawn_at is not null) then
    raise exception 'As mensagens abrem depois do sorteio.';
  end if;

  if p_to = 'target' then
    if me.assigned_to is null then raise exception 'Você ainda não tirou ninguém.'; end if;
    v_giver_id := me.id;
  elsif p_to = 'giver' then
    select id into v_giver_id from ss_participants where assigned_to = me.id limit 1;
    if v_giver_id is null then raise exception 'Ninguém te tirou ainda.'; end if;
  else
    raise exception 'Destino inválido.';
  end if;

  -- trava contra enxurrada: 30 mensagens por pessoa por dia
  if (select count(*) from ss_messages m
      where m.created_at > now() - interval '1 day'
        and ((m.giver_id = me.id and m.from_giver)
          or (not m.from_giver and m.giver_id = (select id from ss_participants where assigned_to = me.id limit 1)))
     ) >= 30 then
    raise exception 'Você mandou muitas mensagens hoje. Tente amanhã.';
  end if;

  insert into ss_messages (giver_id, from_giver, body) values (v_giver_id, p_to = 'target', v_body);
end $$;

-- quem recebeu a mensagem pode denunciar; o responsável vê e pode ocultar
create or replace function public.ss_report_message(p_token text, p_message_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me ss_participants := ss_me(p_token);
begin
  update ss_messages m set reported = true
  where m.id = p_message_id
    and ((m.giver_id = me.id and not m.from_giver)                         -- resposta de quem eu tirei
      or (m.from_giver and m.giver_id = (select id from ss_participants where assigned_to = me.id limit 1)));
end $$;

-- ---------- permissões ----------
-- as funções internas não ficam expostas para o público
revoke execute on function public.ss_run_draw(uuid) from public, anon, authenticated;
revoke execute on function public.ss_maybe_auto_draw(uuid) from public, anon, authenticated;
revoke execute on function public.ss_me(text) from public, anon, authenticated;
revoke execute on function public.ss_organizer(text) from public, anon, authenticated;
revoke execute on function public.ss_wishlist_json(uuid) from public, anon, authenticated;
revoke execute on function public.ss_new_token() from public, anon, authenticated;
revoke execute on function public.ss_pin_hash(uuid, text) from public, anon, authenticated;

grant execute on function public.ss_enabled() to anon, authenticated;
grant execute on function public.ss_create_group(text, text, text, text, text, date, date, numeric, numeric, boolean, boolean) to anon, authenticated;
grant execute on function public.ss_group_preview(text) to anon, authenticated;
grant execute on function public.ss_join(text, text, text, text, text) to anon, authenticated;
grant execute on function public.ss_my_page(text) to anon, authenticated;
grant execute on function public.ss_update_me(text, text, text, text) to anon, authenticated;
grant execute on function public.ss_manage_participant(text, uuid, text) to anon, authenticated;
grant execute on function public.ss_recovery_link(text, uuid) to anon, authenticated;
grant execute on function public.ss_recover(text, text) to anon, authenticated;
grant execute on function public.ss_reset_link(text, uuid) to anon, authenticated;
grant execute on function public.ss_draw_now(text) to anon, authenticated;
grant execute on function public.ss_hide_message(text, uuid) to anon, authenticated;
grant execute on function public.ss_wishlist_add(text, text, text, text, text) to anon, authenticated;
grant execute on function public.ss_wishlist_remove(text, uuid) to anon, authenticated;
grant execute on function public.ss_send_message(text, text, text) to anon, authenticated;
grant execute on function public.ss_report_message(text, uuid) to anon, authenticated;
