-- 004_seed.sql
-- Seed default org + hard limits + circuit breaker + privileged wallets.
--
-- Privileged (explicit membership only):
--   Admin:    0x25D8bE971f8c5E7C6aFC8645a08D43B506A8e051
--   Operator: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8  (Anvil #1 / replace as needed)
--
-- Viewer: any other wallet that SIWE-connects is auto-enrolled as viewer
--         on this default organization (see apps/web/app/api/auth/verify).
--
-- Profiles are created at SIWE login time (linked to auth.users).

insert into public.organizations (id, keeperhub_org_id, name)
values (
  'a0000000-0000-4000-8000-000000000001',
  'kh_org_defi_sentinel_testnet',
  'DeFi Sentinel Testnet Org'
)
on conflict (keeperhub_org_id) do nothing;

insert into public.hard_limits (
  organization_id,
  max_repayment_pct,
  max_gas_price_gwei,
  max_consecutive_failures,
  allowed_contracts,
  updated_by
)
values (
  'a0000000-0000-4000-8000-000000000001',
  30,
  50,
  3,
  array[
    '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27',
    '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951'
  ]::text[],
  'seed'
)
on conflict (organization_id) do nothing;

insert into public.circuit_breaker (organization_id, is_tripped, failure_count)
values (
  'a0000000-0000-4000-8000-000000000001',
  false,
  0
)
on conflict (organization_id) do nothing;

-- Admin (privileged — never auto-assigned)
insert into public.organization_members (organization_id, wallet_address, role)
values (
  'a0000000-0000-4000-8000-000000000001',
  '0x25d8be971f8c5e7c6afc8645a08d43b506a8e051',
  'admin'
)
on conflict (organization_id, wallet_address) do update
  set role = excluded.role;

-- Operator (privileged — never auto-assigned)
insert into public.organization_members (organization_id, wallet_address, role)
values (
  'a0000000-0000-4000-8000-000000000001',
  '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
  'operator'
)
on conflict (organization_id, wallet_address) do update
  set role = excluded.role;
