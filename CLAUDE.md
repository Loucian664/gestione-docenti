# Gestione Docenti – Rombiolo

App del responsabile di plesso della scuola secondaria di I grado di Rombiolo: orario, assenze, sostituzioni,
report. Sito: https://loucian664.github.io/gestione-docenti/ (pubblicato da `.github/workflows/pages.yml` a ogni
push su `main`). L'app per più sedi è un'altra repository (`Loucian664/gestione-docenti-multisede`).

## Come lavorare

- L'utente non programma: rispondi in italiano, parlando dell'app (schermate, tasti, dati), non di comandi o
  file, salvo richiesta. Rileggi le risposte e correggi errori di calcolo e di grammatica prima di inviarle.
- Per le modifiche, prima si discute: proponi, aspetta l'OK. Una domanda dell'utente non è un OK.
- Su GitHub solo con l'OK esplicito dell'utente.
- `AGENTS.md` è il contratto di un'altra piattaforma (Grok): qui non vale.
- Test: `npx tsx --test src/lib/*.test.ts`; controllo dei tipi: `npx tsc --noEmit -p .`.

## Nomi veri: mai pubblicarli

I backup JSON dell'utente e le sue schermate contengono nomi veri di colleghi: usali solo nella cartella
temporanea della sessione. Mai in commit, test, anteprime pubbliche o messaggi su GitHub.

## Calcolo lungo dell'orario

L'utente (o chi usa l'app) prepara la richiesta in Orario → Costruisci → «Calcolo lungo con Claude Code»: l'app
salva il backup e copia un messaggio che inizia con «Calcolo lungo dell’orario.» e dice partenza, slot e durata.
Lo stesso motore di «Proponi orario» gira molto più a lungo e le versioni migliori, diverse tra loro, tornano negli
slot scelti dentro il backup.

1. Il backup allegato contiene nomi veri: copialo nella cartella temporanea della sessione, mai nella repository.
2. Dal messaggio: partenza («da zero» → `--modo da-zero`, «migliora l’orario attuale» → `--modo migliora`),
   slot (`--slot 3,4,5`), slot occupati da sostituire, quelli con «(sostituisce «…»)» (`--sostituisci 4`), durata
   in minuti (`--minuti`). Se il messaggio manca o è incompleto, chiedi all'utente queste tre cose.
3. Se manca `node_modules`, `npm ci`. Poi avvia in background (comando in background con timeout pari alla durata
   più 15 minuti, al massimo 2 ore):
   `node scripts/calcolo-lungo.mjs --backup <backup> --modo da-zero --slot 3,4,5 --minuti 60 --uscita <backup-calcolo-lungo.json>`
   Opzioni: `--corsa <secondi>` (durata di ogni corsa del motore, 120), `--processi <n>` (processori meno uno).
4. Se il programma si rifiuta (slot occupato non da sostituire, slot in uso, materie senza docente…), spiega il
   motivo all'utente con parole sue e chiedi come procedere: non forzare.
5. Alla fine manda all'utente il backup di uscita come file, con un riepilogo in parole semplici: per ogni slot le
   ore buche e le eventuali voci da sistemare, a confronto con l'orario attuale (il programma le stampa). Le
   versioni sono in ordine di valutazione complessiva dell'app, non solo di ore buche.
6. Ricorda all'utente: Impostazioni → Importa backup. Se nel frattempo ha segnato assenze o sostituzioni, l'app
   avvisa che il backup è più vecchio: in quel caso meglio non importarlo e rifare il calcolo da un backup nuovo.
7. Per il calcolo non si modifica il codice e non si pubblica nulla.

Il programma: `scripts/calcolo-lungo.mjs` (compila e avvia), `scripts/calcolo-lungo-run.ts` (processi),
`src/lib/calcolo-lungo.ts` (richiesta, versioni, backup; con i test). Il riquadro dell'app:
`src/components/calcolo-lungo.tsx`.
