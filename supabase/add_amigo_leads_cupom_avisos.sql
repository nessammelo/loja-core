-- Amigo secreto: e-mail + aceite de novidades, WhatsApp do responsável,
-- cupom de 5% por grupo e rotina automática (sorteio + avisos por e-mail). v20, 24/11/2026
-- Pode rodar mais de uma vez. Cole tudo no SQL Editor do Supabase e clique em Run.
-- Precisa do add_amigo_ideias_presente.sql (v19) já rodado.

-- 1) Colunas novas ------------------------------------------------------------
alter table ss_participants add column if not exists email text;
alter table ss_participants add column if not exists marketing_optin boolean not null default false;
alter table ss_participants add column if not exists optin_at timestamptz;
alter table ss_participants add column if not exists last_seen_at timestamptz;
alter table ss_participants add column if not exists draw_email_at timestamptz;
alter table ss_participants add column if not exists msg_email_at timestamptz;

alter table ss_groups add column if not exists organizer_phone text;
alter table ss_groups add column if not exists warn_email_at timestamptz;

-- cupom que pertence a um grupo do amigo secreto (some junto se o grupo for apagado)
alter table coupons add column if not exists ss_group_id uuid references ss_groups(id) on delete cascade;
create index if not exists coupons_ss_group_idx on coupons(ss_group_id);

-- histórico dos e-mails do amigo secreto (pra respeitar o limite diário do Resend)
create table if not exists ss_email_log (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid references ss_participants(id) on delete set null,
  kind text not null,             -- sorteio | mensagens | aviso_responsavel
  to_email text,
  status text not null default 'sent',
  error text,
  created_at timestamptz not null default now()
);
create index if not exists ss_email_log_created_idx on ss_email_log(created_at);
alter table ss_email_log enable row level security;
drop policy if exists "admin autenticado le emails amigo" on ss_email_log;
create policy "admin autenticado le emails amigo" on ss_email_log
  for select using (auth.role() = 'authenticated');

-- 2) Contato da própria pessoa ---------------------------------------------------
-- p_phone: só vale pra quem organiza (null = não mexe no WhatsApp).
create or replace function public.ss_set_contact(p_token text, p_email text, p_optin boolean, p_phone text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me ss_participants := ss_me(p_token);
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
begin
  if v_email is not null and (char_length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Confira o e-mail.';
  end if;
  if p_phone is not null and me.is_organizer then
    if v_phone ~ '^55[0-9]{10,11}$' then v_phone := substr(v_phone, 3); end if; -- tira o +55
    if v_phone is null or char_length(v_phone) not between 10 and 11 then
      raise exception 'Confira o WhatsApp (com DDD).';
    end if;
    update ss_groups set organizer_phone = v_phone where id = me.group_id;
  end if;
  update ss_participants
  set email = v_email,
      marketing_optin = coalesce(p_optin, false) and v_email is not null,
      optin_at = case
        when coalesce(p_optin, false) and v_email is not null then coalesce(optin_at, now())
        else null end
  where id = me.id;
end $$;

-- 3) Cupom do grupo: 5%, uso ilimitado ------------------------------------------
-- Vale até 23h59 do dia da troca. Sem data de troca: 30 dias depois do sorteio;
-- se nunca sortear, 60 dias depois da criação do grupo.
create or replace function public.ss_coupon_expiry(p_group_id uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select (coalesce(g.exchange_date,
                   (g.drawn_at at time zone 'America/Sao_Paulo')::date + 30,
                   (coalesce(g.created_at, now()) at time zone 'America/Sao_Paulo')::date + 60)
          + time '23:59:59') at time zone 'America/Sao_Paulo'
  from ss_groups g where g.id = p_group_id
$$;

create or replace function public.ss_sync_group_coupon(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  select 'AMIGO' || join_code into v_code from ss_groups where id = p_group_id;
  if v_code is null then return; end if;
  insert into coupons (code, type, value, active, max_uses, expires_at, ss_group_id)
  values (v_code, 'percent', 5, true, null, ss_coupon_expiry(p_group_id), p_group_id)
  on conflict (code) do update set expires_at = excluded.expires_at
    where coupons.ss_group_id = excluded.ss_group_id;
end $$;

create or replace function public.ss_groups_coupon_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform ss_sync_group_coupon(new.id);
  return new;
end $$;

drop trigger if exists trg_ss_group_coupon on ss_groups;
create trigger trg_ss_group_coupon
  after insert or update of exchange_date, drawn_at on ss_groups
  for each row execute function public.ss_groups_coupon_trigger();

-- grupos que já existem ganham o cupom
do $$
declare r record;
begin
  for r in select id from ss_groups loop
    perform ss_sync_group_coupon(r.id);
  end loop;
end $$;

-- 4) Página secreta: + e-mail/aceite, WhatsApp (responsável), cupom do grupo ------
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
  -- marca a visita (e-mail de "mensagens novas" só avisa o que chegou depois disso)
  update ss_participants set last_seen_at = now() where id = me.id returning * into me;
  select * into g from ss_groups where id = me.group_id;
  v_reveal := g.drawn_at is not null and g.reveal_after_exchange
              and g.exchange_date is not null and ss_today() > g.exchange_date;

  v_result := jsonb_build_object(
    'me', jsonb_build_object('name', me.name, 'tee_size', me.tee_size, 'hoodie_size', me.hoodie_size,
                             'status', me.status, 'is_organizer', me.is_organizer,
                             'link_reset_at', me.link_reset_at, 'gift_ideas', me.gift_ideas,
                             'email', me.email, 'marketing_optin', me.marketing_optin,
                             'phone', case when me.is_organizer then g.organizer_phone end),
    'group', jsonb_build_object('name', g.name, 'join_code', g.join_code, 'draw_mode', g.draw_mode,
                                'draw_date', g.draw_date, 'exchange_date', g.exchange_date,
                                'min_value', g.min_value, 'max_value', g.max_value,
                                'require_approval', g.require_approval,
                                'reveal_after_exchange', g.reveal_after_exchange,
                                'drawn', g.drawn_at is not null,
                                'coupon_code', (select c.code from coupons c
                                                where c.ss_group_id = g.id and c.active
                                                  and (c.expires_at is null or c.expires_at > now()) limit 1),
                                'coupon_expires_at', (select c.expires_at from coupons c
                                                      where c.ss_group_id = g.id limit 1)),
    'my_wishlist', ss_wishlist_json(me.id)
  );

  if g.drawn_at is not null and me.assigned_to is not null then
    select * into v_target from ss_participants where id = me.assigned_to;
    v_result := v_result || jsonb_build_object(
      'target', jsonb_build_object('name', v_target.name, 'tee_size', v_target.tee_size,
                                   'hoodie_size', v_target.hoodie_size,
                                   'gift_ideas', v_target.gift_ideas,
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
          'has_wishlist', exists (select 1 from ss_wishlist w where w.participant_id = p.id),
          'has_ideas', nullif(trim(coalesce(p.gift_ideas, '')), '') is not null,
          'has_email', p.email is not null
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

-- 5) Rotina automática (Netlify, de hora em hora) --------------------------------
-- Faz os sorteios automáticos do dia e devolve quem precisa receber e-mail.
-- p_limit: quantos e-mails ainda cabem hoje.
create or replace function public.ss_cron_tick(p_limit integer default 40) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g record;
  v_draw jsonb;
  v_msgs jsonb;
  v_warn jsonb;
  v_left integer := greatest(coalesce(p_limit, 0), 0);
begin
  -- sorteios automáticos vencidos (com pelo menos 3 aprovados)
  for g in
    select id from ss_groups
    where drawn_at is null and draw_mode = 'auto' and draw_date is not null and draw_date <= ss_today()
  loop
    begin
      perform ss_maybe_auto_draw(g.id);
    exception when others then
      null; -- um grupo com problema não trava os outros
    end;
  end loop;

  -- "O sorteio saiu" (sem dizer quem tirou)
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_draw from (
    select p.id, p.email, p.name, p.token, gr.name as group_name, gr.exchange_date,
           (select c.code from coupons c where c.ss_group_id = gr.id and c.active
              and (c.expires_at is null or c.expires_at > now()) limit 1) as coupon_code
    from ss_participants p join ss_groups gr on gr.id = p.group_id
    where gr.drawn_at is not null and gr.drawn_at > now() - interval '30 days'
      and p.status = 'approved' and p.email is not null and p.draw_email_at is null
      and p.assigned_to is not null
    order by gr.drawn_at
    limit v_left
  ) x;
  v_left := v_left - jsonb_array_length(v_draw);

  -- responsável: chegou o dia do sorteio e não tem 3 aprovados
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_warn from (
    select o.id, o.email, o.name, o.token, gr.id as group_id, gr.name as group_name,
           (select count(*) from ss_participants a where a.group_id = gr.id and a.status = 'approved') as approved,
           (select count(*) from ss_participants a where a.group_id = gr.id and a.status = 'pending') as pending
    from ss_groups gr join ss_participants o on o.group_id = gr.id and o.is_organizer
    where gr.drawn_at is null and gr.draw_mode = 'auto' and gr.draw_date <= ss_today()
      and gr.warn_email_at is null and o.email is not null
    limit v_left
  ) x;
  v_left := v_left - jsonb_array_length(v_warn);

  -- mensagens novas: no máximo 1 e-mail por dia por pessoa,
  -- só do que chegou depois da última visita e do último aviso
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_msgs from (
    select p.id, p.email, p.name, p.token, gr.name as group_name
    from ss_participants p join ss_groups gr on gr.id = p.group_id
    where gr.drawn_at is not null and p.email is not null
      and (p.msg_email_at is null or p.msg_email_at < now() - interval '24 hours')
      and exists (
        select 1 from ss_messages m
        where not m.hidden
          and m.created_at > coalesce(p.last_seen_at, '-infinity'::timestamptz)
          and m.created_at > coalesce(p.msg_email_at, '-infinity'::timestamptz)
          and m.created_at < now() - interval '10 minutes'  -- dá tempo de responder sem virar e-mail
          and ((not m.from_giver and m.giver_id = p.id)
               or (m.from_giver and m.giver_id in (select q.id from ss_participants q where q.assigned_to = p.id)))
      )
    limit v_left
  ) x;

  return jsonb_build_object('draw', v_draw, 'warn', v_warn, 'messages', v_msgs);
end $$;

-- marca o que foi enviado (ou que não precisa mais enviar)
create or replace function public.ss_cron_mark(p_kind text, p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_kind = 'draw' then
    update ss_participants set draw_email_at = now() where id = any(p_ids);
  elsif p_kind = 'messages' then
    update ss_participants set msg_email_at = now() where id = any(p_ids);
  elsif p_kind = 'warn' then
    update ss_groups set warn_email_at = now() where id = any(p_ids);
  end if;
end $$;

-- 6) Permissões --------------------------------------------------------------------
revoke execute on function public.ss_coupon_expiry(uuid) from public, anon, authenticated;
revoke execute on function public.ss_sync_group_coupon(uuid) from public, anon, authenticated;
revoke execute on function public.ss_groups_coupon_trigger() from public, anon, authenticated;
revoke execute on function public.ss_cron_tick(integer) from public, anon, authenticated;
revoke execute on function public.ss_cron_mark(text, uuid[]) from public, anon, authenticated;
grant execute on function public.ss_cron_tick(integer) to service_role;
grant execute on function public.ss_cron_mark(text, uuid[]) to service_role;

grant execute on function public.ss_set_contact(text, text, boolean, text) to anon, authenticated;
grant execute on function public.ss_my_page(text) to anon, authenticated;
