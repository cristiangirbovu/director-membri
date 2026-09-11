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
