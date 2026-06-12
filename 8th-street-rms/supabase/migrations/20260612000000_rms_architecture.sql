-- 8th Street RMS architecture hardening.
-- Run this in Supabase SQL editor or through Supabase migrations.

alter table rooms
  add constraint rooms_status_check
  check (status in ('Available', 'Reserved', 'Occupied'));

alter table rooms
  add constraint rooms_room_number_unique unique (room_number);

alter table reservations
  add column if not exists applicant_name text,
  add column if not exists reservation_date date,
  add column if not exists move_in_date date;

alter table reservations
  add constraint reservations_status_check
  check (status in ('Pending', 'Approved', 'Converted', 'Cancelled'));

alter table tenants
  add column if not exists reservation_id bigint references reservations(id),
  add constraint tenants_status_check
  check (status in ('Active', 'Moved Out'));

alter table payments
  add column if not exists status text,
  add constraint payments_amount_non_negative
  check (coalesce(amount_paid, 0) >= 0),
  add constraint payments_remaining_balance_non_negative
  check (coalesce(remaining_balance, 0) >= 0),
  add constraint payments_status_check
  check (coalesce(payment_status, status) in ('Paid', 'Partial', 'Pending'));

create unique index if not exists reservations_one_active_per_room
  on reservations(room_id)
  where status in ('Pending', 'Approved');

create unique index if not exists tenants_one_active_per_room
  on tenants(assigned_room_id)
  where status = 'Active';

create unique index if not exists payments_no_duplicate_entry
  on payments(tenant_id, payment_date, amount_paid);

create or replace function rms_set_room_status_from_reservation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'Converted' then
      update rooms set status = 'Available' where id = old.room_id;
    end if;
    return old;
  end if;

  if old.room_id is not null and old.room_id <> new.room_id and old.status <> 'Converted' then
    update rooms set status = 'Available' where id = old.room_id;
  end if;

  if new.status = 'Converted' then
    update rooms set status = 'Occupied' where id = new.room_id;
  elsif new.status = 'Cancelled' then
    update rooms set status = 'Available' where id = new.room_id;
  else
    update rooms set status = 'Reserved' where id = new.room_id;
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_sync_room_status on reservations;
create trigger reservations_sync_room_status
after insert or update or delete on reservations
for each row execute function rms_set_room_status_from_reservation();

create or replace function rms_set_room_status_from_tenant()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.assigned_room_id is not null then
      update rooms set status = 'Available' where id = old.assigned_room_id;
    end if;
    return old;
  end if;

  if old.assigned_room_id is not null and old.assigned_room_id <> new.assigned_room_id then
    update rooms set status = 'Available' where id = old.assigned_room_id;
  end if;

  if new.assigned_room_id is not null then
    if new.status = 'Active' then
      update rooms set status = 'Occupied' where id = new.assigned_room_id;
    elsif new.status = 'Moved Out' then
      update rooms set status = 'Available' where id = new.assigned_room_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tenants_sync_room_status on tenants;
create trigger tenants_sync_room_status
after insert or update or delete on tenants
for each row execute function rms_set_room_status_from_tenant();

create or replace function rms_calculate_payment_status()
returns trigger
language plpgsql
as $$
declare
  tenant_rent numeric := 0;
begin
  select coalesce(r.monthly_rent, t.monthly_rent, 0)
    into tenant_rent
  from tenants t
  left join rooms r on r.id = t.assigned_room_id
  where t.id = new.tenant_id;

  if coalesce(new.amount_paid, 0) <= 0 then
    new.payment_status := 'Pending';
    new.status := 'Pending';
  elsif tenant_rent > 0 and new.amount_paid >= tenant_rent then
    new.payment_status := 'Paid';
    new.status := 'Paid';
  else
    new.payment_status := 'Partial';
    new.status := 'Partial';
  end if;

  new.remaining_balance := greatest(tenant_rent - coalesce(new.amount_paid, 0), 0);
  return new;
end;
$$;

drop trigger if exists payments_calculate_status on payments;
create trigger payments_calculate_status
before insert or update on payments
for each row execute function rms_calculate_payment_status();
