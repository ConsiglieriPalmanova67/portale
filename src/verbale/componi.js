// Testo del verbale dai fatti della seduta (fatti.js), con le formule di docs/verbale-modello.md (sezione 3) nell'ordine
// della sezione 2. Testo semplice, senza HTML: paragrafi separati da una riga vuota (chi lo mostra lo protegge con esc).
// Un dato che la legge richiede ma che manca (data e ora della prima convocazione, convocante, ora di chiusura…) diventa
// una riga «______» da completare a mano; ciò che il portale non conosce affatto (codice fiscale, numero di pagine…)
// si omette. Non si stampano mai segnaposto. Funzione pura.

const RIGA_FIRMA = '______________________';
const VUOTO = '______';

const condomini = (n) => `n. ${n} ${n === 1 ? 'condomino' : 'condomini'}`;
// Testo scritto a mano: senza spazi ai bordi e senza righe vuote interne (spezzerebbero il paragrafo).
const pulito = (testo) => String(testo ?? '').replace(/\r\n?/g, '\n').split('\n').map((r) => r.trim()).filter(Boolean).join('\n');
// Una frase scritta a mano chiusa da un punto, se non ha già la sua punteggiatura finale.
const chiusa = (testo) => (/[.!?…»")]$/.test(testo) ? testo : `${testo}.`);
// «dall'art. 1136 c.c.»; una norma scritta in altro modo resta «da …».
const dalla = (norma) => (/^art\./.test(norma) ? `dall'${norma}` : `da ${norma}`);
const minuscola = (testo) => testo.charAt(0).toLowerCase() + testo.slice(1);
const nominativo = (p) => `${p.nominativo} (${p.unita ? `unità ${p.unita}, ` : ''}${p.millesimi}/1000)`;
// «il giorno 20/10/2026 alle ore 21:00 presso Sala comune»; ciò che manca resta da completare a mano.
const appuntamento = ({ data, ora, luogo } = {}) => `il giorno ${data || VUOTO} alle ore ${ora || VUOTO} presso ${luogo || VUOTO}`;
const tipoAssemblea = (f) => (f.tipo ? ` ${f.tipo}` : '');
const convocataDa = (f) => `convocata da ${f.avviso.convocante || VUOTO} con avviso del ${f.avviso.data || VUOTO}, inviato a tutti gli aventi diritto`;

const QUORUM = {
  prima: { comma: 'primo comma', soglie: 'maggioranza dei partecipanti e due terzi del valore' },
  seconda: { comma: 'terzo comma', soglie: 'un terzo dei partecipanti e un terzo del valore' },
};
const DOPO = { appello: 'Variazioni dei presenti dopo l\'appello:', votazione: 'Variazioni dei presenti dopo l\'ultima votazione:' };

function variazioni(elenco, titolo) {
  return [titolo, ...elenco.map((m) => `– ore ${m.ora}: ${m.verso} ${nominativo(m)}${m.delegato ? `, rappresentato da ${m.delegato}` : ''}.`)];
}

function convocazione(f, numeri) {
  const quando = f.convocazione === 'seconda'
    ? `per ${appuntamento(f.primaConvocazione)} in prima convocazione e per ${appuntamento(f.seduta)} in seconda convocazione`
    : `per ${appuntamento(f.seduta)} in prima convocazione`;
  const odg = f.ordineDelGiorno.length ? ', con il seguente ordine del giorno:' : ', con l\'ordine del giorno riportato nell\'avviso.';
  return [
    `${numeri.convocazione}. CONVOCAZIONE`,
    `Si dà atto che l'assemblea${tipoAssemblea(f)} del Condominio è stata ${convocataDa(f)}, ${quando}${odg}`,
    ...f.ordineDelGiorno.map((p) => `${p.numero}. ${p.testo}`),
    `L'avviso è allegato al presente verbale (allegato n. ${numeri.avviso}).`,
    `Si dà atto altresì che il Presidente dell'assemblea, ${f.presidente ? `${f.presidente}, ` : ''}nominato come indicato al paragrafo ${numeri.presidente}, ha verificato la regolare convocazione di tutti gli aventi diritto, come richiesto dall'art. 1136, sesto comma, c.c.`,
  ];
}

function primaConvocazione(f, numeri) {
  // il termine si dichiara solo se le due date sono note e lo rispettano (fatti.js, termineSeconda)
  const termine = f.primaConvocazione?.termineRispettato
    ? ' L\'odierna seduta si tiene in giorno diverso da quello della prima convocazione e non oltre dieci giorni da essa (art. 1136, terzo comma, c.c.; art. 66, quarto comma, disp. att. c.c.).' : '';
  return [
    `${numeri.prima}. PRIMA CONVOCAZIONE`,
    `Si dà atto che l'assemblea fissata in prima convocazione per ${appuntamento(f.primaConvocazione)} è andata deserta per mancanza del numero legale, come risulta dall'annotazione di mancata costituzione nel registro dei verbali (art. 1130, n. 7, c.c.)${numeri.deserta ? `, allegata sub n. ${numeri.deserta}` : ''}.${termine}`,
  ];
}

function appello(f, numeri) {
  const titolo = `${numeri.appello}. APPELLO`;
  const a = f.appello;
  if (!a) return [titolo, 'L\'appello non risulta ancora registrato nel portale.'];
  const riga = (r) => [`– ${r.nominativo}`, r.unita && `unità ${r.unita}`, `${r.millesimi}/1000`,
    r.delega ? `per delega a ${r.delega.delegato}${r.delega.esterno ? ' (non condomino)' : ''}` : 'di persona',
    r.ora && (r.delega ? `delega registrata ore ${r.ora}` : `ingresso ore ${r.ora}`)].filter(Boolean).join(' – ');
  return [
    titolo,
    `Alle ore ${a.ora} si procede all'appello. Gli aventi diritto sono ${condomini(a.aventiDiritto.teste)}, per complessivi ${a.aventiDiritto.millesimi}/1000${a.tabella ? ` della tabella ${a.tabella}` : ''}.`,
    'Risultano presenti:',
    `– di persona: ${condomini(a.diPersona.teste)}, per ${a.diPersona.millesimi}/1000;`,
    `– per delega: ${condomini(a.perDelega.teste)}, per ${a.perDelega.millesimi}/1000;`,
    `in totale ${condomini(a.presenti.teste)} su ${a.aventiDiritto.teste}, per ${a.presenti.millesimi}/1000.`,
    ...(a.elenco.length ? ['Elenco nominativo dei presenti:', ...a.elenco.map(riga)] : []),
    `Lo stesso elenco, con gli orari, è riportato nel foglio presenze del report allegato n. ${numeri.report}.${numeri.deleghe ? ` Le deleghe, rilasciate per iscritto, sono allegate sub n. ${numeri.deleghe}.` : ''}`,
  ];
}

function votazione(v, numeri) {
  const gruppi = [['Favorevoli', v.favorevoli], ['Contrari', v.contrari], ['Astenuti', v.astenuti]];
  if (v.mancanti.teste) gruppi.push(['Senza voto espresso', v.mancanti]);
  const righe = gruppi.map(([nome, g], i) => `– ${nome}: n. ${g.teste}, per ${g.millesimi}/1000: ${g.nominativi.map(nominativo).join(', ') || 'nessuno'}${i < gruppi.length - 1 ? ';' : '.'}`);
  const regola = v.frazione
    ? `maggioranza degli intervenuti che rappresenti almeno ${v.frazione} del valore (${v.soglia}/1000)`
    : minuscola(v.maggioranza);
  return [
    `Votazione per appello nominale${v.tabella ? ` (tabella ${v.tabella})` : ''}. ${v.chiusa && v.ora ? `Alle ore ${v.ora} sono presenti` : 'Sono presenti'}, di persona o per delega, ${condomini(v.presenti.teste)} su ${v.aventiDiritto} aventi diritto al voto sul punto, per ${v.presenti.millesimi}/1000 (intervenuti).`,
    ...righe,
    v.assenti.teste
      ? `Gli assenti al momento del voto, ${condomini(v.assenti.teste)} per ${v.assenti.millesimi}/1000, sono elencati nel report allegato n. ${numeri.report}.`
      : 'Non vi sono assenti al momento del voto.',
    `Maggioranza richiesta: ${regola} – ${chiusa(v.norma)}`,
  ];
}

// Modello, 3.4 A e B. L'esito è quello calcolato dal portale (come nel Report e nella scheda Votazioni).
function esito(v, f, delibera) {
  const oggetto = delibera ? 'la delibera sopra trascritta' : 'la proposta posta in votazione';
  const verifica = v.daVerificareContrari
    ? `[DA VERIFICARE: i millesimi dei favorevoli (${v.favorevoli.millesimi}/1000) non superano quelli dei contrari (${v.contrari.millesimi}/1000); secondo il modello (Cass. 13856/2026) la delibera potrebbe non essere valida; verificare prima della firma.]` : '';
  if (v.approvato && (v.unanime || !v.frazione)) {
    return [`Esito: APPROVATA. L'assemblea APPROVA ${oggetto} all'unanimità degli intervenuti, ${condomini(v.presenti.teste)} per ${v.presenti.millesimi}/1000, i cui nominativi sono riportati nell'elenco dei favorevoli.`, verifica];
  }
  if (v.approvato) {
    const contrari = f.convocazione === 'seconda' && v.favorevoliSuperanoContrari
      ? `; i millesimi dei favorevoli (${v.favorevoli.millesimi}/1000) superano quelli dei contrari (${v.contrari.millesimi}/1000)` : '';
    return [
      `Esito: APPROVATA. La proposta ha ottenuto il voto favorevole della maggioranza degli intervenuti (n. ${v.favorevoli.teste} su ${v.presenti.teste}), che rappresenta ${v.favorevoli.millesimi}/1000, pari o superiore alla soglia di ${v.soglia}/1000 richiesta ${contrari ? `${dalla(v.norma)}${contrari}.` : chiusa(dalla(v.norma))}`,
      `L'assemblea pertanto APPROVA ${oggetto}.`,
      verifica,
    ];
  }
  const motivi = v.frazione
    ? [v.mancaMaggioranzaTeste && 'manca la maggioranza degli intervenuti per teste', v.sottoSoglia && `i favorevoli non raggiungono la soglia di ${v.soglia}/1000`].filter(Boolean)
    : [`manca il voto favorevole di tutti gli ${v.unanimita === 'intervenuti' ? 'intervenuti' : 'aventi diritto'}`];
  return [
    `Esito: RESPINTA. La proposta non ha raggiunto la maggioranza richiesta ${dalla(v.norma)} (${motivi.length ? `${motivi.join(' e ')}: ` : ''}favorevoli n. ${v.favorevoli.teste} su ${v.presenti.teste} intervenuti, per ${v.favorevoli.millesimi}/1000; contrari per ${v.contrari.millesimi}/1000).`,
    'L\'assemblea pertanto NON APPROVA la proposta.',
  ];
}

// Un punto all'ordine del giorno: un paragrafo per parte (modello, 3.3).
function punto(p, f, numeri) {
  const blocchi = [[`PUNTO ${p.numero} – ${p.testo}`]];
  if (p.variazioni.length) {
    blocchi.push([...variazioni(p.variazioni, DOPO[p.variazioniDa] ?? DOPO.appello),
      'Chi è uscito non partecipa alle votazioni successive e risulta assente; eventuali dichiarazioni sul voto rese prima di uscire non sono computate.']);
  }
  if (p.candidati.length) blocchi.push([`Candidati: ${p.candidati.join(', ')}.`]);
  const sintesi = pulito(p.sintesi);
  const dichiarazioni = pulito(p.dichiarazioni) ? ['Dichiarazioni a verbale rese su richiesta (art. 1130, n. 7, c.c.):', pulito(p.dichiarazioni)] : null;
  if (p.informativo) {
    // modello, 3.4 E: solo comunicazioni, senza alcuna votazione
    if (dichiarazioni) blocchi.push(dichiarazioni);
    blocchi.push([sintesi ? `Sono rese le seguenti comunicazioni, senza alcuna votazione: ${chiusa(sintesi)}` : 'Non si procede ad alcuna votazione.',
      'Gli argomenti che richiedono una decisione saranno inseriti nell\'ordine del giorno di una prossima assemblea.']);
    return blocchi;
  }
  if (sintesi) blocchi.push([`Discussione. ${chiusa(sintesi)}`]);
  if (dichiarazioni) blocchi.push(dichiarazioni);
  const v = p.votazione;
  if (!v) {
    blocchi.push(['Il punto non viene posto in votazione. Nessuna decisione è assunta sul punto.']);
    return blocchi;
  }
  const delibera = pulito(p.delibera);
  if (delibera) blocchi.push(['Proposta di delibera posta in votazione:', `«${delibera}»`]);
  if (v.tabellaParticolare && v.tabella) {
    blocchi.push([`Il punto riguarda la tabella ${v.tabella}: votano i soli condomini compresi in tale tabella e quorum e maggioranze sono calcolati sui relativi millesimi.`]);
  }
  blocchi.push(votazione(v, numeri));
  blocchi.push(v.chiusa ? esito(v, f, delibera) : ['Votazione non ancora chiusa nel portale: il conteggio è provvisorio e l\'esito non è ancora determinato.']);
  return blocchi;
}

// Modello, 3.7: quorum costitutivo non raggiunto all'appello. Nessun punto si tratta.
function mancataCostituzione(f) {
  const a = f.appello;
  const { comma, soglie } = QUORUM[f.convocazione];
  const verbalizzante = f.presidente || RIGA_FIRMA;
  const presenti = a.presenti.teste
    ? `sono presenti, di persona o per delega, soltanto ${condomini(a.presenti.teste)} su ${a.aventiDiritto.teste}, per ${a.presenti.millesimi}/1000: ${a.elenco.map((r) => `${nominativo(r)}${r.delega ? `, per delega a ${r.delega.delegato}` : ''}`).join('; ')}`
    : 'nessun avente diritto è presente';
  return [
    [f.condominio.toUpperCase()],
    ['VERBALE DI MANCATA COSTITUZIONE DELL\'ASSEMBLEA', '(da annotare nel registro dei verbali ai sensi dell\'art. 1130, n. 7, c.c.)'],
    [
      `Il giorno ${f.seduta.data} alle ore ${f.seduta.ora || VUOTO}, presso ${f.seduta.luogo || VUOTO}, era fissata l'assemblea${tipoAssemblea(f)} in ${f.convocazione} convocazione, ${convocataDa(f)}, con l'ordine del giorno riportato nell'avviso allegato.`,
      `Alle ore ${a.ora}, ${verbalizzante} constata che ${presenti}.`,
      `Non è raggiunto il quorum costitutivo previsto dall'art. 1136, ${comma}, c.c. (${soglie}).`,
      'L\'assemblea non è validamente costituita e non può deliberare.',
      f.convocazione === 'prima'
        ? 'L\'assemblea si terrà in seconda convocazione come indicato nell\'avviso.'
        : 'Gli argomenti all\'ordine del giorno dovranno essere sottoposti a una nuova assemblea, da convocare con nuovo avviso.',
      `Il presente verbale è chiuso alle ore ${f.chiusura.ora || VUOTO}.`,
    ],
    [[f.seduta.luogo, f.seduta.data].filter(Boolean).join(', '), `${f.presidente ? `${f.presidente} ` : ''}${RIGA_FIRMA}`],
    [`Allegati: avviso di convocazione${a.presenti.teste ? '; foglio presenze e deleghe' : ''}.`],
  ];
}

// Numeri dei paragrafi e degli allegati: assegnati in sequenza, i rimandi nel testo li usano.
function numerazione(f) {
  const sezioni = ['convocazione', f.convocazione === 'seconda' && 'prima', 'apertura', 'presidente', 'appello',
    f.appello && f.quorumRaggiunto && 'costituzione', 'trattazione', 'chiusura', 'lettura', 'allegati'].filter(Boolean);
  const numeri = Object.fromEntries(sezioni.map((s, i) => [s, i + 1]));
  for (const chiave of ['avviso', 'deserta', 'report', 'deleghe']) numeri[chiave] = f.allegati.find((x) => x.chiave === chiave)?.numero ?? null;
  return numeri;
}

const unisci = (blocchi) => blocchi.map((righe) => righe.filter(Boolean).join('\n')).filter(Boolean).join('\n\n');

export function componiVerbale(f) {
  if (f.appello && f.quorumRaggiunto === false) return unisci(mancataCostituzione(f));
  const numeri = numerazione(f);
  const { seduta } = f;
  const { comma, soglie } = QUORUM[f.convocazione];
  const blocchi = [
    [f.condominio.toUpperCase()],
    [`VERBALE DELL'ASSEMBLEA ${f.tipo ? `${f.tipo.toUpperCase()} ` : ''}DEI CONDOMINI`, `in ${f.convocazione} convocazione del ${seduta.data}`],
    convocazione(f, numeri),
    numeri.prima && primaConvocazione(f, numeri),
    [`${numeri.apertura}. APERTURA`, `Il giorno ${seduta.data}, alle ore ${seduta.apertura || VUOTO}, presso ${seduta.luogo || VUOTO}, si apre la seduta.`],
    [`${numeri.presidente}. PRESIDENTE E SEGRETARIO`, `L'assemblea nomina Presidente ${f.presidente || RIGA_FIRMA} e Segretario ${f.segretario || RIGA_FIRMA}, che accettano.`],
    appello(f, numeri),
    numeri.costituzione && [`${numeri.costituzione}. COSTITUZIONE`,
      `Il Presidente, constatato che sono presenti, di persona o per delega, ${condomini(f.appello.presenti.teste)} su ${f.appello.aventiDiritto.teste}, che rappresentano ${f.appello.presenti.millesimi}/1000 del valore dell'edificio, e che è quindi raggiunto il quorum previsto dall'art. 1136, ${comma}, c.c. (${soglie}), dichiara l'assemblea validamente costituita e atta a deliberare sugli argomenti all'ordine del giorno.`],
    [`${numeri.trattazione}. TRATTAZIONE DEI PUNTI ALL'ORDINE DEL GIORNO`],
    ...f.punti.flatMap((p) => punto(p, f, numeri)),
    f.movimentiFinali.length && variazioni(f.movimentiFinali, f.punti.some((p) => p.votazione?.chiusa) ? DOPO.votazione : DOPO.appello),
    [`${numeri.chiusura}. CHIUSURA DEI LAVORI`,
      `Esaurita la trattazione dei punti all'ordine del giorno alle ore ${VUOTO}, risultano presenti ${condomini(f.chiusura.teste)} per ${f.chiusura.millesimi}/1000.`],
    [
      `${numeri.lettura}. LETTURA E APPROVAZIONE DEL VERBALE`,
      'Il presente verbale, con gli allegati elencati di seguito, è letto ai presenti.',
      `Il report allegato n. ${numeri.report} (foglio presenze con orari di ingresso e di uscita, elenco delle deleghe, quorum costitutivo, presenti e votazioni nominative per ciascun punto, con teste e millesimi) costituisce parte integrante del presente verbale ed è sottoscritto insieme a esso.`,
      `Il Presidente dichiara chiusa l'assemblea alle ore ${f.chiusura.ora || VUOTO}.`,
    ],
    ['Letto, confermato e sottoscritto.'],
    [[seduta.luogo, seduta.data].filter(Boolean).join(', ')],
    [`Il Presidente ${f.presidente ? `${f.presidente} ` : ''}${RIGA_FIRMA}`, `Il Segretario ${f.segretario ? `${f.segretario} ` : ''}${RIGA_FIRMA}`],
    [`${numeri.allegati}. ELENCO DEGLI ALLEGATI`, ...f.allegati.map((x) => `${x.numero}. ${x.descrizione}`)],
  ];
  return unisci(blocchi.filter(Array.isArray));
}
