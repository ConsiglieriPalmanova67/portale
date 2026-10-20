// Edge Function `estrai`: riceve dal portale alcune pagine di un PDF e le fa leggere a Claude (API Anthropic),
// con le istruzioni e lo schema di risposta della sezione (vedi sezioni.ts). Non scrive nel database: restituisce
// i dati letti e il portale li salva con le regole di accesso dell'utente. La chiave dell'API vive solo qui,
// nei secret della funzione (ANTHROPIC_API_KEY): il browser non la vede mai.
//
// POST { azione: 'indice' | 'blocco', pdf: <base64>, pagine: [numeri di pagina nel fascicolo, nell'ordine del PDF],
//        sezione?, parte?, contesto?: <numero della pagina mandata solo per orientarsi, la prima del PDF> }
// → 200 { dati, token_ingresso, token_uscita, modello }
// → 4xx/5xx { errore: <messaggio in italiano>, temporaneo: <true se vale la pena riprovare> }
import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { ISTRUZIONI_GENERALI, SEZIONI } from "./sezioni.ts";

// Il modello che legge: il più capace della linea Opus, con visione. Per cambiarlo basta questa riga
// (oppure il secret ESTRAI_MODELLO, senza ripubblicare la funzione).
const MODELLO = Deno.env.get("ESTRAI_MODELLO") ?? "claude-opus-5-5";
// Quanto il modello "ci pensa": low | medium | high | xhigh | max. Più alto = più lento e più costoso.
const SFORZO = Deno.env.get("ESTRAI_SFORZO") ?? "medium";
// Se i filtri di sicurezza del modello rifiutano la richiesta, l'API la ripete da sola su un modello di ripiego.
// È una funzione in beta: se l'API la rifiuta, mettere il secret ESTRAI_RIPIEGO a "no".
const RIPIEGO = (Deno.env.get("ESTRAI_RIPIEGO") ?? "si") !== "no";
// Limiti dell'API per i PDF: 32 MB a richiesta (il base64 pesa un terzo in più del file) e 600 pagine.
const MAX_BASE64 = 30 * 1024 * 1024;
const MAX_PAGINE = 600;

// Origini da cui il portale può chiamare la funzione: il server locale e GitHub Pages.
// Altre origini si aggiungono con il secret ESTRAI_ORIGINI (separate da virgola).
const ORIGINI = ["http://localhost:5173", "http://127.0.0.1:5173", ...(Deno.env.get("ESTRAI_ORIGINI") ?? "").split(",").map((o) => o.trim()).filter(Boolean)];
const consentita = (origine: string) => ORIGINI.includes(origine) || /^https:\/\/[a-z0-9-]+\.github\.io$/i.test(origine);

function intestazioni(richiesta: Request): Record<string, string> {
  const origine = richiesta.headers.get("Origin") ?? "";
  return {
    ...(consentita(origine) ? { "Access-Control-Allow-Origin": origine } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
  };
}

class Rifiuto extends Error {
  constructor(public stato: number, messaggio: string, public temporaneo = false) {
    super(messaggio);
  }
}

// Solo un consigliere con mandato in corso può far leggere un documento (e quindi spendere).
async function controllaAccesso(richiesta: Request) {
  const autorizzazione = richiesta.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(autorizzazione)) throw new Rifiuto(401, "Accesso non valido: esci dal portale e rientra.");
  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: autorizzazione } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: utente, error: erroreUtente } = await supabase.auth.getUser();
  if (erroreUtente || !utente?.user) throw new Rifiuto(401, "La sessione è scaduta: esci dal portale e rientra.");
  const { data: consigliere, error } = await supabase.rpc("is_consigliere");
  if (error) throw new Rifiuto(500, `Non è stato possibile verificare il mandato di consigliere: ${error.message}`, true);
  if (consigliere !== true) throw new Rifiuto(403, "Solo i consiglieri con un mandato in corso possono estrarre i dati dai documenti.");
}

type Corpo = { azione?: string; pdf?: string; pagine?: number[]; sezione?: string; parte?: number | null; contesto?: number | null };

function prepara(corpo: Corpo) {
  if (corpo.azione !== "indice" && corpo.azione !== "blocco") throw new Rifiuto(400, "Richiesta non valida: azione sconosciuta.");
  const nome = corpo.azione === "indice" ? "indice" : String(corpo.sezione ?? "");
  const sezione = SEZIONI[nome];
  if (!sezione || (corpo.azione === "blocco" && nome === "indice")) throw new Rifiuto(400, `Richiesta non valida: sezione «${nome}» sconosciuta.`);
  if (typeof corpo.pdf !== "string" || !corpo.pdf) throw new Rifiuto(400, "Richiesta non valida: manca il PDF.");
  if (corpo.pdf.length > MAX_BASE64) throw new Rifiuto(413, "Il documento è troppo grande per essere letto in una volta sola (limite 32 MB a richiesta): va diviso in blocchi più piccoli.");
  const pagine = Array.isArray(corpo.pagine) ? corpo.pagine.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  if (!pagine.length) throw new Rifiuto(400, "Richiesta non valida: manca l'elenco delle pagine.");
  if (pagine.length > MAX_PAGINE) throw new Rifiuto(413, `Il documento ha troppe pagine per una sola richiesta (limite ${MAX_PAGINE}).`);

  const corrispondenza = pagine.length === 1
    ? `Il PDF allegato ha una pagina: è la pagina ${pagine[0]} del fascicolo.`
    : `Il PDF allegato ha ${pagine.length} pagine: sono, nell'ordine, le pagine ${pagine.join(", ")} del fascicolo.`;
  const contesto = corpo.contesto && pagine[0] === Number(corpo.contesto) && pagine.length > 1
    ? `\n\nLa prima pagina del PDF (pagina ${pagine[0]} del fascicolo) è solo di CONTESTO: serve a sapere quali titoli (gruppo, sottoconto, sezione) sono aperti quando comincia la pagina ${pagine[1]}. NON trascrivere nulla di ciò che compare in quella pagina: è già stata letta. Trascrivi solo le pagine ${pagine.slice(1).join(", ")}.`
    : "";
  const parte = nome === "riparto" && corpo.parte ? `\n\nQuesto blocco appartiene alla parte ${corpo.parte} del riparto.` : "";
  return { sezione, testo: `${corrispondenza}${contesto}${parte}\n\n${sezione.istruzioni}` };
}

async function leggi(corpo: Corpo) {
  const chiave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!chiave) throw new Rifiuto(503, "La chiave API di Anthropic non è configurata: va aggiunta ai secret della funzione (ANTHROPIC_API_KEY).");
  const { sezione, testo } = prepara(corpo);
  const client = new Anthropic({ apiKey: chiave, maxRetries: 1 });

  // In streaming: una risposta lunga non incappa nei tempi massimi di una richiesta HTTP.
  const flusso = client.beta.messages.stream({
    model: MODELLO,
    max_tokens: sezione.maxToken,
    thinking: { type: "adaptive" },
    output_config: { effort: SFORZO as "low" | "medium" | "high" | "xhigh" | "max", format: { type: "json_schema", schema: sezione.schema } },
    system: ISTRUZIONI_GENERALI,
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: corpo.pdf as string } },
        { type: "text", text: testo },
      ],
    }],
    ...(RIPIEGO ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  });
  const messaggio = await flusso.finalMessage();

  if (messaggio.stop_reason === "refusal") throw new Rifiuto(422, "Il modello ha rifiutato di leggere queste pagine (filtro di sicurezza). Riprova; se si ripete, il blocco va inserito a mano.");
  if (messaggio.stop_reason === "max_tokens") throw new Rifiuto(422, "La risposta è stata troncata: le pagine contengono troppi dati per un blocco solo. Riduci le pagine del blocco e rileggi.");
  const scritto = messaggio.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let dati: unknown;
  try {
    dati = JSON.parse(scritto);
  } catch {
    throw new Rifiuto(502, "La risposta del modello non è leggibile (JSON non valido). Riprova.", true);
  }
  const uso = messaggio.usage;
  return {
    dati,
    // i token in ingresso comprendono quelli letti o scritti nella cache
    token_ingresso: uso.input_tokens + (uso.cache_creation_input_tokens ?? 0) + (uso.cache_read_input_tokens ?? 0),
    token_uscita: uso.output_tokens,
    modello: messaggio.model,
  };
}

// Dagli errori dell'API a messaggi che chi usa il portale può capire.
function daErrore(errore: unknown): Rifiuto {
  if (errore instanceof Rifiuto) return errore;
  if (errore instanceof Anthropic.AuthenticationError) return new Rifiuto(503, "La chiave API di Anthropic non è valida: va controllata nei secret della funzione.");
  if (errore instanceof Anthropic.PermissionDeniedError) return new Rifiuto(503, "La chiave API di Anthropic non ha il permesso di usare questo modello.");
  if (errore instanceof Anthropic.RateLimitError) return new Rifiuto(429, "Troppe richieste in poco tempo (limite di frequenza dell'API): aspetta un minuto e riprova.", true);
  if (errore instanceof Anthropic.BadRequestError && /credit balance/i.test(errore.message)) return new Rifiuto(503, "Il credito dell'account Anthropic è esaurito: va ricaricato dalla console Anthropic (Billing). I blocchi già letti restano salvati.");
  if (errore instanceof Anthropic.BadRequestError) return new Rifiuto(400, `L'API ha rifiutato la richiesta: ${errore.message}`);
  if (errore instanceof Anthropic.APIConnectionError) return new Rifiuto(502, "Il servizio di lettura non è raggiungibile in questo momento. Riprova.", true);
  if (errore instanceof Anthropic.APIError) {
    if (errore.status === 413) return new Rifiuto(413, "Il documento è troppo grande per l'API (limite 32 MB e 600 pagine a richiesta): va diviso in blocchi più piccoli.");
    if (errore.status === 402) return new Rifiuto(503, "Il credito dell'account Anthropic è esaurito o la fatturazione non è attiva.");
    if (errore.status === 529 || (errore.status ?? 0) >= 500) return new Rifiuto(503, "Il servizio di lettura è sovraccarico in questo momento. Riprova tra poco.", true);
    return new Rifiuto(502, `Errore dell'API (${errore.status ?? "?"}): ${errore.message}`);
  }
  return new Rifiuto(500, `Errore imprevisto: ${errore instanceof Error ? errore.message : String(errore)}`, true);
}

Deno.serve(async (richiesta: Request) => {
  const testa = intestazioni(richiesta);
  if (richiesta.method === "OPTIONS") return new Response(null, { status: 204, headers: testa });
  try {
    if (richiesta.method !== "POST") throw new Rifiuto(405, "Metodo non consentito.");
    await controllaAccesso(richiesta);
    let corpo: Corpo;
    try {
      corpo = await richiesta.json();
    } catch {
      throw new Rifiuto(400, "Richiesta non valida: il corpo non è JSON.");
    }
    return new Response(JSON.stringify(await leggi(corpo)), { status: 200, headers: testa });
  } catch (errore) {
    const rifiuto = daErrore(errore);
    if (rifiuto.stato >= 500) console.error("estrai:", errore);
    return new Response(JSON.stringify({ errore: rifiuto.message, temporaneo: rifiuto.temporaneo }), { status: rifiuto.stato, headers: testa });
  }
});
