# Confronto con il programma originale

Queste fixture contengono **incontri storici**, non classifiche certificate.
`132.json`: 10 partecipanti, 4 turni, nessun bye; un partecipante perde quattro incontri.
`134.json`: 7 partecipanti, 3 turni, un bye per turno. Nessun ritiro nei due casi.

Le 40 e 24 righe Access vengono unite rispettivamente in 20 incontri e in 9 incontri più 3 bye.
Ogni incontro conserva le due righe originali con identificativi anonimizzati. `Placement`
vale 1/2 e indica il posto nel pairing, **non la posizione in classifica**. `Rnk` è zero.
L'eseguibile non è stato usato per generare valori attesi.

## Rigenerare gli incontri

Da `mantis-clone`:

```bash
npm run legacy:prepare
```

Richiede `mdb-export` (viene riconosciuta anche l'installazione locale `.mdbtools-local`).
La lettura di `Mantis/Mantis.mdb` è in sola lettura. L'adattatore controlla iscrizioni,
turni completi, reciprocità, punteggi, posti, tavoli e partecipanti ripetuti; accetta
esclusivamente il marcatore `BYE` come partecipante esterno alle iscrizioni.
La corrispondenza tra ID originali e alias `P01…` è in `.legacy-local/*.identities.json`,
esclusa da Git. Gli alias seguono l'ordinamento degli ID originali, non quello dei nomi.
Lo SHA256 del database sorgente identifica esattamente l'archivio usato.

## Ottenere i riferimenti su Windows

1. Copiare l'intera cartella `Mantis` su un ambiente Windows compatibile. Usare una
   copia del database, conservando l'originale. I tornei sorgenti hanno ID 132 e 134;
   la mappa locale degli alias permette di riconoscerne i partecipanti senza pubblicarne i nomi.
2. Aprire ciascun torneo senza rigenerare pairing o modificare risultati. Nel menu
   Tournament usare **Export XML Standings** e **Export HTML Standings**.
   Il manuale `Mantis/Documents/en/instructions.htm`, sezione “Exporting HTML and XML
   Standings and Pairings”, descrive un XML con tutti i turni e HTML separati per turno.
3. Copiare subito gli export di ciascun torneo in una cartella separata: il legacy
   sovrascrive le directory `XMLExport`/`HTMLExport` alla successiva esportazione.
   Conservare anche gli HTML degli abbinamenti. Non sovrascrivere gli export originali.
4. Verificare che siano presenti **tutte le classifiche**: quattro da 10 righe per 132,
   tre da 7 righe per 134. Confermare vincitori e destinatari dei bye contro le fixture.
   Se gli export non contengono i campi necessari, raccoglierli dall'interfaccia/report
   originali e documentare la provenienza; finché manca un campo, non importare valori stimati.

## Trascrivere e importare le classifiche

Il formato XML effettivo non è ancora disponibile: non viene inventato un parser per
uno schema sconosciuto. Si usa una trascrizione JSON esplicita e validata, mantenendo
i file originali come evidenza. Dopo il primo export, un parser automatico potrà
sostituire la trascrizione senza cambiare il formato delle fixture.

```bash
npm run legacy:reference -- template 132 /tmp/132-reference.json
npm run legacy:reference -- template 134 /tmp/134-reference.json
```

Compilare ogni JSON usando **solo l'output legacy**:

- `capturedAt`: data ISO dell'esportazione.
- `semantics.points`: significato e unità dei punti mostrati dal legacy;
  `semantics.results`: significato dei campi che identificano vittoria/sconfitta e bye.
- `evidence`: nomi dei file XML/HTML originali; modificare i nomi proposti dal template
  per usare quelli reali. `sha256` può restare vuoto: viene calcolato durante l'importazione.
- `rounds[].evidence`: XML e HTML di riferimento per quel turno.
- `rounds[].standings`: righe **nell'ordine legacy**, con alias, posizione, punti,
  T1, T2 e T3 numerici. Riordinare le righe del template secondo la classifica esportata.
  Non aggiungere criteri arbitrari per ordinare giocatori a pari merito.

Non moltiplicare i punti per farli coincidere con il clone. Una differenza di scala
è uno scostamento da registrare. Le fixture mantengono `legacyRows.matchPts` come dato
grezzo: non è usato come punteggio di classifica. I valori 1/0 e 0/1 dei due archivi
sono usati solo per identificare il vincitore; il clone tramite UI registra 2/0 o 0/2.
La suite verifica questi ultimi come comportamento del clone, senza certificarne
l'equivalenza ai game score del legacy.

```bash
npm run legacy:reference -- import 132 /tmp/132-reference.json /percorso/export-132
npm run legacy:reference -- import 134 /tmp/134-reference.json /percorso/export-134
```

L'importatore controlla tutti i turni e partecipanti, posizioni, interi e provenienza;
calcola gli hash degli export e ne archivia copie in `.legacy-local/exports/` (non Git).
Salva `132.reference.json` e `134.reference.json` qui, pronti per il versionamento.
I riferimenti non vengono mai generati da `calculateStandings`. La trascrizione deve
essere verificata contro XML/HTML; l'hash certifica il file, non l'accuratezza della trascrizione.

## Eseguire i confronti

```bash
npm run test:standings
npm run test:legacy:tools
npm run test:legacy
npm run db:generate
npx playwright install chromium
npm run test:legacy:ui
```

`test:legacy` confronta le sette classifiche calcolate con i riferimenti indipendenti.
`test:legacy:tools` verifica l'adattatore, la validazione e la capacità di segnalare
valori alterati, giocatori mancanti e differenze nell'ordine dei pari merito.

La prova UI richiede `prisma/test.db` (preparabile con `npm run db:test:prepare`) e
Playwright/Chromium. Apre un browser visibile; per CI senza display si può impostare
`MANTIS_LEGACY_HEADLESS=1 npm run test:legacy:ui`.
Crea un backup SQLite coerente e privato in una directory temporanea, elimina i dati
personali **soltanto nella copia temporanea**, poi crea entrambi i tornei tramite UI.
Anche la build Next è temporanea: non usa `.next` e non riutilizza server già aperti.
Non carica `.env` nel workspace temporaneo. La copia viene rimossa a fine prova.
Prima di scrivere, il runner verifica il percorso SQLite della propria connessione,
rifiuta un client Prisma generato con URL fisso e controlla che un marcatore creato
soltanto nella copia temporanea sia leggibile dall'applicazione. Confronta inoltre
le impronte logiche di `dev.db` e `test.db` prima/dopo il replay: modifiche concorrenti
esterne vengono riportate come differenze e richiedono una nuova prova senza scritture esterne.

Vengono verificati risultati e bye, classifiche calcolate/salvate/visualizzate, turno
ancora aperto, ricaricamento, navigazione storica, chiusura e riavvio del server.
Gli abbinamenti vengono ricostruiti manualmente; non si confronta il generatore Swiss.
La suite registra inoltre se il popup impedisce il secondo split quando il pool è attivo:
per completare comunque il replay, predispone le conferme in schede separate.

I rapporti JSON/Markdown, log e screenshot sono in `test-results/legacy/` (non Git).
I JSON mantengono le classifiche osservate anche quando mancano i riferimenti.
I livelli `stored-v-calculation`, `ui-v-stored`, `previous-standings` e `reload`
verificano coerenza interna, **non la parità con il legacy**.

Codici di uscita: **0 PASS**, **1 FAIL**, **2 BLOCKED**. Un errore prevale sui blocchi;
il dettaglio dei singoli confronti resta nel rapporto. Senza export legacy le verifiche
di parità rimangono BLOCKED, anche se il replay e i controlli interni passano.
