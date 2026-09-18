// server.ts
// Invelisul Deno. Nu se ruleaza local; se lipeste peste logica.ts in index.ts.
import { createClient } from "npm:@supabase/supabase-js@2";
import { type Candidat, valideaza, normAutorizatie, cheieNume, evalueaza, verdictDb } from "./logica.ts";

// =============================================================================
// SERVER. Tot ce e deasupra e logica pura, testata local. De aici in jos e
// invelisul care vorbeste cu Supabase si ruleaza doar pe Deno.
// =============================================================================

// La lansare se pune adresa exacta a site-ului, ex. 'https://director.exemplu.ro'
const ORIGINE_PERMISA = '*';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': ORIGINE_PERMISA,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// deno-lint-ignore no-explicit-any
type Rand = any;
const mapeaza = (r: Rand): Candidat => ({
  nume: r.nume, autorizatie: r.numar_autorizatie, limbi: r.limbi,
  curte: r.curte_apel, cheie: r.nume_key,
});

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ eroare: 'Metodă nepermisă.' }, 405);

  let brut: unknown;
  try { brut = await req.json(); } catch { return json({ eroare: 'Cerere nevalidă.' }, 400); }

  const { date: d, erori } = valideaza(brut);
  if (!d) return json({ eroare: erori.join(' ') }, 400);

  // Cheile SUPABASE_URL si SUPABASE_SERVICE_ROLE_KEY sunt puse automat de
  // Supabase in mediul functiei. Nu apar nicaieri in cod.
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // 1. Adresa e deja inscrisa?
  const { data: existent } = await sb.from('membri').select('id')
    .ilike('email', d.email).limit(1).maybeSingle();
  if (existent) return json({ eroare: 'Această adresă de email este deja înscrisă.' }, 409);

  // 2. Cautam in referinta dupa numar si, separat, dupa nume.
  const auth  = normAutorizatie(d.numar_autorizatie);
  const cheie = cheieNume(d.nume);
  const sel   = 'nume, numar_autorizatie, limbi, curte_apel, nume_key';
  const gol   = Promise.resolve({ data: [] as Rand[] });
  const [cA, cN] = await Promise.all([
    auth  ? sb.from('referinta').select(sel).eq('auth_norm', auth) : gol,
    cheie ? sb.from('referinta').select(sel).eq('nume_key', cheie) : gol,
  ]);

  const rez = evalueaza(
    { nume: d.nume, autorizatie: d.numar_autorizatie, limbi: d.limbi },
    (cA.data || []).map(mapeaza),
    (cN.data || []).map(mapeaza),
  );

  // 3. Contul de autentificare, cu parola aleasa de om. Poate intra cu ea
  //    sau, alternativ, cu link pe email. Se creeaza pentru toti; accesul la
  //    director e decis de verdict.
  let userId: string | null = null;
  const { data: u, error: eU } = await sb.auth.admin.createUser({
    email: d.email, password: d.parola, email_confirm: true,
  });
  if (!eU && u?.user) {
    userId = u.user.id;
  } else {
    // Adresa exista deja in auth (ramasa de la o inscriere stearsa).
    // O cautam si ii punem parola noua, ca omul sa poata intra.
    const { data: lst } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = lst?.users?.find((x) => (x.email || '').toLowerCase() === d.email)?.id ?? null;
    if (userId) await sb.auth.admin.updateUserById(userId, { password: d.parola });
  }

  // 4. Salvam inscrierea cu verdictul.
  const { error: eI } = await sb.from('membri').insert({
    nume: d.nume,
    numar_autorizatie: d.numar_autorizatie,
    limbi: d.limbi,
    judet: d.judet,
    localitate: d.localitate,
    email: d.email,
    telefon: d.telefon || null,
    firma: d.firma || null,
    site: d.site || null,
    consimtamant_prelucrare: true,
    afisare: d.afisare,
    verdict: verdictDb(rez.verdict),
    motiv: rez.motiv,
    mj_nume: rez.mjNume ?? null,
    mj_limbi: rez.mjLimbi ?? null,
    mj_curte: rez.mjCurte ?? null,
    verificat_la: new Date().toISOString(),
    auth_norm: auth || null,
    auth_user_id: userId,
  });
  if (eI) {
    if (eI.code === '23505') return json({ eroare: 'Această adresă de email este deja înscrisă.' }, 409);
    console.error('insert membri:', eI);
    return json({ eroare: 'Nu am putut salva înscrierea. Încearcă din nou.' }, 500);
  }

  return json({ verdict: verdictDb(rez.verdict), motiv: rez.motiv, mj_nume: rez.mjNume ?? null });
}

Deno.serve(handler);
