# Mantis Clone

Mantis Clone è l’applicazione web locale, basata su Next.js e SQLite, con Prisma per il database.

## Preparazione su Ubuntu

Requisiti: Node.js/npm e Python 3 (con il modulo SQLite incluso nella distribuzione standard).

```bash
npm ci
test -f .env || cp .env.example .env
npm run db:generate
npm run db:migrate
```

`DATABASE_URL` imposta il database principale e per impostazione iniziale punta a `prisma/dev.db`. Se il progetto contiene già un `.env`, i comandi ne conservano le impostazioni.

## Preparare il database di test

```bash
npm run db:test:prepare
```

Il comando crea `prisma/test.db` con un backup SQLite coerente anche mentre il database principale è in uso. Verifica l’integrità, le chiavi esterne e lo stato delle migrazioni. Non esegue il seed e non sovrascrive una copia di test che esiste già. Una copia incompleta viene eliminata in caso di errore.

## Avviare l’applicazione sui dati di test

```bash
npm run dev:test
```

Apri <http://127.0.0.1:3000>. Il comando usa esclusivamente `prisma/test.db` e accetta connessioni solo da Ubuntu locale. Premi `Ctrl+C` per arrestare il server.

Per avviare la versione ottimizzata, esegui `npm run build` e poi `npm run start:test`.
Se la porta predefinita è occupata, puoi sceglierne una libera: `MANTIS_TEST_PORT=3001 npm run dev:test`.

Le modifiche effettuate dal server rimangono nella copia di test anche dopo l’arresto e il riavvio. Ferma il server prima di ricrearla:

```bash
rm prisma/test.db
npm run db:test:prepare
```

Il comando di preparazione si ferma se la copia esiste. La rimozione esplicita cancella **solo la copia di test** e ne consente la ricreazione dal database principale.

## Spareggi della classifica

- **T1:** somma delle differenze tra vittorie e sconfitte degli avversari incontrati. Il contributo di ogni singolo avversario è limitato a un minimo di −3; il totale T1 può essere inferiore a −3.
- **T2:** somma dei T1 degli avversari incontrati.
- **T3:** somma dei quadrati dei numeri dei turni persi. Per esempio, sconfitte ai turni 2 e 5 danno `2² + 5² = 29`.

I valori si calcolano sui risultati disponibili fino al turno considerato. Per verificare le formule: `npm run test:standings`.

## Analisi preliminare

La directory `Mantis` contiene il programma Windows e il database Access originari, senza i sorgenti dell’applicazione. L’importatore disponibile porta nel clone i giocatori locali, ma non i tornei e gli incontri storici. La build web e le pagine principali sono state verificate su Ubuntu.

Prima di usare il clone in un torneo reale, considera questi punti ancora da specificare o correggere:

- i criteri Swiss possono produrre ripetizioni anche quando esiste un abbinamento alternativo; non viene tracciata l’assegnazione dei bye;
- è disponibile l’eliminazione singola nell’interfaccia, ma gli abbinamenti applicano ancora il sistema Swiss;
- i risultati si inseriscono come vittoria 2–0 o sconfitta 0–2, senza punteggi parziali o pareggi;
- l’eliminazione di un giocatore rimuove dati collegati ai tornei conclusi e ne altera lo storico;
- il seed rimuove i dati prima di completare e validare l’importazione;
- i checkpoint manuali e il ripristino del torneo hanno comportamenti da verificare;
- alcune operazioni validano lo stato prima di aprire la transazione, con un possibile problema in caso di richieste simultanee;
- ricerca ed elenchi caricano tutti i giocatori; la dashboard può mostrare contatori non aggiornati dopo una modifica.

L’implementazione delle regole di torneo e l’aggiornamento delle dipendenze sono fuori da questa preparazione. Il progetto usa Next.js 14, una versione non più supportata; prima di esporre l’applicazione in rete occorre pianificare un aggiornamento. La verifica dell’audit npm ha inoltre segnalato vulnerabilità nelle dipendenze, incluso un avviso DoS per applicazioni con Server Actions: il numero totale dell’audit non implica che ogni problema sia raggiungibile in questo progetto.
