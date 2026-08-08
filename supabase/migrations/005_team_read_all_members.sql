-- Phase 7: all org members can read the team roster (transparency).
-- Admins still own insert/update/delete.

create policy "Members can list organization roster"
  on public.organization_members for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members self
      where self.organization_id = organization_members.organization_id
        and self.wallet_address = public.current_wallet_address()
    )
  );
