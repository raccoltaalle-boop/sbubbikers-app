-- =====================================================================
--  Uscite annullate: si registra quando sono state annullate, così
--  l'app le nasconde dal giorno dopo l'annullamento. Eseguire una volta.
-- =====================================================================
alter table public.uscite add column if not exists annullata_at timestamptz;

create or replace function public.uscite_data_annullamento()
returns trigger language plpgsql as $$
begin
  if new.annullata and not coalesce(old.annullata, false) then new.annullata_at := now();
  elsif not new.annullata then new.annullata_at := null;
  end if;
  return new;
end $$;

drop trigger if exists uscite_annullamento on public.uscite;
create trigger uscite_annullamento before insert or update of annullata on public.uscite
  for each row execute function public.uscite_data_annullamento();

-- quelle già annullate restano visibili fino a domani
update public.uscite set annullata_at = now() where annullata and annullata_at is null;
