-- Sterge TOT importul demo din lista clientei, dintr-o singura comanda.
-- De rulat inainte de lansare, cand directorul trebuie sa contina doar
-- oameni care s-au inscris singuri prin formular.
delete from membri where motiv like 'Import demo din lista clientei.%';
