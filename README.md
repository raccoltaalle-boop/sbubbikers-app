# 🚴 SBUBBIKERS — app della squadra

App installabile (PWA) per **Android, iPhone e PC**: uscite in bici, avvisi ai soci, divise (catalogo e prenotazioni), convenzioni.
Accesso solo su **invito personale**, nessuna registrazione. Un **bot Telegram** pubblica le uscite e gli avvisi sul canale.

**Costo: 0 €** — GitHub Pages (hosting) + Supabase piano Free (database) + Telegram Bot API.

```
web/                    → l'app (va su GitHub Pages)
  js/config.js          → ⚙️ l'UNICO file da modificare
supabase/schema.sql     → database + permessi (da eseguire una volta)
supabase/functions/telegram/index.ts → il bot
supabase/telegram-setup.sql          → collega database ↔ bot + riepiloghi automatici
.github/workflows/      → pubblicazione automatica + "tieni sveglio" Supabase
```

> Con `SUPABASE_URL` vuoto in `config.js` l'app parte in **modalità demo** (codice `DEMO2026`, dati finti salvati solo sul dispositivo). Utile per provarla prima di configurare tutto.

---

## 1. GitHub: pubblicare l'app

1. Crea un account su github.com (se non ce l'hai) e un **nuovo repository**, es. `sbubbikers-app` (pubblico: GitHub Pages gratis richiede repository pubblico. Non contiene segreti, vedi "Sicurezza").
2. Carica tutti i file di questa cartella. Il modo più semplice è **GitHub Desktop**. Se usi il caricamento dal browser, la cartella nascosta `.github` potrebbe non essere vista dal Mac/Windows: in quel caso creala con *Add file → Create new file* scrivendo come nome `.github/workflows/deploy.yml` e incollando il contenuto.
3. *Settings → Pages → Build and deployment → Source:* **GitHub Actions**.
4. Dopo un minuto l'app è online su `https://TUONOME.github.io/sbubbikers-app/` (in demo).

### Dominio app.sbubbikers.com
1. Nel pannello DNS del registrar di `sbubbikers.com` aggiungi:
   `CNAME` · nome `app` · valore `TUONOME.github.io`
2. *Settings → Pages → Custom domain:* `app.sbubbikers.com` → Save, poi spunta **Enforce HTTPS** (può servire qualche ora).
   Il file `web/CNAME` contiene già il dominio.

## 2. Supabase: il database

1. Crea un account su supabase.com → **New project** (regione: *Central EU – Frankfurt*). Annota la password del database.
2. *SQL Editor → New query*: incolla tutto `supabase/schema.sql` → **Run**.
3. *Authentication → Sign In / Providers*: attiva **Allow anonymous sign-ins** (serve per l'accesso con codice).
4. **Crea il primo admin (tu)**: nel SQL Editor esegui il blocco in fondo a `schema.sql` (togli i `--`, metti nome e cognome). Nel risultato compare il tuo **codice**.
5. *Project Settings → API*: copia **Project URL** e chiave **anon public** in `web/js/config.js`. Compila anche `TELEGRAM_CHANNEL_URL`. Fai commit: l'app si ripubblica da sola.
6. Apri `https://app.sbubbikers.com/?i=TUOCODICE` → sei dentro come admin.

### Divise
Le gestiscono gli admin dall'app: *Divise → Gestione → + Aggiungi un capo* (foto, prezzo, taglie; "su ordinazione" con data di chiusura oppure "a magazzino" con i pezzi per taglia). Le foto finiscono nella cartella pubblica `divise` di Supabase Storage, creata da `schema.sql`. La prenotazione di un capo a magazzino scala i pezzi in modo sicuro (due soci non possono prendere l'ultimo pezzo insieme).
Da personalizzare in `web/js/app.js`: IBAN e causale nella sezione "Come pagare" (cerca `IBAN`) e la tabella misure (`GUIDA_TAGLIE`).

### Luoghi e tipi di bici
Si cambiano da *Table Editor → luoghi / tipi_bici*. I luoghi d'esempio vanno sostituiti con i vostri; il campo `ordine` decide l'ordine nel menu. I soci possono aggiungere nuovi luoghi quando creano un'uscita; gli admin li rinominano/eliminano da *Profilo*.

## 3. Telegram: il bot

1. In Telegram scrivi a **@BotFather** → `/newbot` → scegli nome (es. *SBUBBIKERS Bot*) e username → ricevi il **token**. Non condividerlo.
2. Aggiungi il bot come **amministratore del canale** con i permessi *Pubblica messaggi*, *Modifica messaggi*, *Elimina messaggi*.
3. **ID del canale**:
   - canale pubblico → usa `@nomecanale`;
   - canale privato → apri il canale su **web.telegram.org/k/**: nell'indirizzo compare `#-123456789`; l'ID è `-100` seguito da quel numero senza il meno (es. `-100123456789`).
   - Vuoi pubblicare in un **topic** di un gruppo invece che in un canale? Usa l'ID del gruppo e metti in `TELEGRAM_THREAD_ID` il numero del topic (è nel link di un messaggio del topic).

### Pubblicare la funzione
1. Supabase → *Edge Functions → Deploy a new function → Via Editor*. Nome: **`telegram`**. Incolla `supabase/functions/telegram/index.ts` → **Deploy**.
2. Nei dettagli della funzione disattiva **Verify JWT** (la funzione si protegge da sola con `WEBHOOK_SECRET`).
3. *Edge Functions → Secrets*, aggiungi:

| Nome | Valore |
|---|---|
| `TELEGRAM_BOT_TOKEN` | token di BotFather |
| `TELEGRAM_CHAT_ID` | `@nomecanale` oppure `-100…` |
| `WEBHOOK_SECRET` | una password lunga inventata (es. 30 caratteri a caso) |
| `APP_URL` | `https://app.sbubbikers.com` |
| `TELEGRAM_THREAD_ID` | *(solo se pubblichi in un topic)* |

### Collegare database e bot
1. *Database → Extensions*: abilita **pg_net** e **pg_cron**.
2. *Database → Webhooks*: se richiesto, clicca **Enable webhooks** (crea lo schema `supabase_functions`).
3. Apri `supabase/telegram-setup.sql`, sostituisci `TUO-PROGETTO` e `TUO-SEGRETO`, eseguilo nel SQL Editor.
4. Esegui la query di prova in fondo al file: sul canale deve arrivare **"✅ Bot SBUBBIKERS collegato!"**.

Da qui in poi, automaticamente:
- nuova uscita → post sul canale con pulsante **🚴 Partecipo**
- qualcuno aderisce o si ritira → il post si **aggiorna** con l'elenco partecipanti
- uscita annullata → il post viene barrato con **❌ ANNULLATA**
- nuovo avviso (con la spunta "Pubblica su Telegram") → post sul canale
- ogni sera, se l'indomani ci sono uscite → **"🌙 Domani si pedala!"**
- il giovedì, se ci sono uscite nel weekend → **"📅 Il weekend in bici"**

## 4. Tenere sveglio Supabase
Il piano Free mette in pausa il progetto dopo 7 giorni senza attività. Nel repository GitHub:
*Settings → Secrets and variables → Actions → New repository secret*: `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
Il workflow `keepalive` fa un controllo ogni 3 giorni. Puoi lanciarlo a mano da *Actions* per verificare.

## 5. Invitare i soci
App → **Profilo → + Invita un socio** → nome e cognome → **Invia…** (WhatsApp/Telegram) oppure **Copia messaggio**.
Il socio apre il link, tocca **Entra** e c'è. Ogni codice vale per massimo **3 dispositivi**.
- Telefono perso / codice girato ad altri → *Gestisci → Rigenera* (scollega tutti i suoi dispositivi).
- Socio che lascia la squadra → *Gestisci → Disattiva*.

**iPhone:** l'app installata sulla Home non condivide i dati con Safari, quindi alla prima apertura dall'icona chiede di nuovo il codice. Per questo il codice è nel messaggio d'invito e nella pagina Profilo.

---

## Sicurezza (in breve)
- Nel repository pubblico c'è solo la chiave **anon**, pubblica per natura. Tutti i permessi sono nel database (Row Level Security): senza un invito valido non si vede nulla; solo gli admin vedono i codici, creano soci e pubblicano avvisi/convenzioni; ognuno può annullare solo le proprie uscite.
- Token del bot e `WEBHOOK_SECRET` stanno **solo** nei Secrets di Supabase, mai nel codice.
- I codici d'invito hanno 8 caratteri (oltre mille miliardi di combinazioni) e ogni tentativo errato è rallentato.

## Limiti del piano gratuito (indicativi)
Supabase Free: 500 MB di database, 50.000 utenti attivi/mese, 2 progetti. Per una squadra sono margini enormi: un anno di uscite occupa pochi MB.

## Idee per la fase 2
Notifiche push dell'app (oltre a Telegram) · foto nelle convenzioni · statistiche "km di squadra del mese" · modifica di un'uscita già pubblicata · Mini App Telegram.
