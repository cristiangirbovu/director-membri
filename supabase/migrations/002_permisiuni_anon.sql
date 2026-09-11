-- 002_permisiuni_anon.sql
-- Supabase acorda implicit EXECUTE rolului anon pe orice functie noua.
-- Nicio functie de-a noastra nu are sens fara cont, deci revocam explicit.
-- Functiile se apara oricum singure, dar nu vrem sa poata fi nici macar apelate.
revoke execute on function este_membru()                       from anon;
revoke execute on function este_admin()                        from anon;
revoke execute on function eu()                                from anon;
revoke execute on function director()                          from anon;
revoke execute on function admin_lista(verdict_t)              from anon;
revoke execute on function admin_decide(uuid, verdict_t, text) from anon;
revoke execute on function admin_stare(uuid, stare_t)          from anon;
