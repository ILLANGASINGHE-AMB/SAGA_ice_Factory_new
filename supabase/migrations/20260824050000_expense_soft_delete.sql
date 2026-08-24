-- Allow expense categories and expense names to be deleted.
--
-- The Expenses tab could only ever add categories and expense names — there
-- was no way to remove one, so a typo or a category that stopped being used
-- stayed as a Cash Book column forever. soft_delete_row is the app's single
-- delete path (it snapshots to `trash` first, so a deletion is recoverable),
-- but its allow-list didn't include these two tables.
--
-- Both cascade in the database (expense_items -> expense_categories,
-- expense_amounts -> expense_items), so the snapshot must capture those
-- children or a restore from Trash would come back with the columns but none
-- of the recorded amounts.

create or replace function public.soft_delete_row(
  p_table text,
  p_id bigint,
  p_deleted_by text,
  p_deleted_by_role text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_children jsonb := '[]'::jsonb;
  v_label text;
begin
  if p_table not in (
    'customers', 'sales', 'debts', 'notes', 'employees', 'vehicles',
    'bank_deposits', 'cheque_records', 'bank_withdrawals', 'cash_receives',
    'customer_cube_prices', 'employee_attendance', 'vehicle_trips',
    'transport_trips', 'expense_ledger_rows',
    'expense_categories', 'expense_items'
  ) then
    raise exception 'Table % is not allowed for soft delete', p_table;
  end if;

  execute format('select to_jsonb(t) from public.%I t where id = $1', p_table)
    into v_row using p_id;

  if v_row is null then
    raise exception 'Row not found in %', p_table;
  end if;

  if p_table = 'sales' then
    v_children := v_children || jsonb_build_array(jsonb_build_object(
      'table', 'sale_items',
      'rows', coalesce((select jsonb_agg(to_jsonb(t)) from public.sale_items t where t.sale_id = p_id), '[]'::jsonb)
    ));
    v_children := v_children || jsonb_build_array(jsonb_build_object(
      'table', 'debts',
      'rows', coalesce((select jsonb_agg(to_jsonb(t)) from public.debts t where t.sale_id = p_id), '[]'::jsonb),
      'children', coalesce((
        select jsonb_agg(jsonb_build_object(
          'table', 'debt_settlements',
          'rows', coalesce((select jsonb_agg(to_jsonb(s)) from public.debt_settlements s where s.debt_id = d.id), '[]'::jsonb)
        ))
        from public.debts d where d.sale_id = p_id
      ), '[]'::jsonb)
    ));
  elsif p_table = 'customers' then
    v_children := v_children || jsonb_build_array(jsonb_build_object(
      'table', 'debts',
      'rows', coalesce((select jsonb_agg(to_jsonb(t)) from public.debts t where t.customer_id = p_id), '[]'::jsonb),
      'children', coalesce((
        select jsonb_agg(jsonb_build_object(
          'table', 'debt_settlements',
          'rows', coalesce((select jsonb_agg(to_jsonb(s)) from public.debt_settlements s where s.debt_id = d.id), '[]'::jsonb)
        ))
        from public.debts d where d.customer_id = p_id
      ), '[]'::jsonb)
    ));
  elsif p_table = 'vehicles' then
    v_children := v_children || jsonb_build_array(jsonb_build_object(
      'table', 'vehicle_trips',
      'rows', coalesce((select jsonb_agg(to_jsonb(t)) from public.vehicle_trips t where t.vehicle_id = p_id), '[]'::jsonb)
    ));
  elsif p_table = 'employees' then
    v_children := v_children || jsonb_build_array(jsonb_build_object(
      'table', 'employee_attendance',
      'rows', coalesce((select jsonb_agg(to_jsonb(t)) from public.employee_attendance t where t.employee_id = p_id), '[]'::jsonb)
    ));
  elsif p_table = 'expense_ledger_rows' then
    v_children := v_children || jsonb_build_array(jsonb_build_object(
      'table', 'expense_amounts',
      'rows', coalesce((select jsonb_agg(to_jsonb(t)) from public.expense_amounts t where t.ledger_row_id = p_id), '[]'::jsonb)
    ));
  elsif p_table = 'expense_categories' then
    -- Every expense name in the category, and each one's recorded amounts.
    v_children := v_children || jsonb_build_array(jsonb_build_object(
      'table', 'expense_items',
      'rows', coalesce((select jsonb_agg(to_jsonb(t)) from public.expense_items t where t.category_id = p_id), '[]'::jsonb),
      'children', coalesce((
        select jsonb_agg(jsonb_build_object(
          'table', 'expense_amounts',
          'rows', coalesce((select jsonb_agg(to_jsonb(a)) from public.expense_amounts a where a.expense_item_id = i.id), '[]'::jsonb)
        ))
        from public.expense_items i where i.category_id = p_id
      ), '[]'::jsonb)
    ));
  elsif p_table = 'expense_items' then
    v_children := v_children || jsonb_build_array(jsonb_build_object(
      'table', 'expense_amounts',
      'rows', coalesce((select jsonb_agg(to_jsonb(t)) from public.expense_amounts t where t.expense_item_id = p_id), '[]'::jsonb)
    ));
  end if;

  v_label := coalesce(
    v_row->>'customer_code', v_row->>'sale_code', v_row->>'employee_code',
    v_row->>'vehicle_no', v_row->>'expense_code', v_row->>'category_code',
    v_row->>'name', v_row->>'note_text', v_row->>'id'
  );

  insert into public.trash (entity_table, entity_id, entity_label, snapshot, deleted_by)
  values (p_table, p_id::text, v_label, jsonb_build_object('row', v_row, 'children', v_children), p_deleted_by);

  insert into public.activity_log (action, entity_type, entity_id, entity_label, description, performed_by, performed_by_role)
  values ('delete', p_table, p_id::text, v_label, format('Deleted %s %s', p_table, coalesce(v_label, p_id::text)), p_deleted_by, p_deleted_by_role);

  execute format('delete from public.%I where id = $1', p_table) using p_id;
end;
$$;
