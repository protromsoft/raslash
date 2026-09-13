begin;

select plan(32);

select has_table(
  'private',
  'message_usage',
  'Lifetime message usage is stored outside the exposed API schema'
);

select has_column(
  'public',
  'messages',
  'client_request_id',
  'Messages carry a client idempotency key'
);

select ok(
  (
    select i.indisunique
    from pg_catalog.pg_index i
    where i.indexrelid = 'public.messages_user_request_id_idx'::regclass
  ),
  'Message request ids are protected by a unique index'
);

select ok(
  (
    select pg_catalog.pg_get_expr(i.indpred, i.indrelid) is not null
    from pg_catalog.pg_index i
    where i.indexrelid = 'public.messages_user_request_id_idx'::regclass
  ),
  'The idempotency index is partial so legacy rows remain valid'
);

select ok(
  not has_table_privilege('anon', 'public.messages', 'INSERT'),
  'Anonymous clients cannot insert messages'
);

select ok(
  not has_table_privilege('authenticated', 'private.message_usage', 'SELECT'),
  'Authenticated clients cannot read lifetime counters directly'
);

select ok(
  not has_table_privilege('anon', 'private.message_usage', 'SELECT'),
  'Anonymous clients cannot read lifetime counters directly'
);

select ok(
  has_table_privilege('service_role', 'private.message_usage', 'SELECT'),
  'Trusted service jobs can inspect lifetime counters'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.send_place_message(uuid,text,uuid)',
    'EXECUTE'
  ),
  'Authenticated callers can execute the bounded message RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.send_place_message(uuid,text,uuid)',
    'EXECUTE'
  ),
  'Anonymous callers cannot execute the message RPC'
);

select ok(
  not (
    select p.prosecdef
    from pg_catalog.pg_proc p
    where p.oid = 'public.send_place_message(uuid,text,uuid)'::regprocedure
  ),
  'The public message RPC is a security-invoker wrapper'
);

select ok(
  (
    select p.prosecdef
    from pg_catalog.pg_proc p
    where p.oid = 'private.send_place_message(uuid,text,uuid)'::regprocedure
  ),
  'The privileged message implementation is security-definer'
);

select ok(
  (
    select pg_catalog.pg_get_functiondef(
      'private.send_place_message(uuid,text,uuid)'::regprocedure
    ) like '%auth.uid()%'
  ),
  'The server derives message ownership from auth.uid()'
);

select ok(
  (
    select pg_catalog.pg_get_functiondef(
      'private.send_place_message(uuid,text,uuid)'::regprocedure
    ) like '%private.subscription_entitlements%'
  ),
  'Unlimited messaging uses the trusted RevenueCat entitlement table'
);

select ok(
  (
    select pg_catalog.pg_get_functiondef(
      'private.send_place_message(uuid,text,uuid)'::regprocedure
    ) like '%app_review_access%'
  ),
  'The App Review access claim is recognized server-side'
);

select ok(
  (
    select pg_catalog.pg_get_functiondef(
      'private.send_place_message(uuid,text,uuid)'::regprocedure
    ) like '%pg_advisory_xact_lock_shared%message-quota-cutover%'
  ),
  'Message sends participate in the race-safe rollout lock'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_message_access()',
    'EXECUTE'
  ),
  'Authenticated callers can inspect their own message allowance'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_message_access()',
    'EXECUTE'
  ),
  'Anonymous callers cannot inspect a message allowance'
);

select ok(
  not (
    select p.prosecdef
    from pg_catalog.pg_proc p
    where p.oid = 'public.get_message_access()'::regprocedure
  ),
  'The public access-status RPC is security-invoker'
);

select ok(
  (
    select p.prosecdef
    from pg_catalog.pg_proc p
    where p.oid = 'private.get_message_access()'::regprocedure
  ),
  'The privileged access-status implementation is security-definer'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_list_messages(integer,integer,text)',
    'EXECUTE'
  ),
  'Signed-in admins can call the message audit entry point'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.admin_list_messages(integer,integer,text)',
    'EXECUTE'
  ),
  'Anonymous callers cannot call the message audit entry point'
);

select ok(
  not (
    select p.prosecdef
    from pg_catalog.pg_proc p
    where p.oid = 'public.admin_list_messages(integer,integer,text)'::regprocedure
  ),
  'The public message audit RPC is security-invoker'
);

select ok(
  (
    select p.prosecdef
    from pg_catalog.pg_proc p
    where p.oid = 'private.admin_list_messages(integer,integer,text)'::regprocedure
  ),
  'The privileged message audit implementation is security-definer'
);

select ok(
  (
    select pg_catalog.pg_get_functiondef(
      'private.admin_list_messages(integer,integer,text)'::regprocedure
    ) like '%is_admin%'
  ),
  'The message audit implementation checks the trusted admin column'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_list_notifications(integer,integer,text)',
    'EXECUTE'
  ),
  'Signed-in admins can call the notification audit entry point'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.admin_list_notifications(integer,integer,text)',
    'EXECUTE'
  ),
  'Anonymous callers cannot call the notification audit entry point'
);

select ok(
  (
    select pg_catalog.pg_get_functiondef(
      'private.admin_list_notifications(integer,integer,text)'::regprocedure
    ) like '%is_admin%'
  ),
  'The notification audit implementation checks the trusted admin column'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_delete_notification(uuid)',
    'EXECUTE'
  ),
  'Signed-in admins can call the notification delete entry point'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.admin_delete_notification(uuid)',
    'EXECUTE'
  ),
  'Anonymous callers cannot call the notification delete entry point'
);

select ok(
  (
    select p.prosecdef
    from pg_catalog.pg_proc p
    where p.oid = 'private.admin_delete_notification(uuid)'::regprocedure
  ),
  'Notification deletion is performed by a guarded private implementation'
);

select ok(
  (
    select pg_catalog.pg_get_functiondef(
      'private.admin_delete_notification(uuid)'::regprocedure
    ) like '%is_admin%'
  ),
  'Notification deletion checks the trusted admin column'
);

select * from finish();

rollback;
