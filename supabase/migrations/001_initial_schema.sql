-- 001_initial_schema.sql
-- DeFi Sentinel core tables (Phase 1)

create extension if not exists "pgcrypto";

create type public.user_role as enum ('admin', 'operator', 'viewer');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  keeperhub_org_id text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  wallet_address text unique not null,
  display_name text,
  created_at timestamptz not null default now(),
  constraint profiles_wallet_lowercase check (wallet_address = lower(wallet_address))
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  wallet_address text not null,
  role public.user_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (organization_id, wallet_address),
  constraint members_wallet_lowercase check (wallet_address = lower(wallet_address))
);

create table public.hard_limits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade unique,
  max_repayment_pct numeric not null default 30,
  max_gas_price_gwei numeric not null default 50,
  max_consecutive_failures int not null default 3,
  allowed_contracts text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by text
);

create table public.circuit_breaker (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  is_tripped boolean not null default false,
  failure_count int not null default 0,
  last_failure_at timestamptz,
  last_failure_reason text,
  tripped_at timestamptz
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  execution_id text not null,
  organization_id uuid references public.organizations (id),
  timestamp timestamptz not null default now(),
  trigger_type text not null,
  actor_wallet text,
  position_state jsonb not null,
  intelligence_gate jsonb,
  llm_reasoning jsonb,
  guardrail_validation jsonb not null,
  execution_details jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_org_time on public.audit_logs (organization_id, timestamp desc);
create index idx_members_wallet on public.organization_members (wallet_address);
create index idx_profiles_wallet on public.profiles (wallet_address);

-- Helper: current user's wallet from profiles (used by RLS)
create or replace function public.current_wallet_address()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select wallet_address from public.profiles where id = auth.uid()
$$;

create or replace function public.current_member_role(org_id uuid)
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.organization_members m
  where m.organization_id = org_id
    and m.wallet_address = public.current_wallet_address()
  limit 1
$$;

comment on table public.audit_logs is 'Append-only agent execution trail. No UPDATE/DELETE for app roles.';
