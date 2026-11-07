# Gestione Docenti – Rombiolo

App del responsabile di plesso della scuola secondaria di I grado di Rombiolo: orario, assenze, sostituzioni,
report. Sito: https://loucian664.github.io/gestione-docenti/ (pubblicato da `.github/workflows/pages.yml` a ogni
push su `main`). L'app per più sedi è un'altra repository (`Loucian664/gestione-docenti-multisede`).

## Come lavorare

- L'utente non programma: rispondi in italiano, parlando dell'app (schermate, tasti, dati), non di comandi o
  file, salvo richiesta. Rileggi le risposte e correggi errori di calcolo e di grammatica prima di inviarle.
- Per le modifiche, prima si discute: proponi, aspetta l'OK. Una domanda dell'utente non è un OK.
- Su GitHub solo con l'OK esplicito dell'utente.
- `AGENTS.md` ha le stesse regole per gli altri assistenti (Codex, Gemini…): se cambi una regola qui, cambiala anche lì.
- Test: `npx tsx --test src/lib/*.test.ts`; controllo dei tipi: `npx tsc --noEmit -p .`.

## Nomi veri: mai pubblicarli

I backup JSON dell'utente e le sue schermate contengono nomi veri di colleghi: usali solo nella cartella
temporanea della sessione. Mai in commit, test, anteprime pubbliche o messaggi su GitHub.

## Calcolo lungo dell'orario

Se il messaggio dell'utente inizia con «Calcolo lungo dell’orario», segui `CALCOLO-LUNGO.md`: istruzioni valide per
qualsiasi assistente, con le regole (mai un orario scritto a mano, backup con nomi veri solo nella cartella
temporanea, niente modifiche al codice né pubblicazioni) e le opzioni del programma. In questo ambiente: avvia il
comando in background con un timeout pari alla durata più 15 minuti (al massimo 2 ore) e attendi la notifica di fine.
