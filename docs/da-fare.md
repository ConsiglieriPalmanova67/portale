# Cose da fare — portale Condominio Palmanova 67

Elenco delle attività sul portale, separato dal lavoro in corso. Si aggiunge una voce alla volta; quando una è fatta
si sposta in fondo, in «Fatte», con la data.

## Da fare

1. **To-do collegati ai documenti** — da ogni to-do poter collegare uno o più documenti dell'archivio che riguardano
   quel punto (preventivi, relazioni, fatture, verbale da cui nasce), e vederli/aprirli dalla riga del to-do.

2. **Format del verbale di assemblea** — definire un modello di verbale (intestazione, costituzione dell'assemblea,
   capitoli per punto all'ordine del giorno, paragrafi, corpo della delibera con votazione, allegati), partendo da
   modelli esistenti online, e farlo generare dal portale a partire dai dati della seduta.
   _Stato 19/10/2026: il modello è definito in [verbale-modello.md](verbale-modello.md) (struttura, testo da compilare,
   maggioranze, checklist, fonti verificate); resta da farlo generare dal portale (sezione 7 del modello)._

3. _(da definire)_

4. **Prova della convocazione di ciascun condomino** — oggi il verbale riporta solo la dichiarazione che tutti gli aventi
   diritto sono stati convocati e che il presidente lo ha verificato (art. 1136, sesto comma, c.c.). Da impostare una prova
   effettiva per ogni condomino: mezzo di invio dell'avviso (raccomandata, PEC, consegna a mano con firma), data di ricezione
   (almeno 5 giorni prima della prima convocazione, art. 66 disp. att. c.c.), ricevuta in archivio, avviso nel portale per chi
   non risulta convocato in tempo e prospetto da allegare al verbale. Collegato al punto 2.

5. **Grafico delle votazioni da proiettare in sala** — per il punto in votazione: due barre (teste e millesimi) con la
   soglia richiesta tratteggiata, la parte degli assenti visibile nei millesimi, l'esito grande a votazione chiusa e la
   striscia dei punti all'ordine del giorno con il loro stato. Tasto «Proietta» dalla scheda Votazioni. Bozza vista il
   19/10/2026; da riprendere dopo l'assemblea del 20/10.

6. **Profili di accesso: consiglieri e condomini** — i consiglieri come oggi (tutto, in modifica); i condomini in sola
   lettura su una parte dei contenuti. Si fa tutto in Supabase (account su invito, ruolo per utente, regole del database
   per ruolo): il sito su GitHub Pages resta uno solo. Da decidere: cosa vede un condomino (mai recapiti, morosità e
   posizioni degli altri: limiti del Garante privacy), come si invitano, informativa privacy con l'amministratore.
   _Progetto: [superpowers/specs/2026-10-19-profili-accesso-design.md](superpowers/specs/2026-10-19-profili-accesso-design.md)._

## Emerse in precedenza

- Rafforzamenti emersi dalla verifica di sicurezza del 19/10/2026 (nessuno blocca la pubblicazione):
  librerie (supabase-js, pdf.js, pdf-lib) copiate nel repository e Content-Security-Policy in index.html; tabella
  consiglieri modificabile solo con traccia e senza toccare il proprio mandato; is_consigliere() che controlla anche
  l'inizio del mandato; trigger di audit che non lascia riscrivere creato_da/creato_il; «Esci» che avvisa se fallisce;
  recupero password con flusso PKCE; tetto di spesa per la lettura dei PDF; tipi di file ammessi nei bucket.
  Da tenere: su Supabase registrazione libera chiusa e Redirect URLs senza asterischi; nessun altro sito GitHub Pages
  sull'account del consiglio.
- Pubblicazione online (GitHub Pages o alternativa) quando l'account GitHub è sbloccato; nel repository pubblico solo
  il codice, mai dati reali.
- Unire il ramo `feat/assemblea` in `main` dopo la prova generale con i dati veri.
- Prova generale dell'assemblea del 20/10/2026 con i dati veri.
- Regole di voto: aggiungere le altre regole per argomento, una alla volta (oggi c'è solo nomina/revoca
  dell'amministratore, art. 1136 c. 4 c.c.).
- Fatture e documenti di spesa da miocondominio.eu (file XML della fattura elettronica): importarli per avere le spese
  per fornitore.
- Assemblee da completare: straordinarie del 14/12/2021, 08/05/2023, 18/11/2025 e quelle 2014–2020 (dall'elenco degli
  avvisi di miocondominio.eu).
- Verbali mancanti da chiedere all'amministratore: 28/09/2021, 17/05/2022, 27/04/2023 (non sono su miocondominio.eu:
  il «VERBALE.pdf» del 2023 lì presente è quello del 03/04/2023, rinviata).
- Piano e interno delle unità (oggi vuoti per tutte).
- Email ancora da associare ai condomini (4 indirizzi incerti).

## Fatte

- _(nessuna ancora)_
