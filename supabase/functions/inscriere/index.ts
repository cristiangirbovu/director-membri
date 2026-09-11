// index.ts  -  functia de inscriere (Supabase Edge Function, Deno)
// GENERAT din logica.ts + server.ts de scripts/build-functii.mjs. NU se editeaza direct.
import { createClient } from "npm:@supabase/supabase-js@2";

// Logica pura de normalizare si potrivire. Nu atinge nicio baza de date,
// primeste totul ca argument, ca sa poata fi testata separat.
// Este portarea 1:1 a logicii testate pe 38.310 inregistrari (16/16 cazuri).

// ------------------------------------------------------------- normalizare

// Litere care NU se descompun sub NFD si ar fi altfel sterse, rupand numele.
const TRANSLIT: Record<string, string> = {
  'ş': 's', 'Ş': 'S', 'ţ': 't', 'Ţ': 'T',
  'ł': 'l', 'Ł': 'L',
  'đ': 'd', 'Đ': 'D', 'ð': 'd', 'Ð': 'D',
  'ø': 'o', 'Ø': 'O',
  'æ': 'ae', 'Æ': 'AE', 'œ': 'oe', 'Œ': 'OE',
  'ß': 'ss', 'ı': 'i', 'İ': 'I',
  'þ': 'th', 'Þ': 'TH',
};

function stripDiacritice(s: string): string {
  if (!s) return '';
  const x = String(s).replace(/[şŞţŢłŁđĐðÐøØæÆœŒßıİþÞ]/g, (c) => TRANSLIT[c] || c);
  return x.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
}

function normNume(s: string): string {
  let x = stripDiacritice(s).toUpperCase();
  x = x.replace(/[\-'`.]/g, ' ');
  x = x.replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ');
  return x.trim();
}

function cheieNume(s: string): string {
  const n = normNume(s);
  return n ? n.split(' ').sort().join(' ') : '';
}

// "8422", "nr. 8422", "8422/2005", "8422 din 2005" -> "8422"
// Luam PRIMUL grup de cifre plauzibil (max 5 cifre), nu toate cifrele lipite.
function normAutorizatie(s: unknown): string {
  const grupuri = String(s == null ? '' : s).match(/\d+/g);
  if (!grupuri) return '';
  const plauzibile = grupuri.filter((g) => g.replace(/^0+/, '').length <= 5);
  const ales = plauzibile.length ? plauzibile[0] : grupuri[0];
  return ales.replace(/^0+/, '');
}

// ---------------------------------------------------------------- potrivire

interface Candidat {
  nume: string;
  autorizatie: string;
  limbi: string;     // "Engleză, Franceză", exact ca la MJ
  curte: string;
  cheie: string;     // nume_key
}

interface Date {
  nume: string;
  autorizatie: string;
  limbi: string[];
}

interface Rezultat {
  verdict: 'ACCEPTAT' | 'DE VERIFICAT' | 'RESPINS';
  motiv: string;
  mjNume?: string;
  mjLimbi?: string;
  mjCurte?: string;
}

type Potrivire = 'exact' | 'partial_bun' | 'partial_slab' | 'diferit';

function comparaNume(declarat: string, mjKey: string): Potrivire {
  const k1 = cheieNume(declarat);
  if (!mjKey) return 'diferit';
  if (k1 === mjKey) return 'exact';

  const tm = mjKey.split(' ');
  const n = k1 ? k1.split(' ').filter((t) => tm.includes(t)).length : 0;
  if (n >= 2) return 'partial_bun';
  if (n === 1) return 'partial_slab';
  return 'diferit';
}

// Potrivirea limbilor este STRICTA, fara echivalente. Bifa din formular
// trebuie sa fie exact eticheta din autorizatia inregistrata la MJ.
function limbiLipsa(declarate: string[], mjLimbi: string): string[] {
  const mj = String(mjLimbi || '').split(',').map((l) => normNume(l));
  return declarate.filter((l) => l && !mj.includes(normNume(l)));
}

function evalueaza(date: Date, candidati: Candidat[], dupaNume: Candidat[]): Rezultat {
  const auth = normAutorizatie(date.autorizatie);

  // Numar lipsa sau nevalid. Nu respingem direct daca numele exista totusi.
  if (!auth) {
    if (dupaNume.length) {
      return {
        verdict: 'DE VERIFICAT',
        motiv: 'Numarul autorizatiei lipseste sau e scris gresit, dar numele apare ' +
               'in baza MJ cu autorizatia ' + dupaNume[0].autorizatie + '.',
        mjNume: dupaNume[0].nume, mjLimbi: dupaNume[0].limbi, mjCurte: dupaNume[0].curte,
      };
    }
    return { verdict: 'RESPINS', motiv: 'Numar de autorizatie lipsa sau nevalid.' };
  }

  // Numarul nu exista in baza MJ.
  if (!candidati.length) {
    if (dupaNume.length) {
      return {
        verdict: 'DE VERIFICAT',
        motiv: 'Numarul ' + auth + ' nu apare in baza MJ, dar numele exista ' +
               'cu autorizatia ' + dupaNume[0].autorizatie + '. Posibil numar gresit.',
        mjNume: dupaNume[0].nume, mjLimbi: dupaNume[0].limbi, mjCurte: dupaNume[0].curte,
      };
    }
    return {
      verdict: 'RESPINS',
      motiv: 'Autorizatia ' + auth + ' nu apare in baza Ministerului Justitiei, ' +
             'iar numele nu a fost gasit. Poate fi o autorizatie recenta sau o eroare de tastare.',
    };
  }

  // Cel mai bun candidat dintre cei cu acelasi numar.
  const ordine: Record<Potrivire, number> = { exact: 3, partial_bun: 2, partial_slab: 1, diferit: 0 };
  let best = candidati[0];
  let bestPot = comparaNume(date.nume, best.cheie);
  for (const c of candidati.slice(1)) {
    const p = comparaNume(date.nume, c.cheie);
    if (ordine[p] > ordine[bestPot]) { best = c; bestPot = p; }
  }
  const comun = { mjNume: best.nume, mjLimbi: best.limbi, mjCurte: best.curte };

  if (bestPot === 'diferit') {
    return { ...comun, verdict: 'DE VERIFICAT',
      motiv: 'Autorizatia ' + auth + ' exista, dar este emisa pe numele "' + best.nume +
             '", complet diferit de cel declarat.' };
  }
  if (bestPot !== 'exact') {
    return { ...comun, verdict: 'DE VERIFICAT',
      motiv: 'Autorizatia ' + auth + ' exista pe numele "' + best.nume +
             '", care se potriveste doar partial. Posibila schimbare de nume.' };
  }

  const lipsa = limbiLipsa(date.limbi || [], best.limbi);
  if (lipsa.length) {
    return { ...comun, verdict: 'DE VERIFICAT',
      motiv: 'Nume si numar confirmate, dar aceste limbi nu apar in baza MJ: ' +
             lipsa.join(', ') + '. Poate fi o autorizare ulterioara.' };
  }

  return { ...comun, verdict: 'ACCEPTAT',
    motiv: 'Nume, numar de autorizatie si limbi confirmate in baza MJ.' };
}

// ----------------------------------------------------------------- validare

// Lista fixata de clienta. 41 de limbi, in ordinea data de ea. NU se modifica.
const LIMBI = [
  'Engleză', 'Franceză', 'Germană', 'Spaniolă', 'Italiană', 'Rusă',
  'Arabă', 'Turcă', 'Ucraineană',
  'Sârbă', 'Ebraică', 'Maghiară',
  'Albaneză', 'Bulgară', 'Catalană', 'Chineză', 'Coreeană', 'Cehă', 'Croată',
  'Daneză', 'Greacă', 'Japoneză', 'Macedoneană', 'Norvegiană', 'Olandeză',
  'Persană', 'Polonă', 'Portugheză', 'Slovacă', 'Slovenă', 'Suedeză',
  'Armeană', 'Bengaleză', 'Hindi', 'Indoneziană', 'Finlandeză', 'Lituaniană',
  'Panjabi', 'Nepaleză', 'Urdu', 'Vietnameză',
];

const JUDETE = [
  'Alba', 'Arad', 'Argeș', 'Bacău', 'Bihor', 'Bistrița-Năsăud', 'Botoșani',
  'Brăila', 'Brașov', 'București', 'Buzău', 'Călărași', 'Caraș-Severin',
  'Cluj', 'Constanța', 'Covasna', 'Dâmbovița', 'Dolj', 'Galați', 'Giurgiu',
  'Gorj', 'Harghita', 'Hunedoara', 'Ialomița', 'Iași', 'Ilfov', 'Maramureș',
  'Mehedinți', 'Mureș', 'Neamț', 'Olt', 'Prahova', 'Sălaj', 'Satu Mare',
  'Sibiu', 'Suceava', 'Teleorman', 'Timiș', 'Tulcea', 'Vâlcea', 'Vaslui',
  'Vrancea',
];

const AFISARI = ['public', 'fara_telefon', 'intern'];

interface Inscriere {
  nume: string;
  numar_autorizatie: string;
  limbi: string[];
  judet: string;
  localitate: string;
  email: string;
  telefon?: string;
  firma?: string;
  site?: string;
  consimtamant_prelucrare: boolean;
  afisare: string;
}

const curat = (v: unknown, max = 200): string =>
  String(v == null ? '' : v).normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, max);

// Gaseste eticheta canonica dintr-o lista, comparand fara diacritice si fara
// majuscule. Asa 'Engleza', 'ENGLEZĂ' si 'Engleză' cu ă descompus ajung toate
// la 'Engleză', exact cum e in lista. Intoarce '' daca nu exista.
function canonic(valoare: string, lista: string[]): string {
  const n = normNume(valoare);
  return n ? (lista.find((x) => normNume(x) === n) ?? '') : '';
}

/** Curata si valideaza ce vine din browser. Intoarce datele curate sau lista de erori. */
function valideaza(brut: unknown): { date?: Inscriere; erori: string[] } {
  const b = (brut && typeof brut === 'object') ? brut as Record<string, unknown> : {};
  const erori: string[] = [];

  const d: Inscriere = {
    nume:              curat(b.nume, 120),
    numar_autorizatie: curat(b.numar_autorizatie, 30),
    limbi:             Array.isArray(b.limbi) ? b.limbi.map((l) => canonic(curat(l, 40), LIMBI)).filter(Boolean) : [],
    judet:             canonic(curat(b.judet, 40), JUDETE),
    localitate:        curat(b.localitate, 80),
    email:             curat(b.email, 120).toLowerCase(),
    telefon:           curat(b.telefon, 30),
    firma:             curat(b.firma, 120),
    site:              curat(b.site, 120),
    consimtamant_prelucrare: b.consimtamant_prelucrare === true,
    afisare:           curat(b.afisare, 20),
  };

  if (d.nume.length < 3)                       erori.push('Numele lipsește.');
  if (!normAutorizatie(d.numar_autorizatie))   erori.push('Numărul autorizației lipsește sau nu e valid.');
  const nrLimbiTrimise = Array.isArray(b.limbi) ? b.limbi.filter(Boolean).length : 0;
  if (!d.limbi.length)                         erori.push('Alege cel puțin o limbă.');
  else if (d.limbi.length < nrLimbiTrimise)    erori.push('O limbă nu este din listă.');
  if (!d.judet)                                erori.push('Județul nu este valid.');
  if (d.localitate.length < 2)                 erori.push('Localitatea lipsește.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) erori.push('Adresa de email nu este validă.');
  if (!d.consimtamant_prelucrare)              erori.push('Acordul pentru prelucrarea datelor este necesar.');
  if (!AFISARI.includes(d.afisare))            erori.push('Alege cum vrei să apari în director.');

  return erori.length ? { erori } : { date: d, erori: [] };
}

function verdictDb(v: Rezultat['verdict']): 'acceptat' | 'de_verificat' | 'respins' {
  return v === 'ACCEPTAT' ? 'acceptat' : v === 'DE VERIFICAT' ? 'de_verificat' : 'respins';
}

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

  // 3. Contul de autentificare. Fara parola: omul intra prin link pe email.
  //    Se creeaza pentru toti; accesul la director e decis de verdict.
  let userId: string | null = null;
  const { data: u, error: eU } = await sb.auth.admin.createUser({
    email: d.email, email_confirm: true,
  });
  if (!eU && u?.user) {
    userId = u.user.id;
  } else {
    // Adresa exista deja in auth (ramasa de la o inscriere stearsa). O cautam.
    const { data: lst } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = lst?.users?.find((x) => (x.email || '').toLowerCase() === d.email)?.id ?? null;
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
