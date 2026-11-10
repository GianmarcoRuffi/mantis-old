# Esito del confronto — 10 novembre 2026

**La coincidenza con il legacy non è ancora certificabile:** mancano gli export
XML/HTML delle classifiche originali. Le fixture contengono incontri autentici;
nessuna classifica attesa è stata ricavata dal clone.

## Verifiche eseguite

| Verifica | Esito |
|---|---|
| Adattatore Access e strumenti di confronto | 13 test passati: 5 Python, 8 Node |
| Formule di classifica già presenti | 3 test passati |
| TypeScript | `npx tsc --noEmit --incremental false` passato |
| Confronto delle sette classifiche con il legacy | 7 BLOCKED, uscita 2 |
| Replay UI completo di 132 e 134 | 7 turni, 61 righe giocatore-turno; completati anche storico e riavvio |
| Coerenza fra calcolo, database e classifica visualizzata | Nessuna differenza nei due casi |
| Risultati, destinatari dei bye, turno parziale e ricaricamento | Controlli passati |
| Isolamento nell'esecuzione completa | Marcatore nella copia dedicata e impronte logiche dei database originali: PASS |

Il rapporto UI contiene **117 PASS, 7 FAIL, 63 BLOCKED**. I 63 blocchi sono i
confronti con il riferimento legacy per sette turni, tre livelli (calcolo, dati
persistiti, UI) e tre fasi (fine turno, storico, dopo riavvio). Non sono sette
classifiche legacy verificate: restano riferimenti assenti.

L'uscita UI è **1 (FAIL)** per il problema del popup descritto sotto. L'assenza dei
riferimenti resta comunque visibile come BLOCKED nei singoli controlli.
Rapporti dettagliati e classifiche osservate: [calcolo](../../../test-results/legacy/calculation.md),
[interfaccia](../../../test-results/legacy/ui.md) e relativi JSON nella stessa cartella.
Questi artefatti locali sono esclusi da Git e si rigenerano eseguendo i comandi della guida.

## Problema riprodotto: secondo split con pool manuale attivo

1. Avviare un turno con almeno due incontri.
2. Aprire “Split pairing” sul primo incontro e confermare.
3. Aprire “Split pairing” su un altro incontro ancora abbinato.
4. Il popup mostra il pool già attivo, ma non “Conferma Split” per l'incontro scelto.

La condizione del popup mostra la conferma soltanto quando non ci sono giocatori
nel pool. Il problema si ripete in tutti e sette i turni. Evidenze visive:
[torneo 132](../../../test-results/legacy/132-manual-pool.png),
[torneo 134](../../../test-results/legacy/134-manual-pool.png).

Per completare il confronto, la suite apre le conferme in schede separate prima
del primo split e poi esegue le azioni una alla volta. Questo permette di usare le
azioni UI esistenti e rende esplicito il limite dell'interfaccia. Non sono state
corrette le regole o le funzioni dell'applicazione.

## Isolamento e ripristino durante lo sviluppo

Il client Prisma preesistente era stato generato con `file:./dev.db` fisso, mentre
lo schema corrente usa `DATABASE_URL`. Nei primi tentativi ciò ha creato per errore
tre tornei di prova e venti giocatori nel database principale. Queste sole righe,
identificate dagli ID creati dalla suite e verificate prive di incontri, classifiche
o checkpoint, sono state rimosse in una transazione insieme alle venti iscrizioni.
Il database è tornato a 373 giocatori, un torneo, 40 iscrizioni, 60 incontri,
80 righe Standing e 46 checkpoint. Le righe applicative preesistenti non sono state modificate.

Il client è stato rigenerato. Il runner ora rifiuta un client con URL fisso, verifica
il percorso SQLite effettivo prima della pulizia della copia, controlla un marcatore
leggibile esclusivamente dal database temporaneo prima di scrivere tramite UI e
confronta le impronte logiche di `dev.db` e `test.db` prima/dopo. Database, sorgenti
copiate e build del runner vengono rimossi a fine esecuzione; il server sulla porta
3000 viene lasciato in esecuzione.

## Passo necessario per completare la certificazione

Esportare su Windows le sette classifiche dei tornei 132/134, trascriverle e importarle
con la [procedura documentata](README.md), quindi ripetere `test:legacy` e
`test:legacy:ui`. Vanno preservati valori numerici e ordine originali, anche nei pari
merito. Le differenze di punti, spareggi o posizioni diventeranno FAIL dettagliati;
la suite non modifica valori attesi o applicazione per ottenere un risultato positivo.
