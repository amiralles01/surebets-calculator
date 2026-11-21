// ==UserScript==
// @name         Apuestas +EV → Telegram (los mismos 12 canales)
// @namespace    adrian.ev.telegram
// @version      1.0.7
// @description  Lee las apuestas de valor (+EV) de BetHero Sports (página «Valor Positivo») y las reparte en los mismos 12 canales de Telegram que el script de surebets, con las mismas reglas. Script aparte: no toca el de surebets.
// @author       Adrian
// @match        https://betherosports.com/es/value-bets*
// @match        https://www.betherosports.com/es/value-bets*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.telegram.org
// @connect      raw.githubusercontent.com
// @connect      hc-ping.com
// @updateURL    https://raw.githubusercontent.com/amiralles01/surebets-calculator/main/userscripts/ev-telegram.user.js
// @downloadURL  https://raw.githubusercontent.com/amiralles01/surebets-calculator/main/userscripts/ev-telegram.user.js
// ==/UserScript==

(function () {
  'use strict';

  /* ═══ Auto-actualización (desde la v3.8.1 / EV 1.0.7) ═══════════════════════════════════════════════════════════
     Cada 5 min mira en GitHub si hay una versión nueva del script. Si la hay, la descarga, la guarda en Tampermonkey
     y recarga la pestaña (cuando la cola está vacía): al arrancar se ejecuta la versión descargada en vez de esta.
     Además Tampermonkey instala la nueva versión por su cuenta (@updateURL) en su próxima comprobación.
     Los tokens de los bots NO están en este código: se guardan en Tampermonkey (ver SECRETOS_SEMILLA). */
  const AUTO = { url: 'https://raw.githubusercontent.com/amiralles01/surebets-calculator/main/userscripts/ev-telegram.user.js', version: '1.0.7', clave: 'auto_codigo_v1', fallo: 'auto_fallo_v1', vista: 'auto_version_vista_v1', cadaMin: 5, global: '__sbtgAuto_ev-telegram' };
  const autoVersionDe = (txt) => { const m = /\/\/ @version\s+([\d.]+)/.exec(String(txt || '').slice(0, 4000)); return m ? m[1] : ''; };
  const autoMasNueva = (a, b) => {
    const x = String(a || '').split('.').map(Number), y = String(b || '').split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; }
    return false;
  };
  const autoGet = (k, d) => { try { const v = GM_getValue(k); return v === undefined || v === null ? d : v; } catch (e) { return d; } };
  const autoSet = (k, v) => { try { GM_setValue(k, v); } catch (e) { /* nada */ } };
  if (!globalThis[AUTO.global]) {
    globalThis[AUTO.global] = AUTO.version;
    const guardado = autoGet(AUTO.clave, '');
    const vg = autoVersionDe(guardado);
    if (guardado && autoMasNueva(vg, AUTO.version) && autoGet(AUTO.fallo, '') !== vg) {
      try {
        globalThis[AUTO.global] = vg;
        eval(guardado); // eslint-disable-line no-eval
        return; // ya corre la versión descargada: esta (la instalada) no hace nada más
      } catch (e) {
        console.warn('[' + 'ev-telegram' + '] La versión descargada ' + vg + ' no arranca; uso la instalada ' + AUTO.version, e);
        autoSet(AUTO.fallo, vg);
        globalThis[AUTO.global] = AUTO.version;
      }
    }
  }
  const autoPedir = (headers) => new Promise((res) => {
    try {
      GM_xmlhttpRequest({ method: 'GET', url: AUTO.url + '?t=' + Date.now(), headers: Object.assign({ 'Cache-Control': 'no-cache' }, headers || {}), timeout: 30000,
        onload: (r) => res(r.status >= 200 && r.status < 300 ? String(r.responseText || '') : ''), onerror: () => res(''), ontimeout: () => res('') });
    } catch (e) { res(''); }
  });
  let autoComprobando = false;
  async function autoComprobar() {
    if (autoComprobando) return;
    autoComprobando = true;
    try {
      const cab = await autoPedir({ Range: 'bytes=0-3999' });
      const vr = autoVersionDe(cab);
      if (!vr || !autoMasNueva(vr, AUTO.version) || autoGet(AUTO.fallo, '') === vr) return;
      const recarga = () => { if (typeof recargar === 'function') recargar('versión nueva ' + vr, false); else location.reload(); };
      if (autoVersionDe(autoGet(AUTO.clave, '')) === vr) { recarga(); return; } // ya descargada: la recarga esperaba a que se vaciara la cola
      const codigo = await autoPedir();
      if (autoVersionDe(codigo) !== vr || codigo.indexOf('// ==/UserScript==') < 0 || !/\}\)\(\);\s*$/.test(codigo)) return; // incompleta
      try { new Function(codigo); } catch (e) { // eslint-disable-line no-new-func
        console.warn('[' + 'ev-telegram' + '] La versión ' + vr + ' de GitHub no se puede usar todavía:', e && e.message);
        autoSet(AUTO.fallo, vr);
        return;
      }
      autoSet(AUTO.clave, codigo);
      console.log('[' + 'ev-telegram' + '] Versión nueva ' + vr + ' descargada (esta es la ' + AUTO.version + ') → recargo');
      recarga();
    } finally { autoComprobando = false; }
  }
  setTimeout(autoComprobar, 20000);
  setInterval(autoComprobar, AUTO.cadaMin * 60000);
  setTimeout(() => { // aviso por Telegram: «actualizado de X a Y»
    const antes = autoGet(AUTO.vista, '');
    if (antes === AUTO.version) return;
    autoSet(AUTO.vista, AUTO.version);
    if (antes && typeof aviso === 'function') aviso('🔄 Script actualizado solo: ' + antes + ' → ' + AUTO.version, 'actualizado');
  }, 60000);

  /* ╔══════════════════════════════════════════════════════════════════════╗
     ║ 1. CONFIGURACIÓN — lo único que tienes que rellenar                   ║
     ╚══════════════════════════════════════════════════════════════════════╝ */
  const CONFIG = {
    // Bot principal: se usa para el modo prueba, los avisos y para cualquier canal sin token propio.
    TOKEN: '',

    // 'simulacion' → no envía nada, solo lo muestra en la consola (F12)
    // 'prueba'     → envía TODO a tu chat de pruebas, indicando a qué canal habría ido
    // 'real'       → envía cada apuesta +EV a su canal
    // (también se cambia con el botón del panel; el panel manda sobre esta línea)
    MODO: 'real',

    // 'auto' = tu chat privado con el bot principal (abre el bot en Telegram y pulsa «Iniciar»). O pon un chat_id.
    CHAT_PRUEBA: 'auto',
    // Avisos de errores/caídas. 'auto' = el mismo chat privado. '' = sin avisos.
    CHAT_ALERTAS: 'auto',

    // ⚠️ Mismos bots y canales que el script de surebets. Los chatId 'auto' los saca del script de surebets (v3.1.6 o más):
    // ten abierta también su pestaña (Arbitraje) al menos una vez. Aquí roiMin = EV mínimo (%), con las mismas cifras que las surebets.
    // Los 11 canales con bot propio (el CONTROL va aparte, justo debajo). chatId 'auto' = el script encuentra solo el canal
    // donde ese bot es administrador (o pon el -100... a mano). roiMin = ROI mínimo (se acepta el valor exacto).
    //   F = fútbol · T = tenis · P = principales (ganador, hándicap, totales…) · S = secundarios (tiros, aces, jugadores, 1ª parte…)
    //   1 / 2 / 3 = nivel del partido (1 = máxima liquidez: LaLiga, Champions, Mundial, partidos con un grande…)
    CANALES: {
      F1P: { token: '', chatId: 'auto', roiMin: 1.5 },  // ⚽ F1 · Principales  (bot principal: comandos y avisos)
      F1S: { token: '', chatId: 'auto', roiMin: 1.5 },  // ⚽ F1 · Secundarios
      F2P: { token: '', chatId: 'auto', roiMin: 1.5 },  // ⚽ F2 · Principales
      F2S: { token: '', chatId: 'auto', roiMin: 1.5 },  // ⚽ F2 · Secundarios
      F3:  { token: '', chatId: 'auto', roiMin: 1.5 },  // ⚽ F3 · Resto de ligas (principales y secundarios)
      T1P: { token: '', chatId: 'auto', roiMin: 1.5 },  // 🎾 T1 · Principales
      T1S: { token: '', chatId: 'auto', roiMin: 1.5 },  // 🎾 T1 · Secundarios
      T2:  { token: '', chatId: 'auto', roiMin: 1.5 },  // 🎾 T2 · ATP 250 (principales y secundarios)
      BK:  { token: '', chatId: 'auto', roiMin: 1.5 },  // 🏀 Basket · NBA y Euroliga (ganador, hándicap, totales; sin jugadores)
      BKE: { token: '', chatId: 'auto', roiMin: 1.5 },  // 🏀 Basket · ⭐️NBA (@Surebetsvalorbasket2bot) · v3.5.0: apuestas de jugador de las estrellas de la NBA
      ROI: { token: '', chatId: '-1003836138101', roiMin: 0.75 }, // 📉 ROI bajo · Importantes (0.75–1.5 %)
      H1:  { token: '', chatId: 'auto', roiMin: 0.75 }, // ⏰ Menos de 1 hora
    },

    // Canal de CONTROL: recibe ABSOLUTAMENTE TODO (lo enviado, con su canal, y lo no enviado, con el motivo) y las filas que no se han podido leer.
    // Sirve para comprobar que no se escapa nada. token '' = usa el bot principal (el de F1 Principales). Bot propio de CONTROL (v3.1.1): «CONTROL». No uses el bot de AutoSurebets, que es el de la app. chatId 'auto' = el canal
    // donde está ese bot y que tenga «CONTROL» en el nombre. activo: false para apagarlo.
    CONTROL: { activo: true, token: '', chatId: 'auto', roiMin: 0, borrarSiDesaparece: true }, // roiMin 0 = todo. borrarSiDesaparece: el CONTROL refleja la web (lo que deja de estar se borra, como en los canales). Si se satura, súbelo (p. ej. 0.5) y lo de menos ROI no irá al CONTROL

    // Aviso si el PC se queda sin internet o se apaga: pega aquí la URL de ping de healthchecks.io
    // (p. ej. 'https://hc-ping.com/xxxxxxxx-xxxx-...'). Vacío = desactivado.
    HEALTHCHECK_URL: '',

    // Mercados de periodo parcial (1ª parte, 1er set, 1er cuarto...): son secundarios → B en todos los niveles.
    PERIODO_PARCIAL: { segura: 'B', media: 'B', roja: 'B' },

    // ⏰ H1 = TODAS las apuestas +EV de PREPARTIDO que empiezan en menos de estos minutos (ROI desde el mínimo de H1, 0.75 %),
    // aunque por deporte, liga y mercado fueran a otro canal. Solo entra lo que pasa todos los filtros (ligas principales,
    // mercados permitidos…). Si ya salió antes por otro canal, no se repite en H1.
    // 🧪 Mientras el +EV está a prueba: lo que iría a los canales principales baja un escalón.
    //   F1 Principales → F2 Principales · F1 Secundarios → F2 Secundarios · T1 Principales / Secundarios → T2 (ATP 250).
    //   El resto (F2, F3, T2, Basket, ROI bajo, Menos de 1 hora, CONTROL) igual. Pon {} para mandarlo todo a su canal normal.
    DEGRADAR_CANALES: { F1P: 'F2P', F1S: 'F2S', T1P: 'T2', T1S: 'T2' },

    MINUTOS_H1: 60,

    // ROI a partir del cual la apuesta +EV huele a error de cuota (palpable): va a ROI_MAX_CANAL con un aviso. 0 = sin límite.
    ROI_MAX: 15, // (aquí es el EV)
    ROI_MAX_CANAL: 'H1', // '' = no se envía a ningún canal (solo CONTROL)

    // 📉 Canal ROI = SOLO apuestas +EV con ROI entre el mínimo de ROI (0.75 %) y el de su canal (1.5 %) de partidos importantes:
    // fútbol de nivel 1 y 2 (F1, F2) y tenis T1 (Grand Slam, Masters, ATP 500, Finals, Laver Cup, tenistas top).
    // Si empieza en menos de 1 hora manda H1. Si ya salió por otro canal, no se repite aquí.
    ROI_BAJO: { activo: true },

    // 🏀 Basket: SOLO NBA (temporada y playoffs) y Euroliga, solo mercados principales del partido (ganador, hándicap, totales).
    // Nada de jugadores ni estadísticas (solo CONTROL). totales: false = los totales también solo CONTROL.
    // cuartosYMitades: true = 1er cuarto, 1ª mitad… también al canal. G League, Summer League, ACB, NCAA, etc.: solo CONTROL.
    NBA: {
      activo: true, euroliga: true, canal: 'BK', totales: true, cuartosYMitades: false,
      // v3.5.0 · Las apuestas de jugador de las estrellas salen SOLO en este canal (🏀 Basket · ⭐️NBA), no en el de Basket. '' = como antes (Basket).
      canalEstrellas: 'BKE',
      // Apuestas de jugador de la NBA: solo salen (al canal ⭐️NBA, canalEstrellas) las de estas estrellas. Las de cualquier otro jugador → solo CONTROL.
      // Pon o quita nombres completos tal cual (sin tildes da igual). jugadoresEstrella: false = ningún jugador sale.
      jugadoresEstrella: true,
      estrellas: [
        // superestrellas
        'LeBron James', 'Stephen Curry', 'Kevin Durant', 'Giannis Antetokounmpo', 'Nikola Jokic', 'Luka Doncic',
        'Shai Gilgeous-Alexander', 'Victor Wembanyama', 'Joel Embiid', 'Jayson Tatum', 'Anthony Edwards', 'Anthony Davis',
        'Devin Booker', 'Ja Morant', 'Jalen Brunson', 'Donovan Mitchell', 'Kyrie Irving', 'James Harden',
        'Damian Lillard', 'Kawhi Leonard', 'Jimmy Butler', 'Trae Young', 'Jaylen Brown', 'Cooper Flagg', 'LaMelo Ball',
        // titulares muy conocidos: sus props también se mueven mucho
        'Tyrese Haliburton', 'Tyrese Maxey', 'Paolo Banchero', 'Franz Wagner', 'Zion Williamson', 'Karl-Anthony Towns',
        "De'Aaron Fox", 'Domantas Sabonis', 'Bam Adebayo', 'Jalen Williams', 'Chet Holmgren', 'Pascal Siakam',
        'Jaren Jackson', 'Zach LaVine', 'DeMar DeRozan', 'Paul George', 'Jamal Murray', 'Alperen Sengun',
        'Scottie Barnes', 'Cade Cunningham', 'Evan Mobley', 'Darius Garland', 'Jalen Green', 'Austin Reaves',
        'Kristaps Porzingis', 'Desmond Bane', 'Jalen Johnson', 'Amen Thompson', 'Derrick White', 'Jrue Holiday',
      ],
    },

    // Copa del Rey: Primera contra Primera → su canal normal · un solo equipo de Primera → F3 · ninguno → solo CONTROL
    // (lista EQUIPOS_PRIMERA más abajo). false = todos los partidos de Copa a su canal normal.
    COPA_DEL_REY_SOLO_PRIMERA: true,

    // Reenviar una apuesta +EV ya enviada si su ROI cambia.
    REENVIAR_SI_CAMBIA_ROI: false, // false = mismas casas y mismo mercado → un solo mensaje aunque cambie la cuota
    // Diferencia mínima de ROI (en puntos) para reenviar. 0 = cualquier cambio.
    REENVIO_DIFERENCIA_MIN: 0,
    // Nunca se repite un ROI que ya se envió para esa misma apuesta +EV, y entre dos avisos
    // de la misma apuesta +EV tienen que pasar al menos estos minutos (evita ráfagas cuando la cuota baila).
    REENVIO_ESPERA_MIN: 15,

    // Si una apuesta +EV desaparece de la web mientras espera en la cola, no se envía.
    DESCARTAR_SI_DESAPARECE: true,

    // Si una apuesta +EV YA ENVIADA lleva estos minutos seguidos sin salir en la web, se borra su mensaje del canal.
    // 0 = no borrar nunca. (Los mensajes del CONTROL no se borran.)
    BORRAR_SI_DESAPARECE_MIN: 5,
    // Si una apuesta +EV borrada vuelve a salir más tarde en la web, se envía otra vez.
    REENVIAR_SI_VUELVE: true,



    // Separación mínima entre mensajes al mismo canal (límite de Telegram ≈ 20/min por canal).
    INTERVALO_POR_CANAL_MS: 3100,

    // Pulsar "Mostrar más" automáticamente para que se carguen todas las filas (hasta MAX_FILAS).
    AUTO_MOSTRAR_MAS: true,
    MAX_FILAS: 2000, // tope de seguridad para que el navegador no se ahogue

    // Vigilancia
    RECARGA_CADA_MIN: 60,             // recarga de seguridad (0 = nunca). Espera a que la cola esté vacía.
    RECARGA_SI_DESCONECTADO_SEG: 90,  // si el indicador "Conectado" de la web falla este tiempo → recarga
    RECARGA_SI_CONGELADO_MIN: 20,     // si la tabla no cambia nada en este tiempo → recarga
    DIAS_MEMORIA: 2,                  // cuánto se recuerdan las apuestas +EV ya enviadas

    MOSTRAR_PANEL: true,
    DEBUG: false,
  };

  /* ╔══════════════════════════════════════════════════════════════════════╗
     ║ 2. COMPETICIONES — Nivel 1 / 2 / 3 según la liquidez del evento        ║
     ║    Nivel 1 = máxima liquidez (se mueve muchísimo dinero, la apuesta   ║
     ║    se camufla). Nivel 2 = importante pero menos volumen. Nivel 3 =    ║
     ║    poca liquidez. Lo que no esté en ningún nivel NO SALE (solo        ║
     ║    CONTROL).                                                          ║
     ║    "sube: true" = si juega un equipo/selección TOP sube un nivel.      ║
     ╚══════════════════════════════════════════════════════════════════════╝ */

  // Prefijos de país/región que la web puede poner delante (o detrás) del nombre de la liga.
  const P = {
    ING: ['england', 'english', 'eng', 'inglaterra'],
    ESP: ['spain', 'spanish', 'espana', 'esp'],
    ITA: ['italy', 'italian', 'italia', 'ita'],
    ALE: ['germany', 'german', 'alemania', 'deutschland', 'ger'],
    FRA: ['france', 'french', 'francia', 'fra'],
    HOL: ['netherlands', 'dutch', 'holland', 'holanda', 'paises bajos', 'ned'],
    POR: ['portugal', 'portuguese', 'por'],
    ESC: ['scotland', 'scottish', 'escocia'],
    BEL: ['belgium', 'belgian', 'belgica'],
    TUR: ['turkey', 'turkish', 'turkiye', 'turquia'],
    GRE: ['greece', 'greek', 'grecia'],
    AUT: ['austria', 'austrian'],
    SUI: ['switzerland', 'swiss', 'suiza'],
    DIN: ['denmark', 'danish', 'dinamarca'],
    NOR: ['norway', 'norwegian', 'noruega'],
    SUE: ['sweden', 'swedish', 'suecia'],
    POL: ['poland', 'polish', 'polonia'],
    CHE: ['czech republic', 'czechia', 'czech', 'republica checa', 'chequia'],
    CRO: ['croatia', 'croatian', 'croacia'],
    SAU: ['saudi arabia', 'saudi', 'arabia saudi', 'arabia saudita'],
    USA: ['usa', 'us', 'united states', 'eeuu', 'estados unidos', 'north america'],
    MEX: ['mexico', 'mexican'],
    BRA: ['brazil', 'brazilian', 'brasil'],
    ARG: ['argentina', 'argentinian', 'argentine'],
    JAP: ['japan', 'japanese', 'japon'],
    COR: ['south korea', 'korea republic', 'korea', 'korean', 'corea del sur'],
    AUS: ['australia', 'australian'],
    UEFA: ['uefa', 'europe', 'european', 'europa', 'international', 'international clubs', 'clubs', 'intl', 'internacional'],
    MUNDO: ['world', 'fifa', 'international', 'intl', 'mundo', 'internacional'],
    CONMEBOL: ['conmebol', 'south america', 'sudamerica', 'america', 'international', 'international clubs', 'clubs', 'internacional'],
  };

  // Ligas y copas de clubes. "nombres" valen solos o con país; "soloConPais" solo con prefijo de país.
  // (Las competiciones de selecciones y los amistosos se tratan aparte, más abajo.)
  const FUTBOL = [
    // ── NIVEL 1: lo más líquido que hay (en España, LaLiga y la Champions) ──
    { nivel: 1, comp: 'LaLiga', paises: P.ESP, nombres: ['laliga', 'la liga', 'laliga ea sports', 'la liga ea sports', 'laliga santander', 'la liga santander'], soloConPais: ['primera division', 'liga', 'primera'] },
    { nivel: 1, comp: 'Champions League', paises: P.UEFA, nombres: ['champions league', 'uefa champions league'] },

    // ── NIVEL 2 (sube a 1 si juega un grande): ligas top europeas, Europa League, copas grandes ──
    { nivel: 2, sube: true, comp: 'Premier League', paises: P.ING, nombres: ['premier league', 'epl', 'barclays premier league'] },
    { nivel: 2, sube: true, comp: 'Serie A', paises: P.ITA, nombres: ['serie a', 'serie a tim', 'serie a enilive'] },
    { nivel: 2, sube: true, comp: 'Bundesliga', paises: P.ALE, nombres: ['bundesliga', '1 bundesliga'] },
    { nivel: 2, sube: true, comp: 'Ligue 1', paises: P.FRA, nombres: ['ligue 1', 'ligue1', 'ligue 1 mcdonald s', 'ligue 1 uber eats'] },
    { nivel: 2, sube: true, comp: 'Europa League', paises: P.UEFA, nombres: ['europa league', 'uefa europa league'] },
    { nivel: 2, sube: true, comp: 'Copa del Rey', paises: P.ESP, nombres: ['copa del rey', 'kings cup', 'king s cup'], soloConPais: ['cup', 'copa'] },
    { nivel: 2, sube: true, comp: 'Supercopa de España', paises: P.ESP, nombres: ['supercopa', 'supercopa de espana'], soloConPais: ['super cup', 'supercup'] },
    { nivel: 2, sube: true, comp: 'FA Cup', paises: P.ING, nombres: ['fa cup', 'emirates fa cup', 'the fa cup'] },
    { nivel: 2, sube: true, comp: 'Supercopa de Europa', paises: P.UEFA, nombres: ['uefa super cup', 'supercopa de europa'] },
    { nivel: 2, comp: 'Eredivisie', paises: P.HOL, nombres: ['eredivisie'] },
    { nivel: 2, comp: 'Primeira Liga', paises: P.POR, nombres: ['primeira liga', 'liga portugal', 'liga portugal betclic', 'liga portugal bwin', 'liga nos'], soloConPais: ['primeira', 'liga', 'primera liga', 'primera division'] },

    // ── NIVEL 3 (sube a 2 si juega un grande): poca liquidez ──
    { nivel: 3, sube: true, comp: 'Conference League', paises: P.UEFA, nombres: ['conference league', 'uefa conference league', 'europa conference league', 'uefa europa conference league'] },
    { nivel: 3, sube: true, comp: 'Previa de competición UEFA', paises: P.UEFA, nombres: ['champions league qualification', 'uefa champions league qualification', 'champions league qualifying', 'europa league qualification', 'uefa europa league qualification', 'conference league qualification', 'uefa conference league qualification', 'europa conference league qualification'] },
    { nivel: 3, sube: true, comp: 'Copa de Inglaterra (EFL)', paises: P.ING, nombres: ['efl cup', 'carabao cup', 'league cup', 'community shield', 'fa community shield'] },
    { nivel: 3, sube: true, comp: 'Copa de Italia', paises: P.ITA, nombres: ['coppa italia', 'supercoppa', 'supercoppa italiana'], soloConPais: ['cup', 'super cup', 'supercup'] },
    { nivel: 3, sube: true, comp: 'Copa de Alemania', paises: P.ALE, nombres: ['dfb pokal', 'dfb cup', 'dfl supercup'], soloConPais: ['cup', 'pokal', 'super cup', 'supercup'] },
    { nivel: 3, sube: true, comp: 'Copa de Francia', paises: P.FRA, nombres: ['coupe de france', 'trophee des champions'], soloConPais: ['cup', 'super cup', 'supercup'] },
    { nivel: 3, comp: 'Copa de Portugal', paises: P.POR, nombres: ['taca de portugal', 'taca da liga', 'supertaca'], soloConPais: ['cup', 'league cup', 'super cup', 'supercup'] },
    { nivel: 3, comp: 'Copa de Países Bajos', paises: P.HOL, nombres: ['knvb beker', 'knvb cup', 'johan cruijff schaal'], soloConPais: ['cup', 'super cup', 'supercup'] },
    { nivel: 3, comp: 'LaLiga 2', paises: P.ESP, nombres: ['laliga 2', 'la liga 2', 'laliga2', 'laliga hypermotion', 'la liga hypermotion', 'segunda division'], soloConPais: ['segunda', 'segunda division', 'liga 2'] },
    { nivel: 3, comp: 'Championship', paises: P.ING, nombres: ['efl championship', 'sky bet championship'], soloConPais: ['championship'] },
    { nivel: 3, comp: '2. Bundesliga', paises: P.ALE, nombres: ['2 bundesliga', 'bundesliga 2', '2nd bundesliga'] },
    { nivel: 3, comp: 'Serie B', paises: P.ITA, soloConPais: ['serie b', 'serie bkt'] },
    { nivel: 3, comp: 'Ligue 2', paises: P.FRA, nombres: ['ligue 2', 'ligue 2 bkt'] },
    { nivel: 3, comp: 'Escocia Premiership', paises: P.ESC, nombres: ['scottish premiership'], soloConPais: ['premiership', 'premier league'] },
    { nivel: 3, comp: 'Bélgica Pro League', paises: P.BEL, nombres: ['jupiler pro league', 'belgian pro league'], soloConPais: ['pro league', 'first division a', 'division 1a', 'first division'] },
    { nivel: 3, comp: 'Turquía Süper Lig', paises: P.TUR, nombres: ['super lig', 'trendyol super lig'], soloConPais: ['super league'] },
    { nivel: 3, comp: 'Grecia Super League', paises: P.GRE, soloConPais: ['super league', 'super league 1'] },
    { nivel: 3, comp: 'Austria Bundesliga', paises: P.AUT, soloConPais: ['bundesliga'] },
    { nivel: 3, comp: 'Suiza Super League', paises: P.SUI, nombres: ['swiss super league'], soloConPais: ['super league'] },
    { nivel: 3, comp: 'Dinamarca Superliga', paises: P.DIN, soloConPais: ['superliga', 'superligaen'] },
    { nivel: 3, comp: 'Noruega Eliteserien', paises: P.NOR, nombres: ['eliteserien'] },
    { nivel: 3, comp: 'Suecia Allsvenskan', paises: P.SUE, nombres: ['allsvenskan'] },
    { nivel: 3, comp: 'Polonia Ekstraklasa', paises: P.POL, nombres: ['ekstraklasa'] },
    { nivel: 3, comp: 'Chequia 1. Liga', paises: P.CHE, soloConPais: ['first league', '1 liga', 'chance liga', 'fortuna liga'] },
    { nivel: 3, comp: 'Croacia HNL', paises: P.CRO, nombres: ['hnl', 'supersport hnl', '1 hnl', 'prva hnl'] },
    { nivel: 3, sube: true, comp: 'Copa Libertadores', paises: P.CONMEBOL, nombres: ['copa libertadores', 'libertadores', 'conmebol libertadores', 'copa conmebol libertadores'] },

    // ── NIVEL 0 = NO SALE EN NINGÚN CANAL (solo CONTROL): ligas que no son principales ──
    // (se dejan en la lista para que el CONTROL diga claramente por qué no salen; cambia el 0 por 3 para volver a activarlas)
    { nivel: 0, comp: 'Arabia Saudí Pro League', paises: P.SAU, nombres: ['saudi pro league', 'roshn saudi league'], soloConPais: ['pro league', 'professional league'] },
    { nivel: 0, comp: 'MLS', paises: P.USA, nombres: ['mls', 'major league soccer', 'mls cup'] },
    { nivel: 0, comp: 'Liga MX', paises: P.MEX, nombres: ['liga mx', 'liga bbva mx'], soloConPais: ['primera division', 'liga'] },
    { nivel: 0, comp: 'Brasileirão', paises: P.BRA, nombres: ['brasileirao', 'brasileirao serie a'], soloConPais: ['serie a', 'campeonato brasileiro serie a'] },
    { nivel: 0, comp: 'Argentina Liga Profesional', paises: P.ARG, nombres: ['liga profesional argentina'], soloConPais: ['liga profesional', 'primera division', 'liga profesional de futbol'] },
    { nivel: 0, comp: 'Copa Sudamericana', paises: P.CONMEBOL, nombres: ['copa sudamericana', 'sudamericana', 'conmebol sudamericana'] },
    { nivel: 0, comp: 'Japón J1', paises: P.JAP, nombres: ['j1 league', 'j league', 'j1'] },
    { nivel: 0, comp: 'Corea K League 1', paises: P.COR, nombres: ['k league 1', 'k league', 'k1 league'] },
    { nivel: 0, comp: 'Australia A-League', paises: P.AUS, nombres: ['a league', 'a league men', 'isuzu ute a league'] },
  ];

  // Tenis (se detecta por palabras del nombre del torneo)
  const TENIS = {
    GRAND_SLAM: /\b(us open|wimbledon|roland garros|french open|australian open|open de australia|abierto de australia|abierto de estados unidos|internationaux de france)\b/,
    MASTERS_1000: /\b(indian wells|bnp paribas open|miami|monte carlo|montecarlo|monaco|madrid|mutua madrid|rome|roma|internazionali|italian open|canada|canadian open|toronto|montreal|national bank open|cincinnati|western southern|mason|shanghai|paris|bercy|rolex paris|masters 1000|m1000)\b/,
    ATP_500: /\b(atp 500|rotterdam|dallas|doha|qatar|rio de janeiro|rio|acapulco|dubai|barcelona|munich|halle|queen s|queens|london|hamburg|washington|beijing|tokyo|basel|basilea|bale|swiss indoors|vienna|viena|wien|erste bank)\b/,
    ATP_FINALS: /\b(atp finals|nitto|finales atp|turin|torino)\b/,
    // Torneos ATP 250 (por ciudad) — la web a veces pone solo "ciudad país superficie", sin "ATP"
    ATP_250: /\b(brisbane|hong kong|adelaide|auckland|montpellier|delray beach|marseille|marsella|buenos aires|santiago|houston|marrakech|bucharest|bucarest|geneva|ginebra|stuttgart|s hertogenbosch|hertogenbosch|mallorca|eastbourne|newport|bastad|gstaad|kitzbuhel|umag|estoril|los cabos|atlanta|winston salem|chengdu|hangzhou|astana|almaty|stockholm|estocolmo|nordic open|antwerp|amberes|brussels|bruselas|bruxelles|european open|metz|moselle open|belgrade|belgrado|athens|atenas|hellenic|lyon|cordoba|pune|dallas)\b/,
    // Ciudades donde solo hay torneo masculino en el circuito principal (si la web no dice ATP/WTA)
    SOLO_ATP: /\b(shanghai|monte carlo|montecarlo|monaco|hamburg|hamburgo|halle|queen s|queens|basel|basilea|vienna|viena|rotterdam|acapulco|rio de janeiro|rio|munich|barcelona|hangzhou|chengdu|astana|almaty|stockholm|estocolmo|nordic open|antwerp|amberes|brussels|bruselas|bruxelles|european open|metz|moselle open|belgrade|belgrado|athens|atenas|hellenic|swiss indoors|basilea|bale|wien|erste bank|gstaad|kitzbuhel|umag|newport|atlanta|winston salem|los cabos|delray beach|marseille|montpellier|buenos aires|santiago|houston|marrakech|bucharest|geneva|mallorca|dallas|turin|torino|bercy)\b/,
    // Ciudades que en otoño (sep–dic) solo tienen torneo masculino (en invierno hay WTA)
    SOLO_ATP_OTONO: /\b(lyon)\b/,
    ITF: /\bitf\b|\b[mw] ?(15|25|35|40|50|60|75|80|100)\b/,
    DAVIS: /\b(davis cup|copa davis)\b/,
    EXHIBICION_TOP: /\b(laver cup|six kings)\b/,
    EXHIBICION: /\b(six kings|laver cup|uts|ultimate tennis showdown|exhibition|exhibicion|exho|hopman|kooyong|mubadala|world tennis league|battle of the sexes|tie break tens)\b/,
    CHALLENGER: /\b(challenger|ch \d{2,3}|atp \d{2,3} challenger|atp 1[27]5|atp [57]5|atp 100)\b/,
    // Circuitos menores donde no juega ningún top 20 (UTR Pro Tennis Tour, Futures, universitario, ligas…)
    MENOR: /\b(utr|ptt|pro tennis tour|pro series|pro circuit|futures?|college|ncaa|universit\w*|national championships?|campeonato nacional|tennis league|liga|league|gsb|tcl|e tennis|virtual)\b/,
    FUERA: /\b(junior|juniors|boys|girls|juvenil|wheelchair|silla de ruedas|legends|leyendas|seniors?|veteranos|next gen|nextgen|united cup|billie jean king|bjk|fed cup|wta 125)\b/,
    DOBLES: /\b(doubles|dobles|double|mixed|mixto|mixtos|dbls)\b/,
    PREVIA: /\b(qualification|qualifying|qualifiers|qualifier|qualy|quali|clasificacion|clasificatoria|previa)\b/,
    FEM: /\b(wta|women|womens|woman|female|ladies|femenino|femenina|fem|mujeres|damas)\b/,
    MASC: /\b(atp|men|mens|masc|masculino|hombres|caballeros|masters)\b/,
  };

  // Calendario ATP: meses en que se juega cada torneo. Solo se usa cuando la web NO pone «ATP» en el nombre
  // (si pone solo la ciudad, un torneo menor en esa ciudad —UTR, ITF…— no debe colarse como ATP).
  const CALENDARIO_ATP = [
    // Grand Slams y Finals
    [/\b(melbourne|australian open|open de australia|abierto de australia)\b/, [1]], [/\b(new york|nueva york|flushing|us open|abierto de estados unidos)\b/, [8, 9]],
    [/\b(turin|torino|nitto)\b/, [11]],
    // Masters 1000
    [/\b(indian wells|bnp paribas open)\b/, [3]], [/\bmiami\b/, [3, 4]], [/\b(monte carlo|montecarlo|monaco)\b/, [4]], [/\b(madrid|mutua madrid)\b/, [4, 5]],
    [/\b(rome|roma|internazionali|italian open)\b/, [5]], [/\b(canada|canadian open|toronto|montreal|national bank open)\b/, [7, 8]],
    [/\b(cincinnati|western southern|mason)\b/, [8]], [/\bshanghai\b/, [9, 10]], [/\b(paris|bercy|rolex paris)\b/, [5, 6, 10, 11]],
    // ATP 500
    [/\brotterdam\b/, [2]], [/\bdallas\b/, [2]], [/\b(doha|qatar)\b/, [2]], [/\b(rio de janeiro|rio)\b/, [2]], [/\bacapulco\b/, [2, 3]], [/\bdubai\b/, [2, 3]],
    [/\bbarcelona\b/, [4]], [/\bmunich\b/, [4]], [/\bhalle\b/, [6]], [/\b(queen s|queens|london|londres)\b/, [6, 7]], [/\b(hamburg|hamburgo)\b/, [5, 7]],
    [/\bwashington\b/, [7, 8]], [/\bbeijing\b/, [9, 10]], [/\btokyo\b/, [9, 10]], [/\b(basel|basilea|bale|swiss indoors)\b/, [10, 11]], [/\b(vienna|viena|wien|erste bank)\b/, [10, 11]],
    // ATP 250
    [/\b(brisbane|hong kong)\b/, [12, 1]], [/\b(adelaide|auckland|pune)\b/, [1]], [/\bmontpellier\b/, [1, 2]], [/\b(delray beach|marseille|marsella|buenos aires|cordoba)\b/, [2]],
    [/\bsantiago\b/, [2, 3]], [/\b(houston|marrakech|bucharest|bucarest)\b/, [3, 4]], [/\bestoril\b/, [4]], [/\b(geneva|ginebra)\b/, [5]], [/\blyon\b/, [5, 10, 11]],
    [/\b(stuttgart|s hertogenbosch|hertogenbosch|mallorca|eastbourne)\b/, [6]], [/\b(newport|bastad|gstaad|kitzbuhel|umag)\b/, [7]], [/\b(los cabos|atlanta)\b/, [7, 8]],
    [/\bwinston salem\b/, [8]], [/\b(chengdu|hangzhou)\b/, [9]], [/\b(almaty|astana|antwerp|amberes|brussels|bruselas|bruxelles|european open)\b/, [10]], [/\b(stockholm|estocolmo|nordic open)\b/, [10, 11]],
    [/\b(metz|moselle open|belgrade|belgrado|athens|atenas|hellenic)\b/, [11]],
  ];
  const enCalendarioATP = (t, mes) => CALENDARIO_ATP.some(([re, meses]) => re.test(t) && meses.includes(mes));

  // v1.0.5 · SEDES ATP APRENDIDAS DE LA WEB. Cuando una fila dice «ATP <ciudad>» (p. ej. «Sweden ATP Stockholm - Hard»), esa ciudad
  // cuenta como torneo ATP durante 10 días aunque otras filas del mismo torneo NO pongan «ATP» («Stockholm Sweden Hard»).
  // Así un torneo que cambia de fechas o una sede nueva nunca se queda fuera por culpa del calendario.
  const ATP_SEDE_DIAS = 10;
  const NO_SEDE = new Set(('atp tour world 250 500 1000 masters finals final men mens singles single hard clay grass indoor indoors carpet outdoor court ' +
    'open los las la le el de del di san santa st saint the of cup copa tennis championships championship international internacional').split(' '));
  let sedesATP = null; // se lee del almacenamiento la primera vez que hace falta
  const sedes = () => sedesATP || (sedesATP = store.get('atp_sedes_v1', {}) || {});
  function sedeDeATP(t) { // 'sweden atp stockholm hard' → 'stockholm'
    const m = t.match(/\batp\s+(.+)$/);
    if (!m) return null;
    for (const w of m[1].split(' ')) if (w.length >= 3 && !NO_SEDE.has(w) && !/\d/.test(w)) return w;
    return null;
  }
  function aprenderSedeATP(t) {
    const w = sedeDeATP(t);
    if (!w) return;
    const S = sedes();
    const ya = S[w] || 0;
    if (ahora() - ya < 3600000) return; // ya apuntada hace menos de 1 h
    S[w] = ahora();
    for (const [k, ts] of Object.entries(S)) if (ahora() - ts > ATP_SEDE_DIAS * 86400000) delete S[k];
    store.set('atp_sedes_v1', S);
  }
  const sedeAprendida = (t) => Object.entries(sedes()).some(([w, ts]) => ahora() - ts <= ATP_SEDE_DIAS * 86400000 && (' ' + t + ' ').includes(' ' + w + ' '));

  // Equipos, selecciones y tenistas que hacen subir un nivel al partido (edítalo cuando quieras)
  const EQUIPOS_TOP = ['real madrid', 'barcelona', 'atletico madrid', 'atletico de madrid', 'manchester city', 'man city', 'manchester united', 'man utd', 'man united',
    'liverpool', 'arsenal', 'chelsea', 'tottenham', 'bayern', 'dortmund', 'leverkusen', 'inter', 'internazionale', 'milan', 'juventus', 'napoli', 'paris saint germain', 'psg', 'paris sg'];
  const SELECCIONES_TOP = ['spain', 'espana', 'france', 'francia', 'england', 'inglaterra', 'germany', 'alemania', 'italy', 'italia', 'portugal', 'netherlands',
    'paises bajos', 'holanda', 'belgium', 'belgica', 'argentina', 'brazil', 'brasil', 'croatia', 'croacia'];
  const TENISTAS_TOP = ['alcaraz', 'sinner', 'djokovic', 'zverev', 'fritz', 'draper', 'de minaur', 'musetti', 'shelton', 'medvedev', 'rune', 'ruud', 'mensik', 'paul', 'tsitsipas', 'rublev'];

  // Para saber si un partido de tenis es masculino o femenino cuando la web no lo dice
  const ATP_APELLIDOS = ('sinner alcaraz zverev djokovic fritz draper de minaur musetti shelton medvedev rune ruud mensik paul tsitsipas rublev dimitrov humbert cerundolo ' +
    'auger aliassime khachanov tiafoe lehecka machac fils bublik berrettini korda davidovich fokina cobolli popyrin shapovalov nakashima michelsen griekspoor darderi ' +
    'tabilo munar baez carreno busta bautista agut struff hurkacz norrie evans giron etcheverry navone sonego arnaldi bergs mpetshi perricard fonseca tien kecmanovic ' +
    'lajovic nishikori wawrinka monfils thompson kokkinakis kyrgios borges jarry garin van de zandschulp halys muller mannarino moutet rinderknech bonzi marozsan ' +
    'fucsovics safiullin kotov nardi cazaux opelka brooksby mcdonald eubanks wolf spizzirri diallo de jong comesana ugo carabelli vacherot royer quinn basavareddy ' +
    'tirante cilic goffin ofner altmaier hanfmann koepfer misolic cachin coria bu shang zhizhen kovacevic van assche gaston fearnley harris schwaerzler prizmic ' +
    'medjedovic djere landaluce carballes collignon blockx hijikata jacquet sakamoto rodionov skatov dzumhur zeppieri passaro gigante maestrelli ' +
    'vavassori bolelli majchrzak mcdonald svajda shevchenko gea boyer virtanen ruusuvuori sweeny duckworth walton kubler purcell vukic polmans tseng nava ' +
    'damm krueger holt riedi stricker huesler budkov kjaer engel trungelliti alcala ramos vinolas martinez zapata llamas moro canas pellegrino zeppieri cecchinato').split(' ');
  const WTA_APELLIDOS = ('sabalenka swiatek gauff pegula rybakina anisimova andreeva paolini keys navarro zheng shnaider alexandrova svitolina mboko muchova noskova ' +
    'tauson kasatkina ostapenko samsonova kalinskaya krejcikova vondrousova badosa bouzkova kenin collins haddad maia garcia linette frech stearns kostyuk siniakova ' +
    'yastremska putintseva krueger jovic raducanu fernandez osaka azarenka bencic kvitova sakkari cirstea mertens kessler siegemund sorribes tormo bucsa parry eala ' +
    'joint kartal boulter jabeur wozniacki stephens townsend tomljanovic kudermetova yafan xinyu yuan gao preston korneeva sonmez lys niemeier tjen valentova ' +
    'sramkova bejlek golubic teichmann uchijima starodubtseva zarazua osorio podoroska bondar udvardy grabher ruse tomova rakhimova potapova blinkova avanesyan ' +
    'zakharova pavlyuchenkova krunic galfi bronzetti cocciaretto stefanini vekic wang xiyu zhu lin bouzas maneiro parks dolehide li volynets birrell hunter ' +
    'gibson inglis rogers fruhvirtova bartunkova kalinina baptiste branstine marcinko sun hibino ito kato mandlik rakotomanga jeanjean paquet parry burel cornet ' +
    'hon kalinina snigur dzalamidze arango riera sierra carle gorgodze').split(' ');
  const NOMBRES_F = ('aryna iga coco jessica elena mirra jasmine madison emma paula qinwen diana ekaterina elina victoria karolina linda clara daria jelena liudmila ' +
    'anna barbora marketa marie sofia danielle beatriz caroline magda magdalena eva peyton marta anastasia iva leylah naomi belinda petra maria elise ajla sorana ' +
    'mccartney laura sara cristina ana renata alina taylah polina lucia sloane alycia olga xinyu yafan xiyu katie harriet heather sonay ons lulu mayar viktoriya ' +
    'kamilla yulia veronika irina elisabetta jil tatjana moyuka oksana nadia julia camila nuria rebecca dayana kateryna alexandra alize kimberly ashlyn hailey ' +
    'alexa katerina varvara anhelina kristina tereza sinja solana maya tamara mirjam lois oceane chloe leolia carole fiona diane harmony kristyna brenda kaja dalma ' +
    'panna greet yanina oleksandra lesia ylena aliaksandra arantxa mariam suzan ellen jule hanne bianca kayla taylor ann anastasija despina valentini tatiana ' +
    'maddison jaqueline francesca martina lucrezia jasmin sabine wiktoria magdalena carolina erika rebeka viktorija eri mai ena nao misaki shuai saisai qiang yue ' +
    'kateryna marina vera yuliia mananchaya talia storm destanee kimberly priscilla arina daria').split(' ');
  const NOMBRES_M = ('alexander jannik carlos novak jack alex lorenzo ben daniil holger casper jakub tommy stefanos andrey grigor ugo francisco felix karen frances jiri ' +
    'tomas arthur matteo sebastian alejandro flavio alexei brandon learner tallon luciano jaume pablo roberto jan hubert cameron daniel nicolas mariano zizou giovanni ' +
    'joao laslo miomir dusan kei stan gael richard jordan thanasi nick thiago cristian botic quentin alexandre adrian corentin benjamin fabian marton aslan pavel luca ' +
    'hugo terence reilly mackenzie christopher aleksandar marcos camilo valentin nishesh juan marin david filip roman yoshihito james martin dalibor raphael zsombor ' +
    'kyrian rinky yunchaokete zhizhen juncheng hamad damir lukas jakob dominic vit tristan emilio jesper mattia andrea federico luciano facundo tomas sebastian ' +
    'mariano francisco jenson otto aidan rafael marcelo arthur titouan pierre gilles constant jerome mikael jaume pedro carlos albert bernabe martin dino borna ' +
    'denis vasek aleksandar marat roman alibek dmitry evgeny vitaliy illya oleksii hady patrick rei shintaro taro sho yosuke yibing zhe').split(' ');

  // v1.0.5 · ¿Los DOS jugadores son tenistas del circuito ATP (por apellido)? (en UTR / ITF casi nunca pasa)
  function ambosATP(eventoRaw) {
    const js = String(eventoRaw).split(/\s+vs\.?\s+|\s+-\s+/i);
    return js.length === 2 && js.every((j) => { const n = ' ' + norm(j) + ' '; return ATP_APELLIDOS.concat(TENISTAS_TOP).some((a) => a.length >= 3 && n.includes(' ' + a + ' ')); });
  }

  function generoTenis(eventoRaw) {
    let f = 0, m = 0;
    for (const jugador of String(eventoRaw).split(/\s+vs\.?\s+|\s+-\s+|\s*\/\s*/i)) {
      const n = ' ' + norm(jugador) + ' ';
      const palabras = n.trim().split(' ');
      if (ATP_APELLIDOS.some((a) => n.includes(' ' + a + ' '))) { m++; continue; }
      if (WTA_APELLIDOS.some((a) => n.includes(' ' + a + ' '))) { f++; continue; }
      if (NOMBRES_F.includes(palabras[0])) f++;
      else if (NOMBRES_M.includes(palabras[0])) m++;
    }
    if (f && !m) return 'F';
    if (m && !f) return 'M';
    return null;
  }

  /* ╔══════════════════════════════════════════════════════════════════════╗
     ║ 3. MERCADOS — A (principal) o B (estadísticas / props)                ║
     ╚══════════════════════════════════════════════════════════════════════╝ */

  // Cualquier mercado que contenga una de estas palabras es B (estadísticas, jugadores, especiales).
  const PALABRAS_PROP = [
    // estadísticas de partido
    'corner', 'corners', 'corneres', 'esquina', 'esquinas', 'tarjeta', 'tarjetas', 'amarilla', 'amarillas', 'roja', 'rojas', 'booking', 'bookings', 'card', 'cards',
    'fuera de juego', 'fueras de juego', 'offside', 'offsides', 'saque de meta', 'saques de meta', 'saque de puerta', 'saques de puerta', 'saque de banda', 'saques de banda', 'goal kick', 'goal kicks', 'throw in', 'throw ins',
    'tiro', 'tiros', 'disparo', 'disparos', 'remate', 'remates', 'shot', 'shots', 'falta', 'faltas', 'foul', 'fouls',
    'ace', 'aces', 'doble falta', 'dobles faltas', 'double fault', 'double faults', 'quiebre', 'quiebres', 'break', 'breaks', 'rotura', 'roturas', 'tie break', 'tie breaks', 'tiebreak', 'tiebreaks', 'desempate', 'desempates',
    // jugadores
    'jugador', 'jugadores', 'jugadora', 'player', 'players', 'rebote', 'rebotes', 'rebound', 'rebounds', 'asistencia', 'asistencias', 'assist', 'assists',
    'triple', 'triples', 'threes', 'perdida', 'perdidas', 'turnover', 'turnovers', 'bloqueo', 'bloqueos', 'tapon', 'tapones', 'block', 'blocks', 'robo', 'robos', 'steal', 'steals',
    'doble doble', 'triple doble', 'double double', 'triple double', 'pra', 'p+a', 'p+r', 'r+a', 'p+r+a',
    'pase', 'pases', 'pass', 'passes', 'centro', 'centros', 'cross', 'crosses', 'despeje', 'despejes', 'clearance', 'clearances', 'parada', 'paradas', 'save', 'saves',
    'goleador', 'goleadores', 'anotador', 'anotadores', 'scorer', 'scorers',
    // béisbol / NFL / rugby / cricket / dardos / eSports / UFC / snooker
    'hit', 'hits', 'jonron', 'jonrones', 'home run', 'home runs', 'homerun', 'homeruns', 'strikeout', 'strikeouts', 'ponche', 'ponches', 'base por bola', 'bases por bola', 'bases por bolas', 'walk', 'walks', 'out', 'outs',
    'touchdown', 'touchdowns', 'td', 'tds', 'yarda', 'yardas', 'yard', 'yards', 'intercepcion', 'intercepciones', 'interception', 'interceptions', 'sack', 'sacks', 'captura', 'capturas', 'recepcion', 'recepciones', 'reception', 'receptions', 'acarreo', 'acarreos', 'rushing', 'carries',
    'try', 'tries', 'ensayo', 'ensayos', 'wicket', 'wickets', 'wide', 'wides', 'six', 'sixes', 'seises', 'cuatros', 'fours', 'run out', 'run outs',
    '180', '180s', 'leg', 'legs', 'checkout', 'kill', 'kills', 'mapa', 'mapas', 'map', 'maps', 'ronda', 'rondas', 'round', 'rounds', 'asalto', 'asaltos', 'frame', 'frames',
    // especiales
    'metodo', 'method', 'ko', 'tko', 'sumision', 'submission', 'decision', 'distancia', 'distance',
    'exacto', 'exacta', 'exactos', 'exactas', 'correcto', 'correct score', 'margen', 'margin', 'par impar', 'impar', 'odd even',
    'con mas', 'highest scoring', 'rango', 'range', 'intervalo', 'minuto', 'minutos', 'minute', 'grupo', 'group', 'eliminatoria', 'clasifica', 'se clasifica', 'to qualify',
    'descanso final', 'medio tiempo final', 'ht ft', 'primer gol', 'ultimo gol', 'first goal', 'last goal', 'anytime', 'primer equipo', 'ultimo equipo', 'carrera a', 'race to',
    'combinada', 'combo', 'bet builder', 'crea tu apuesta', 'torneo', 'outright', 'campeon', 'campeonato', 'ganador de la liga',
  ];

  // Mercados principales (con liquidez). Un mercado es A solo si encaja aquí y no tiene ninguna palabra de la lista anterior.
  const MERCADO_PRINCIPAL = [
    /\b(ganador|ganadora|winner|moneyline|money line|1x2|resultado|result|match result|vencedor|3 way|2 way|tres vias|dos vias)\b/,
    /\b(doble oportunidad|double chance)\b/,
    /\b(apuesta sin empate|sin empate|empate no apuesta|empate no accion|draw no bet|dnb|no bet)\b/,
    /\b(ambos marcan|ambos equipos marcan|ambos equipos anotan|ambos anotan|both teams to score|btts)\b/,
    /\b(porteria invicta|porteria a cero|imbatida|clean sheet|sin encajar|sin recibir goles|sin recibir gol|win to nil|a cero)\b/,
    /\b(ambas mitades|ambas partes|alguna mitad|alguna parte|both halves|either half)\b/,
    // a partir de aquí: totales / hándicaps (se revisa además que la selección no sea un jugador)
    /\b(total|totales|mas menos|mas o menos|over under|handicap|handicaps|spread|linea|lineas|point spread|run line|puck line)\b/,
    /\b(goles|goals|puntos|points|juegos|games|sets|carreras|runs|field goal|field goals)\b/,
  ];
  const PRIMER_PATRON_LINEAS = 6; // índice del primer patrón de totales/hándicaps

  // Periodo parcial (1ª parte, 1er set, 2º cuarto, primeras 5 entradas...)
  const PERIODO_PARCIAL = new RegExp(
    '\\b(1er|1ra|1ro|1a|1o|1st|2do|2da|2o|2a|2nd|3er|3ra|3ro|3o|3a|3rd|4to|4o|4a|4th|5to|5o|5a|5th|' +
    'primer|primera|primero|segundo|segunda|tercer|tercera|tercero|cuarto|cuarta|quinto|quinta|first|second|third|fourth|fifth|1|2|3|4|5) ?' +
    '(set|parte|mitad|tiempo|cuarto|periodo|inning|entrada|juego|half|quarter|period|asalto|round|mapa|map)\\b' +
    '|\\b(set|parte|mitad|cuarto|periodo|inning|entrada|half|quarter|period|juego|game) ?(1|2|3|4|5)\\b' +
    '|\\b(descanso|medio tiempo|halftime|half time|f5|primeras? \\d+ entradas|first \\d+ innings)\\b'
  );

  /* 🔐 Tokens de los bots (desde la v3.8.1 / EV 1.0.7): el código está en GitHub, que es público, así que los tokens NO van
     escritos arriba. Se guardan en Tampermonkey: la versión «INSTALAR» (la que pegas a mano) los trae aquí debajo y los
     guarda la primera vez; las versiones que llegan solas de GitHub los leen de Tampermonkey. Un token escrito arriba manda. */
  const SECRETOS_SEMILLA = null;
  (function aplicarSecretos() {
    try {
      if (SECRETOS_SEMILLA && SECRETOS_SEMILLA.TOKEN) GM_setValue('secretos_v1', SECRETOS_SEMILLA);
      const s = GM_getValue('secretos_v1');
      if (!s || typeof s !== 'object') return;
      if (!String(CONFIG.TOKEN || '').trim() && s.TOKEN) CONFIG.TOKEN = s.TOKEN;
      for (const [k, t] of Object.entries(s.CANALES || {})) if (CONFIG.CANALES[k] && !String(CONFIG.CANALES[k].token || '').trim()) CONFIG.CANALES[k].token = t;
      if (CONFIG.CONTROL && !String(CONFIG.CONTROL.token || '').trim() && s.CONTROL) CONFIG.CONTROL.token = s.CONTROL;
    } catch (e) { console.warn('No se pudieron leer los tokens guardados', e); }
  })();

  /* ═══════════════════ A partir de aquí no hace falta tocar nada ═══════════════════ */

  const VERSION = '1.0.7';
  const MODO_CODIGO = CONFIG.MODO;
  const ZONAS = {
    segura: { num: '1', emoji: '🟢', nombre: 'NIVEL 1' },
    media: { num: '2', emoji: '🟡', nombre: 'NIVEL 2' },
    roja: { num: '3', emoji: '🔴', nombre: 'NIVEL 3' },
  };
  const NOMBRE_CANAL = {
    F1P: '⚽ F1 · Principales', F1S: '⚽ F1 · Secundarios', F2P: '⚽ F2 · Principales', F2S: '⚽ F2 · Secundarios', F3: '⚽ F3 · Resto de ligas',
    T1P: '🎾 T1 · Principales', T1S: '🎾 T1 · Secundarios', T2: '🎾 T2 · ATP 250', BK: '🏀 Basket · NBA y Euroliga', BKE: '🏀 Basket · ⭐️NBA',
    ROI: '📉 ROI bajo · Importantes', H1: '⏰ Menos de 1 hora', CONTROL: '🔍 CONTROL',
  };
  const rotulo = (c) => NOMBRE_CANAL[c] || c;
  // Nombres de canal de versiones anteriores → los de ahora (para no perder canales detectados ni lo ya enviado)
  const CANAL_VIEJO = { '1A': 'F1P', '1B': 'F1S', '2A': 'F2P', '2B': 'F2S', '3A': 'F3', '3B': 'ROI', '4A': 'H1' };
  const EMOJI_CANAL = { F1P: '⚽', F1S: '⚽', F2P: '⚽', F2S: '⚽', F3: '⚽', T1P: '🎾', T1S: '🎾', T2: '🎾', BK: '🏀', BKE: '🏀', ROI: '📉', H1: '⏰', CONTROL: '🔍' };
  // Cómo se reconoce cada canal por su nombre en Telegram (si un bot está en varios canales). Sin tildes ni símbolos.
  const TITULO_CANAL = { F1P: 'f1 principales', F1S: 'f1 secundarios', F2P: 'f2 principales', F2S: 'f2 secundarios', F3: 'f3', T1P: 't1 principales', T1S: 't1 secundarios', T2: 't2', BK: 'basket', BKE: 'nba estrellas', ROI: 'roi bajo', H1: 'menos de 1 hora' };
  const DESCRIPCION_CANAL = {
    F1P: 'fútbol de nivel 1 · mercados principales', F1S: 'fútbol de nivel 1 · secundarios (tiros, goleador, 1ª parte, tarjetas, córners…)',
    F2P: 'fútbol de nivel 2 · mercados principales', F2S: 'fútbol de nivel 2 · secundarios (sin tarjetas ni córners)', F3: 'fútbol de nivel 3 · principales y secundarios',
    T1P: 'tenis: Grand Slam, Masters 1000, ATP 500, Finals, Laver Cup, tenistas top · principales', T1S: 'tenis T1 · secundarios (aces, 1er set…)',
    T2: 'tenis ATP 250 · principales y secundarios', BK: 'NBA y Euroliga · ganador, hándicap y totales', BKE: 'NBA · apuestas de jugador de las estrellas (puntos, rebotes, asistencias…)',
  };
  const NUM_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  const EMOJI_DEPORTE = [
    ['⚽', 'futbol'], ['🎾', 'tenis'], ['🏀', 'baloncesto'], ['🏈', 'americano'], ['🎯', 'dardos'],
    ['⚾', 'beisbol'], ['🏒', 'hockey'], ['🏐', 'voleibol'], ['🏓', 'tenis de mesa'], ['🏉', 'rugby'], ['🏏', 'cricket'],
    ['🎮', 'esports'], ['🤾', 'balonmano'], ['⛳', 'golf'], ['🥊', 'combate'], ['🥋', 'combate'], ['🤼', 'combate'],
    ['🎱', 'snooker'], ['🏎', 'motor'], ['🚴', 'ciclismo'], ['🏸', 'badminton'], ['🏑', 'hockey hierba'],
  ];

  const ahora = () => Date.now();
  const log = (...a) => console.log('%c[+EV→TG]', 'color:#a855f7;font-weight:bold', ...a);
  const dbg = (...a) => { if (CONFIG.DEBUG) log(...a); };

  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9+]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const PROP_RE = new RegExp('(^|\\s)(' + PALABRAS_PROP.map(norm).map(escapeRe).join('|') + ')(?=\\s|$)');

  // ─────────────────────────── almacenamiento ───────────────────────────
  const store = {
    get(k, def) { try { const v = GM_getValue(k); return v === undefined || v === null ? def : v; } catch (e) { return def; } },
    set(k, v) { try { GM_setValue(k, v); } catch (e) { log('No se pudo guardar', k, e); } },
  };
  const ss = {
    get(k) { try { return sessionStorage.getItem('ev_' + k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem('ev_' + k, v); } catch (e) { /* nada */ } },
    json(k, def) { try { const v = sessionStorage.getItem('ev_' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
    setJson(k, v) { try { sessionStorage.setItem('ev_' + k, JSON.stringify(v)); } catch (e) { /* nada */ } },
  };
  // Puente con el script de surebets (misma web → mismo localStorage): de ahí salen los canales y los comandos /ev…
  const PUENTE_CHATS = 'sbtg_puente_chats_v1', PUENTE_CMDS = 'sbtg_puente_ev_cmds_v1', PUENTE_VIVO = 'sbtg_puente_ev_vivo_v1';
  const ls = {
    json(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
    setJson(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* nada */ } },
  };

  /* ═══════════════════════ CLASIFICACIÓN DE COMPETICIONES ═══════════════════════ */

  const RUIDO = [
    /^\s*(soccer|football|futbol)\b/g,
    /\b(19|20)\d{2}( (19|20)?\d{2})?\b/g,
    /\b(regular season|temporada regular|season|temporada)\b/g,
    /\b(league phase|league stage|fase de liga|fase liga)\b/g,
    /\b(group stage|fase de grupos|groups?|grupos?)( [a-p])?\b/g,
    /\b(matchday|jornada|round|ronda|fecha|week|semana)s? \d+\b/g,
    /\b(1st|2nd|3rd|4th|5th|6th|first|second|third|fourth|fifth|sixth|primera|segunda|tercera|cuarta|quinta) (round|ronda|eliminatoria)\b/g,
    /\b(round of \d+|last \d+|1 \d+ final|dieciseisavos( de final)?|octavos( de final)?|cuartos( de final)?)\b/g,
    /\b(knockout stage|knockout round|knockout phase|knockouts?|knock out stage|eliminatorias?|play ?offs?|playoff round)\b/g,
    /\b(quarter ?finals?|semi ?finals?|semifinales?|finals?)\b/g,
    /\b(apertura|clausura)\b/g,
  ];
  function limpiarRuido(t) {
    let k = ' ' + t + ' ';
    for (const re of RUIDO) k = k.replace(re, ' ');
    return k.replace(/\s+/g, ' ').trim();
  }

  const MAPA_FUTBOL = new Map();
  (function construirMapaFutbol() {
    const add = (k, regla) => {
      k = norm(k);
      if (MAPA_FUTBOL.has(k) && MAPA_FUTBOL.get(k) !== regla) dbg('Alias repetido:', k);
      else MAPA_FUTBOL.set(k, regla);
    };
    for (const r of FUTBOL) {
      for (const n of r.nombres || []) {
        add(n, r);
        for (const p of r.paises) { add(p + ' ' + n, r); add(n + ' ' + p, r); }
      }
      for (const n of r.soloConPais || []) {
        for (const p of r.paises) { add(p + ' ' + n, r); add(n + ' ' + p, r); }
      }
    }
  })();

  const FEM_RE = /\b(women|womens|woman|female|femenino|femenina|femenil|feminine|feminin|frauen|damen|ladies|girls|mujeres|wsl|nwsl|liga f|w league)\b/;
  const JUVENIL_RE = /\b(u ?\d{2}|sub ?\d{2}|under ?\d{2}|youth|juvenil|juveniles|reserves?|reservas|academy)\b/;

  /* ── Filtro del canal H1 (menos de 1 hora) ── */
  // Selecciones nacionales (inglés y español) para reconocer amistosos entre países
  const SELECCIONES = new Set([
    'afghanistan','afganistan','albania','algeria','argelia','andorra','angola','antigua and barbuda','antigua y barbuda','argentina','armenia','aruba','australia','austria','azerbaijan','azerbaiyan',
    'bahamas','bahrain','barein','bangladesh','barbados','belarus','bielorrusia','belgium','belgica','belize','belice','benin','bermuda','bermudas','bhutan','butan','bolivia',
    'bosnia and herzegovina','bosnia herzegovina','bosnia y herzegovina','bosnia','botswana','botsuana','brazil','brasil','brunei','bulgaria','burkina faso','burundi',
    'cambodia','camboya','cameroon','camerun','canada','cape verde','cabo verde','central african republic','republica centroafricana','chad','chile','china','chinese taipei','colombia','comoros','comoras',
    'congo','dr congo','rd congo','congo dr','republica democratica del congo','costa rica','croatia','croacia','cuba','curacao','cyprus','chipre','czech republic','czechia','republica checa','chequia',
    'denmark','dinamarca','djibouti','yibuti','dominica','dominican republic','republica dominicana','ecuador','egypt','egipto','el salvador','england','inglaterra','equatorial guinea','guinea ecuatorial','eritrea','estonia','eswatini','ethiopia','etiopia',
    'faroe islands','islas feroe','feroe','fiji','fiyi','finland','finlandia','france','francia','gabon','gambia','georgia','germany','alemania','ghana','gibraltar','greece','grecia','grenada','granada','guadeloupe','guadalupe','guam','guatemala','guinea','guinea bissau','guyana',
    'haiti','honduras','hong kong','hungary','hungria','iceland','islandia','india','indonesia','iran','iraq','irak','ireland','irlanda','republic of ireland','israel','italy','italia','ivory coast','cote d ivoire','costa de marfil',
    'jamaica','japan','japon','jordan','jordania','kazakhstan','kazajistan','kenya','kenia','kosovo','kuwait','kyrgyzstan','kirguistan','laos','latvia','letonia','lebanon','libano','lesotho','liberia','libya','libia','liechtenstein','lithuania','lituania','luxembourg','luxemburgo',
    'macau','macao','madagascar','malawi','malaysia','malasia','maldives','maldivas','mali','malta','martinique','martinica','mauritania','mauritius','mauricio','mexico','moldova','moldavia','mongolia','montenegro','montserrat','morocco','marruecos','mozambique','myanmar',
    'namibia','nepal','netherlands','paises bajos','holanda','new caledonia','nueva caledonia','new zealand','nueva zelanda','nicaragua','niger','nigeria','north korea','corea del norte','north macedonia','macedonia del norte','macedonia','northern ireland','irlanda del norte','norway','noruega',
    'oman','pakistan','palestine','palestina','panama','papua new guinea','papua nueva guinea','paraguay','peru','philippines','filipinas','poland','polonia','portugal','puerto rico','qatar','catar',
    'romania','rumania','russia','rusia','rwanda','ruanda','saint kitts and nevis','saint lucia','santa lucia','saint vincent and the grenadines','samoa','san marino','saudi arabia','arabia saudi','arabia saudita','scotland','escocia','senegal','serbia','seychelles','sierra leone','sierra leona',
    'singapore','singapur','slovakia','eslovaquia','slovenia','eslovenia','solomon islands','islas salomon','somalia','south africa','sudafrica','south korea','korea republic','corea del sur','republica de corea','south sudan','sudan del sur','spain','espana','sri lanka','sudan','suriname','surinam','sweden','suecia','switzerland','suiza','syria','siria',
    'tahiti','tajikistan','tayikistan','tanzania','thailand','tailandia','timor leste','togo','tonga','trinidad and tobago','trinidad y tobago','tunisia','tunez','turkey','turquia','turkiye','turkmenistan',
    'uganda','ukraine','ucrania','united arab emirates','emiratos arabes unidos','uae','uruguay','usa','united states','estados unidos','eeuu','uzbekistan','vanuatu','venezuela','vietnam','wales','gales','yemen','zambia','zimbabwe','zimbabue',
    'cayman islands','islas caiman','anguilla','french guiana','guayana francesa','sint maarten','bonaire','turks and caicos islands','british virgin islands','us virgin islands',
  ]);
  // Competiciones de selecciones o mundiales (cualquier confederación)
  const INTERNACIONAL_RE = /\b(nations league|liga de naciones|world cup|copa del mundo|mundial|wc qualification|eliminatorias|euro|european championship|eurocopa|copa america|gold cup|copa oro|concacaf|conmebol|africa cup of nations|afcon|copa africa|asian cup|copa asia|arab cup|club world cup|intercontinental|international friendl\w*|amistosos internacionales|internacional)\b/;
  const AMISTOSO_RE = /\b(friendl\w*|amistos\w*|international match|partido internacional)\b/;
  const FEM_EXTRA_RE = /\bwta\b|\bw ?(15|25|35|40|50|60|75|80|100|125)\b|\bwnba\b/;
  const esSeleccion = (nombre) => SELECCIONES.has(norm(nombre).replace(/\b(national team|seleccion)\b/g, '').replace(/\s+/g, ' ').trim());

  // ¿Puede ir a H1? Nada femenino (ningún deporte) ni juvenil, y lo que ya ha pasado la clasificación de su deporte.
  function permitidoEnH1(a, comp) {
    const t = norm(a.torneo), ev = norm(a.evento);
    if (FEM_RE.test(t) || FEM_RE.test(ev) || FEM_EXTRA_RE.test(t) || /\((w|f|fem|women|mujeres)\)/i.test(a.evento)) return false;
    const futbol = a.torneo.includes('⚽') || comp.deporte === 'futbol';
    if (comp.copaNoPrimera) return false; // solo CONTROL
    if (!futbol || comp.zona || comp.copa) return true; // ya ha pasado los filtros de su clasificación
    if (/\bw\b/.test(ev) || JUVENIL_RE.test(t) || JUVENIL_RE.test(ev)) return false;
    const equipos = String(a.evento).split(/\s+vs\.?\s+|\s+-\s+/i);
    const selecciones = equipos.length === 2 && equipos.every(esSeleccion);
    if (AMISTOSO_RE.test(t)) return selecciones; // amistosos: solo entre selecciones, nunca de clubes
    if (MAPA_FUTBOL.has(limpiarRuido(t))) return true;
    if (INTERNACIONAL_RE.test(t)) return true;
    return false;
  }

  const ESPORTS_RE = /\b(esports?|e sports?|cyber|cybersport|2k\d*|ebasketball|e basketball|efootball|e football|esoccer|e soccer|ea fc|fifa \d{2}|fc \d{2}|gt league|lol|league of legends|lck|lec|lpl|lcs|cs ?2|cs go|csgo|counter strike|dota ?2?|valorant|vct|rocket league|starcraft|overwatch|rainbow six|r6|mobile legends|mlbb|king of glory|honor of kings|call of duty|cod|pubg|apex legends|fortnite|tekken|street fighter|warcraft|hearthstone|iem|esl|blast|pgl|bo[135])\b/;
  // Ligas de basket que se llaman casi igual que las de fútbol: si la fila no trae 🏀, que nunca se tomen por fútbol
  const BASKET_RE = /\b(basket|basketball|baloncesto|fiba|acb|liga endesa|eurocup|eurobasket|vtb|aba league|aba liga|adriatic league|lkl|nbl|kbl|cba|b league|bbl|lega basket|wnba|ncaab|bsl|basketligaen|bnxt)\b/;
  function detectarDeporte(torneoRaw, t) {
    if (torneoRaw.includes('🎮') || ESPORTS_RE.test(t)) return 'esports';
    for (const [e, d] of EMOJI_DEPORTE) if (torneoRaw.includes(e)) return d;
    if (/\b(atp|wta|itf|challenger|laver cup|davis cup|copa davis|united cup|six kings|roland garros|wimbledon)\b/.test(t)) return 'tenis';
    if (/\b(nba|euroleague|euroliga)\b/.test(t) || BASKET_RE.test(t)) return 'baloncesto';
    if (/\b(nhl|khl|shl|ahl|liiga|ice hockey|hockey)\b/.test(t)) return 'hockey';
    if (/\b(mlb|npb|kbo|baseball|beisbol)\b/.test(t)) return 'beisbol';
    if (/\b(nfl|ncaaf|american football|futbol americano)\b/.test(t)) return 'americano';
    if (/\b(handball|balonmano|ehf)\b/.test(t)) return 'balonmano';
    if (/\b(volleyball|voleibol|voley|cev)\b/.test(t)) return 'voleibol';
    if (/\b(pdc|darts|dardos)\b/.test(t)) return 'dardos';
    if (/\bufc\b/.test(t)) return 'combate';
    return null;
  }

  const NIVEL_ZONA = { 1: 'segura', 2: 'media', 3: 'roja' };
  const si = (nivel, comp, deporte) => ({ zona: NIVEL_ZONA[nivel], nivel, comp, deporte, motivo: comp });
  const no = (motivo, deporte) => ({ zona: null, nivel: null, comp: null, deporte, motivo });
  const contieneNombre = (ev, lista) => lista.some((n) => (' ' + ev + ' ').includes(' ' + norm(n) + ' '));
  // Equipos de Primera 2026/27 (para la Copa del Rey). Cada línea = un equipo con los nombres con los que puede salir en la web.
  // Cuando cambie la temporada: quita los 3 que bajan y añade los 3 que suben.
  const EQUIPOS_PRIMERA = [
    ['athletic club', 'athletic bilbao', 'athletic'], ['atletico madrid', 'atletico de madrid', 'atl madrid', 'atl. madrid'], ['osasuna', 'ca osasuna'],
    ['celta vigo', 'celta de vigo', 'rc celta', 'celta'], ['alaves', 'deportivo alaves'], ['elche', 'elche cf'], ['barcelona', 'fc barcelona'],
    ['getafe', 'getafe cf'], ['levante', 'levante ud'], ['malaga', 'malaga cf', 'malaga fc'], ['racing santander', 'racing de santander', 'real racing club'],
    ['rayo vallecano'], ['deportivo la coruna', 'deportivo de la coruna', 'rc deportivo', 'deportivo coruna', 'depor'], ['espanyol', 'rcd espanyol'],
    ['real betis', 'betis'], ['real madrid'], ['real sociedad'], ['sevilla', 'sevilla fc'], ['valencia', 'valencia cf'], ['villarreal', 'villarreal cf'],
  ];
  // filiales y equipos con nombre parecido que NO son de Primera
  const NO_PRIMERA_RE = /\b(b|c|ii|castilla|mestalla|fortuna|promesas|sanse|bilbao athletic|sevilla atletico|atletico malagueno|deportivo fabril|rayo cantabria|juvenil|u19|sub ?19)\b/;
  const esDePrimera = (equipo) => { const e = norm(equipo); return !NO_PRIMERA_RE.test(e) && EQUIPOS_PRIMERA.some((l) => contieneNombre(e, l)); };
  const juegaTop = (ev) => contieneNombre(ev.replace(/\binter miami\b/g, ' '), EQUIPOS_TOP);
  const seleccionTop = (ev) => contieneNombre(ev, SELECCIONES_TOP);
  const subir = (nivel, top) => (top && nivel > 1 ? nivel - 1 : nivel);
  const nombreLimpio = (torneoRaw) => String(torneoRaw).replace(/^[^\p{L}\p{N}]+/u, '').trim();

  function clasificarCompeticion(torneoRaw, eventoRaw, tiempo) {
    const t = norm(torneoRaw);
    const ev = norm(eventoRaw);
    const dep = detectarDeporte(torneoRaw, t);
    if (dep === 'esports') return no('eSports: no se envía a ningún canal', 'esports');
    if (/\bufc\b/.test(t)) return no('UFC: no se envía a ningún canal', 'combate');
    if (dep === 'tenis') return clasificarTenis(t, ev, eventoRaw, torneoRaw, tiempo);
    if (dep === 'futbol' || dep === null) {
      const r = clasificarFutbol(t, ev, eventoRaw, dep);
      if (r.zona || dep === 'futbol' || r.copa) return r;
    }
    if (FEM_RE.test(t) || FEM_RE.test(ev) || /\bwnba\b/.test(t)) return no('Femenino', dep);
    if (JUVENIL_RE.test(t)) return no('Juvenil', dep);
    if (dep === 'baloncesto') {
      const B = CONFIG.NBA || {};
      const nbaOk = B.activo && /\bnba\b/.test(t) && !/\b(g league|gleague|summer league|liga de verano|preseason|pretemporada|2k|cup qualifying)\b/.test(t);
      const euroOk = B.activo && B.euroliga && /\b(euroleague|euroliga)\b/.test(t) && !/\b(eurocup|qualifi\w*|clasificacion)\b/.test(t);
      if (nbaOk || euroOk) {
        const r = si(nbaOk ? 2 : 3, nbaOk ? 'NBA' : 'Euroliga', dep);
        r.soloPrincipales = true; // solo ganador, hándicap y totales del partido
        return r;
      }
      return no('Baloncesto fuera de la NBA y la Euroliga', dep);
    }
    return no('Deporte sin canal (solo fútbol, tenis, NBA y Euroliga)', dep);
  }

  function clasificarFutbol(t, ev, eventoRaw, dep) {
    const d = 'futbol';
    if (FEM_RE.test(t) || FEM_RE.test(ev) || /\bw\b/.test(ev) || /\((w|f|fem)\)/i.test(eventoRaw)) return no('Fútbol femenino', d);
    if (JUVENIL_RE.test(t) || JUVENIL_RE.test(ev)) return no('Fútbol juvenil / reservas', d);
    const sel = clasificarSelecciones(t, ev, eventoRaw);
    if (sel) return sel;
    const regla = MAPA_FUTBOL.get(limpiarRuido(t));
    if (!regla) return no('Liga menor', dep || d);
    if (!regla.nivel) return no('Liga no principal: ' + regla.comp, d);
    if (regla.comp === 'Copa del Rey' && CONFIG.COPA_DEL_REY_SOLO_PRIMERA) {
      const eq = String(eventoRaw).split(/\s+vs\.?\s+|\s+-\s+/i);
      const dePrimera = eq.length === 2 ? eq.filter(esDePrimera).length : 0;
      // con un solo equipo de Primera → F3 (nivel 3); sin ninguno → solo CONTROL
      if (dePrimera === 1) return si(3, 'Copa del Rey (un solo equipo de Primera)', d);
      if (dePrimera === 0) return Object.assign(no('Copa del Rey: ningún equipo de Primera', d), { copa: true, copaNoPrimera: true });
    }
    const top = !!regla.sube && juegaTop(ev);
    return si(subir(regla.nivel, top), regla.comp + (top ? ' · equipo top' : ''), d);
  }

  // Selecciones nacionales, competiciones mundiales y amistosos
  function clasificarSelecciones(t, ev, eventoRaw) {
    const d = 'futbol';
    const equipos = String(eventoRaw).split(/\s+vs\.?\s+|\s+-\s+/i);
    const sonSelecciones = equipos.length === 2 && equipos.every(esSeleccion);
    const top = seleccionTop(ev);
    const previa = /\b(qualification|qualifying|qualifiers|qualifier|clasificacion|clasificatoria|eliminatorias?|preliminary)\b/.test(t);
    const confedTop = /\b(uefa|europe|european|europa|conmebol|south america|sudamerica)\b/.test(t);
    if (/\b(club world cup|mundial de clubes|intercontinental)\b/.test(t)) return si(subir(2, juegaTop(ev)), 'Mundial de Clubes', d);
    if (/\b(nations league|liga de naciones)\b/.test(t)) {
      if (/\bconcacaf\b/.test(t)) return si(3, 'CONCACAF Nations League', d);
      return si(subir(2, top), 'UEFA Nations League' + (top ? ' · selección top' : ''), d);
    }
    if (/\b(world cup|copa del mundo|copa mundial|mundial)\b/.test(t)) {
      if (previa) return confedTop ? si(subir(2, top), 'Clasificación Mundial (UEFA/CONMEBOL)', d) : si(3, 'Clasificación Mundial (otras)', d);
      return si(1, 'Mundial', d);
    }
    if (/\b(euro|eurocopa|european championship|campeonato de europa)\b/.test(t)) {
      return previa ? si(subir(2, top), 'Clasificación Eurocopa', d) : si(1, 'Eurocopa', d);
    }
    if (/\bcopa america\b/.test(t)) return si(subir(2, top), 'Copa América', d);
    if (/\b(gold cup|copa oro|concacaf)\b/.test(t)) return sonSelecciones ? si(3, 'CONCACAF (selecciones)', d) : no('CONCACAF de clubes (MLS / Liga MX)', d);
    if (/\b(africa cup of nations|afcon|copa africa|copa africana|asian cup|copa asiatica|copa de asia|arab cup|copa arabe)\b/.test(t)) return si(3, 'Copa continental (África/Asia)', d);
    // Torneos regionales de selecciones (SAFF, AFF, Copa del Golfo, COSAFA…): poca liquidez → no salen (solo CONTROL)
    if (/\b(saff|aff|asean|mitsubishi electric|eaff|e 1 football|waff|cafa|cosafa|cecafa|wafu|ufoa|cfu|caribbean cup|ofc|pacific games|gulf cup|arabian gulf|copa del golfo|kings cup|king s cup|merdeka|sea games|south asian)\b/.test(t)) return no('Torneo regional de selecciones (poca liquidez)', d);
    if (!AMISTOSO_RE.test(t) && /\b(international|internacional)\b/.test(t) && sonSelecciones && /\b(championship|campeonato|cup|copa|tournament|torneo|trophy|trofeo|games|juegos)\b/.test(t)) return no('Torneo de selecciones menor (poca liquidez)', d);
    if (AMISTOSO_RE.test(t) || (/\b(international|internacional)\b/.test(t) && sonSelecciones)) {
      if (sonSelecciones) return top ? si(2, 'Amistoso de selecciones (con una top)', d) : no('Amistoso de selecciones sin ninguna top (poca liquidez)', d);
      if (juegaTop(ev)) return si(3, 'Amistoso de clubes (equipo top)', d);
      return no('Amistoso de clubes', d);
    }
    return null;
  }

  function clasificarTenis(t, ev, eventoRaw, torneoRaw, tiempo) {
    const d = 'tenis';
    const inicio = inicioPartido(tiempo);
    const f = partesMadrid(inicio);
    const top = contieneNombre(ev, TENISTAS_TOP);
    if (TENIS.FUERA.test(t)) return no('Tenis: junior / silla / leyendas / por equipos', d);
    if (TENIS.ITF.test(t)) return no('Tenis ITF', d);
    if (TENIS.MENOR.test(t) && !/\batp\b/.test(t)) return no('Tenis: circuito menor (UTR / Futures / universitario…), ahí no juega ningún top 20', d);
    // Exhibiciones con top 20 (Laver Cup, Six Kings Slam) → nivel 2; el resto de exhibiciones no
    if (TENIS.EXHIBICION_TOP.test(t) && !TENIS.FEM.test(t)) return si(2, 'Exhibición con top 20 (Laver Cup / Six Kings)', d);
    if (TENIS.EXHIBICION.test(t)) return no('Tenis exhibición', d);
    if (TENIS.DOBLES.test(t)) return no('Tenis dobles', d);
    // ¿Masculino o femenino? 1º lo que diga el torneo; 2º los jugadores; 3º la ciudad (si allí solo hay ATP)
    let genero = TENIS.FEM.test(t) ? 'F' : TENIS.MASC.test(t) ? 'M' : null;
    const marcaATP = /\batp\b/.test(t); // la web pone «ATP» → circuito ATP (los Challenger ya se han quitado arriba)
    // Sin «ATP» en el nombre, la ciudad solo cuenta si ese mes se juega allí un torneo ATP
    // v1.0.5 · …o si otra fila de la web ya ha dicho «ATP <esta ciudad>» estos días (sede aprendida)
    const esATPdeVerdad = marcaATP && !TENIS.CHALLENGER.test(t) && !TENIS.ITF.test(t) && !TENIS.FEM.test(t) && !TENIS.FUERA.test(t);
    if (esATPdeVerdad) aprenderSedeATP(t);
    const aprendida = !marcaATP && sedeAprendida(t);
    const fechaATP = marcaATP || TENIS.GRAND_SLAM.test(t) || TENIS.ATP_FINALS.test(t) || enCalendarioATP(t, f.mo) || aprendida;
    if (!genero) genero = generoTenis(eventoRaw || ev);
    if (!genero && TENIS.SOLO_ATP.test(t)) genero = 'M';
    if (!genero && TENIS.SOLO_ATP_OTONO.test(t) && f.mo >= 9) genero = 'M';
    // Grand Slam (también si la web pone la ciudad: París en tierra, Nueva York, Melbourne, Wimbledon)
    // (por fecha: París a finales de mayo/junio = Roland Garros; Londres de finales de junio a mediados de julio = Wimbledon)
    const slam = TENIS.GRAND_SLAM.test(t) || (/\bparis\b/.test(t) && /\b(clay|tierra)\b/.test(t) && f.mo >= 5 && f.mo <= 6) || (/\b(new york|nueva york|flushing|melbourne)\b/.test(t) && enCalendarioATP(t, f.mo)) ||
      (/\bparis\b/.test(t) && ((f.mo === 5 && f.d >= 18) || (f.mo === 6 && f.d <= 12))) || (/\b(london|londres)\b/.test(t) && ((f.mo === 6 && f.d >= 26) || (f.mo === 7 && f.d <= 16)));
    // Solo tenis masculino del circuito ATP (y torneos donde juegan top 20). Nada femenino, ni Challenger, ni ITF, ni previas.
    if (genero === 'F') return no('Tenis femenino', d);
    if (TENIS.DAVIS.test(t)) return top ? si(2, 'Copa Davis · tenista top', d) : no('Copa Davis sin tenista top', d);
    if (TENIS.CHALLENGER.test(t)) return no('Tenis Challenger (no hay top 20)', d);
    if (TENIS.PREVIA.test(t)) return no('Tenis previa / qualy (no hay top 20)', d);
    if (!genero) return no('Tenis: no se sabe si es masculino o femenino', d);
    // v1.0.5 · Ciudad de un torneo ATP conocido fuera de sus fechas guardadas, pero los DOS jugadores son tenistas ATP → se envía (con aviso)
    const ciudadATP = TENIS.MASTERS_1000.test(t) || TENIS.ATP_500.test(t) || TENIS.ATP_250.test(t) || TENIS.SOLO_ATP.test(t) || TENIS.SOLO_ATP_OTONO.test(t);
    const fueraFechas = !slam && !fechaATP && ciudadATP && ambosATP(eventoRaw || ev);
    if (!slam && !fechaATP && !fueraFechas) return no('Tenis: sin «ATP» en el nombre y ese mes no hay torneo ATP en esa ciudad (probable UTR / Challenger / ITF)', d);
    const grande = (r) => { if (fueraFechas && r.zona) r.motivo += ' · ojo: fuera de sus fechas habituales (revisa que es ATP)'; return r; };
    if (slam) return grande(si(1, 'Grand Slam', d));
    if (TENIS.ATP_FINALS.test(t)) return grande(si(1, 'ATP Finals', d));
    if (TENIS.MASTERS_1000.test(t) || /\b(atp masters|masters 1000)\b/.test(t)) return grande(si(subir(2, top), 'ATP Masters 1000' + (top ? ' · tenista top' : ''), d));
    if (TENIS.ATP_500.test(t)) return grande(si(subir(2, top), 'ATP 500' + (top ? ' · tenista top' : ''), d));
    if (marcaATP || TENIS.ATP_250.test(t)) {
      // ATP 250: va a T2, salvo que juegue un tenista top (entonces es un partido importante → T1)
      const r = si(subir(3, top), 'ATP 250' + (top ? ' · tenista top' : ''), d);
      r.t2 = !top;
      return grande(r);
    }
    // v1.0.5 · Ciudad nueva (no está en las listas) pero la web ya la ha llamado «ATP» en otra fila → ATP 250
    if (aprendida) {
      const r = si(subir(3, top), 'ATP 250 (sede vista como «ATP» en la web)' + (top ? ' · tenista top' : ''), d);
      r.t2 = !top;
      return r;
    }
    // Ciudad que no es de ningún torneo ATP conocido y sin "ATP" en el nombre → probablemente Challenger/ITF
    return no('Tenis: torneo menor (probable Challenger/ITF)', d);
  }

  /* ═══════════════════════ CLASIFICACIÓN DE MERCADOS ═══════════════════════ */

  const PALABRAS_NEUTRAS = new Set(('mas menos de over under si no empate o u y or and draw local visitante home away x ' +
    'ninguno ninguna none ambos cualquiera both either equipo team ganar gana sin con a la el los las del al en por ' +
    'handicap total goles puntos juegos sets set carreras exactamente exactly entre asiatico europeo linea').split(' '));

  // ¿La selección nombra a alguien que no es uno de los equipos/jugadores del evento? → probable apuesta de jugador
  function pareceJugador(seleccion, evento) {
    const delEvento = new Set(norm(evento).split(' '));
    const resto = norm(seleccion).split(' ').filter((w) => w.length >= 3 && !/\d/.test(w) && !PALABRAS_NEUTRAS.has(w) && !delEvento.has(w));
    return resto.length >= 2;
  }

  function tipoMercado(mercado, seleccion, evento) {
    const m = norm(mercado);
    if (!m) return 'prop';
    if (/\s(y|and|&|\+)\s/i.test(' ' + String(mercado).toLowerCase() + ' ')) return 'prop'; // combinadas
    if (PROP_RE.test(m)) return 'prop';
    const i = MERCADO_PRINCIPAL.findIndex((re) => re.test(m));
    if (i < 0) return 'prop'; // especial o desconocido → B
    if (i >= PRIMER_PATRON_LINEAS && pareceJugador(seleccion, evento)) return 'prop';
    return PERIODO_PARCIAL.test(m) ? 'parcial' : 'principal';
  }

  function clasificarMercados(a) {
    let prop = false, parcial = false;
    const tipos = a.patas.map((p) => tipoMercado(p.mercado, p.seleccion, a.evento));
    for (const t of tipos) { if (t === 'prop') prop = true; else if (t === 'parcial') parcial = true; }
    return { prop, parcial, tipos };
  }

  // Canal según deporte, nivel del partido y tipo de mercado (principal / secundario)
  function canalDe(comp, merc) {
    const parcialB = merc.parcial && String((CONFIG.PERIODO_PARCIAL || {})[comp.zona] || 'B').toUpperCase() === 'B';
    const sec = !!(merc.prop || parcialB);
    if (comp.deporte === 'futbol') return comp.nivel === 1 ? (sec ? 'F1S' : 'F1P') : comp.nivel === 2 ? (sec ? 'F2S' : 'F2P') : 'F3';
    if (comp.deporte === 'tenis') return comp.t2 || comp.nivel >= 3 ? 'T2' : (sec ? 'T1S' : 'T1P');
    if (comp.deporte === 'baloncesto') return (CONFIG.NBA && CONFIG.NBA.canal) || 'BK';
    return null;
  }

  /* ═══════════════════════ LECTURA DE LA TABLA ═══════════════════════ */

  let tablaCache = null;
  function encontrarTabla() {
    if (tablaCache && tablaCache.isConnected) return tablaCache;
    tablaCache = null;
    const tablas = [...document.querySelectorAll('table')];
    for (const t of tablas) if (t.querySelector('th[data-column-id="ev"]')) return (tablaCache = t);
    for (const t of tablas) {
      const cab = norm((t.querySelector('thead') || t).textContent.slice(0, 400));
      if (/\bev\b/.test(cab) && /\bcasas?\b/.test(cab)) return (tablaCache = t);
    }
    return null;
  }

  function mapearColumnas(tabla) {
    const idx = { roi: 0, evento: 1, apuesta: 2, casas: 3, tiempo: 4 };
    const ids = { ev: 'roi', event: 'evento', bet: 'apuesta', books: 'casas', startingIn: 'tiempo' };
    [...tabla.querySelectorAll('thead th')].forEach((th, i) => {
      const id = th.getAttribute('data-column-id');
      if (id && ids[id]) { idx[ids[id]] = i; return; }
      const x = norm(th.textContent);
      if (!x) return;
      if (/^ev\b|valor/.test(x)) idx.roi = i;
      else if (/evento|event|partido/.test(x)) idx.evento = i;
      else if (/^apuesta|^bet|seleccion|mercado/.test(x)) idx.apuesta = i;
      else if (/casas?|books|bookmaker/.test(x)) idx.casas = i;
      else if (/comienza|inicio|tiempo|hora|start|minuto|marcador/.test(x)) idx.tiempo = i;
    });
    return idx;
  }

  function hojas(el) {
    const out = [];
    if (!el) return out;
    el.querySelectorAll('*').forEach((n) => {
      if (n.children.length === 0 && n.tagName !== 'INPUT' && n.tagName !== 'svg') {
        const t = n.textContent.replace(/\s+/g, ' ').trim();
        if (t) out.push(t);
      }
    });
    return out;
  }

  function parsearPata(sep) {
    const pata = sep.parentElement;
    if (!pata) return null;
    let prev = sep.previousElementSibling;
    let stake = '';
    // El stake puede ser un <input> suelto o ir dentro de una cajita (con el símbolo €): se salta y se sigue hacia atrás
    while (prev && (prev.tagName === 'INPUT' || prev.querySelector('input'))) {
      const inp = prev.tagName === 'INPUT' ? prev : prev.querySelector('input');
      if (!stake) stake = String(inp.value || inp.getAttribute('value') || '').trim();
      prev = prev.previousElementSibling;
    }
    const h = hojas(prev).filter((x) => !/^\+ ?ev$/i.test(x));
    const mercado = h[0] || '';
    const seleccion = h.slice(1).join(' ');
    let cuotaTxt = '';
    for (let n = sep.nextElementSibling; n && !cuotaTxt; n = n.nextElementSibling) {
      const m = n.textContent.trim().match(/^(\d+(?:[.,]\d+)?)$/);
      if (m) cuotaTxt = m[1].replace(',', '.');
      else if (n.querySelector('img')) break;
    }
    const img = pata.querySelector('img[alt]');
    let casa = img ? img.getAttribute('alt').replace(/\s*logo\s*$/i, '').trim() : '';
    if (!casa && img) casa = (img.getAttribute('src') || '').split('/').pop().replace(/\.\w+$/, '');
    let extraCasas = 0;
    pata.querySelectorAll('span').forEach((s) => { const m = s.textContent.trim().match(/^\+(\d+)$/); if (m) extraCasas = +m[1]; });
    const cuota = parseFloat(cuotaTxt);
    if (!(cuota > 1) || !casa || !mercado) return null;
    const ev = [...pata.querySelectorAll('*')].some((n) => n.children.length === 0 && /^\+\s*ev\b/i.test(n.textContent.trim()))
      || /(^|\s)\+\s*EV(\s|$)/.test(pata.textContent);
    return { mercado, seleccion, cuota, cuotaTxt, casa, extraCasas, stake, ev };
  }

  function calcularRoi(patas) {
    const s = patas.reduce((acc, p) => acc + 1 / p.cuota, 0);
    return s > 0 ? (1 / s - 1) * 100 : NaN;
  }

  function claveDe(torneo, evento, patas) {
    // Partido + mercados + casas: cada combinación de casas es una apuesta +EV distinta (un mensaje cada una).
    // La cuota y el ROI NO forman parte de la clave: si solo cambia la cuota, no se reenvía.
    return [norm(torneo), norm(evento), ...patas.map((p) => [norm(p.mercado), norm(p.seleccion), norm(p.casa)].join('~')).sort()].join('|');
  }

  // Una fila de +EV = UNA apuesta: EV % · torneo + partido · mercado + selección · casa(s) + cuota · cuándo empieza.
  // Se guarda con la misma forma que una apuesta +EV de una sola pata, así sirven todas las reglas de canales.
  function parsearFila(tr, col) {
    const celdas = [...tr.children].filter((c) => c.tagName === 'TD' || c.getAttribute('role') === 'cell');
    if (celdas.length < 3) return null;
    const cEv = celdas[col.evento], cAp = celdas[col.apuesta], cCa = celdas[col.casas], cRoi = celdas[col.roi];
    if (!cEv || !cAp || !cCa) return { error: 'columnas' };
    const hEv = hojas(cEv);
    const iVs = hEv.findIndex((h) => /\svs\.?\s/i.test(h));
    const evento = iVs >= 0 ? hEv[iVs] : hEv[1] || '';
    const torneo = iVs > 0 ? hEv[iVs - 1] : hEv[0] || '';
    const hAp = hojas(cAp);
    const mercado = hAp[0] || '';
    const seleccion = hAp.slice(1).join(' ');
    const casas = [...cCa.querySelectorAll('img[alt]')].map((i) => i.getAttribute('alt').replace(/\s*logo\s*$/i, '').trim()).filter(Boolean);
    if (!casas.length) { const img = cCa.querySelector('img[src]'); if (img) casas.push((img.getAttribute('src') || '').split('/').pop().replace(/\.\w+$/, '')); }
    const hCa = hojas(cCa);
    const cuotaTxt = (hCa.find((h) => /^\d+(?:[.,]\d+)?$/.test(h) && parseFloat(h.replace(',', '.')) > 1) || '').replace(',', '.');
    let extraCasas = 0;
    hCa.forEach((h) => { const m = h.match(/^\+(\d+)$/); if (m) extraCasas = +m[1]; });
    const cuota = parseFloat(cuotaTxt);
    if (!torneo || !evento || !mercado || !(cuota > 1) || !casas.length) return { error: `estructura: torneo=${!!torneo} evento=${!!evento} mercado=${!!mercado} cuota=${cuotaTxt || '-'} casas=${casas.length}` };
    const mRoi = (cRoi ? cRoi.textContent : '').replace(',', '.').match(/(-?\d+(?:\.\d+)?)\s*%/);
    const roi = mRoi ? parseFloat(mRoi[1]) : NaN;
    if (!isFinite(roi)) return { error: 'EV' };
    const tiempo = celdas[col.tiempo] ? celdas[col.tiempo].textContent.replace(/\s+/g, ' ').trim() : '';
    const pata = { mercado, seleccion, cuota, cuotaTxt, casa: casas[0], casas, extraCasas, restoCasas: extraCasas, stake: '', ev: true };
    const patas = [pata];
    return { ev: true, roi, roiTexto: mRoi[1] + '%', torneo, evento, extraEvento: hEv.filter((h, i) => i !== iVs && i !== iVs - 1).join(' · '), patas, ganancia: '', tiempo, clave: claveDe(torneo, evento, patas) };
  }

  // Plan B: sin fiarse de columnas ni del "@". Busca la celda del ROI (xx%), la del evento (la que tiene " vs ")
  // y cada apuesta a partir del logo de la casa y la cuota que tiene al lado.
  function parsearFilaAuto(tr) {
    const celdas = [...tr.querySelectorAll(':scope > td, :scope > [role="cell"], :scope > div')];
    if (celdas.length < 2) return { error: 'auto: pocas celdas' };
    const cRoi = celdas.find((c) => /^\s*-?\d+(?:[.,]\d+)?\s*%\s*$/.test(c.textContent));
    const cAp = celdas.slice().sort((x, y) => y.querySelectorAll('img[alt]').length - x.querySelectorAll('img[alt]').length)[0];
    const cEv = celdas.find((c) => c !== cAp && hojas(c).some((h) => /\svs\.?\s|\s-\s/i.test(h)));
    if (!cAp || !cEv) return { error: 'auto: no encuentro evento/apuestas' };
    const hEv = hojas(cEv);
    const iEv = hEv.findIndex((h) => /\svs\.?\s/i.test(h));
    const evento = iEv >= 0 ? hEv[iEv] : hEv[1] || '';
    const torneo = iEv > 0 ? hEv[iEv - 1] : hEv[0] || '';
    const contenedores = [];
    for (const img of cAp.querySelectorAll('img[alt]')) {
      let n = img.parentElement;
      while (n && n !== cAp) {
        const hs = hojas(n);
        if (hs.some((h) => /^\d+(?:[.,]\d+)?$/.test(h) && parseFloat(h.replace(',', '.')) > 1) && hs.filter((h) => /[a-záéíóúñ]/i.test(h)).length >= 1) break;
        n = n.parentElement;
      }
      if (n && n !== cAp && !contenedores.some((c) => c === n || c.contains(n) || n.contains(c))) contenedores.push(n);
    }
    const patas = contenedores.map((c) => {
      const hs = hojas(c).filter((h) => h !== '@' && !/^\+ ?ev$/i.test(h) && !/^\+\d+$/.test(h));
      const nums = hs.filter((h) => /^\d+(?:[.,]\d+)?$/.test(h));
      const textos = hs.filter((h) => !/^\d+(?:[.,]\d+)?$/.test(h));
      const stakeInp = c.querySelector('input');
      const cuotaTxt = (nums.find((h) => !stakeInp || h !== stakeInp.value) || '').replace(',', '.');
      const img = c.querySelector('img[alt]');
      let extraCasas = 0;
      hojas(c).forEach((h) => { const m = h.match(/^\+(\d+)$/); if (m) extraCasas = +m[1]; });
      const ev = hojas(c).some((h) => /^\+\s*ev$/i.test(h));
      return { ev, mercado: textos[0] || '', seleccion: textos.slice(1).join(' '), cuota: parseFloat(cuotaTxt), cuotaTxt, casa: img ? img.getAttribute('alt').replace(/\s*logo\s*$/i, '').trim() : '', extraCasas, stake: stakeInp ? String(stakeInp.value || '') : '' };
    }).filter((p) => p.cuota > 1 && p.casa && p.mercado);
    if (!torneo || !evento || patas.length < 2) return { error: `auto: torneo=${!!torneo} evento=${!!evento} apuestas=${patas.length}` };
    const mRoi = cRoi ? cRoi.textContent.replace(',', '.').match(/(-?\d+(?:\.\d+)?)\s*%/) : null;
    let roi = mRoi ? parseFloat(mRoi[1]) : Math.round(calcularRoi(patas) * 100) / 100;
    if (!isFinite(roi)) return { error: 'auto: roi' };
    return { roi, roiTexto: mRoi ? mRoi[1] + '%' : roi.toFixed(2) + '%', torneo, evento, extraEvento: '', patas, ganancia: '', tiempo: '', clave: claveDe(torneo, evento, patas) };
  }

  function parsearFilaNormal(tr, col) {
    const celdas = [...tr.children].filter((c) => c.tagName === 'TD');
    if (celdas.length < 3) return null;
    const cRoi = celdas[col.roi], cEv = celdas[col.evento], cAp = celdas[col.apuestas];
    if (!cEv || !cAp) return { error: 'columnas' };
    const hEv = hojas(cEv);
    const torneo = hEv[0] || '';
    const evento = hEv[1] || '';
    const seps = [...cAp.querySelectorAll('span, div')].filter((n) => n.children.length === 0 && n.textContent.trim() === '@');
    const patas = seps.map(parsearPata).filter(Boolean);
    if (!torneo || !evento || patas.length < 2 || patas.length !== seps.length) return { error: `estructura: torneo=${!!torneo} evento=${!!evento} '@'=${seps.length} apuestas leídas=${patas.length}` };
    const txtRoi = cRoi ? cRoi.textContent.replace(',', '.') : '';
    const mRoi = txtRoi.match(/(-?\d+(?:\.\d+)?)\s*%/);
    let roi = mRoi ? parseFloat(mRoi[1]) : NaN;
    if (!isFinite(roi)) roi = Math.round(calcularRoi(patas) * 100) / 100;
    if (!isFinite(roi)) return { error: 'roi' };
    const roiTexto = mRoi ? mRoi[1] + '%' : roi.toFixed(2) + '%';
    const ganancia = celdas[col.ganancia] && col.ganancia !== col.apuestas ? celdas[col.ganancia].textContent.replace(/\s+/g, ' ').trim() : '';
    const tiempo = celdas[col.tiempo] && col.tiempo !== col.apuestas ? celdas[col.tiempo].textContent.replace(/\s+/g, ' ').trim() : '';
    return { roi, roiTexto, torneo, evento, extraEvento: hEv.slice(2).join(' · '), patas, ganancia, tiempo, clave: claveDe(torneo, evento, patas) };
  }

  function leerTabla() {
    const tabla = encontrarTabla();
    if (!tabla) return null;
    const col = mapearColumnas(tabla);
    const filas = tabla.tBodies && tabla.tBodies.length ? [...tabla.tBodies].flatMap((b) => [...b.rows]) : [...tabla.querySelectorAll('tbody tr')];
    const apuestas = [];
    const fallidas = [];
    let errores = 0;
    for (const tr of filas) {
      let a = null;
      try { a = parsearFila(tr, col); } catch (e) { a = { error: e.message }; }
      if (!a) continue;
      if (a.error) {
        errores++;
        if (!estado.filaFallida || ahora() - estado.filaFallida.t > 60000) estado.filaFallida = { t: ahora(), motivo: a.error, html: tr.outerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>').slice(0, 12000) };
        fallidas.push({ motivo: a.error, texto: tr.textContent.replace(/\s+/g, ' ').trim().slice(0, 600) });
        dbg('Fila no leída:', a.error, tr.textContent.slice(0, 120));
        continue;
      }
      apuestas.push(a);
    }
    return { tabla, apuestas, errores, fallidas, filas: filas.length };
  }

  // La tabla solo enseña 1 casa por apuesta (+N). La lista para móvil (oculta) enseña alguna más: se juntan.
  function completarCasas(apuestas) {
    try {
      const mapa = new Map();
      document.querySelectorAll('ul[role="list"] > li').forEach((li) => {
        const t = li.textContent;
        const mRoi = t.replace(',', '.').match(/(\d+(?:\.\d+)?)\s*%/);
        const ev = li.querySelector('p');
        if (!mRoi || !ev) return;
        const cuotas = [...li.querySelectorAll('span')].filter((sp) => sp.children.length === 0 && /^\d+(?:[.,]\d+)?$/.test(sp.textContent.trim()) && sp.parentElement && sp.parentElement.querySelector('img'));
        const patas = cuotas.map((sp) => ({ cuota: parseFloat(sp.textContent.trim().replace(',', '.')), casas: [...sp.parentElement.querySelectorAll('img[alt]')].map((i) => i.getAttribute('alt').replace(/\s*logo\s*$/i, '').trim()).filter(Boolean) }));
        mapa.set(norm(ev.textContent) + '|' + mRoi[1], patas);
      });
      for (const a of apuestas) {
        const extra = mapa.get(norm(a.evento) + '|' + a.roiTexto.replace('%', ''));
        a.patas.forEach((p, i) => {
          p.casas = [p.casa];
          const m = extra && extra[i];
          if (m && Math.abs(m.cuota - p.cuota) < 1e-9) for (const c of m.casas) if (!p.casas.includes(c)) p.casas.push(c);
          p.restoCasas = Math.max(0, (p.extraCasas || 0) - (p.casas.length - 1));
        });
      }
    } catch (e) { dbg('completarCasas', e); }
  }

  // ── Qué se ha decidido con cada apuesta +EV (para el diagnóstico y el comando «porque») ──
  const decisiones = new Map(); // clave → { evento, torneo, roi, texto, t }
  const vistasHasta = new Map(); // clave → última vez que se vio en la tabla
  const TEXTO_ACCION = {
    encolada: (r) => `⏳ en cola para ${rotulo(r.canal)}`,
    en_cola: (r) => `⏳ en cola para ${rotulo(r.canal)}`,
    descartada: (r) => `🚫 no se envía: ${r.motivo || 'competición sin nivel'}`,
    fuera_4A: (r) => `🚫 no se envía: ${r.motivo || 'femenino / juvenil / liga menor'}`,
    roi_bajo: (r) => `🚫 EV por debajo del mínimo de ${rotulo(r.canal) || '?'} (${r.min != null ? r.min : ((CONFIG.CANALES[r.canal] || {}).roiMin ?? 1)}%)${r.motivo ? ' · ' + r.motivo : ''}`,
    roi_alto: () => `⚠️ EV muy alto (posible error de cuota) → ${rotulo(CONFIG.ROI_MAX_CANAL || 'H1')}`,
    ya_enviada: (r) => `☑️ ya enviada antes a ${rotulo(r.canal)} con las mismas casas`,
    espera_reenvio: (r) => `⏸ ya enviada a ${rotulo(r.canal)} hace poco`,
    ya_en_1_3: () => `☑️ ya salió por otro canal`,
    sin_destino: (r) => `❌ el canal ${rotulo(r.canal)} no está conectado`,
    chat_bloqueado: (r) => `❌ el canal ${rotulo(r.canal)} dio error; se reintenta en unos minutos`,
    token_malo: (r) => `❌ el token del canal ${rotulo(r.canal)} es incorrecto`,
  };
  function anotarDecision(a, r, textoForzado) {
    const f = TEXTO_ACCION[r && r.accion];
    const texto = textoForzado || (f ? f(r) : (r && r.accion) || '?');
    const nivel = r && r.comp && r.comp.comp ? ` [${r.comp.comp}]` : '';
    decisiones.set(a.clave, { evento: a.evento, torneo: a.torneo, roi: a.roiTexto, texto: texto + nivel, t: ahora() });
    if (decisiones.size > 600) decisiones.delete(decisiones.keys().next().value);
  }
  function anotarPorClave(clave, texto) {
    const d = decisiones.get(clave);
    if (d) { d.texto = texto; d.t = ahora(); }
  }
  const horaCorta = (t) => new Date(t).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
  function textoDecisiones(filtro, max) {
    const f = norm(filtro || '');
    const lista = [...decisiones.values()].filter((d) => !f || norm(d.evento + ' ' + d.torneo).includes(f)).sort((x, y) => y.t - x.t).slice(0, max || 40);
    if (!lista.length) return f ? `No he visto ninguna apuesta +EV que contenga «${filtro}» desde la última recarga (${horaCorta(estado.inicio)}). Puede que no haya llegado a cargarse en la tabla.` : 'Todavía no he leído ninguna apuesta +EV.';
    return lista.map((d) => `• ${d.evento} · ${d.roi}\n   ${d.torneo}\n   → ${d.texto} (${horaCorta(d.t)})`).join('\n');
  }

  // ── Canal CONTROL ──
  let enviadosControl = {};
  const pendientesControl = new Set();
  const claveControl = () => `control_v1_${CONFIG.MODO}_${estado.modo || 'general'}`;
  const NO_VA_A_CONTROL = new Set(['encolada', 'en_cola', 'ya_enviada', 'espera_reenvio', 'ya_en_1_3']);
  function encolarControl(clave, texto, base) {
    if (!CONFIG.CONTROL || !CONFIG.CONTROL.activo || CONFIG.MODO === 'simulacion') return;
    if (enviadosControl[clave] || pendientesControl.has(clave)) return;
    const chatId = chatDe('CONTROL'), token = tokenDe('CONTROL');
    if (!chatId || !tokenValido(token) || tokensMalos.has(token) || (chatBloqueadoHasta.get(chatId) || 0) > ahora()) return;
    pendientesControl.add(clave);
    cola.push({ tipo: 'control', canal: 'CONTROL', clave, base, token, chatId, texto, intentos: 0, html: true });
    // si se acumulan demasiados, se quitan los más viejos (los canales normales siempre van primero)
    const enCola = cola.filter((x) => x.tipo === 'control');
    if (enCola.length > 300) { const viejo = enCola[0]; cola.splice(cola.indexOf(viejo), 1); pendientesControl.delete(viejo.clave); }
  }
  function controlApuesta(a, motivo, canalEnviada) {
    if (a.roi < (CONFIG.CONTROL.roiMin || 0)) return; // poco ROI: no merece la pena verla en el CONTROL
    let cuerpo;
    try { cuerpo = construirMensaje(a, { zona: 'otras' }, { prop: false, parcial: false }, 'CONTROL', null); } catch (e) { cuerpo = esc(a.evento + ' · ' + a.roiTexto + '\n' + a.torneo); }
    const cabecera = canalEnviada ? `📤 <b>ENVIADA → ${esc(rotulo(canalEnviada))}</b>${motivo ? ' · ' + esc(motivo) : ''}` : `🔍 <b>NO ENVIADA</b> · ${esc(motivo)}`;
    encolarControl(canalEnviada ? a.clave + '>' + canalEnviada : a.clave, cabecera + '\n\n' + cuerpo, a.clave);
  }
  function controlFilaIlegible(f) {
    let h = 0;
    for (let i = 0; i < f.texto.length; i++) h = (h * 31 + f.texto.charCodeAt(i)) | 0;
    encolarControl('fila_' + h, `⚠️ <b>FILA QUE NO HE PODIDO LEER</b>\nMotivo: ${esc(f.motivo)}\n\n<code>${esc(f.texto)}</code>`);
  }
  function podarControl() {
    const limite = ahora() - CONFIG.DIAS_MEMORIA * 86400000;
    for (const k of Object.keys(enviadosControl)) if (enviadosControl[k] < limite) delete enviadosControl[k];
  }

  function clavesVisibles() {
    const r = leerTabla();
    return r ? new Set(r.apuestas.map((a) => a.clave)) : null;
  }

  /* ═══════════════════════ MODO (Prepartido / En Vivo) ═══════════════════════ */

  function botonesModo() {
    const bs = [...document.querySelectorAll('button')];
    const pre = bs.filter((b) => /^prepartido$/i.test(b.textContent.trim()));
    const viv = bs.filter((b) => /^en vivo/i.test(b.textContent.trim()));
    return { pre, viv };
  }
  const botonActivo = (b) => /\bbg-gray-7\d\d\b|\btext-white\b/.test(b.className) && !/\btext-gray-4\d\d\b/.test(b.className);
  function detectarModo() {
    const { pre, viv } = botonesModo();
    if (viv.some(botonActivo)) return 'envivo';
    if (pre.some(botonActivo)) return 'prepartido';
    return null;
  }
  function pulsarModo(modo) {
    const { pre, viv } = botonesModo();
    const b = (modo === 'envivo' ? viv : pre)[0];
    if (b) { b.click(); return true; }
    return false;
  }
  const textoModo = (m) => (m === 'envivo' ? 'En Vivo' : m === 'prepartido' ? 'Prepartido' : 'General');

  /* ═══════════════════════ ESTADO ═══════════════════════ */

  const TAB_ID = Math.random().toString(36).slice(2, 10);
  const estado = {
    inicio: ahora(),
    modo: null,
    lider: false,
    liderEscrito: false,
    pausado: ss.get('sb_pausa') === '1',
    filas: 0, leidas: 0, erroresLectura: 0,
    ultimaLectura: 0, ultimaMutacionTabla: 0, ultimaTablaVista: 0, tablaVistaAlgunaVez: false,
    escaneoPendiente: 0,
    malConexionDesde: 0,
    recargaPedida: 0,
    errorFatal: '',
    ultimoAviso: '', ultimoAvisoHora: 0,
    avisosConfig: new Set(),
    descartadasDesaparecidas: 0,
    pruebas: {},
    iniciado: false,
  };
  let enviados = {};
  let mensajes = {};            // clave → [{ c: chat, m: id del mensaje, b: id del bot, ts, canal }] para poder borrarlos
  let mensajesControl = {};     // clave → [{ c, m, b, ts }] su mensaje en el CONTROL (1 por apuesta +EV, con su último estado)
  let enviadosSucios = false;
  let stats = { fecha: '', c: {} };
  let catalogo = store.get('catalogo_v1', { t: {}, m: {} });
  let catalogoSucio = false;
  const vistasSesion = new Set();
  const pendientes = new Set();
  const cola = [];
  const proximoPorChat = new Map();
  const chatBloqueadoHasta = new Map();
  let proximoGlobal = 0;
  let enVuelo = false;

  const hoy = () => new Date().toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });
  // Se guarda aparte por modo de envío (simulación / prueba / real) y por pestaña (Prepartido / En Vivo)
  const claveEnviados = () => `enviados_v1_${CONFIG.MODO}_${estado.modo || 'general'}`;
  const claveStats = () => `stats_v1_${CONFIG.MODO}_${estado.modo || 'general'}`;
  const claveMensajes = () => `mensajes_v1_${CONFIG.MODO}_${estado.modo || 'general'}`;
  const claveMensajesControl = () => `mensajes_control_v1_${CONFIG.MODO}_${estado.modo || 'general'}`;

  function cargarEstadoModo() {
    enviadosControl = store.get(claveControl(), {});
    podarControl();
    enviados = store.get(claveEnviados(), {});
    for (const e of Object.values(enviados)) if (e && CANAL_VIEJO[e.canal]) e.canal = CANAL_VIEJO[e.canal];
    podarEnviados();
    mensajes = store.get(claveMensajes(), {});
    for (const l of Object.values(mensajes)) for (const x of l || []) { delete x.borrando; if (CANAL_VIEJO[x.canal]) x.canal = CANAL_VIEJO[x.canal]; } // la cola se pierde al recargar
    mensajesControl = store.get(claveMensajesControl(), {});
    for (const l of Object.values(mensajesControl)) for (const x of l || []) delete x.borrando;
    podarMensajes();
    stats = store.get(claveStats(), { fecha: hoy(), c: {} });
    if (stats.fecha !== hoy()) stats = { fecha: hoy(), c: {} };
    purgarDeporteEquivocado();
  }
  // Mensajes que están en un canal de otro deporte (los dejó el reparto viejo: tenis en F1/F2, NBA en F3…): se borran
  // al arrancar, y si la apuesta +EV sigue en la web se vuelve a mandar a su canal bueno.
  function purgarDeporteEquivocado() {
    if (CONFIG.MODO === 'simulacion') return 0;
    let n = 0;
    const t = ahora();
    for (const [clave, lista] of Object.entries(mensajes)) {
      for (const x of lista || []) {
        const ok = DEPORTE_CANAL[x.canal];
        if (!ok || x.borrando) continue;
        const dep = x.dep || detectarDeporte('', String(clave).split('|')[0]);
        if (!dep || ok.includes(dep)) continue;
        const tk = tokenDeBot(x.b);
        if (!tk) continue;
        x.borrando = true;
        cola.push({ tipo: 'borrar', clave, canal: x.canal, token: tk, chatId: x.c, mid: x.m, creado: t, intentos: 0, noAntes: 0, forzar: true, olvidar: true, desc: `${String(clave).split('|')[1] || clave} (${NOMBRE_DEPORTE[dep] || dep} en ${rotulo(x.canal)})` });
        n++;
      }
    }
    if (n) log(`🧹 ${n} mensajes en un canal que no es de su deporte: se borran`);
    return n;
  }
  function podarEnviados() {
    const limite = ahora() - CONFIG.DIAS_MEMORIA * 86400000;
    let claves = Object.keys(enviados);
    for (const k of claves) if (!enviados[k] || enviados[k].ts < limite) { delete enviados[k]; enviadosSucios = true; }
    claves = Object.keys(enviados);
    if (claves.length > 5000) {
      claves.sort((x, y) => enviados[x].ts - enviados[y].ts).slice(0, claves.length - 5000).forEach((k) => delete enviados[k]);
      enviadosSucios = true;
    }
  }
  // Telegram no deja a los bots borrar mensajes de hace más de 48 h → esos ya no se vigilan
  function podarMensajes() {
    const limite = ahora() - 47 * 3600000;
    for (const M of [mensajes, mensajesControl]) for (const k of Object.keys(M)) {
      const l = (M[k] || []).filter((x) => x && x.ts > limite);
      if (l.length) M[k] = l; else delete M[k];
    }
  }
  function guardar(forzar) {
    if (estado.lider && (enviadosSucios || forzar)) { store.set(claveEnviados(), enviados); store.set(claveStats(), stats); store.set(claveControl(), enviadosControl); store.set(claveMensajes(), mensajes); store.set(claveMensajesControl(), mensajesControl); enviadosSucios = false; }
    if (catalogoSucio || forzar) { mezclarCatalogo(); podarCatalogo(); store.set('catalogo_v1', catalogo); catalogoSucio = false; }
  }

  /* ═══════════════════════ PESTAÑA LÍDER (una por modo) ═══════════════════════ */

  function latido() {
    const modo = estado.modo || 'general';
    const k = 'lider_v1_' + modo;
    const l = store.get(k, null);
    const t = ahora();
    const libre = !l || l.id === TAB_ID || t - l.ts > 20000;
    if (libre) {
      store.set(k, { id: TAB_ID, ts: t });
      if (estado.liderEscrito && l && l.id === TAB_ID) {
        if (!estado.lider) {
          estado.lider = true;
          cargarEstadoModo();
          estado.escaneoPendiente = ahora() - 1000; // leer la tabla ya
          log('Esta pestaña es la que envía (' + textoModo(estado.modo) + ').');
        }
      }
      estado.liderEscrito = true;
    } else {
      if (estado.lider) log('Otra pestaña ha tomado el control de ' + textoModo(modo) + '. Esta queda en pausa.');
      estado.lider = false;
      estado.liderEscrito = false;
    }
  }
  function soltarLiderazgo() {
    try {
      const k = 'lider_v1_' + (estado.modo || 'general');
      const l = store.get(k, null);
      if (l && l.id === TAB_ID) store.set(k, { id: TAB_ID, ts: 0 });
    } catch (e) { /* nada */ }
  }

  /* ═══════════════════════ CATÁLOGO (para revisar nombres) ═══════════════════════ */

  function registrarCatalogo(a, comp, merc) {
    if (vistasSesion.has(a.clave)) return;
    vistasSesion.add(a.clave);
    const t = ahora();
    const e = catalogo.t[a.torneo] || (catalogo.t[a.torneo] = { n: 0 });
    e.n++; e.z = comp.zona || '-'; e.c = comp.zona ? comp.comp : comp.motivo; e.u = t;
    a.patas.forEach((p, i) => {
      const km = p.mercado;
      const m = catalogo.m[km] || (catalogo.m[km] = { n: 0 });
      m.n++; m.tipo = merc.tipos[i]; m.u = t;
    });
    catalogoSucio = true;
  }
  // Junta lo que haya guardado otra pestaña con lo de esta
  function mezclarCatalogo() {
    const g = store.get('catalogo_v1', { t: {}, m: {} });
    for (const sec of ['t', 'm']) {
      catalogo[sec] = catalogo[sec] || {};
      for (const [k, v] of Object.entries(g[sec] || {})) {
        const mio = catalogo[sec][k];
        if (!mio) catalogo[sec][k] = v;
        else { mio.n = Math.max(mio.n || 0, v.n || 0); if ((v.u || 0) > (mio.u || 0)) { const n = mio.n; Object.assign(mio, v); mio.n = n; } }
      }
    }
  }
  function podarCatalogo() {
    for (const sec of ['t', 'm']) {
      const ks = Object.keys(catalogo[sec] || {});
      if (ks.length > 1500) ks.sort((x, y) => catalogo[sec][x].u - catalogo[sec][y].u).slice(0, ks.length - 1500).forEach((k) => delete catalogo[sec][k]);
    }
  }
  function textoCatalogo() {
    const L = [];
    L.push('CATÁLOGO +EV→Telegram v' + VERSION + ' — ' + new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }));
    L.push('');
    L.push('══ COMPETICIONES (nombre exacto en la web → clasificación) ══');
    const orden = { segura: 0, media: 1, roja: 2, '-': 3 };
    const nom = { segura: 'ZONA SEGURA', media: 'ZONA MEDIA', roja: 'ZONA ROJA', '-': 'DESCARTADA' };
    Object.entries(catalogo.t).sort((x, y) => ((orden[x[1].z] ?? 3) - (orden[y[1].z] ?? 3)) || (y[1].n - x[1].n)).forEach(([k, v]) => {
      L.push(`[${nom[v.z] || v.z}] ${k}  →  ${v.c}  (×${v.n})`);
    });
    L.push('');
    L.push('══ MERCADOS (nombre exacto en la web → tipo) ══');
    const tn = { principal: 'A principal', parcial: 'periodo parcial', prop: 'B props/especial' };
    Object.entries(catalogo.m).sort((x, y) => String(x[1].tipo).localeCompare(String(y[1].tipo)) || (y[1].n - x[1].n)).forEach(([k, v]) => {
      L.push(`[${tn[v.tipo] || v.tipo}] ${k}  (×${v.n})`);
    });
    return L.join('\n');
  }

  /* ═══════════════════════ MENSAJE ═══════════════════════ */

  function fmtCuota(txt) {
    const s = String(txt);
    if (!s.includes('.')) return s + '.00';
    const dec = s.split('.')[1];
    return dec.length === 1 ? s + '0' : s;
  }
  const fmtRoi = (r) => (Math.round(r * 100) / 100).toString() + '%';
  const fechaHora = () => new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });

  function etiquetaMercado(merc, letra) {
    if (merc.prop) return '🎯 Estadísticas / Props';
    if (merc.parcial) return letra === 'A' ? '📊 Mercado principal · ⏱️ Periodo parcial' : '⏱️ Periodo parcial';
    return '📊 Mercado principal';
  }

  const restoDe = (p) => (p.restoCasas != null ? p.restoCasas : p.extraCasas || 0);
  // Cuota justa (sin margen) que sale del EV: cuota / (1 + EV). Por debajo de ella la apuesta ya no tiene valor.
  function cuotaJusta(a) {
    const p = a.patas[0];
    return p && p.cuota > 1 && a.roi > -99 ? p.cuota / (1 + a.roi / 100) : NaN;
  }
  function construirMensaje(a, comp, merc, canal, prev, nota) {
    const L = [];
    const p = a.patas[0];
    // Primera línea = lo que se ve en la notificación: que es +EV, el partido y el valor
    L.push(`💎 <b>+EV</b> · ⚔️ <b>${esc(a.evento)}</b> · 📈 <b>EV ${esc(a.roiTexto)}</b>`);
    if (prev) L.push(`🔄 <i>EV actualizado: ${fmtRoi(prev.roi)} → ${fmtRoi(a.roi)}</i>`);
    L.push(`🏆 ${esc(a.torneo)}`);
    if ((canal === 'H1' || canal === 'ROI') && nota) L.push(`📌 <i>${esc(nota)}</i>`); // por qué está en H1 / ROI bajo
    if (a.modo === 'envivo') L.push(`🔥 <b>EN VIVO</b>${a.tiempo ? ' · ' + esc(a.tiempo) : ''}`);
    else if (a.tiempo) L.push(`⏳ <b>Empieza en:</b> ${esc(a.tiempo)}`);
    L.push('');
    L.push(`🎯 <b>${esc(p.mercado)}${p.seleccion ? ' - ' + esc(p.seleccion) : ''}</b>`);
    L.push(`📈 Cuota: <code>${esc(fmtCuota(p.cuotaTxt))}</code> en 🏦 <b>${(p.casas || [p.casa]).map(esc).join(', ')}</b>${restoDe(p) ? ` <i>(+${restoDe(p)} ${restoDe(p) === 1 ? 'casa' : 'casas'} más)</i>` : ''}`);
    const cj = cuotaJusta(a);
    if (isFinite(cj) && cj > 1) L.push(`⚖️ Cuota justa: <code>${cj.toFixed(2)}</code> · si la cuota baja de ahí, ya no tiene valor`);
    L.push('━━━━━━━━━━━━━━━━━━');
    L.push('💎 <i>Apuesta de valor: es UNA sola apuesta, no una surebet (se puede perder).</i>');
    L.push(`🕒 <b>Hora:</b> ${esc(fechaHora())}`);
    return L.join('\n');
  }

  /* ═══════════════════════ DECISIÓN ═══════════════════════ */

  function destinoDe(canal) {
    if (CONFIG.MODO === 'simulacion') return { token: '', chatId: 'SIMULACION' };
    const d = CONFIG.MODO === 'prueba' ? 'PRUEBA' : canal;
    const token = tokenDe(d);
    const chatId = chatDe(d);
    return tokenValido(token) && chatId ? { token, chatId } : null;
  }

  function avisoConfig(clave, texto) {
    if (estado.avisosConfig.has(clave)) return;
    estado.avisosConfig.add(clave);
    aviso(texto);
  }

  // ¿Se envió, pero su mensaje ya no está en el chat (borrado al desaparecer de la web)?
  function noEstaEnChat(clave) {
    const prev = enviados[clave];
    if (!prev || !CONFIG.REENVIAR_SI_VUELVE) return false;
    if (prev.manual) return false; // la borraste tú con /borrarentradas → no se vuelve a enviar
    return !!prev.borrada || (!!prev.seg && !(mensajes[clave] || []).length);
  }
  // Reglas de reenvío comunes. El tiempo de espera y los ROI repetidos solo cuentan dentro del mismo canal.
  function comprobarPrevio(a, canal) {
    const prev = enviados[a.clave];
    if (!prev) return null;
    if (noEstaEnChat(a.clave)) return { prev: null }; // su mensaje ya no está en el chat (se borró) y está en la web → se envía otra vez
    if (prev.canal !== canal) return { prev: null };
    if (!CONFIG.REENVIAR_SI_CAMBIA_ROI) return { accion: 'ya_enviada' };
    const dif = Math.abs(prev.roi - a.roi);
    if (dif < 1e-9 || dif < CONFIG.REENVIO_DIFERENCIA_MIN) return { accion: 'ya_enviada' };
    if ((prev.rois || [prev.roi]).some((r) => Math.abs(r - a.roi) < 1e-9)) return { accion: 'ya_enviada' };
    if (ahora() - (prev.ts || 0) < CONFIG.REENVIO_ESPERA_MIN * 60000) return { accion: 'espera_reenvio' };
    return { prev };
  }

  // ⏰ Canal H1: apuestas +EV de prepartido que empiezan en menos de 1 hora (y, con aviso, los ROI de posible error).
  // Lo que ya salió alguna vez por otro canal no se repite aquí.
  function aH1(a, comp, merc, accion, nota, roiMin) {
    const ch = CONFIG.CANALES.H1;
    if (!ch) return { accion, motivo: nota || comp.motivo, comp, merc };
    if (!permitidoEnH1(a, comp)) return { accion: 'fuera_4A', motivo: comp.motivo, comp, merc };
    // Córners de Europa League / Conference League: nunca en H1 (los partidos con un grande suben de nivel y se colaban)
    if (comp.deporte === 'futbol' && CORNERS_RE.test(textoPatas(a)) && /\b(europa league|conference league|uefa europa|uefa conference|uel|uecl)\b/.test(norm(a.torneo))) return { accion: 'descartada', motivo: 'Córners de Europa / Conference League: no van a Menos de 1 hora', comp, merc };
    const prev = enviados[a.clave];
    if (prev && !noEstaEnChat(a.clave) && (prev.tres || prev.canal !== 'H1')) return { accion: 'ya_en_1_3', comp, merc };
    if (cola.some((it) => it.tipo === 'surebet' && it.clave === a.clave && it.canal !== 'H1')) return { accion: 'ya_en_1_3', comp, merc };
    const min = roiMin != null ? roiMin : (ch.roiMin || 0);
    if (a.roi < min) return { accion: 'roi_bajo', canal: 'H1', min, motivo: nota, comp, merc };
    const p = comprobarPrevio(a, 'H1');
    if (p && p.accion) return { accion: p.accion, canal: 'H1', comp, merc };
    return { accion: 'enviar', canal: 'H1', comp, merc, prev: p && p.prev, nota };
  }

  // "41m" → 41 · "1h 5m" → 65 · "1d 18h" → 2520 · "Tomorrow at 11:30" / vacío / en vivo → null
  function minutosParaEmpezar(txt) {
    const t = String(txt || '').toLowerCase();
    if (!/\d\s*(d|h|m)\b/.test(t) || /[a-z]{3,}/.test(t.replace(/\b(min|mins|hrs?)\b/g, ''))) return null;
    let total = 0;
    const d = t.match(/(\d+)\s*d\b/), h = t.match(/(\d+)\s*h/), m = t.match(/(\d+)\s*m/);
    if (d) total += +d[1] * 1440;
    if (h) total += +h[1] * 60;
    if (m) total += +m[1];
    return total;
  }
  // Fecha y hora en España de un instante → { y, mo, d, h, mi, dow (0 = domingo) }
  function partesMadrid(ts) {
    try {
      const s = new Date(ts).toLocaleString('en-GB', { timeZone: 'Europe/Madrid', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      const m = s.match(/(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+)/);
      if (m) {
        const y = +m[3], mo = +m[2], d = +m[1];
        return { y, mo, d, h: +m[4] % 24, mi: +m[5], dow: new Date(Date.UTC(y, mo - 1, d)).getUTCDay() };
      }
    } catch (e) { /* sin zona horaria: se usa la del PC */ }
    const x = new Date(ts);
    return { y: x.getFullYear(), mo: x.getMonth() + 1, d: x.getDate(), h: x.getHours(), mi: x.getMinutes(), dow: x.getDay() };
  }
  // Lunes de la semana de ese instante, como 'AAAA-MM-DD'
  function lunesDe(ts) {
    const p = partesMadrid(ts);
    return new Date(Date.UTC(p.y, p.mo - 1, p.d) - ((p.dow + 6) % 7) * 86400000).toISOString().slice(0, 10);
  }
  const esLaborable = (ts) => { const w = partesMadrid(ts).dow; return w >= 1 && w <= 5; };
  // Cuándo empieza el partido: "6h 28m", "1d 18h", "Mañana a las 20:45", "Hoy a las 9:00", "25/10 14:00"… (si no se entiende: ahora)
  function inicioPartido(tiempo) {
    const t = ahora();
    const min = minutosParaEmpezar(tiempo);
    if (min !== null) return t + min * 60000;
    const txt = norm(tiempo || '');
    const hm = String(tiempo || '').match(/(\d{1,2}):(\d{2})/);
    const p = partesMadrid(t);
    const enMin = hm ? +hm[1] * 60 + +hm[2] : p.h * 60 + p.mi;
    let dias = null;
    if (/\b(pasado manana|day after tomorrow)\b/.test(txt)) dias = 2;
    else if (/\b(manana|tomorrow)\b/.test(txt)) dias = 1;
    else if (/\b(hoy|today)\b/.test(txt)) dias = 0;
    else {
      const f = String(tiempo || '').match(/\b(\d{1,2})\/(\d{1,2})\b/);
      if (f) {
        let y = p.y;
        if (+f[2] < p.mo - 6) y++;
        dias = Math.round((Date.UTC(y, +f[2] - 1, +f[1]) - Date.UTC(p.y, p.mo - 1, p.d)) / 86400000);
        if (dias < -1 || dias > 30) dias = null;
      }
    }
    if (dias === null) return t;
    let r = t + (dias * 1440 + enMin - (p.h * 60 + p.mi)) * 60000;
    // corrección por cambio de hora (verano/invierno) entre ahora y el partido
    const q = partesMadrid(r);
    let dif = q.h * 60 + q.mi - enMin;
    if (dif > 720) dif -= 1440; else if (dif < -720) dif += 1440;
    r -= dif * 60000;
    return r;
  }

  // ¿Cuántos minutos faltan para que empiece? (solo prepartido; null si no se sabe)
  function minutosHastaInicio(a) {
    if (a.modo === 'envivo') return null;
    const m = minutosParaEmpezar(a.tiempo);
    if (m !== null) return m;
    const txt = norm(a.tiempo || '');
    if (!/\d{1,2}:\d{2}/.test(String(a.tiempo || '')) || !/\b(hoy|today)\b|\b\d{1,2} \d{1,2} \d{1,2} \d{2}\b/.test(txt)) return null;
    return Math.round((inicioPartido(a.tiempo) - ahora()) / 60000);
  }
  const textoPatas = (a) => norm(a.patas.map((p) => p.mercado + ' ' + p.seleccion).join(' | '));
  const TARJETAS_RE = /\b(tarjeta|tarjetas|amarilla|amarillas|roja|rojas|booking|bookings|card|cards|amonestacion|amonestaciones|expulsion|expulsiones)\b/;
  const CORNERS_RE = /\b(corner|corners|corneres|esquina|esquinas|saques? de esquina)\b/;
  const REMATES_RE = /\b(tiro|tiros|disparo|disparos|remate|remates|shot|shots)\b/;
  const TOTAL_RE = /\b(total|totales|mas menos|mas o menos|over under|over|under)\b/;
  const HANDICAP_RE = /\b(handicap|handicaps|spread|asiatico|asian|point spread)\b/;

  const CANALES_IMPORTANTES = ['F1P', 'F1S', 'F2P', 'F2S', 'T1P', 'T1S']; // los que pueden pasar al canal ROI bajo
  // Cada canal solo admite su deporte. Aunque una regla fallara, nunca sale basket o tenis en un canal de fútbol (ni al revés).
  const DEPORTE_CANAL = { F1P: ['futbol'], F1S: ['futbol'], F2P: ['futbol'], F2S: ['futbol'], F3: ['futbol'], T1P: ['tenis'], T1S: ['tenis'], T2: ['tenis'], BK: ['baloncesto'], BKE: ['baloncesto'], ROI: ['futbol', 'tenis'], H1: ['futbol', 'tenis', 'baloncesto'] };
  const NOMBRE_DEPORTE = { futbol: 'fútbol', tenis: 'tenis', baloncesto: 'basket' };
  function deporteCuadra(canal, a, comp) {
    const ok = DEPORTE_CANAL[canal];
    if (!ok) return true;
    const porEmoji = EMOJI_DEPORTE.find(([e]) => String(a.torneo || '').includes(e));
    if (porEmoji && porEmoji[1] !== comp.deporte) return false; // el icono de la web manda
    return ok.includes(comp.deporte);
  }
  function evaluar(a) {
    const r = evaluarRuta(a);
    if (r.accion === 'enviar' && r.comp && !deporteCuadra(r.canal, a, r.comp)) {
      const d = r.comp.deporte || 'otro deporte';
      return { accion: 'descartada', motivo: `⚠️ ${NOMBRE_DEPORTE[d] || d} no puede ir en ${rotulo(r.canal)} → solo CONTROL`, canal: r.canal, comp: r.comp, merc: r.merc };
    }
    return r;
  }
  // ⭐ Estrellas de la NBA (CONFIG.NBA.estrellas): nombre completo, al revés («James LeBron»), con inicial («L. James») y,
  // si el apellido no se repite en la NBA, el apellido solo. Más los apodos de siempre.
  const APELLIDOS_COMUNES = new Set(['wagner', 'jackson', 'mobley', 'barnes', 'bane', 'james', 'davis', 'brown', 'edwards', 'mitchell', 'butler', 'young', 'williams', 'johnson', 'jones', 'smith', 'green', 'curry', 'harris', 'allen', 'thompson', 'robinson', 'walker', 'white', 'george', 'holiday', 'porter', 'murray', 'ball', 'leonard', 'irving', 'booker', 'brunson', 'morant', 'young', 'durant']);
  const APODOS_NBA = { 'lebron james': ['lebron'], 'giannis antetokounmpo': ['giannis'], 'luka doncic': ['luka'], 'kawhi leonard': ['kawhi'], 'victor wembanyama': ['wemby'], 'shai gilgeous alexander': ['sga'], 'stephen curry': ['steph curry'] };
  let cacheEstrellas = null;
  function aliasEstrellas() {
    const lista = (CONFIG.NBA && CONFIG.NBA.estrellas) || [];
    const firma = lista.join('|');
    if (cacheEstrellas && cacheEstrellas.firma === firma) return cacheEstrellas.alias;
    const alias = [];
    for (const nombre of lista) {
      const n = norm(nombre), partes = n.split(' ');
      if (partes.length < 2) { alias.push([n, nombre]); continue; }
      const nom = partes[0], ape = partes.slice(1).join(' ');
      const set = new Set([n, ape + ' ' + nom, nom[0] + ' ' + ape, ape + ' ' + nom[0], ...(APODOS_NBA[n] || [])]);
      if (!APELLIDOS_COMUNES.has(ape) && ape.length >= 5) set.add(ape);
      for (const x of set) alias.push([x, nombre]);
    }
    cacheEstrellas = { firma, alias };
    return alias;
  }
  // ¿Todas las patas son de la misma estrella? → su nombre; si no, null
  function estrellaNBA(a) {
    const alias = aliasEstrellas();
    let quien = null;
    for (const p of a.patas) {
      const t = ' ' + norm(p.mercado + ' ' + p.seleccion) + ' ';
      const hit = alias.find(([x]) => t.includes(' ' + x + ' '));
      if (!hit || (quien && quien !== hit[1])) return null;
      quien = hit[1];
    }
    return quien;
  }
  function evaluarRuta(a) {
    const comp = clasificarCompeticion(a.torneo, a.evento, a.tiempo);
    const merc = clasificarMercados(a);
    registrarCatalogo(a, comp, merc);
    const descartar = (motivo, canal) => ({ accion: 'descartada', motivo, canal, comp, merc });
    if (!comp.zona) return descartar(comp.motivo);
    // 1) Canal según deporte, nivel del partido y tipo de mercado
    const canalBase = canalDe(comp, merc);
    let canal = (CONFIG.DEGRADAR_CANALES || {})[canalBase] || canalBase; // +EV a prueba: F1 → F2, T1 → T2
    if (!canal || !CONFIG.CANALES[canal]) return descartar('Sin canal para ' + (comp.deporte || 'este deporte'));
    // Fútbol: las tarjetas y los córners solo salen en partidos de nivel 1 (F1S); en nivel 2 y 3 → solo CONTROL
    if (comp.deporte === 'futbol' && merc.prop) {
      const txt = textoPatas(a);
      const tarjetas = TARJETAS_RE.test(txt), corners = CORNERS_RE.test(txt);
      if ((tarjetas || corners) && comp.nivel !== 1) return descartar(`${tarjetas && corners ? 'Tarjetas / córners' : tarjetas ? 'Tarjetas' : 'Córners'} de un partido de nivel ${comp.nivel} (solo salen las de nivel 1)`, canal);
    }
    // Basket (NBA y Euroliga): nada de jugadores ni estadísticas; cuartos/mitades y totales según configuración
    if (comp.soloPrincipales) {
      // NBA: de jugadores solo las estrellas (CONFIG.NBA.estrellas); Euroliga: ninguna de jugadores
      const estrella = merc.prop && comp.comp === 'NBA' && CONFIG.NBA && CONFIG.NBA.jugadoresEstrella !== false ? estrellaNBA(a) : null;
      if (merc.prop && !estrella) return descartar(`${comp.comp}: apuestas de jugadores / estadísticas → solo CONTROL${comp.comp === 'NBA' ? ' (solo salen las de las estrellas)' : ''}`, canal);
      if (estrella) comp.comp += ' · ⭐ ' + estrella;
      if (estrella && CONFIG.NBA.canalEstrellas && CONFIG.CANALES[CONFIG.NBA.canalEstrellas]) canal = CONFIG.NBA.canalEstrellas; // v3.5.0 · estrellas → 🏀 Basket · ⭐️NBA
      if (merc.parcial && !(CONFIG.NBA && CONFIG.NBA.cuartosYMitades)) return descartar(`${comp.comp}: cuartos / mitades → solo CONTROL`, canal);
      if (!estrella && !(CONFIG.NBA && CONFIG.NBA.totales) && a.patas.some((p) => TOTAL_RE.test(norm(p.mercado)) && !HANDICAP_RE.test(norm(p.mercado)))) return descartar(`${comp.comp}: totales de puntos → solo CONTROL`, canal);
    }
    const minutos = minutosHastaInicio(a);
    // ROI altísimo: posible error de cuota
    if (CONFIG.ROI_MAX > 0 && a.roi > CONFIG.ROI_MAX) {
      const nota = `⚠️ EV de más del ${CONFIG.ROI_MAX}%: posible error de cuota · ${comp.comp}`;
      return CONFIG.ROI_MAX_CANAL ? aH1(a, comp, merc, 'roi_alto', nota) : descartar(nota + ' → solo CONTROL', canal);
    }
    // 2) Empieza en menos de 1 hora → TODO a H1 (con su mínimo más bajo), aunque fuera a otro canal
    if (minutos !== null && minutos >= -5 && minutos < (CONFIG.MINUTOS_H1 || 60)) {
      return aH1(a, comp, merc, 'roi_bajo', `⏰ Empieza en ${Math.max(0, minutos)} min · ${comp.comp} · si no, iría a ${rotulo(canal)}`);
    }
    // 3) ROI mínimo del canal
    const cfg = CONFIG.CANALES[canal];
    if (a.roi < cfg.roiMin) {
      // ROI entre 0.75 y 1.5 de un partido importante (fútbol nivel 1–2 o tenis T1) → canal ROI bajo
      const rb = CONFIG.ROI_BAJO, cr = CONFIG.CANALES.ROI;
      if (rb && rb.activo && cr && CANALES_IMPORTANTES.includes(canalBase) && a.roi >= (cr.roiMin || 0)) {
        const prev = enviados[a.clave];
        if (prev && prev.canal !== 'ROI' && !noEstaEnChat(a.clave)) return { accion: 'ya_enviada', canal: prev.canal, comp, merc };
        const p = comprobarPrevio(a, 'ROI');
        if (p && p.accion) return { accion: p.accion, canal: 'ROI', comp, merc };
        return { accion: 'enviar', canal: 'ROI', comp, merc, prev: p && p.prev, nota: `📉 EV bajo de partido importante · ${comp.comp} · con ≥${cfg.roiMin}% iría a ${rotulo(canal)}` };
      }
      return { accion: 'roi_bajo', canal, min: cfg.roiMin, motivo: `${comp.comp} · ${rotulo(canal)}`, comp, merc };
    }
    const p = comprobarPrevio(a, canal);
    if (p && p.accion) return { accion: p.accion, canal, comp, merc };
    return { accion: 'enviar', canal, comp, merc, prev: p && p.prev };
  }

  function procesarApuesta(a) {
    const r = evaluar(a);
    if (r.accion !== 'enviar') return r;
    const pkey = a.clave + '#' + a.roi;
    if (pendientes.has(pkey)) return { accion: 'en_cola', canal: r.canal };
    const dest = destinoDe(r.canal);
    if (!dest) {
      if (CONFIG.MODO === 'prueba') avisoConfig('sin_chat_prueba', `Para recibir las pruebas abre ${nombreBot(CONFIG.TOKEN)} en Telegram y pulsa «Iniciar».`);
      else avisoConfig('sin_chat_' + r.canal, `El canal ${rotulo(r.canal)} aún no está conectado: pulsa 🔎 Canales para ver qué falta.`);
      return { accion: 'sin_destino', canal: r.canal };
    }
    const chatId = dest.chatId;
    if (dest.token && tokensMalos.has(dest.token)) return { accion: 'token_malo', canal: r.canal };
    if ((chatBloqueadoHasta.get(chatId) || 0) > ahora()) return { accion: 'chat_bloqueado', canal: r.canal };
    let texto = construirMensaje(a, r.comp, r.merc, r.canal, r.prev, r.nota);
    if (CONFIG.MODO === 'prueba') texto += `\n🧪 <b>[PRUEBA → ${esc(rotulo(r.canal))}]</b>`;
    const existente = cola.find((it) => it.tipo === 'surebet' && it.clave === a.clave);
    if (existente && r.canal === 'H1' && existente.canal !== 'H1') return { accion: 'ya_en_1_3', canal: r.canal };
    if (existente) {
      pendientes.delete(existente.pkey);
      Object.assign(existente, { texto, roi: a.roi, pkey, canal: r.canal, chatId, token: dest.token, apuesta: a, dep: r.comp && r.comp.deporte, motivoCanal: r.nota || (r.comp && r.comp.comp) });
    } else {
      cola.push({ tipo: 'surebet', apuesta: a, canal: r.canal, token: dest.token, chatId, texto, clave: a.clave, roi: a.roi, pkey, intentos: 0, noAntes: 0, html: true, desc: `${a.evento} (${a.roiTexto})`, dep: r.comp && r.comp.deporte, motivoCanal: r.nota || (r.comp && r.comp.comp) });
    }
    pendientes.add(pkey);
    return { accion: 'encolada', canal: r.canal, comp: r.comp };
  }

  /* ═══════════════════════ TELEGRAM ═══════════════════════ */

  function tokenValido(tk) { return /^\d{5,}:[\w-]{20,}$/.test(String(tk || '').trim()); }

  // ── Tokens y chats de cada destino ('1A'…'3B', 'PRUEBA', 'ALERTAS') ──
  let chatsDetectados = store.get('chats_v1', {});
  (function migrarCanalesViejos() {
    let cambio = false;
    for (const [v, n] of Object.entries(CANAL_VIEJO)) if (chatsDetectados[v]) { if (!chatsDetectados[n]) chatsDetectados[n] = chatsDetectados[v]; delete chatsDetectados[v]; cambio = true; }
    if (cambio) store.set('chats_v1', chatsDetectados);
  })();
  const botsInfo = {};          // id del bot → { username, chats: Map, quitados: Set, error }
  const tokensMalos = new Set();
  let ultimaDeteccion = 0, detectando = null;

  const botIdDe = (tk) => String(tk || '').trim().split(':')[0];
  const cfgDestino = (c) => CONFIG.CANALES[c] || (c === 'CONTROL' ? CONFIG.CONTROL : null);
  const tokenPropio = (c) => String((cfgDestino(c) && cfgDestino(c).token) || '').trim();
  const destinosAuto = () => [...Object.keys(CONFIG.CANALES), ...(CONFIG.CONTROL && CONFIG.CONTROL.activo ? ['CONTROL'] : [])];
  const tokenDe = (c) => tokenPropio(c) || String(CONFIG.TOKEN || '').trim();
  function manualDe(c) {
    const v = c === 'PRUEBA' ? CONFIG.CHAT_PRUEBA : c === 'ALERTAS' ? CONFIG.CHAT_ALERTAS : (cfgDestino(c) || {}).chatId;
    return String(v == null ? '' : v).trim();
  }
  const esAuto = (c) => { const m = manualDe(c); return !m || m.toLowerCase() === 'auto'; };
  // ¿De qué canal es este título? ('⚽ F2 · Principales' → F2P, '🔍 CONTROL' → CONTROL, '1A' → null). El nombre del canal manda:
  // un bot nunca publica en un canal cuyo nombre es de otro canal.
  function codigoDeTitulo(titulo) {
    const t = ' ' + norm(titulo) + ' ';
    if (t.includes(' control ')) return 'CONTROL';
    if (/⭐|🌟/.test(String(titulo || '')) || / (estrellas?|stars?) /.test(t)) return 'BKE'; // v3.5.0 · «🏀 Basket · ⭐️NBA»
    const hits = Object.keys(TITULO_CANAL).filter((c) => t.includes(' ' + TITULO_CANAL[c] + ' '));
    if (hits.length) return hits.sort((a, b) => TITULO_CANAL[b].length - TITULO_CANAL[a].length)[0];
    const porCodigo = Object.keys(TITULO_CANAL).filter((c) => new RegExp('(^|[^a-z0-9])' + c.toLowerCase() + '($|[^a-z0-9])', 'i').test(String(titulo || '')));
    return porCodigo.length === 1 ? porCodigo[0] : null;
  }
  const tituloAjeno = (titulo, c) => { const tc = codigoDeTitulo(titulo); return !!tc && tc !== c; };
  function chatDe(c) {
    const m = manualDe(c);
    if (m && m.toLowerCase() !== 'auto') return m;
    if (!m && c === 'ALERTAS') return null;
    const k = c === 'PRUEBA' || c === 'ALERTAS' ? 'PRIVADO' : c;
    const d = chatsDetectados[k];
    if (d && k !== 'PRIVADO' && tituloAjeno(d.titulo, k)) return null; // ese canal se llama como otro: ahí no
    return d && d.bot === botIdDe(tokenDe(c)) ? String(d.id) : null;
  }
  function nombreBot(tk) { const b = botsInfo[botIdDe(tk)]; return b && b.username ? '@' + b.username : 'el bot ' + botIdDe(tk); }

  function tgApi(token, metodo, params) {
    return new Promise((resolve) => {
      try {
        GM_xmlhttpRequest({
          method: 'POST',
          url: `https://api.telegram.org/bot${String(token).trim()}/${metodo}`,
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify(params || {}),
          timeout: 20000,
          onload: (r) => {
            let j = null;
            try { j = JSON.parse(r.responseText); } catch (e) { /* nada */ }
            resolve({ ok: !!(j && j.ok), status: r.status, json: j, desc: (j && j.description) || 'HTTP ' + r.status });
          },
          onerror: () => resolve({ ok: false, status: 0, desc: 'Error de red' }),
          ontimeout: () => resolve({ ok: false, status: 0, desc: 'Tiempo de espera agotado' }),
        });
      } catch (e) {
        resolve({ ok: false, status: 0, desc: 'GM_xmlhttpRequest no disponible: ' + e.message });
      }
    });
  }

  function enviarTelegram(token, chatId, texto, html) {
    if (CONFIG.MODO === 'simulacion') {
      log('[SIMULACIÓN] →', chatId, '\n' + texto.replace(/<[^>]+>/g, ''));
      return Promise.resolve({ ok: true, simulado: true });
    }
    const body = { chat_id: chatId, text: texto, disable_web_page_preview: true };
    if (html) body.parse_mode = 'HTML';
    return tgApi(token, 'sendMessage', body);
  }

  // Pregunta a cada bot en qué canales está (getUpdates) y asigna cada canal automáticamente
  // Los bots son los mismos que los del script de surebets, y ese script es el que lee sus mensajes (getUpdates).
  // Si este script también los leyera, se «robarían» los comandos y los avisos de canal entre los dos.
  // Por eso aquí NO se lee nada de Telegram: los canales salen del script de surebets (lo deja en la web, en localStorage).
  function detectarChats() {
    if (detectando) return detectando;
    ultimaDeteccion = ahora();
    detectando = (async () => {
      const tokens = [...new Set([CONFIG.TOKEN, ...destinosAuto().map(tokenDe)].map((t) => String(t || '').trim()).filter(tokenValido))];
      for (const tk of tokens) {
        const id = botIdDe(tk);
        const info = botsInfo[id] || (botsInfo[id] = { username: '', chats: new Map(), quitados: new Set(), error: '' });
        if (!info.username && CONFIG.MODO !== 'simulacion') {
          const me = await tgApi(tk, 'getMe');
          if (me.ok) info.username = me.json.result.username || '';
          else if (me.status === 401 || me.status === 404) { tokensMalos.add(tk); info.error = 'token incorrecto'; continue; }
        }
      }
      asignarChats();
    })().catch((e) => log('Error buscando canales:', e)).finally(() => { detectando = null; });
    return detectando;
  }
  // Lee los mensajes nuevos de un bot (getUpdates con offset: se confirman, así nunca se atasca en 100)
  // y de paso apunta en qué canales está y atiende los comandos si es el bot principal.
  const leyendoBot = {};
  function leerUpdates() { return Promise.resolve(); } // ver detectarChats: este script nunca lee los mensajes de los bots
  function apuntarChat(info, chat, orden) {
    const k = String(chat.id);
    info.chats.set(k, { id: k, tipo: chat.type, titulo: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || k, orden });
    info.quitados.delete(k);
  }
  // Canales del script de surebets (v3.1.6+): { t, version, chats: { F1P: { id, titulo, bot }, …, PRIVADO } }.
  // Se guardan también aquí, así siguen valiendo aunque la pestaña de surebets esté cerrada.
  function asignarChats() {
    const p = ls.json(PUENTE_CHATS, null);
    estado.puente = p ? { t: p.t || 0, version: p.version || '?' } : null;
    if (!p || !p.chats || typeof p.chats !== 'object') return;
    const nuevo = {};
    for (const [k, v] of Object.entries(p.chats)) if (v && v.id && v.bot) nuevo[k] = { id: String(v.id), titulo: String(v.titulo || ''), bot: String(v.bot) };
    if (!Object.keys(nuevo).length) return;
    if (JSON.stringify(nuevo) !== JSON.stringify(chatsDetectados)) {
      chatsDetectados = nuevo;
      store.set('chats_v1', chatsDetectados);
      log('Canales (del script de surebets):', Object.entries(nuevo).map(([k, v]) => `${k} → ${v.titulo}`).join(' · ') || 'ninguno');
    }
  }
  // ── Comandos por Telegram: escribe /estado (o "estado") al bot principal y contesta si está activo ──
  let ultimaConsultaComandos = 0, consultandoComandos = false;
  // Comandos: se escriben al bot principal con «ev» delante (/evestado, /ev web…). El script de surebets los lee y los deja
  // aquí (localStorage); la primera pestaña +EV que manda los coge y los reparte a las demás como siempre.
  async function revisarComandos() {
    if (consultandoComandos) return;
    consultandoComandos = true;
    ultimaConsultaComandos = ahora();
    try {
      asignarChats();
      const lista = ls.json(PUENTE_CMDS, []);
      if (!Array.isArray(lista) || !lista.length) return;
      const hechos = store.get('cmds_hechos_v1', []);
      let cambio = false;
      for (const c of lista) {
        if (!c || !c.id || hechos.includes(c.id)) continue;
        hechos.push(c.id); cambio = true;
        if (ahora() - (c.t || 0) > 120000) continue; // viejo: no
        let txt = String(c.texto || '').trim().replace(/^(\/\w+)@\w+/, '$1');
        txt = txt.replace(/^\/?ev\s*/i, '/');
        if (txt === '/') txt = '/help';
        atenderComando({ chat: { id: c.chat, type: 'private' }, text: txt, date: Math.round((c.t || ahora()) / 1000) });
      }
      if (cambio) store.set('cmds_hechos_v1', hechos.slice(-100));
    } finally { consultandoComandos = false; }
  }
  // Lista de comandos: es lo que sale en /help y en el menú «/» de Telegram
  const COMANDOS = [
    ['help', 'Lista de todos los comandos +EV'],
    ['estado', 'Si el bot está activo y qué ha enviado hoy'],
    ['pruebas', 'Manda un mensaje de prueba a cada canal y te dice cuáles van'],
    ['borrarentradas', 'Borra de los canales las apuestas +EV publicadas'],
    ['borrarviejas', 'Borra ya las que no están en la web (sin esperar)'],
    ['pausa', 'Deja de enviar apuestas +EV (sigue leyendo la web)'],
    ['reanudar', 'Vuelve a enviar después de una pausa'],
    ['modo', 'Modo de envío actual (prueba o real)'],
    ['modoreal', 'Pasa a modo REAL: cada apuesta +EV a su canal'],
    ['modoprueba', 'Pasa a modo PRUEBA: todo a este chat'],
    ['enviadas', 'Las últimas apuestas +EV enviadas'],
    ['cola', 'Lo que está esperando para salir, por canal'],
    ['canales', 'Qué canal está conectado a cada bot'],
    ['porque', 'Qué ha hecho con una apuesta +EV: /porque villa'],
    ['reenviar', 'Vuelve a enviar las apuestas +EV que hay ahora en la web'],
    ['olvidar', 'Borra lo enviado y lo vuelve a mandar limpio a su canal'],
    ['web', 'Las apuestas +EV que hay ahora en la web y a qué canal va cada una (o por qué no sale)'],
    ['reiniciar', 'Recarga la página de apuestas +EV'],
  ];
  function textoAyuda() {
    return '💎 <b>Comandos del bot +EV</b> (los mismos que los de surebets, con «ev» delante)\n\n' + COMANDOS.map(([c, d]) => `/ev${c} → ${esc(d)}`).join('\n') +
      '\n\nTambién vale con espacio: «/ev estado», «/ev porque villa».' +
      '\nSi tienes Prepartido y En Vivo abiertos, cada pestaña contesta lo suyo.';
  }
  // Pone la lista en el menú «/» de Telegram (una vez por versión)
  function registrarComandos() { /* el menú «/» del bot lo pone el script de surebets (incluye los /ev…) */ }

  // Órdenes para TODAS las pestañas que envían (Prepartido y En Vivo): la pestaña que lee el comando
  // lo deja apuntado y las demás lo ven en menos de un segundo.
  const ORDENES_KEY = 'ordenes_tg_v1';
  const ordenesHechas = new Set(ss.json('sb_ordenes', []));
  function difundir(cmd, arg, chat) {
    const o = { id: TAB_ID + '_' + ahora() + '_' + Math.random().toString(36).slice(2, 6), cmd, arg: arg || '', chat: String(chat), t: ahora() };
    const lista = store.get(ORDENES_KEY, []).filter((x) => ahora() - x.t < 120000).concat(o).slice(-20);
    store.set(ORDENES_KEY, lista);
    ejecutarOrden(o);
  }
  function marcarOrden(id) {
    ordenesHechas.add(id);
    ss.setJson('sb_ordenes', [...ordenesHechas].slice(-50));
  }
  function revisarOrdenes(soloMarcar) {
    const lista = store.get(ORDENES_KEY, []);
    for (const o of lista) {
      if (ordenesHechas.has(o.id)) continue;
      if (soloMarcar || ahora() - o.t > 60000) { marcarOrden(o.id); continue; }
      if (!estado.lider || !estado.iniciado) continue;
      ejecutarOrden(o);
    }
  }
  function ejecutarOrden(o) {
    if (ordenesHechas.has(o.id)) return;
    marcarOrden(o.id);
    const pest = `<b>[${textoModo(estado.modo)}]</b> `;
    const r = (texto) => responder(o.chat, texto);
    try {
      if (o.cmd === 'estado') r(textoEstado());
      else if (o.cmd === 'pausa' || o.cmd === 'reanudar') {
        estado.pausado = o.cmd === 'pausa';
        ss.set('sb_pausa', estado.pausado ? '1' : '0');
        pintarPanel();
        r(pest + (estado.pausado ? '⏸ En pausa: sigo leyendo la web pero no envío nada. /evreanudar para seguir.' : '▶ Reanudado: vuelvo a enviar apuestas +EV.'));
      } else if (o.cmd === 'reenviar') {
        const conControl = o.arg === 'control';
        const n = reenviarTodo(conControl);
        r(pest + `🔁 Vuelvo a enviar las ${n} apuestas +EV que hay ahora en la web a sus canales${conControl ? ' (y también las del CONTROL)' : ''}. Tardarán un poco en salir todas (Telegram deja ~20 mensajes por minuto en cada canal).`);
      } else if (o.cmd === 'olvidar') {
        const x = olvidarEnviadas();
        r(pest + `🧹 Olvidadas ${x.n} apuestas +EV enviadas.` + (x.borrar ? ` Borro sus ${x.borrar} mensajes de los canales (~1 por segundo)` : '') +
          ` y las que sigan en la web se vuelven a enviar UNA vez, cada una a su canal según las reglas actuales.` +
          ` El CONTROL también se vacía${x.borrarCtrl ? ` (${x.borrarCtrl} mensajes)` : ''} y vuelve a recibir TODAS las de la web, salgan o no por un canal (tarda unos minutos: Telegram deja ~20 por minuto).${estado.pausado ? ' Estás en PAUSA: empezará al /evreanudar.' : ''}\nAhora te digo qué pasa con cada apuesta +EV de la web.`);
        estado.informeWeb = { chat: o.chat };
        solicitarEscaneo();
      } else if (o.cmd === 'web') {
        estado.informeWeb = { chat: o.chat };
        solicitarEscaneo();
      } else if (o.cmd === 'borrar' || o.cmd === 'borrarviejas') {
        const n = borrarEntradas(o.cmd === 'borrar');
        if (!n) r(pest + (o.cmd === 'borrar' ? '🗑 No hay mensajes míos en los canales que se puedan borrar (Telegram solo deja borrar los de menos de 48 h).' : '🗑 No hay ninguna publicada que ya no esté en la web.'));
        else r(pest + `🗑 Borrando ${n} mensajes de los canales${o.cmd === 'borrar' ? ' (las que sigan en la web no se vuelven a enviar)' : ' de apuestas +EV que ya no están en la web'}. Va a ~1 por segundo${estado.pausado ? ', pero estás en PAUSA: empezará al /evreanudar' : ''}.`);
      } else if (o.cmd === 'enviadas') r(pest + textoEnviadas());
      else if (o.cmd === 'cola') r(pest + textoCola());
      else if (o.cmd === 'porque') {
        r(pest + esc(('🔎 ' + (o.arg ? `«${o.arg}»` : 'Últimas apuestas +EV leídas') + '\n\n' + textoDecisiones(o.arg, o.arg ? 15 : 25)).slice(0, 3800)));
      } else if (o.cmd === 'reiniciar') {
        r(pest + '🔄 Recargando la página… En unos segundos escribe /evestado para comprobar que ha vuelto.');
        setTimeout(() => { guardar(true); soltarLiderazgo(); location.reload(); }, 4000);
      }
    } catch (e) { log('Error con el comando', o.cmd, e); }
  }

  function atenderComando(m) {
    if (!m || !m.chat || m.chat.type !== 'private' || !m.text) return;
    const privado = chatDe('PRUEBA');
    if (privado && String(m.chat.id) !== String(privado)) return; // solo te contesta a ti
    if (ahora() / 1000 - (m.date || 0) > 600) return; // mensajes viejos: no
    if (!estado.lider) return;
    const original = m.text.trim().replace(/^(\/\w+)@\w+/, '$1'); // «/estado@MiBot» → «/estado»
    const txt = original.toLowerCase();
    const resto = (re) => original.replace(re, '').trim();
    const chat = m.chat.id;
    const es = (re) => re.test(txt);
    if (es(/^\/?(ayuda|help|start|comandos)\b/)) responder(chat, textoAyuda());
    else if (es(/^\/?(estado|status|activo)\b/)) difundir('estado', '', chat);
    else if (es(/^\/?(pruebas?|probar|test)\b/)) pruebasPorTelegram(chat);
    else if (es(/^\/?(borrarentradas|borrar ?entradas|borrartodo|borrar)$/)) pedirBorrado(chat);
    else if (es(/^\/?(siborrar|si borrar|sí borrar)\b/)) confirmarBorrado(chat);
    else if (es(/^\/?(borrarviejas|borrar ?viejas)\b/)) difundir('borrarviejas', '', chat);
    else if (es(/^\/?(pausa|pausar|parar|stop)\b/)) difundir('pausa', '', chat);
    else if (es(/^\/?(reanudar|seguir|continuar|play)\b/)) difundir('reanudar', '', chat);
    else if (es(/^\/?(modoreal|modo ?real)\b/)) cambiarModoEnvio('real', chat);
    else if (es(/^\/?(modoprueba|modo ?prueba)\b/)) cambiarModoEnvio('prueba', chat);
    else if (es(/^\/?modo\b/)) responder(chat, `⚙️ Modo de envío: <b>${CONFIG.MODO.toUpperCase()}</b>\n${CONFIG.MODO === 'real' ? 'Cada apuesta +EV va a su canal.' : 'Todo llega a este chat, indicando a qué canal habría ido.'}\n\n/evmodoreal · /evmodoprueba`);
    else if (es(/^\/?(enviadas|ultimas|últimas)\b/)) difundir('enviadas', '', chat);
    else if (es(/^\/?cola\b/)) difundir('cola', '', chat);
    else if (es(/^\/?(canales|bots)\b/)) {
      detectarChats().then(() => responder(chat, '<pre>' + esc(textoCanales().slice(0, 3800)) + '</pre>'));
    }
    else if (es(/^\/?(porque|por que|por qué|porqué|motivo|buscar)\b/)) difundir('porque', resto(/^\/?(porque|por que|por qué|porqué|motivo|buscar)\s*/i), chat);
    else if (es(/^\/?(reenviar|reenvia|reenvía|repetir)\b/)) difundir('reenviar', /control/.test(txt) ? 'control' : '', chat);
    else if (es(/^\/?(olvidar|olvidarenviadas)\b/)) difundir('olvidar', '', chat);
    else if (es(/^\/?(web|tabla|ahora)\b/)) difundir('web', '', chat);
    else if (es(/^\/?(reiniciar|recargar|reset)\b/)) difundir('reiniciar', '', chat);
    else if (txt.startsWith('/')) responder(chat, `No conozco «/ev${esc(original.split(/\s/)[0].replace(/^\//, ''))}». Escribe /evhelp para ver los comandos +EV.`);
  }

  // /pruebas: lanza la prueba de canales y, cuando acaba, te dice cómo ha ido cada uno
  function pruebasPorTelegram(chat) {
    if (CONFIG.MODO === 'simulacion') { responder(chat, 'En modo simulación no se envía nada.'); return; }
    responder(chat, '🧪 Enviando un mensaje de prueba a cada canal… En unos segundos te digo cuáles van.');
    probarCanales();
    const t0 = ahora();
    const mirar = () => {
      const pr = Object.entries(estado.pruebas);
      const pendiente = pr.some(([, v]) => v === '⏳' || v === '🔎');
      if (pendiente && ahora() - t0 < 45000) { setTimeout(mirar, 2000); return; }
      if (!pr.length) { responder(chat, '🧪 No se ha podido probar ningún canal. Mira /evcanales.'); return; }
      const ok = pr.filter(([, v]) => v === '✅').length;
      const lineas = pr.map(([c, v]) => `${v === '✅' ? '✅' : v === '⏳' || v === '🔎' ? '⏳' : '❌'} ${c === 'PRUEBA' ? 'Este chat' : rotulo(c)}${v === '✅' ? '' : ' · ' + esc(v.replace(/^(✅|❌|⏳|🔎|⏸|—)\s*/, '') || 'sin respuesta todavía')}`);
      responder(chat, `🧪 <b>Resultado de la prueba</b> (${ok}/${pr.length} bien)\n\n` + lineas.join('\n'));
    };
    setTimeout(mirar, 4000);
  }

  // /borrarentradas pide confirmación (se toca /siborrar) para no vaciar los canales sin querer
  const BORRADO_KEY = 'borrar_pedido_v1';
  function totalMensajes() {
    let n = 0;
    for (const l of Object.values(mensajes)) n += (l || []).filter((x) => !x.borrando).length;
    return n;
  }
  function pedirBorrado(chat) {
    store.set(BORRADO_KEY, ahora());
    const n = totalMensajes();
    responder(chat, `🗑 <b>¿Borrar las apuestas +EV publicadas en los canales?</b>\n` +
      `En ${textoModo(estado.modo)} hay ${n} mensajes míos de las últimas 48 h.` +
      ` Se borran también los de la otra pestaña si la tienes abierta. Las que sigan en la web NO se vuelven a enviar (salvo /evolvidar).\n\n` +
      `Toca /evsiborrar para confirmar (vale 2 min).\nO /evborrarviejas para borrar solo las que ya no están en la web.\nLos mensajes del CONTROL no se tocan.`);
  }
  function confirmarBorrado(chat) {
    const pedido = store.get(BORRADO_KEY, 0);
    if (!pedido || ahora() - pedido > 120000) { responder(chat, 'Primero escribe /evborrarentradas (la confirmación caduca a los 2 min).'); return; }
    store.set(BORRADO_KEY, 0);
    difundir('borrar', '', chat);
  }
  // todas = true → todas las publicadas; false → solo las que ya no están en la web. Devuelve cuántos mensajes se van a borrar.
  function borrarEntradas(todas) {
    if (CONFIG.MODO === 'simulacion') return 0;
    podarMensajes();
    const t = ahora();
    let n = 0;
    for (const [clave, lista] of Object.entries(mensajes)) {
      if (!todas && t - (vistasHasta.get(clave) || 0) < 20000) continue; // sigue en la web
      for (const x of lista) {
        if (x.borrando) continue;
        const token = tokenDeBot(x.b);
        if (!token) { quitarMensaje({ clave, chatId: x.c, mid: x.m }); continue; }
        x.borrando = true;
        const d = decisiones.get(clave);
        cola.push({ tipo: 'borrar', clave, canal: x.canal, token, chatId: x.c, mid: x.m, creado: t, intentos: 0, noAntes: 0, forzar: todas, manual: true, desc: d ? d.evento || clave : clave });
        n++;
      }
    }
    procesarCola();
    return n;
  }

  function cambiarModoEnvio(nuevo, chat) {
    if (CONFIG.MODO === nuevo) { responder(chat, `Ya estás en modo ${nuevo.toUpperCase()}.`); return; }
    const sinCanal = Object.keys(CONFIG.CANALES).filter((c) => !chatDe(c));
    responder(chat, nuevo === 'real'
      ? '🚀 Paso a <b>MODO REAL</b>: cada apuesta +EV se publicará en su canal. Recargo las pestañas…' + (sinCanal.length ? `\nOjo: sin canal conectado → ${sinCanal.join(', ')} (esas se saltan).` : '') + '\n/evmodoprueba para volver.'
      : '🧪 Paso a <b>MODO PRUEBA</b>: todo llegará a este chat. Recargo las pestañas…');
    store.set('modo_envio_v1', { modo: nuevo, base: MODO_CODIGO });
    // la recarga la hace vigilarModoEnvio() en cada pestaña (también en esta) cuando el mensaje ya ha salido
  }
  // Si se cambia el modo de envío (desde Telegram o desde otra pestaña), esta pestaña se recarga para aplicarlo
  function vigilarModoEnvio() {
    const mg = store.get('modo_envio_v1', null);
    const deseado = mg && mg.base === MODO_CODIGO && ['simulacion', 'prueba', 'real'].includes(mg.modo) ? mg.modo : MODO_CODIGO;
    if (deseado === CONFIG.MODO) return;
    if (cola.some((x) => x.canal === 'COMANDO') && ahora() - (estado.modoCambiadoDesde || (estado.modoCambiadoDesde = ahora())) < 15000) return; // deja salir la respuesta
    log('Cambio de modo de envío a', deseado.toUpperCase(), '→ recargo');
    guardar(true);
    soltarLiderazgo();
    location.reload();
  }

  function textoEnviadas() {
    const lista = [...decisiones.values()].filter((d) => /^✅ enviada/.test(d.texto)).sort((x, y) => y.t - x.t).slice(0, 15);
    if (!lista.length) return `📨 No he enviado ninguna apuesta +EV desde la última recarga (${horaCorta(estado.inicio)}).`;
    return '📨 <b>Últimas enviadas</b>\n\n' + lista.map((d) => `• ${esc(d.evento)} · ${esc(d.roi)}\n   ${esc(d.texto.replace(/^✅ enviada a /, '→ '))} (${horaCorta(d.t)})`).join('\n').slice(0, 3700);
  }
  function textoCola() {
    const sure = cola.filter((x) => x.tipo === 'surebet');
    const borr = cola.filter((x) => x.tipo === 'borrar').length;
    const ctrl = cola.filter((x) => x.tipo === 'control').length;
    const porCanal = {};
    for (const x of sure) porCanal[x.canal] = (porCanal[x.canal] || 0) + 1;
    const L = [`📦 <b>En cola</b>: ${sure.length} apuestas +EV${estado.pausado ? ' (⏸ en pausa)' : ''}`];
    if (sure.length) L.push(Object.entries(porCanal).map(([c, n]) => `${c} ${n}`).join(' · '));
    if (sure.length) L.push('', ...sure.slice(0, 10).map((x) => `• ${esc(x.desc || x.clave)} → ${x.canal}`));
    if (borr) L.push(`🗑 Mensajes por borrar: ${borr}`);
    if (ctrl) L.push(`🔍 Para el CONTROL: ${ctrl}`);
    return L.join('\n');
  }
  // Olvida lo enviado de las apuestas +EV que están ahora en la web, para que vuelvan a salir
  // /olvidar: borra de los canales los mensajes de las apuestas +EV enviadas y las olvida, para que las que sigan en la web
  // se vuelvan a enviar una sola vez a su canal actual (sin dejar el mensaje viejo duplicado en el canal).
  function olvidarEnviadas() {
    const n = Object.keys(enviados).length;
    let borrar = 0;
    if (CONFIG.MODO !== 'simulacion') {
      podarMensajes();
      const t = ahora();
      for (const [clave, lista] of Object.entries(mensajes)) {
        for (const x of lista.slice()) {
          if (x.borrando) continue;
          const token = tokenDeBot(x.b);
          if (!token) { quitarMensaje({ clave, chatId: x.c, mid: x.m }); continue; }
          x.borrando = true;
          const d = decisiones.get(clave);
          cola.push({ tipo: 'borrar', clave, canal: x.canal, token, chatId: x.c, mid: x.m, creado: t, intentos: 0, noAntes: 0, forzar: true, olvidar: true, desc: d ? d.evento || clave : clave });
          borrar++;
        }
      }
    }
    // el CONTROL también se vacía y vuelve a recibir TODAS las de la web (enviadas y no enviadas)
    let borrarCtrl = 0;
    if (CONFIG.MODO !== 'simulacion') {
      const t = ahora();
      for (const [clave, lista] of Object.entries(mensajesControl)) {
        for (const x of lista.slice()) {
          if (x.borrando) continue;
          const token = tokenDeBot(x.b);
          if (!token) { quitarMensaje({ ctrl: true, clave, chatId: x.c, mid: x.m }); continue; }
          x.borrando = true;
          cola.push({ tipo: 'borrar', ctrl: true, clave, canal: 'CONTROL', token, chatId: x.c, mid: x.m, creado: t, intentos: 0, noAntes: 0, forzar: true, olvidar: true, desc: 'CONTROL' });
          borrarCtrl++;
        }
      }
    }
    for (let k = cola.length - 1; k >= 0; k--) if (cola[k].tipo === 'control' && cola[k].base) cola.splice(k, 1);
    pendientesControl.clear();
    enviadosControl = {};
    enviados = {}; enviadosSucios = true; guardar(true);
    estado.escaneoPendiente = ahora() - 1000; // leer ya
    procesarCola();
    return { n, borrar, borrarCtrl };
  }
  function reenviarTodo(conControl) {
    const r = leerTabla();
    const lista = r ? r.apuestas : [];
    for (const a of lista) {
      delete enviados[a.clave];
      if (conControl) delete enviadosControl[a.clave];
    }
    enviadosSucios = true;
    guardar(true);
    estado.escaneoPendiente = ahora() - 1000; // leer ya
    return lista.length;
  }
  function responder(chatId, texto) {
    cola.unshift({ tipo: 'alerta', canal: 'COMANDO', token: String(CONFIG.TOKEN).trim(), chatId: String(chatId), texto, intentos: 0, html: true });
    procesarCola();
  }
  function textoEstado() {
    const t = ahora();
    const hace = (ms) => { const s = Math.round((t - ms) / 1000); return s < 60 ? s + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : Math.round(s / 3600) + ' h'; };
    const con = estadoConexion();
    const L = [];
    L.push(estado.pausado ? '⏸ <b>Bot +EV EN PAUSA</b>' : `✅ <b>Bot +EV ACTIVO</b> (modo ${CONFIG.MODO.toUpperCase()})`);
    L.push(`🔢 Versión del script: ${VERSION}`);
    if (otrosScripts().length) L.push(esc(textoDuplicado(otrosScripts())));
    L.push(`🖥 Pestaña: ${textoModo(estado.modo)} · lleva ${hace(estado.inicio)} desde la última recarga`);
    L.push(`🔌 Web: ${con === 'ok' ? 'Conectado' : con === 'mal' ? '⚠️ Desconectada' : 'sin dato'}${CONFIG.HEALTHCHECK_URL ? ' · aviso de caídas: activado' : ''}`);
    L.push(`📋 Última lectura de la tabla: ${estado.ultimaLectura ? 'hace ' + hace(estado.ultimaLectura) : 'ninguna'} · ${estado.leidas}/${estado.filas} filas`);
    L.push('📨 Enviadas hoy: ' + Object.keys(CONFIG.CANALES).map((c) => `${EMOJI_CANAL[c] || ''}${c} ${chatDe(c) ? stats.c[c] || 0 : '(sin canal)'}`).join(' · ') + (CONFIG.CONTROL && CONFIG.CONTROL.activo ? ` · CONTROL ${chatDe('CONTROL') ? stats.c.CONTROL || 0 : '(sin canal)'}` : ''));
    L.push(`📦 En cola: ${cola.filter((x) => x.tipo === 'surebet').length}`);
    if (CONFIG.BORRAR_SI_DESAPARECE_MIN > 0) L.push(`🗑 Borradas hoy por llevar ${CONFIG.BORRAR_SI_DESAPARECE_MIN} min sin salir en la web: ${stats.c.BORRADAS || 0}`);
    if (estado.errorFatal) L.push('❌ ' + esc(estado.errorFatal));
    else if (estado.ultimoAviso && t - estado.ultimoAvisoHora < 3600000) L.push(`⚠️ Último aviso (hace ${hace(estado.ultimoAvisoHora)}): ${esc(estado.ultimoAviso)}`);
    return L.join('\n');
  }

  function faltanChats() {
    if (CONFIG.MODO === 'prueba' && !chatDe('PRUEBA')) return true;
    if (manualDe('ALERTAS').toLowerCase() === 'auto' && !chatDe('ALERTAS')) return true;
    return Object.keys(CONFIG.CANALES).some((c) => tokenPropio(c) && tokenValido(tokenDe(c)) && !chatDe(c)) || (CONFIG.CONTROL && CONFIG.CONTROL.activo && !chatDe('CONTROL'));
  }
  function textoCanales() {
    const L = ['BOTS Y CANALES — ' + fechaHora(), ''];
    for (const c of Object.keys(CONFIG.CANALES)) {
      const tk = tokenDe(c);
      const ch = chatDe(c);
      const d = chatsDetectados[c];
      if (!tokenValido(tk)) L.push(`${rotulo(c)}  ❌ sin token`);
      else if (tokensMalos.has(tk)) L.push(`${rotulo(c)}  ❌ el token de ${c} es incorrecto: cópialo otra vez de @BotFather`);
      else if (ch) L.push(`${rotulo(c)}  ✅ ${esAuto(c) && d ? '«' + d.titulo + '»' : '(puesto a mano)'}  ${ch}  · ${nombreBot(tk)}`);
      else if (!tokenPropio(c)) L.push(`${rotulo(c)}  ⏸ sin bot propio todavía → pega su token en la línea '${c}' de la configuración (o añade ${nombreBot(tk)} a ese canal y pon «${c}» en el nombre del canal)`);
      else L.push(`${rotulo(c)}  ❌ sin canal → añade ${nombreBot(tk)} como ADMINISTRADOR del canal ${c} y publica cualquier mensaje en ese canal`);
    }
    if (CONFIG.CONTROL && CONFIG.CONTROL.activo) {
      const ch = chatDe('CONTROL'), d = chatsDetectados.CONTROL;
      L.push(ch ? `CONTROL  ✅ ${d ? '«' + d.titulo + '»' : '(puesto a mano)'}  ${ch}  · ${nombreBot(tokenDe('CONTROL'))}`
        : `CONTROL  ❌ sin canal → crea un canal con «CONTROL» en el nombre, añade ${nombreBot(tokenDe('CONTROL'))} como ADMINISTRADOR y publica un mensaje`);
    }
    L.push('');
    L.push(chatDe('PRUEBA') ? `Pruebas y avisos  ✅ tu chat privado con ${nombreBot(CONFIG.TOKEN)}` : `Pruebas y avisos  ❌ abre ${nombreBot(CONFIG.TOKEN)} en Telegram y pulsa «Iniciar» (o escríbele cualquier cosa)`);

    const ajenos = [];
    for (const [id, b] of Object.entries(botsInfo)) for (const x of b.chats.values()) {
      if (x.tipo === 'private') continue;
      const tc = codigoDeTitulo(x.titulo);
      if (tc && (CONFIG.CANALES[tc] || tc === 'CONTROL') && botIdDe(tokenDe(tc)) !== id) ajenos.push(`  ⚠️ ${b.username ? '@' + b.username : id} está en «${x.titulo}», que es el canal ${tc}: ahí no publica (ese canal es de ${nombreBot(tokenDe(tc))}). Puedes quitarlo de ese canal.`);
    }
    if (ajenos.length) L.push('', 'Bots en un canal que no es el suyo:', ...ajenos);
    const pu = estado.puente;
    L.push('', pu ? `Canales sacados del script de surebets v${pu.version} (actualizado ${new Date(pu.t).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}).`
      : '❌ Todavía no he recibido los canales del script de surebets: actualízalo a la v3.1.6 (o más) y abre su pestaña (Arbitraje) en este mismo navegador.');
    L.push('Si un canal sale sin conectar aquí, conéctalo en el script de surebets (su /canales): este script usa los mismos canales.');
    return L.join('\n');
  }

  function procesarCola() {
    if (enVuelo || !cola.length) return;
    if (sinInternet()) { marcarSinConexion(); return; }
    const t = ahora();
    if (t < proximoGlobal) return;
    const puedeSurebets = estado.lider && !estado.pausado;
    for (let k = cola.length - 1; k >= 0; k--) if (cola[k].token && tokensMalos.has(cola[k].token)) { pendientes.delete(cola[k].pkey); cola.splice(k, 1); }
    const listo = (it) => (it.noAntes || 0) <= t && (proximoPorChat.get(it.chatId) || 0) <= t;
    let i = cola.findIndex((it) => it.tipo !== 'control' && ((it.tipo !== 'surebet' && it.tipo !== 'borrar') || puedeSurebets) && listo(it));
    if (i < 0) i = cola.findIndex((it) => it.tipo === 'control' && puedeSurebets && listo(it));
    if (i < 0) return;
    const it = cola[i];
    if (it.tipo === 'surebet') {
      if (CONFIG.DESCARTAR_SI_DESAPARECE && t - (vistasHasta.get(it.clave) || 0) > 20000 && t - estado.ultimaLectura < 10000) {
        cola.splice(i, 1);
        pendientes.delete(it.pkey);
        estado.descartadasDesaparecidas++;
        anotarPorClave(it.clave, `💨 desapareció de la web antes de poder enviarla a ${rotulo(it.canal)}`);
        if (it.apuesta) controlApuesta(it.apuesta, `desapareció de la web antes de poder enviarla a ${rotulo(it.canal)}`);
        dbg('Descartada (ya no está en la web):', it.desc);
        return procesarCola();
      }
    }
    if (it.tipo === 'borrar' && !it.forzar && (vistasHasta.get(it.clave) || 0) > it.creado) {
      // ha vuelto a salir en la web mientras esperaba → no se borra
      cola.splice(i, 1);
      marcarBorrando(it, false);
      return procesarCola();
    }
    cola.splice(i, 1);
    enVuelo = true;
    const peticion = it.tipo === 'borrar' ? tgApi(it.token, 'deleteMessage', { chat_id: it.chatId, message_id: it.mid }) : enviarTelegram(it.token, it.chatId, it.texto, it.html);
    peticion.then((res) => {
      enVuelo = false;
      proximoGlobal = ahora() + 150;
      const privado = !String(it.chatId).startsWith('-'); // chat privado (modo prueba): Telegram deja 1 mensaje por segundo
      proximoPorChat.set(it.chatId, ahora() + (it.tipo === 'borrar' ? 1000 : privado ? 1100 : CONFIG.INTERVALO_POR_CANAL_MS));
      if (res.ok) alEnviar(it, res);
      else manejarError(it, res);
      procesarCola();
    });
  }

  function alEnviar(it, res) {
    if (estado.sinConexionDesde) conexionRecuperada();
    if (it.tipo === 'borrar') {
      quitarMensaje(it);
      if (it.ctrl) { if (!it.reemplazada && !it.olvidar) olvidarControlDe(it.clave); dbg('🗑 Borrada del CONTROL:', it.desc); return; }
      if (it.olvidar) { dbg('🗑 Borrada por /olvidar:', it.desc); return; } // no se marca: se vuelve a enviar si sigue en la web
      if (enviados[it.clave]) enviados[it.clave][it.forzar ? 'manual' : 'borrada'] = ahora();
      if (it.manual) {
        anotarPorClave(it.clave, `🗑 borrada de ${it.canal} con /${it.forzar ? 'borrarentradas' : 'borrarviejas'}`);
        log(`🗑 Borrada de ${it.canal} (comando de Telegram): ${it.desc}`);
        return;
      }
      if (stats.fecha !== hoy()) stats = { fecha: hoy(), c: {} };
      stats.c.BORRADAS = (stats.c.BORRADAS || 0) + 1;
      anotarPorClave(it.clave, `🗑 borrada de ${it.canal}: llevaba ${CONFIG.BORRAR_SI_DESAPARECE_MIN} min sin salir en la web`);
      log(`🗑 Borrada de ${it.canal} (ya no está en la web): ${it.desc}`);
      return;
    }
    if (it.tipo === 'surebet') {
      pendientes.delete(it.pkey);
      const ant = enviados[it.clave];
      const rois = ((ant && !ant.borrada && (ant.rois || [ant.roi])) || []).concat(it.roi).slice(-30);
      const mismoCanal = ant && ant.canal === it.canal;
      enviados[it.clave] = { roi: it.roi, rois: mismoCanal ? rois : [it.roi], canal: it.canal, ts: ahora(), tres: !!(ant && ant.tres) || it.canal !== 'H1' };
      const mid = res && res.json && res.json.result && res.json.result.message_id;
      if (mid && it.token) {
        (mensajes[it.clave] = mensajes[it.clave] || []).push({ c: String(it.chatId), m: mid, b: botIdDe(it.token), ts: ahora(), canal: it.canal, dep: it.dep || '' });
        enviados[it.clave].seg = true;
        // Si esta apuesta +EV tenía mensaje en OTRO canal (p. ej. de una versión vieja del script, o del ROI bajo al subir de ROI), se borra el viejo
        for (const x of mensajes[it.clave]) {
          if (x.canal === it.canal || x.canal === 'CONTROL' || x.borrando) continue;
          const tk = tokenDeBot(x.b);
          if (!tk) continue;
          x.borrando = true;
          cola.push({ tipo: 'borrar', clave: it.clave, canal: x.canal, token: tk, chatId: x.c, mid: x.m, creado: ahora(), intentos: 0, noAntes: 0, forzar: true, olvidar: true, desc: `${it.desc} (se ha pasado a ${rotulo(it.canal)})` });
        }
      }
      enviadosSucios = true;
      if (stats.fecha !== hoy()) stats = { fecha: hoy(), c: {} };
      stats.c[it.canal] = (stats.c[it.canal] || 0) + 1;
      anotarPorClave(it.clave, `✅ enviada a ${rotulo(it.canal)}${CONFIG.MODO === 'prueba' ? ' (modo prueba → tu chat)' : ''}`);
      if (it.apuesta) controlApuesta(it.apuesta, it.motivoCanal || '', it.canal); // CONTROL = absolutamente todo
      log(`✅ Enviada a ${it.canal}${CONFIG.MODO === 'prueba' ? ' (prueba)' : ''}: ${it.desc}`);
    } else if (it.tipo === 'control') {
      pendientesControl.delete(it.clave);
      enviadosControl[it.clave] = ahora();
      const midC = res && res.json && res.json.result && res.json.result.message_id;
      if (it.base && midC) {
        const l = mensajesControl[it.base] || (mensajesControl[it.base] = []);
        for (const x of l) {
          if (x.borrando) continue;
          const tk = tokenDeBot(x.b);
          if (!tk) continue;
          x.borrando = true;
          cola.push({ tipo: 'borrar', ctrl: true, reemplazada: true, clave: it.base, canal: 'CONTROL', token: tk, chatId: x.c, mid: x.m, creado: ahora(), intentos: 0, noAntes: 0, forzar: true, desc: 'CONTROL (estado anterior)' });
        }
        l.push({ c: String(it.chatId), m: midC, b: botIdDe(it.token), ts: ahora() });
      }
      enviadosSucios = true;
      if (stats.fecha !== hoy()) stats = { fecha: hoy(), c: {} };
      stats.c.CONTROL = (stats.c.CONTROL || 0) + 1;
    } else if (it.tipo === 'prueba') {
      estado.pruebas[it.canal] = '✅';
    }
  }

  /* ── Borrar del canal las apuestas +EV que ya no están en la web ── */
  function tokenDeBot(botId) {
    const tokens = [CONFIG.TOKEN, ...destinosAuto().map(tokenDe), tokenDe('PRUEBA')].map((x) => String(x || '').trim());
    return tokens.find((tk) => tokenValido(tk) && botIdDe(tk) === String(botId)) || '';
  }
  const almacen = (it) => (it.ctrl ? mensajesControl : mensajes);
  // la apuesta +EV ya no tiene mensaje en el CONTROL: si vuelve a salir en la web, se vuelve a mandar
  function olvidarControlDe(base) {
    for (const k of Object.keys(enviadosControl)) if (k === base || k.startsWith(base + '>')) delete enviadosControl[k];
    enviadosSucios = true;
  }
  function marcarBorrando(it, valor) {
    const x = (almacen(it)[it.clave] || []).find((m) => m.c === it.chatId && m.m === it.mid);
    if (x) { if (valor) x.borrando = true; else delete x.borrando; }
  }
  function quitarMensaje(it) {
    const M = almacen(it);
    const l = (M[it.clave] || []).filter((m) => !(m.c === it.chatId && m.m === it.mid));
    if (l.length) M[it.clave] = l; else delete M[it.clave];
    enviadosSucios = true;
  }
  function revisarBorrados() {
    const min = CONFIG.BORRAR_SI_DESAPARECE_MIN;
    if (!(min > 0) || CONFIG.MODO === 'simulacion') return;
    const t = ahora();
    // Solo se cuenta el tiempo mientras la web funciona bien (con internet, «Conectado» y la tabla leída hace poco);
    // si se cae la web o internet, no se borra nada.
    const webBien = !sinInternet() && !estado.sinConexionDesde && estadoConexion() !== 'mal' && estado.ultimaLectura && t - estado.ultimaLectura < 15000 &&
      !(estado.erroresLectura > 0 && estado.leidas === 0) && !estado.faltanFilas; // con filas sin cargar no se borra nada
    if (!webBien) { estado.webBienDesde = 0; return; }
    if (!estado.webBienDesde) estado.webBienDesde = t;
    if (!estado.lider || !estado.iniciado || estado.pausado) return;
    const espera = min * 60000;
    if (CONFIG.CONTROL && CONFIG.CONTROL.borrarSiDesaparece !== false) {
      for (const [clave, lista] of Object.entries(mensajesControl)) {
        for (const x of lista) {
          if (x.borrando) continue;
          const base = Math.max(vistasHasta.get(clave) || 0, x.ts || 0, estado.webBienDesde, estado.inicio || 0);
          if (t - base < espera) continue;
          const token = tokenDeBot(x.b);
          if (!token) { quitarMensaje({ ctrl: true, clave, chatId: x.c, mid: x.m }); continue; }
          x.borrando = true;
          const d = decisiones.get(clave);
          cola.push({ tipo: 'borrar', ctrl: true, clave, canal: 'CONTROL', token, chatId: x.c, mid: x.m, creado: t, intentos: 0, noAntes: 0, desc: 'CONTROL: ' + (d ? d.evento || clave : clave) });
        }
      }
    }
    for (const [clave, lista] of Object.entries(mensajes)) {
      for (const x of lista) {
        if (x.borrando) continue;
        const base = Math.max(vistasHasta.get(clave) || 0, x.ts || 0, estado.webBienDesde, estado.inicio || 0);
        if (t - base < espera) continue;
        const token = tokenDeBot(x.b);
        if (!token) { quitarMensaje({ clave, chatId: x.c, mid: x.m }); continue; }
        x.borrando = true;
        const d = decisiones.get(clave);
        cola.push({ tipo: 'borrar', clave, canal: x.canal, token, chatId: x.c, mid: x.m, creado: t, intentos: 0, noAntes: 0, desc: d ? d.evento || clave : clave });
      }
    }
  }

  function manejarError(it, res) {
    const d = String(res.desc || '');
    const params = (res.json && res.json.parameters) || {};
    const t = ahora();
    if (res.status === 429) {
      const espera = (params.retry_after || 5) * 1000 + 300;
      proximoPorChat.set(it.chatId, t + espera);
      proximoGlobal = Math.max(proximoGlobal, t + Math.min(espera, 5000));
      cola.unshift(it);
      dbg('Telegram pide esperar', espera, 'ms');
      return;
    }
    if (it.tipo === 'borrar') {
      if (res.status === 0 || res.status >= 500) {
        // sin internet o fallo de Telegram: se reintenta más tarde
        if (res.status === 0 && sinInternet()) marcarSinConexion();
        it.intentos = (it.intentos || 0) + 1;
        if (it.intentos <= 5) { it.noAntes = t + it.intentos * 15000; cola.push(it); } else marcarBorrando(it, false);
        return;
      }
      // ya no existe, es de hace más de 48 h o no hay permiso → se deja de intentar
      quitarMensaje(it);
      if (/rights|permission|admin|forbidden/i.test(d) || res.status === 403) aviso(`No puedo borrar mensajes en ${it.canal} (${d}). El bot tiene que ser administrador del canal con permiso para publicar.`, 'borrar_' + it.chatId);
      else dbg('No se pudo borrar', it.desc, d);
      return;
    }
    if (params.migrate_to_chat_id) {
      const nuevo = String(params.migrate_to_chat_id);
      for (const c of Object.keys(CONFIG.CANALES)) if (String(CONFIG.CANALES[c].chatId) === String(it.chatId)) CONFIG.CANALES[c].chatId = nuevo;
      if (String(CONFIG.CHAT_PRUEBA) === String(it.chatId)) CONFIG.CHAT_PRUEBA = nuevo;
      for (const k of Object.keys(chatsDetectados)) if (String(chatsDetectados[k].id) === String(it.chatId)) chatsDetectados[k].id = nuevo;
      store.set('chats_v1', chatsDetectados);
      aviso(`El chat ${it.chatId} ahora es ${nuevo}. Cambia ese chatId en la configuración.`, 'migrado');
      it.chatId = nuevo;
      cola.unshift(it);
      return;
    }
    if (res.status === 400 && /parse entities|can't find end|unsupported start tag/i.test(d) && it.html) {
      it.html = false;
      it.texto = it.texto.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      cola.unshift(it);
      return;
    }
    if (res.status === 401 || res.status === 404) {
      tokensMalos.add(it.token);
      if (it.tipo === 'surebet') pendientes.delete(it.pkey);
      if (it.tipo === 'prueba') estado.pruebas[it.canal] = '❌ token incorrecto';
      const principal = it.token === String(CONFIG.TOKEN).trim();
      const txt = `El token ${principal ? 'del bot principal' : 'del canal ' + it.canal} es incorrecto (Telegram responde ${res.status}). Cópialo otra vez de @BotFather.`;
      if (principal) estado.errorFatal = txt;
      aviso(txt, 'token_' + botIdDe(it.token));
      return;
    }
    const errorDeChat = res.status === 403 || /chat not found|not enough rights|administrator|not a member|kicked|have no rights|write_forbidden|admin_required|chat_id is empty|peer_id_invalid|channel_private|user not found/i.test(d);
    if (it.tipo === 'control' && !(res.status === 429)) pendientesControl.delete(it.clave);
    if (res.status === 400 && !errorDeChat) {
      if (it.tipo === 'surebet') pendientes.delete(it.pkey);
      if (it.tipo === 'prueba') estado.pruebas[it.canal] = '❌ ' + d;
      aviso('Telegram rechazó un mensaje: ' + d, 'contenido');
      return;
    }
    if (errorDeChat) {
      chatBloqueadoHasta.set(it.chatId, t + 10 * 60000);
      if (it.tipo === 'surebet') pendientes.delete(it.pkey);
      if (it.tipo === 'prueba') estado.pruebas[it.canal] = '❌ ' + d;
      aviso(`No se puede publicar en ${it.canal || ''} (${it.chatId}): ${d}. ¿Está el bot como administrador con permiso para publicar? Se reintenta en 10 min.`, 'chat_' + it.chatId);
      return;
    }
    // sin internet: no se gastan reintentos, se espera a que vuelva la conexión
    if (res.status === 0 && (sinInternet() || /red|network|tiempo/i.test(d))) {
      marcarSinConexion();
      it.noAntes = t + 10000;
      cola.push(it);
      return;
    }
    // errores de red / 5xx → reintentos con espera creciente
    it.intentos = (it.intentos || 0) + 1;
    const esperas = [5, 15, 30, 60, 120];
    if (it.intentos <= esperas.length) {
      it.noAntes = t + esperas[it.intentos - 1] * 1000;
      cola.push(it);
      dbg('Reintento', it.intentos, d);
    } else {
      if (it.tipo === 'surebet') pendientes.delete(it.pkey);
      if (it.tipo === 'prueba') estado.pruebas[it.canal] = '❌ ' + d;
      aviso('No se pudo enviar tras varios intentos: ' + d, 'red');
    }
  }

  // ── Conexión a internet ──
  const sinInternet = () => typeof navigator !== 'undefined' && navigator.onLine === false;
  function marcarSinConexion() {
    if (!estado.sinConexionDesde) { estado.sinConexionDesde = ahora(); log('⚠️ Sin conexión a internet'); }
  }
  function conexionRecuperada() {
    if (!estado.sinConexionDesde) return;
    const desde = estado.sinConexionDesde, min = Math.max(1, Math.round((ahora() - desde) / 60000));
    estado.sinConexionDesde = 0;
    log('Conexión recuperada');
    aviso(`🌐 Se fue internet en el PC de ${horaCorta(desde)} a ${horaCorta(ahora())} (${min} min). Ya está conectado otra vez. Las apuestas +EV de ese rato que sigan en la web se enviarán ahora.`, 'internet_' + desde);
    if (estado.malConexionDesde) estado.malConexionDesde = ahora(); // dar margen a que la web se reconecte sola antes de recargar
  }
  try {
    window.addEventListener('offline', () => marcarSinConexion());
    window.addEventListener('online', () => setTimeout(conexionRecuperada, 3000));
  } catch (e) { /* nada */ }

  // Latido a healthchecks.io: si deja de llegar (sin internet, PC apagado, navegador cerrado), ellos te avisan
  let ultimoLatidoExterno = 0;
  function latidoExterno() {
    const url = String(CONFIG.HEALTHCHECK_URL || '').trim();
    if (!url || !estado.lider || ahora() - ultimoLatidoExterno < 60000) return;
    ultimoLatidoExterno = ahora();
    try { GM_xmlhttpRequest({ method: 'GET', url, timeout: 15000, onload: () => {}, onerror: () => {}, ontimeout: () => {} }); } catch (e) { /* nada */ }
  }

  const ultimaAlerta = ss.json('sb_alertas', {});
  function aviso(texto, tipo) {
    estado.ultimoAviso = texto;
    estado.ultimoAvisoHora = ahora();
    log('⚠️', texto);
    const chatAlerta = chatDe('ALERTAS');
    const tokenAlerta = tokenDe('ALERTAS');
    if (!tipo || !chatAlerta || CONFIG.MODO === 'simulacion' || !tokenValido(tokenAlerta) || tokensMalos.has(tokenAlerta)) return;
    if (!estado.lider && tipo !== 'arranque') return;
    const t = ahora();
    if (ultimaAlerta[tipo] && t - ultimaAlerta[tipo] < 30 * 60000) return;
    ultimaAlerta[tipo] = t;
    ss.setJson('sb_alertas', ultimaAlerta);
    cola.unshift({ tipo: 'alerta', canal: 'ALERTAS', token: tokenAlerta, chatId: chatAlerta, texto: `⚠️ <b>Bot +EV</b> (${textoModo(estado.modo)})\n${esc(texto)}`, intentos: 0, html: true });
  }

  async function probarCanales() {
    if (CONFIG.MODO === 'simulacion') { aviso('En modo simulación no se envía nada. Pasa a PRUEBA o REAL con el botón del panel.'); return; }
    estado.pruebas = {};
    Object.keys(CONFIG.CANALES).forEach((c) => { estado.pruebas[c] = '🔎'; });
    tokensMalos.clear();
    estado.errorFatal = tokenValido(CONFIG.TOKEN) ? '' : estado.errorFatal;
    await detectarChats();
    const privado = chatDe('PRUEBA');
    for (const c of [...destinosAuto(), 'PRUEBA', 'ALERTAS']) {
      const token = tokenDe(c);
      const chat = chatDe(c);
      if (c === 'ALERTAS' && (!chat || chat === privado)) { delete estado.pruebas[c]; continue; }
      if (!tokenValido(token)) { estado.pruebas[c] = '— sin token'; continue; }
      if (tokensMalos.has(token)) { estado.pruebas[c] = '❌ token incorrecto'; continue; }
      if (!chat) { estado.pruebas[c] = c === 'PRUEBA' ? '❌ pulsa Iniciar en el bot' : c === 'CONTROL' ? '❌ crea el canal CONTROL' : tokenPropio(c) ? '❌ sin canal' : '⏸ sin bot propio'; continue; }
      chatBloqueadoHasta.delete(chat);
      estado.pruebas[c] = '⏳';
      cola.unshift({ tipo: 'prueba', canal: c, token, chatId: chat, intentos: 0, html: true, texto: `✅ <b>Prueba de conexión</b>\n${ZONAS_POR_CANAL(c)}\nSi ves este mensaje, el bot puede publicar aquí.` });
    }
    procesarCola();
  }
  function ZONAS_POR_CANAL(c) {
    if (c === 'PRUEBA') return '🧪 Tu chat de pruebas y avisos';
    if (c === 'ALERTAS') return '⚠️ Chat de avisos';
    if (c === 'CONTROL') return '🔍 <b>CONTROL</b> · absolutamente todo (lo enviado y lo no enviado)';
    if (c === 'H1') return `⏰ <b>MENOS DE 1 HORA</b> · prepartido que empieza en menos de ${CONFIG.MINUTOS_H1 || 60} min (ROI desde ${(CONFIG.CANALES.H1 || {}).roiMin}%)`;
    if (c === 'ROI') return `📉 <b>ROI BAJO</b> · ${(CONFIG.CANALES.ROI || {}).roiMin}–${(CONFIG.CANALES.F1P || {}).roiMin}% de partidos importantes de fútbol (nivel 1–2) y tenis (T1)`;
    return `<b>${esc(rotulo(c))}</b> · ${esc(DESCRIPCION_CANAL[c] || '')}`;
  }

  /* ═══════════════════════ CICLO PRINCIPAL ═══════════════════════ */

  const esPaginaArbitraje = () => /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?value-bets\/?$/i.test(location.pathname); // (nombre heredado: aquí es la página +EV)

  let leyendo = false;
  function ciclo() {
    if (leyendo) return;
    leyendo = true;
    try {
      estado.escaneoPendiente = 0;
      const r = leerTabla();
      estado.ultimaLectura = ahora();
      if (!r) return;
      estado.tablaVistaAlgunaVez = true;
      estado.ultimaTablaVista = ahora();
      if (!estado.ultimaMutacionTabla) estado.ultimaMutacionTabla = ahora();
      estado.filas = r.filas;
      estado.leidas = r.apuestas.length;
      estado.erroresLectura = r.errores;
      if (r.errores > 0 && r.apuestas.length === 0) avisoConfig('estructura', 'Hay filas pero no se ha podido leer ninguna: puede que la web haya cambiado su diseño.');
      const ahoraMismo = ahora();
      for (const a of r.apuestas) vistasHasta.set(a.clave, ahoraMismo);
      if (vistasHasta.size > 3000) for (const [k, v] of vistasHasta) if (ahoraMismo - v > 3600000) vistasHasta.delete(k);
      if (!estado.lider || estado.pausado || !estado.iniciado) {
        for (const a of r.apuestas) anotarDecision(a, null, estado.pausado ? '⏸ el bot está en pausa' : '⏸ esta pestaña no es la que envía');
        mandarInformeWeb(r);
        return;
      }
      for (const a of r.apuestas) {
        a.modo = estado.modo;
        let res;
        try { res = procesarApuesta(a); } catch (e) { res = { accion: 'error' }; log('Error procesando', a.evento, e); }
        const prevD = decisiones.get(a.clave);
        if (prevD && (res.accion === 'en_cola' || (res.accion === 'ya_enviada' && /^✅/.test(prevD.texto)))) { prevD.roi = a.roiTexto; continue; }
        anotarDecision(a, res);
        // CONTROL = absolutamente todo: lo que se envía (con su canal) y lo que no (con el motivo)
        // (las que se envían van al CONTROL cuando de verdad salen: ver alEnviar)
        if (!NO_VA_A_CONTROL.has(res.accion)) controlApuesta(a, (decisiones.get(a.clave) || {}).texto || res.accion);
        dbg(res.accion, res.canal || '', res.motivo || '', a.torneo, '|', a.evento, a.roiTexto);
      }
      for (const f of r.fallidas || []) controlFilaIlegible(f);
      mandarInformeWeb(r);
      autoMostrarMas(r);
    } catch (e) {
      log('Error en la lectura:', e);
    } finally {
      leyendo = false;
    }
  }

  // Informe de /olvidar y /web: cada apuesta +EV que hay ahora en la web, a qué canal va o por qué no sale
  function mandarInformeWeb(r) {
    const inf = estado.informeWeb;
    if (!inf) return;
    estado.informeWeb = null;
    const sale = new Map(), no = new Map();
    let nSale = 0, nNo = 0;
    const meter = (mapa, k, x) => { if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(x); };
    for (const a of r.apuestas) {
      const d = decisiones.get(a.clave) || { texto: '?' };
      const base = String(d.texto).replace(/\s\[[^\]]*\]$/, '');
      const item = `${esc(a.evento)} ${esc(a.roiTexto)}`;
      const m = base.match(/^(?:⏳ en cola para|✅ enviada a|☑️ ya enviada antes a|⏸ ya enviada a) (.+?)(?: con las mismas casas| hace poco| \(modo prueba.*)?$/);
      if (m || /^☑️ ya salió/.test(base)) { meter(sale, m ? m[1] : 'otro canal', item); nSale++; }
      else { meter(no, base.replace(/^(🚫 EV por debajo del mínimo de .+?\(\d+(?:\.\d+)?%\)).*$/, '$1'), item); nNo++; }
    }
    const L = [`📋 <b>[${textoModo(estado.modo)}] En la web hay ${r.apuestas.length} apuestas +EV</b>${r.errores ? ` (+${r.errores} filas que no se han podido leer)` : ''}${estado.faltanFilas ? ' · quedan filas por cargar («Mostrar más»)' : ''}`];
    L.push('', `✅ <b>${nSale} van a un canal</b>`);
    for (const [c, l] of sale) L.push(`<b>${esc(c)}</b> (${l.length}): ${l.join(' · ')}`);
    L.push('', `🚫 <b>${nNo} no salen por ningún canal</b> (solo al CONTROL), por las reglas:`);
    const finalCtrl = CONFIG.CONTROL && CONFIG.CONTROL.activo ? (chatDe('CONTROL') ? `🔍 Al CONTROL van las ${r.apuestas.length}, salgan o no por un canal.` : '❌ El CONTROL no está conectado: /evcanales') : '';
    for (const [m, l] of no) L.push(`${esc(m)} (${l.length}): ${l.join(' · ')}`);
    if (finalCtrl) L.splice(1, 0, finalCtrl);
    let texto = L.join('\n');
    if (texto.length > 3900) texto = texto.slice(0, 3850).replace(/[^\n]*$/, '') + '… (lista cortada: /evporque nombre para ver una en concreto)';
    // detrás de las respuestas que ya esperan (para que llegue después del «Olvidadas…»)
    const i = cola.findIndex((x) => x.tipo !== 'alerta');
    cola.splice(i < 0 ? cola.length : i, 0, { tipo: 'alerta', canal: 'COMANDO', token: String(CONFIG.TOKEN).trim(), chatId: String(inf.chat), texto, intentos: 0, html: true });
    procesarCola();
  }

  let ultimoMostrarMas = 0;
  function autoMostrarMas(r) {
    const b = [...document.querySelectorAll('button')].find((x) => /^mostrar m[aá]s$/i.test(x.textContent.trim()) && !x.disabled);
    // ¿Quedan filas sin cargar? (si pulsar «Mostrar más» ya no añade filas, se da la tabla por completa)
    estado.faltanFilas = !!b && (estado.mostrarMasInutil || 0) < 2;
    if (!b || !CONFIG.AUTO_MOSTRAR_MAS || r.filas >= CONFIG.MAX_FILAS || ahora() - ultimoMostrarMas < 4000) return;
    // si el último clic no cargó un bloque de filas nuevas (≥5), el botón ya no trae nada
    estado.mostrarMasInutil = estado.filasAlPulsar != null && r.filas < estado.filasAlPulsar + 5 ? (estado.mostrarMasInutil || 0) + 1 : 0;
    estado.filasAlPulsar = r.filas;
    ultimoMostrarMas = ahora(); b.click(); dbg('Pulsado "Mostrar más"');
  }

  function solicitarEscaneo() {
    if (!estado.escaneoPendiente) estado.escaneoPendiente = ahora();
    if (ahora() - estado.ultimaLectura > 2500) ciclo();
  }

  function estadoConexion() {
    const el = [...document.querySelectorAll('button span, span')].find((s) => s.children.length === 0 && /^(conectado|desconectado|reconectando|conectando|sin conexi[oó]n|connected|disconnected|reconnecting|connecting)\W*$/i.test(s.textContent.trim()));
    if (!el) return null;
    return /^(conectado|connected)\W*$/i.test(el.textContent.trim()) ? 'ok' : 'mal';
  }

  function recargar(motivo, porFallo) {
    const t = ahora();
    if (cola.length && (!estado.recargaPedida || t - estado.recargaPedida < 120000)) { estado.recargaPedida = estado.recargaPedida || t; return; }
    if (porFallo) {
      const hist = (ss.json('sb_recargas', []) || []).filter((x) => t - x < 30 * 60000);
      if (hist.length >= 4) {
        if (!estado.recargaBloqueada) { estado.recargaBloqueada = true; aviso('Demasiadas recargas seguidas (' + motivo + '). Revisa la pestaña.', 'bucle'); }
        return;
      }
      hist.push(t);
      ss.setJson('sb_recargas', hist);
      aviso('Recargando la página: ' + motivo, 'recarga');
    }
    log('Recargando:', motivo);
    guardar(true);
    soltarLiderazgo();
    const hacer = () => location.reload();
    if (cola.length && estado.lider) setTimeout(hacer, 3000); else hacer();
  }

  function vigilar() {
    if (!esPaginaArbitraje()) return;
    const t = ahora();
    latidoExterno();
    if (sinInternet()) { marcarSinConexion(); return; } // sin internet no se recarga nunca (la página no volvería)
    if (estado.sinConexionDesde) {
      // comprobar si ya vuelve a haber internet (cualquier respuesta de Telegram vale)
      if (CONFIG.MODO !== 'simulacion' && tokenValido(CONFIG.TOKEN)) tgApi(CONFIG.TOKEN, 'getMe').then((r) => { if (r.status > 0) conexionRecuperada(); });
      return;
    }
    const con = estadoConexion();
    if (con === 'mal') {
      if (!estado.malConexionDesde) estado.malConexionDesde = t;
      if (t - estado.malConexionDesde > CONFIG.RECARGA_SI_DESCONECTADO_SEG * 1000) return recargar('la web ha perdido la conexión en tiempo real', true);
    } else estado.malConexionDesde = 0;
    // Sin tabla pero con la web "Conectado" = simplemente no hay apuestas +EV ahora mismo → no se recarga
    const webViva = con === 'ok';
    if (!webViva && !estado.tablaVistaAlgunaVez && t - estado.inicio > 180000) return recargar('no aparece la tabla de apuestas +EV', true);
    if (!webViva && estado.tablaVistaAlgunaVez && !encontrarTabla() && t - estado.ultimaTablaVista > 180000) return recargar('la tabla de apuestas +EV ha desaparecido', true);
    if (estado.filas > 0 && estado.ultimaMutacionTabla && t - estado.ultimaMutacionTabla > CONFIG.RECARGA_SI_CONGELADO_MIN * 60000) return recargar(`la tabla lleva ${CONFIG.RECARGA_SI_CONGELADO_MIN} min sin cambios`, true);
    if (CONFIG.RECARGA_CADA_MIN > 0 && t - estado.inicio > CONFIG.RECARGA_CADA_MIN * 60000) return recargar('recarga de seguridad periódica', false);
    if (stats.fecha !== hoy()) { stats = { fecha: hoy(), c: {} }; enviadosSucios = true; }
  }

  let ultimoLatido = 0, ultimaRevisionOrdenes = 0, ultimaVigilancia = 0, ultimoGuardado = 0, ultimoPanel = 0, ultimaPoda = ahora(), ultimaRevisionBorrado = 0;
  function tick() {
    const t = ahora();
    if (!esPaginaArbitraje()) { mostrarPanel(false); return; }
    mostrarPanel(true);
    if (estado.iniciado && t - ultimoLatido > 3000) {
      ultimoLatido = t;
      if (estado.iniciado) { const m = detectarModo(); if (m && m !== estado.modo) cambiarModo(m); }
      latido();
    }
    if ((estado.escaneoPendiente && t - estado.escaneoPendiente > 300 && t - estado.ultimaLectura > 1000) || t - estado.ultimaLectura > 5000) ciclo();
    procesarCola();
    if (estado.iniciado && estado.lider && t - ultimaConsultaComandos > 2000) { revisarComandos(); ls.setJson(PUENTE_VIVO, { t, version: VERSION, modo: estado.modo }); }
    if (estado.iniciado && t - ultimaRevisionOrdenes > 1000) { ultimaRevisionOrdenes = t; revisarOrdenes(); vigilarModoEnvio(); }
    if (estado.iniciado && !detectando && t - ultimaDeteccion > (faltanChats() ? 60000 : 30 * 60000)) detectarChats();
    if (t - ultimaVigilancia > 10000) { ultimaVigilancia = t; vigilar(); }
    if (t - ultimoGuardado > 5000) { ultimoGuardado = t; guardar(false); }
    if (t - ultimaPoda > 3600000) { ultimaPoda = t; podarEnviados(); podarMensajes(); }
    if (t - ultimaRevisionBorrado > 10000) { ultimaRevisionBorrado = t; revisarBorrados(); }
    if (t - ultimoPanel > 1000) { ultimoPanel = t; pintarPanel(); }
  }

  function cambiarModo(m) {
    guardar(true);
    soltarLiderazgo();
    estado.modo = m;
    ss.set('sb_modo', m);
    estado.lider = false;
    estado.liderEscrito = false;
    cola.splice(0, cola.length, ...cola.filter((it) => it.tipo !== 'surebet' && it.tipo !== 'borrar'));
    pendientes.clear();
    log('Modo:', textoModo(m));
  }

  function iniciarReloj(fn, ms) {
    let workerOk = false;
    try {
      const url = URL.createObjectURL(new Blob([`setInterval(function(){postMessage(0)},${ms});`], { type: 'text/javascript' }));
      const w = new Worker(url);
      w.onmessage = () => { workerOk = true; fn(); };
      w.onerror = () => { workerOk = false; };
    } catch (e) { /* la web no permite workers: se usa el temporizador normal */ }
    setInterval(() => { if (!workerOk) fn(); }, ms);
    setInterval(fn, 2000); // respaldo
  }

  function esperar(cond, maxMs) {
    return new Promise((resolve) => {
      const t0 = ahora();
      const f = () => { const v = cond(); if (v || ahora() - t0 > maxMs) resolve(v); else setTimeout(f, 500); };
      f();
    });
  }

  async function iniciar() {
    const mg = store.get('modo_envio_v1', null);
    if (mg && mg.base === MODO_CODIGO && ['simulacion', 'prueba', 'real'].includes(mg.modo)) CONFIG.MODO = mg.modo;
    log(`v${VERSION} cargado. Modo de envío: ${CONFIG.MODO.toUpperCase()}`);
    if (CONFIG.MODO !== 'simulacion' && !tokenValido(CONFIG.TOKEN)) estado.errorFatal = 'Falta el TOKEN del bot principal en CONFIG (o está mal copiado).';
    revisarOrdenes(true); // las órdenes de antes de abrir esta pestaña no se ejecutan
    crearPanel();
    detectarChats();
    if (CONFIG.MODO !== 'simulacion' && tokenValido(CONFIG.TOKEN)) registrarComandos();
    const obs = new MutationObserver((muts) => {
      const tabla = tablaCache && tablaCache.isConnected ? tablaCache : null;
      if (tabla) for (const m of muts) if (tabla.contains(m.target)) { estado.ultimaMutacionTabla = ahora(); break; }
      if (estado.iniciado) solicitarEscaneo();
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    iniciarReloj(tick, 250);
    window.addEventListener('beforeunload', () => { guardar(true); soltarLiderazgo(); });

    await esperar(() => esPaginaArbitraje() && encontrarTabla(), 120000);
    const deseado = ss.get('sb_modo');
    const actual = detectarModo();
    if (deseado && actual && deseado !== actual) {
      log('Restaurando el modo de esta pestaña:', textoModo(deseado));
      pulsarModo(deseado);
      await esperar(() => detectarModo() === deseado, 8000);
      await new Promise((r) => setTimeout(r, 2500));
    }
    estado.modo = detectarModo() || 'general';
    ss.set('sb_modo', estado.modo);
    cargarEstadoModo();
    estado.lider = false;
    estado.liderEscrito = false;
    latido();
    ultimoLatido = ahora();
    estado.iniciado = true;
    if (!ss.get('sb_arrancado_' + VERSION)) { // con la versión: así no lo pisa otra versión del script
      ss.set('sb_arrancado_' + VERSION, '1');
      setTimeout(() => aviso(`Bot +EV iniciado (v${VERSION}) en ${textoModo(estado.modo)} (modo ${CONFIG.MODO}).` + (ls.json(PUENTE_CHATS, null) ? '' : ' ⚠️ Aún no tengo los canales del script de surebets: actualízalo a la v3.1.6 y abre su pestaña.'), 'arranque'), 7000);
    }
  }

  /* ═══════════════════════ PANEL ═══════════════════════ */

  let panelHost = null, panelRoot = null;
  function crearPanel() {
    if (!CONFIG.MOSTRAR_PANEL || panelHost) return;
    panelHost = document.createElement('div');
    panelHost.id = 'ev-tg-panel';
    panelHost.setAttribute('data-version', VERSION);
    const pos = store.get('panel_pos_v1', null);
    panelHost.style.cssText = 'position:fixed;z-index:2147483647;' + (pos ? `left:${pos.x}px;top:${pos.y}px;` : 'right:12px;bottom:12px;');
    panelRoot = panelHost.attachShadow({ mode: 'open' });
    panelRoot.innerHTML = `
      <style>
        :host{all:initial}
        .p{font:12px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e5e7eb;background:#1e1033ee;border:1px solid #6b21a8;border-radius:10px;width:290px;box-shadow:0 8px 24px #0008}
        .h{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-bottom:1px solid #334155;font-weight:600;cursor:move;user-select:none}
        .b{padding:8px 10px;display:grid;gap:6px}
        .row{display:flex;justify-content:space-between;gap:8px}
        .muted{color:#94a3b8}
        .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}
        .c{background:#1e293b;border-radius:6px;padding:4px 6px;text-align:center}
        .c b{display:block;font-size:13px}
        .btns{display:flex;flex-wrap:wrap;gap:4px}
        button{font:inherit;color:#e5e7eb;background:#1e293b;border:1px solid #475569;border-radius:6px;padding:4px 7px;cursor:pointer}
        button:hover{background:#334155}
        .err{color:#fca5a5}
        .ok{color:#86efac}
        .warn{color:#fcd34d}
        .hid{display:none!important}
        .modal{position:fixed;inset:5vh 5vw;background:#0f172a;border:1px solid #475569;border-radius:10px;display:flex;flex-direction:column;padding:10px;gap:8px}
        textarea{flex:1;width:100%;box-sizing:border-box;background:#020617;color:#e5e7eb;border:1px solid #334155;border-radius:6px;font:12px/1.4 ui-monospace,Consolas,monospace;padding:8px}
      </style>
      <div class="p">
        <div class="h" id="hdr" title="Arrastra para mover · clic para plegar/desplegar"><span>✥ 💎 +EV → TG v${VERSION}</span><span id="st"></span></div>
        <div class="b" id="body">
          <div class="row"><span class="muted">Pestaña</span><span id="modo"></span></div>
          <div class="row"><span class="muted">Filas leídas</span><span id="filas"></span></div>
          <div class="row"><span class="muted">En cola</span><span id="cola"></span></div>
          <div class="grid" id="canales"></div>
          <div id="pruebas" class="muted"></div>
          <div id="aviso" class="warn"></div>
          <div class="btns">
            <button id="pausa"></button>
            <button id="modoenvio"></button>
            <button id="probar">🧪 Probar canales</button>
            <button id="canalesbtn">🔎 Canales</button>
            <button id="cat">📒 Catálogo</button>
            <button id="diag">🩺 Diagnóstico</button>
            <button id="olvidar">🧹 Olvidar enviadas</button>
          </div>
        </div>
      </div>
      <div class="modal hid" id="modal">
        <div class="row"><b id="mtitulo"></b><span><button id="copiar">Copiar</button> <button id="cerrar">Cerrar</button></span></div>
        <textarea id="txt" readonly></textarea>
      </div>`;
    const $ = (id) => panelRoot.getElementById(id);
    // Clic en la cabecera = plegar/desplegar. Arrastrar la cabecera = mover el panel (se recuerda la posición).
    if (ss.get('sb_plegado') === '1') $('body').classList.add('hid');
    let arrastre = null;
    $('hdr').addEventListener('mousedown', (e) => {
      const r = panelHost.getBoundingClientRect();
      arrastre = { dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, movido: false };
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!arrastre) return;
      if (Math.abs(e.clientX - arrastre.x0) + Math.abs(e.clientY - arrastre.y0) > 4) arrastre.movido = true;
      if (!arrastre.movido) return;
      const x = Math.max(0, Math.min(window.innerWidth - 60, e.clientX - arrastre.dx));
      const y = Math.max(0, Math.min(window.innerHeight - 30, e.clientY - arrastre.dy));
      Object.assign(panelHost.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' });
    });
    window.addEventListener('mouseup', () => {
      if (!arrastre) return;
      if (arrastre.movido) { const r = panelHost.getBoundingClientRect(); store.set('panel_pos_v1', { x: Math.round(r.left), y: Math.round(r.top) }); }
      else { $('body').classList.toggle('hid'); ss.set('sb_plegado', $('body').classList.contains('hid') ? '1' : '0'); }
      arrastre = null;
    });
    $('pausa').onclick = () => { estado.pausado = !estado.pausado; ss.set('sb_pausa', estado.pausado ? '1' : '0'); pintarPanel(); };
    $('probar').onclick = () => probarCanales();
    const modal = (titulo, texto) => { $('mtitulo').textContent = titulo; $('txt').value = texto; $('modal').classList.remove('hid'); };
    $('diag').onclick = () => {
      const tabla = encontrarTabla();
      const L = [`DIAGNÓSTICO v${VERSION} — ${fechaHora()}`, `URL: ${location.href}`, `Tabla encontrada: ${tabla ? 'sí' : 'NO'}`];
      if (tabla) {
        L.push('Cabeceras: ' + [...tabla.querySelectorAll('thead th, [role="columnheader"]')].map((th) => th.textContent.trim()).join(' | '));
        L.push(`Filas: ${estado.filas} · leídas: ${estado.leidas} · con error: ${estado.erroresLectura}`);
        const r = tabla.querySelector('tbody tr') || tabla.querySelector('[role="row"]:not(:first-child)');
        const f = estado.filaFallida || (r ? { motivo: '(sin error)', html: r.outerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>').slice(0, 12000) } : null);
        L.push('', '── Qué ha hecho con cada apuesta +EV (lo más reciente arriba) ──', textoDecisiones('', 80));
        if (f) { L.push('', 'Motivo del último fallo de lectura: ' + f.motivo, '', 'HTML de la fila:', f.html); }
      }
      modal('Diagnóstico — pulsa Copiar y pégamelo', L.join('\n'));
    };
    $('cat').onclick = () => { guardar(true); modal('Catálogo — copia todo y pásalo para ajustar las listas', textoCatalogo()); };
    $('canalesbtn').onclick = async () => { modal('Bots y canales', 'Preguntando a los bots…'); await detectarChats(); modal('Bots y canales', textoCanales()); };
    $('modoenvio').onclick = () => {
      const nuevo = CONFIG.MODO === 'real' ? 'prueba' : 'real';
      const sinCanal = Object.keys(CONFIG.CANALES).filter((c) => !chatDe(c));
      const msg = nuevo === 'real'
        ? 'Pasar a MODO REAL: cada apuesta +EV se publicará en su canal.' + (sinCanal.length ? '\n\nOjo: sin canal conectado todavía → ' + sinCanal.join(', ') + ' (esas se saltan).' : '') + '\n\n¿Seguro?'
        : 'Volver a MODO PRUEBA: todo irá a tu chat privado con el bot. ¿Seguro?';
      if (!confirm(msg)) return;
      store.set('modo_envio_v1', { modo: nuevo, base: MODO_CODIGO });
      guardar(true);
      soltarLiderazgo();
      location.reload();
    };
    $('cerrar').onclick = () => $('modal').classList.add('hid');
    $('copiar').onclick = () => {
      const ta = $('txt');
      ta.select();
      const viejo = () => { try { document.execCommand('copy'); } catch (e) { /* nada */ } };
      try { navigator.clipboard.writeText(ta.value).catch(viejo); } catch (e) { viejo(); }
    };
    $('olvidar').onclick = () => {
      if (!confirm('¿Olvidar todas las apuestas +EV ya enviadas en ' + textoModo(estado.modo) + '? Se borran sus mensajes de los canales y las que sigan en la web se vuelven a enviar una vez a su canal.')) return;
      olvidarEnviadas();
    };
    if (!esPaginaArbitraje()) panelHost.style.display = 'none'; // fuera de «Valor Positivo» no se enseña (ni un instante)
    (document.body || document.documentElement).appendChild(panelHost);
    pintarPanel();
  }
  function mostrarPanel(v) { if (panelHost) panelHost.style.display = v ? '' : 'none'; }
  // ¿Hay otro script de surebets corriendo en esta misma pestaña? (p. ej. la versión vieja sigue activada en Tampermonkey)
  function otrosScripts() {
    return [...document.querySelectorAll('#ev-tg-panel')].filter((h) => h !== panelHost).map((h) => h.getAttribute('data-version') || 'vieja');
  }
  function textoDuplicado(otros) {
    return `⛔ Hay ${otros.length === 1 ? 'otro script' : otros.length + ' scripts más'} de +EV activo en esta pestaña (versión ${otros.join(', ')}). Desactívalo o bórralo en Tampermonkey y deja solo la v${VERSION}.`;
  }
  function pintarPanel() {
    if (!panelRoot) return;
    const $ = (id) => panelRoot.getElementById(id);
    let st, cls;
    if (estado.errorFatal) { st = 'ERROR'; cls = 'err'; }
    else if (!estado.iniciado) { st = 'cargando…'; cls = 'muted'; }
    else if (estado.pausado) { st = 'PAUSADO'; cls = 'warn'; }
    else if (!estado.lider) { st = 'en espera'; cls = 'warn'; }
    else { st = CONFIG.MODO === 'real' ? 'ACTIVO' : CONFIG.MODO === 'prueba' ? 'ACTIVO (prueba)' : 'SIMULACIÓN'; cls = CONFIG.MODO === 'real' ? 'ok' : 'warn'; }
    $('st').textContent = st; $('st').className = cls;
    $('modo').textContent = textoModo(estado.modo) + (estado.lider ? '' : ' · otra pestaña envía');
    $('filas').textContent = `${estado.leidas}/${estado.filas}` + (estado.ultimaLectura ? ' · ' + new Date(estado.ultimaLectura).toLocaleTimeString('es-ES') : '');
    $('cola').textContent = String(cola.filter((x) => x.tipo === 'surebet').length);
    $('canales').innerHTML = Object.keys(CONFIG.CANALES).map((c) => {
      const conectado = !!chatDe(c);
      return `<div class="c" title="${NOMBRE_CANAL[c]}${conectado ? '' : ' · sin canal conectado'}">${EMOJI_CANAL[c] || ''} ${c}<b class="${conectado ? '' : 'err'}">${conectado ? stats.c[c] || 0 : 'sin canal'}</b></div>`;
    }).join('');
    if (CONFIG.CONTROL && CONFIG.CONTROL.activo) $('canales').innerHTML += `<div class="c" title="Absolutamente todo (enviado y no enviado)">🔍 CTRL<b class="${chatDe('CONTROL') ? '' : 'err'}">${chatDe('CONTROL') ? stats.c.CONTROL || 0 : 'sin canal'}</b></div>`;
    $('modoenvio').textContent = CONFIG.MODO === 'real' ? '🧪 Pasar a PRUEBA' : '🚀 Pasar a REAL';
    const pr = Object.entries(estado.pruebas);
    $('pruebas').textContent = pr.length ? 'Prueba: ' + pr.map(([c, v]) => `${c} ${v}`).join(' · ') : '';
    $('aviso').textContent = estado.errorFatal || (estado.ultimoAviso && ahora() - estado.ultimoAvisoHora < 10 * 60000 ? estado.ultimoAviso : '');
    $('aviso').className = estado.errorFatal ? 'err' : 'warn';
    $('pausa').textContent = estado.pausado ? '▶ Reanudar' : '⏸ Pausar';
    const otros = otrosScripts();
    if (otros.length) {
      $('aviso').textContent = textoDuplicado(otros);
      $('aviso').className = 'err';
      if (estado.iniciado && estado.lider && !estado.avisoDuplicado) { estado.avisoDuplicado = true; aviso(textoDuplicado(otros), 'duplicado'); }
    }
  }

  /* ═══════════════════════ ARRANQUE ═══════════════════════ */

  iniciar();
})();
