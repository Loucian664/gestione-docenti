# Gestione Docenti – Rombiolo

Istruzioni per qualsiasi assistente di programmazione (Codex, Gemini, Cursor e altri). Claude Code legge
`CLAUDE.md`, con le stesse regole: leggilo anche tu, vale per tutti.

App del responsabile di plesso della scuola secondaria di I grado di Rombiolo: orario, assenze, sostituzioni,
report. Sito statico: https://loucian664.github.io/gestione-docenti/ (pubblicato da `.github/workflows/pages.yml` a
ogni push su `main`); i dati restano nel browser e si spostano con il backup JSON. L'app per più sedi è un'altra
repository (`Loucian664/gestione-docenti-multisede`).

## Calcolo lungo dell'orario

Se il messaggio dell'utente inizia con «Calcolo lungo dell’orario», segui `CALCOLO-LUNGO.md`.

## Regole

- L'utente non programma: rispondi in italiano, parlando dell'app (schermate, tasti, dati), non di comandi o file,
  salvo richiesta. Rileggi le risposte e correggi errori di calcolo e di grammatica prima di inviarle.
- Per le modifiche, prima si discute: proponi, aspetta l'OK. Una domanda dell'utente non è un OK.
- Su GitHub (commit, push, richieste di unione) solo con l'OK esplicito dell'utente.
- I backup JSON dell'utente e le sue schermate contengono nomi veri di colleghi: usali solo nella tua cartella di
  lavoro. Mai in commit, test, anteprime pubbliche o messaggi su GitHub.
- Test: `npx tsx --test src/lib/*.test.ts`; controllo dei tipi: `npx tsc --noEmit -p .`.
- Il sito non usa server, database né login: i resti del modello iniziale (Grok Build) sono stati tolti, non
  rimetterli.
