-- 003_membri_nullable.sql
-- Pentru importul listei clientei: acesti oameni nu au completat formularul,
-- deci pot lipsi emailul, judetul sau localitatea. Formularul le cere in
-- continuare pe toate (validarea e in functia inscriere), doar tabelul
-- devine tolerant.
alter table membri alter column email      drop not null;
alter table membri alter column judet      drop not null;
alter table membri alter column localitate drop not null;
