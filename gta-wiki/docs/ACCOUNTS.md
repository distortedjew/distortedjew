# Account, preferiti e newsletter

Tutto è **spento di default**: senza configurazione il sito non ha pagine account, né JS/CSS extra, né host esterni nella CSP. Il backend è esterno (nessun server nostro): [Supabase](https://supabase.com) per gli account, [Buttondown](https://buttondown.com) (o un servizio equivalente) per la newsletter.

## Cosa si attiva
| Funzione | Pagine / elementi |
|---|---|
| Account | `/accedi/`, `/registrati/`, `/account/` (tutte `noindex`, fuori dalla sitemap), pulsante «Accedi/Account» nell'header |
| Preferiti | Pulsante «Salva» sotto il titolo di ogni scheda; elenco in `/account/`. Funzionano anche senza account (solo nel browser) |
| Newsletter | Box in home, a fine scheda, pagina `/newsletter/` (indicizzabile), link nel footer |

Tutte le funzioni che trattano dati richiedono `legal.owner` e `legal.email` (titolare del trattamento) e aggiungono la sezione «Account e newsletter» all'informativa privacy.

## 1. Supabase passo-passo
1. Crea un progetto su supabase.com (piano gratuito). Scegli una regione UE.
2. **Project Settings → API**: copia la *Project URL* (`https://xxxx.supabase.co`) e la chiave **anon / publishable**. NON usare mai la `service_role` (la validazione la rifiuta).
3. **SQL Editor**: esegui lo schema qui sotto.
4. **Authentication → Providers → Email**: attiva *Confirm email* (la verifica dell'email è obbligatoria; se la conferma fosse spenta il sito rifiuta la registrazione con un errore di configurazione).
5. **Authentication → URL Configuration**: *Site URL* = URL pubblico del sito (es. `https://utente.github.io/repo/`); aggiungi ai *Redirect URLs* `https://utente.github.io/repo/accedi/` (usato da conferma email e reset password).
6. **Authentication → SMTP Settings**: per la produzione configura un SMTP tuo (Resend, Brevo, ecc.): il mittente predefinito di Supabase ha limiti bassissimi di invii all'ora e non è adatto a un sito pubblico. Personalizza i template in italiano.
7. **Authentication → Rate Limits / Attack Protection**: lascia attivi i limiti; abilita il CAPTCHA se subisci abusi (non gestito dall'interfaccia attuale).
8. Imposta variabili del repository (Settings → Secrets and variables → Actions → **Variables**, sono pubbliche): `WIKI_ACCOUNTS_PROVIDER=supabase`, `WIKI_SUPABASE_URL`, `WIKI_SUPABASE_ANON_KEY`, `WIKI_LEGAL_OWNER`, `WIKI_LEGAL_EMAIL`. Il workflow di deploy le passa alla build, oltre a `WIKI_ENV=production`. In locale puoi invece compilare `config/site.json` (chiave `accounts`).

### Schema SQL (tabella preferiti, RLS, eliminazione account)
```sql
-- Preferiti: una riga per utente e pagina
create table public.favorites (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  url        text not null check (char_length(url) between 1 and 300),
  title      text not null check (char_length(title) between 1 and 200),
  created_at timestamptz not null default now(),
  primary key (user_id, url)
);
create index favorites_user_created_idx on public.favorites (user_id, created_at desc);

alter table public.favorites enable row level security;
create policy "favorites_select_own" on public.favorites for select to authenticated using (user_id = auth.uid());
create policy "favorites_insert_own" on public.favorites for insert to authenticated with check (user_id = auth.uid());
create policy "favorites_update_own" on public.favorites for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "favorites_delete_own" on public.favorites for delete to authenticated using (user_id = auth.uid());

-- Eliminazione dell'account da parte dell'utente (chiamata con supabase.rpc('delete_my_account')).
-- Cancella l'utente in auth.users; i preferiti spariscono per "on delete cascade".
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from auth.users where id = auth.uid();
end; $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
```
La preferenza sugli spoiler e il consenso newsletter sono nei metadati dell'utente (`user_metadata`), quindi **non serve una tabella `profiles`**. Se in futuro vorrai dati di profilo, creala con lo stesso schema RLS (`id uuid primary key references auth.users on delete cascade`, policy `id = auth.uid()`).

## 2. Eliminazione dell'account
In `/account/` → «Elimina il mio account»: l'utente reinserisce la password (riautenticazione), spunta la conferma e il sito chiama la funzione RPC `delete_my_account` (SQL sopra). Cancella l'utente e, a cascata, i preferiti online. Se la funzione non esiste sul progetto, la pagina mostra una procedura di ripiego: scrivere a `legal.email` dall'indirizzo registrato, e il titolare elimina l'utente da *Authentication → Users*. Gli iscritti alla newsletter si disiscrivono dal link in ogni email (la cancellazione completa dei dati presso il provider è una richiesta via email al titolare).

## 3. Newsletter
**Buttondown**: crea l'account, abilita il *double opt-in* (impostazione predefinita) e imposta `WIKI_BUTTONDOWN_USER` con il tuo nome utente. Il modulo fa un POST a `https://buttondown.com/api/emails/embed-subscribe/<utente>` in una nuova scheda.
**Altro servizio** (`newsletter.provider = "custom"`): imposta `WIKI_NEWSLETTER_FORM_ACTION` (https) e, se il campo email non si chiama `email`, `WIKI_NEWSLETTER_EMAIL_FIELD` (es. `EMAIL` per Brevo/Mailchimp). Verifica che il doppio opt-in sia attivo nel servizio. Tipicamente servono campi aggiuntivi nascosti (es. Mailchimp): in tal caso l'integrazione con modulo semplice può non bastare.
La CSP `form-action` ammette soltanto l'host del provider scelto. Il campo honeypot (`lf_website`) è controllato solo da JS: senza JS non c'è filtro lato nostro, la protezione dai bot è quella del provider.

## 4. Provider `mock` (solo sviluppo)
`WIKI_ACCOUNTS_PROVIDER=mock`: utenti finti nel localStorage, banner rosso «MODALITÀ DEMO», conferma email simulata. La validazione fallisce con `WIKI_ENV=production`, e anche la build si interrompe. Serve solo per provare l'interfaccia.

## 5. Libreria client
`src/vendor/supabase.js` è `@supabase/supabase-js` **2.119.0** (build UMD minificata `dist/umd/supabase.js` del pacchetto npm, sha256 `a867edbcfb029370aeec7223dd6180b560b621fbe3bc64c6584fb0369d1b7bce`), licenza MIT in `src/vendor/LICENSE-supabase.txt`. Per aggiornarla: in una cartella temporanea fuori dal repo `npm install @supabase/supabase-js@<versione>`, copia `node_modules/@supabase/supabase-js/dist/umd/supabase.js` e la LICENSE, aggiorna questa nota e prova login/registrazione. Si carica solo nelle pagine account (e, per chi è già loggato, al primo click su «Salva» per sincronizzare). Il realtime non è usato: nessun WebSocket, la CSP aggiunge a `connect-src` solo l'origine di `supabaseUrl`.

## 6. Come funziona la sincronizzazione
I preferiti stanno sempre nel localStorage (`lf_favs`). Se sei loggato vengono uniti con la tabella `favorites`: al login, aprendo `/account/` e dopo ogni «Salva/Rimuovi». Regole: l'unione dei due insiemi; una rimozione fatta su un dispositivo si propaga agli altri alla loro sincronizzazione successiva. Al logout i preferiti vengono tolti dal dispositivo (restano nell'account), per non lasciare dati su computer condivisi.

## 7. Limiti noti
- La sincronizzazione parte solo con il sito aperto: non c'è aggiornamento in tempo reale tra dispositivi.
- Non conosciamo lo stato reale dell'iscrizione newsletter (la gestisce il provider): mostriamo solo cosa l'utente ha avviato.
- Con più schede aperte lo stato dell'header si aggiorna al ricaricamento.
- Nessun CAPTCHA integrato; il blocco temporaneo dopo 5 tentativi falliti è solo di interfaccia, i limiti veri sono quelli di Supabase.
- Non verificato con un progetto Supabase/Buttondown reale (il flusso reale va provato dopo la configurazione).

## 8. Sicurezza: cosa è pubblico
- **Pubblico** (finisce nell'HTML): URL del progetto Supabase, chiave anon/publishable, nome utente Buttondown. Sono pensati per stare nel browser; la sicurezza dei dati sta nelle policy RLS (ogni utente vede e scrive solo le proprie righe).
- **Mai nel repository**: `service_role`, chiavi `sb_secret_`, password del database, token API. La validazione le rifiuta e controlla anche il ruolo dentro la chiave JWT.
- Le password non passano mai da noi: sono gestite da Supabase (hash). Niente dati in query string, niente token nei log, nessun `innerHTML` con dati utente.
- La sessione sta nel localStorage (chiave `lf-auth`); la CSP vieta script inline ed esterni, riducendo il rischio XSS.
