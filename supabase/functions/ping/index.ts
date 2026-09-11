// index.ts  -  ping (Supabase Edge Function)
// Face o citire minima din baza, ca proiectul sa nu intre in pauza pe planul
// gratuit. Apelata de un monitor extern (UptimeRobot) la cateva ore.
// Nu cere autentificare, nu intoarce date personale.

Deno.serve(async () => {
  const { createClient } = await import('npm:@supabase/supabase-js@2');
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { count, error } = await sb.from('referinta').select('*', { count: 'exact', head: true });
  const corp = error ? { ok: false } : { ok: true, referinta: count };
  return new Response(JSON.stringify(corp), {
    status: error ? 500 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
