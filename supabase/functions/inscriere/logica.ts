// logica.ts
// Logica pura de normalizare, potrivire si validare. Nu atinge nicio baza
// de date. Se testeaza local cu: node test_logica.mts
// Fisierul publicat (index.ts) se genereaza din acesta: node ../../../scripts/build-functii.mjs

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

export function stripDiacritice(s: string): string {
  if (!s) return '';
  const x = String(s).replace(/[şŞţŢłŁđĐðÐøØæÆœŒßıİþÞ]/g, (c) => TRANSLIT[c] || c);
  return x.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
}

export function normNume(s: string): string {
  let x = stripDiacritice(s).toUpperCase();
  x = x.replace(/[\-'`.]/g, ' ');
  x = x.replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ');
  return x.trim();
}

export function cheieNume(s: string): string {
  const n = normNume(s);
  return n ? n.split(' ').sort().join(' ') : '';
}

// "8422", "nr. 8422", "8422/2005", "8422 din 2005" -> "8422"
// Luam PRIMUL grup de cifre plauzibil (max 5 cifre), nu toate cifrele lipite.
export function normAutorizatie(s: unknown): string {
  const grupuri = String(s == null ? '' : s).match(/\d+/g);
  if (!grupuri) return '';
  const plauzibile = grupuri.filter((g) => g.replace(/^0+/, '').length <= 5);
  const ales = plauzibile.length ? plauzibile[0] : grupuri[0];
  return ales.replace(/^0+/, '');
}

// ---------------------------------------------------------------- potrivire

export interface Candidat {
  nume: string;
  autorizatie: string;
  limbi: string;     // "Engleză, Franceză", exact ca la MJ
  curte: string;
  cheie: string;     // nume_key
}

export interface Date {
  nume: string;
  autorizatie: string;
  limbi: string[];
}

export interface Rezultat {
  verdict: 'ACCEPTAT' | 'DE VERIFICAT' | 'RESPINS';
  motiv: string;
  mjNume?: string;
  mjLimbi?: string;
  mjCurte?: string;
}

type Potrivire = 'exact' | 'partial_bun' | 'partial_slab' | 'diferit';

export function comparaNume(declarat: string, mjKey: string): Potrivire {
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
export function limbiLipsa(declarate: string[], mjLimbi: string): string[] {
  const mj = String(mjLimbi || '').split(',').map((l) => normNume(l));
  return declarate.filter((l) => l && !mj.includes(normNume(l)));
}

export function evalueaza(date: Date, candidati: Candidat[], dupaNume: Candidat[]): Rezultat {
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
export const LIMBI = [
  'Engleză', 'Franceză', 'Germană', 'Spaniolă', 'Italiană', 'Rusă',
  'Arabă', 'Turcă', 'Ucraineană',
  'Sârbă', 'Ebraică', 'Maghiară',
  'Albaneză', 'Bulgară', 'Catalană', 'Chineză', 'Coreeană', 'Cehă', 'Croată',
  'Daneză', 'Greacă', 'Japoneză', 'Macedoneană', 'Norvegiană', 'Olandeză',
  'Persană', 'Polonă', 'Portugheză', 'Slovacă', 'Slovenă', 'Suedeză',
  'Armeană', 'Bengaleză', 'Hindi', 'Indoneziană', 'Finlandeză', 'Lituaniană',
  'Panjabi', 'Nepaleză', 'Urdu', 'Vietnameză',
];

export const JUDETE = [
  'Alba', 'Arad', 'Argeș', 'Bacău', 'Bihor', 'Bistrița-Năsăud', 'Botoșani',
  'Brăila', 'Brașov', 'București', 'Buzău', 'Călărași', 'Caraș-Severin',
  'Cluj', 'Constanța', 'Covasna', 'Dâmbovița', 'Dolj', 'Galați', 'Giurgiu',
  'Gorj', 'Harghita', 'Hunedoara', 'Ialomița', 'Iași', 'Ilfov', 'Maramureș',
  'Mehedinți', 'Mureș', 'Neamț', 'Olt', 'Prahova', 'Sălaj', 'Satu Mare',
  'Sibiu', 'Suceava', 'Teleorman', 'Timiș', 'Tulcea', 'Vâlcea', 'Vaslui',
  'Vrancea',
];

export const AFISARI = ['public', 'fara_telefon', 'intern'];

export interface Inscriere {
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
  parola: string;
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
export function valideaza(brut: unknown): { date?: Inscriere; erori: string[] } {
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
    // parola NU trece prin curat(): spatiile si lungimea sunt ale ei
    parola:            typeof b.parola === 'string' ? b.parola : '',
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
  if (d.parola.length < 8)                     erori.push('Parola trebuie să aibă cel puțin 8 caractere.');
  if (d.parola.length > 72)                    erori.push('Parola e prea lungă.');

  return erori.length ? { erori } : { date: d, erori: [] };
}

export function verdictDb(v: Rezultat['verdict']): 'acceptat' | 'de_verificat' | 'respins' {
  return v === 'ACCEPTAT' ? 'acceptat' : v === 'DE VERIFICAT' ? 'de_verificat' : 'respins';
}
