// app.js - comun tuturor paginilor.
// Creeaza clientul Supabase si cateva ajutoare. Necesita config.js si
// librăria supabase-js incarcate inainte.
(function () {
  'use strict';

  var C = window.CONFIG;
  window.sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  // Lista fixata de clienta. 41 de limbi, in ordinea data de ea.
  window.LIMBI = [
    'Engleză', 'Franceză', 'Germană', 'Spaniolă', 'Italiană', 'Rusă',
    'Arabă', 'Turcă', 'Ucraineană',
    'Sârbă', 'Ebraică', 'Maghiară',
    'Albaneză', 'Bulgară', 'Catalană', 'Chineză', 'Coreeană', 'Cehă', 'Croată',
    'Daneză', 'Greacă', 'Japoneză', 'Macedoneană', 'Norvegiană', 'Olandeză',
    'Persană', 'Polonă', 'Portugheză', 'Slovacă', 'Slovenă', 'Suedeză',
    'Armeană', 'Bengaleză', 'Hindi', 'Indoneziană', 'Finlandeză', 'Lituaniană',
    'Panjabi', 'Nepaleză', 'Urdu', 'Vietnameză'
  ];

  window.JUDETE = [
    'Alba', 'Arad', 'Argeș', 'Bacău', 'Bihor', 'Bistrița-Năsăud', 'Botoșani',
    'Brăila', 'Brașov', 'București', 'Buzău', 'Călărași', 'Caraș-Severin',
    'Cluj', 'Constanța', 'Covasna', 'Dâmbovița', 'Dolj', 'Galați', 'Giurgiu',
    'Gorj', 'Harghita', 'Hunedoara', 'Ialomița', 'Iași', 'Ilfov', 'Maramureș',
    'Mehedinți', 'Mureș', 'Neamț', 'Olt', 'Prahova', 'Sălaj', 'Satu Mare',
    'Sibiu', 'Suceava', 'Teleorman', 'Timiș', 'Tulcea', 'Vâlcea', 'Vaslui',
    'Vrancea'
  ];

  // Ajutoare DOM
  window.el = function (tag, clasa, text) {
    var e = document.createElement(tag);
    if (clasa) e.className = clasa;
    if (text != null) e.textContent = text;
    return e;
  };
  window.$ = function (id) { return document.getElementById(id); };

  // Afiseaza un mesaj intr-un container #mesaj. tip: ok | atentie | rau | info
  window.mesaj = function (tip, titlu, text) {
    var m = $('mesaj');
    if (!m) return;
    m.className = 'mesaj ' + tip;
    m.textContent = '';
    if (titlu) m.appendChild(el('strong', null, titlu));
    if (text) m.appendChild(el('span', null, text));
    m.hidden = false;
    m.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  window.ascundeMesaj = function () { var m = $('mesaj'); if (m) m.hidden = true; };

  // Sesiunea curenta (null daca nu e conectat)
  window.sesiune = async function () {
    var r = await sb.auth.getSession();
    return r.data.session;
  };

  // Cine sunt: { nume, verdict, membru, admin } sau null
  window.cineSunt = async function () {
    var s = await sesiune();
    if (!s) return null;
    var r = await sb.rpc('eu');
    return r.error ? null : r.data;
  };

  window.deconectare = async function () {
    await sb.auth.signOut();
    window.location.href = 'index.html';
  };

  // Trimite link magic. Redirectioneaza inapoi la pagina data.
  window.trimiteLink = async function (email, paginaInapoi) {
    var url = new URL(paginaInapoi || window.location.pathname, window.location.href).href;
    return sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: url } });
  };

  // Leaga un formular de conectare cu trei actiuni:
  //   submit                 -> intrare cu email + parola
  //   [data-actiune=link]    -> link magic pe email
  //   [data-actiune=reset]   -> email de resetare a parolei, care duce la parola-noua.html
  // Formularul trebuie sa aiba input[name=email] si input[name=parola].
  // laTrimis(email) e apelat cand a plecat un email; laIntrat() cand s-a conectat.
  window.legareConectare = function (form, paginaInapoi, laTrimis, laIntrat) {
    var emailDin = function () {
      return String(new FormData(form).get('email') || '').trim().toLowerCase();
    };
    var ocupat = function (da) {
      form.querySelectorAll('button').forEach(function (b) { b.disabled = da; });
    };
    var explica = function (err, ceIncerc) {
      var m = String(err && err.message || '');
      if (/signup|not allowed/i.test(m))    return 'Adresa asta nu este înscrisă. Verifică dacă e cea folosită la înscriere.';
      if (/rate limit|too many/i.test(m))   return 'Prea multe emailuri cerute în ultima oră. Așteaptă puțin, sau intră cu parola.';
      if (/invalid login|credentials/i.test(m)) return 'Email sau parolă greșită.';
      return ceIncerc + ' nu a mers. Încearcă din nou peste un minut.';
    };

    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      ascundeMesaj();
      var email = emailDin(), parola = String(new FormData(form).get('parola') || '');
      if (!email) { mesaj('rau', 'Lipsește emailul', ''); return; }
      if (!parola) { mesaj('atentie', 'Scrie parola', 'Sau apasă „Trimite-mi un link pe email" ca să intri fără ea.'); return; }
      ocupat(true);
      var r = await sb.auth.signInWithPassword({ email: email, password: parola });
      ocupat(false);
      if (r.error) { mesaj('rau', 'Nu a mers', explica(r.error, 'Conectarea')); return; }
      if (laIntrat) laIntrat(); else window.location.reload();
    });

    var bLink = form.querySelector('[data-actiune=link]');
    if (bLink) bLink.addEventListener('click', async function () {
      ascundeMesaj();
      var email = emailDin();
      if (!email) { mesaj('rau', 'Lipsește emailul', ''); return; }
      ocupat(true);
      var r = await trimiteLink(email, paginaInapoi);
      ocupat(false);
      if (r.error) { mesaj('rau', 'Nu a mers', explica(r.error, 'Trimiterea linkului')); return; }
      if (laTrimis) laTrimis(email);
    });

    var bReset = form.querySelector('[data-actiune=reset]');
    if (bReset) bReset.addEventListener('click', async function (ev) {
      ev.preventDefault();
      ascundeMesaj();
      var email = emailDin();
      if (!email) { mesaj('rau', 'Scrie întâi emailul', 'Apoi apasă din nou pe „Am uitat parola".'); return; }
      ocupat(true);
      var url = new URL('parola-noua.html', window.location.href).href;
      var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: url });
      ocupat(false);
      if (r.error) { mesaj('rau', 'Nu a mers', explica(r.error, 'Trimiterea emailului')); return; }
      mesaj('info', 'Verifică emailul', 'Ți-am trimis pe ' + email + ' un link prin care îți alegi o parolă nouă. Valabil o oră.');
    });
  };

  var LUNI = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
  window.luna = function (iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d) ? '' : LUNI[d.getMonth()] + ' ' + d.getFullYear();
  };
  window.dataScurta = function (iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  window.faraDiacritice = function (s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  };
})();
