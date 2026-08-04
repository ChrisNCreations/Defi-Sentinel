-- 004_seed.sql
-- Seed default org + hard limits + circuit breaker + test wallets.
--
-- Default test wallets (Anvil / Foundry accounts — replace for real testnet ops):
--   Admin:    0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
--   Operator: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
--   Viewer:   0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
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

-- Admin
insert into public.organization_members (organization_id, wallet_address, role)
values (
  'a0000000-0000-4000-8000-000000000001',
  '0x25D8bE971f8c5E7C6aFC8645a08D43B506A8e051',
  'admin'
)
on conflict (organization_id, wallet_address) do update
  set role = excluded.role;

-- Operator
insert into public.organization_members (organization_id, wallet_address, role)
values (
  'a0000000-0000-4000-8000-000000000001',
  '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
  'operator'
)
on conflict (organization_id, wallet_address) do update
  set role = excluded.role;

-- Viewer (cannot read audit_logs under RLS)
insert into public.organization_members (organization_id, wallet_address, role)
values (
  'a0000000-0000-4000-8000-000000000001',
  '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
  'viewer'
)
on conflict (organization_id, wallet_address) do update
  set role = excluded.role;
