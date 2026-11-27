-- Amigo secreto: campo livre "Outras ideias de presente" (v19)
-- Pode rodar mais de uma vez. Cole tudo no SQL Editor do Supabase e clique em Run.
-- Só quem tirar a pessoa vê o texto (o responsável vê só se a pessoa preencheu).

alter table ss_participants add column if not exists gift_ideas text;

-- salva as ideias da própria pessoa (até 500 letras; vazio apaga)
create or replace function public.ss_set_gift_ideas(p_token text, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare me ss_participants := ss_me(p_token);
begin
  if char_length(trim(coalesce(p_text, ''))) > 500 then
    raise exception 'As ideias de presente podem ter até 500 letras.';
  end if;
  update ss_participants
  set gift_ideas = nullif(trim(coalesce(p_text, '')), '')
  where id = me.id;
end $$;

-- página secreta: igual à anterior, agora com gift_ideas (minha, de quem eu tirei)
-- e has_ideas na lista do responsável
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
                             'link_reset_at', me.link_reset_at, 'gift_ideas', me.gift_ideas),
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
          'has_ideas', nullif(trim(coalesce(p.gift_ideas, '')), '') is not null
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

grant execute on function public.ss_set_gift_ideas(text, text) to anon, authenticated;
grant execute on function public.ss_my_page(text) to anon, authenticated;
