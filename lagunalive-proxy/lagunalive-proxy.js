// Worker generico "passa-carte" per LagunaLive: scarica una pagina
// consentita lato server (nessun problema di CORS, a differenza di un
// fetch() diretto dal browser) e la restituisce con l'header
// Access-Control-Allow-Origin.
//
// A differenza della prima versione (fissa sul solo file ISPRA),
// questa accetta qualsiasi URL tramite il parametro ?url=, cosi' lo
// stesso Worker serve sia il file Dati2.xml di ISPRA sia le 4 pagine
// CPSM del Comune di Venezia (Palazzo Cavalli, San Giorgio, Punta
// Salute, Misericordia), al posto di r.jina.ai (che applica
// un'elaborazione "leggibilita'" pensata per articoli, non adatta a
// tabelle/dati grezzi, ed e' risultato piu' lento in pratica).
//
// L'allowlist qui sotto e' una misura di sicurezza: senza di essa,
// chiunque potrebbe usare questo indirizzo per scaricare QUALSIASI
// pagina del web attraverso il tuo Worker (un "proxy aperto"), consumando
// la tua quota giornaliera gratuita di Cloudflare (100.000 richieste/
// giorno) per scopi che non c'entrano nulla con LagunaLive. Aggiungi
// qui nuovi domini solo se servono davvero a LagunaLive.
const ALLOWED_HOSTS = [
  "www.comune.venezia.it",
    "comune.venezia.it",
      "www.venezia.isprambiente.it",
        "venezia.isprambiente.it"
        ];

        // Usato solo se la richiesta non specifica ?url= (compatibilita' con
        // la primissima versione del Worker, fissa sul solo file ISPRA).
        const DEFAULT_TARGET_URL = "https://www.venezia.isprambiente.it/dati/Dati2.xml";

        function corsHeaders() {
          return {
              "Access-Control-Allow-Origin": "*",
                  "Access-Control-Allow-Methods": "GET, OPTIONS"
                    };
                    }

                    export default {
                      async fetch(request) {

                          // Risposta alla richiesta di preflight CORS del browser (di norma
                              // non necessaria per un semplice fetch() GET senza header
                                  // personalizzati, ma innocua da gestire comunque).
                                      if (request.method === "OPTIONS") {
                                            return new Response(null, { headers: corsHeaders() });
                                                }

                                                    const requestUrl = new URL(request.url);
                                                        const targetParam = requestUrl.searchParams.get("url");
                                                            const targetUrl = targetParam || DEFAULT_TARGET_URL;

                                                                let parsedTarget;
                                                                    try {
                                                                          parsedTarget = new URL(targetUrl);
                                                                              } catch (err) {
                                                                                    return new Response("URL non valido: " + targetUrl, {
                                                                                            status: 400,
                                                                                                    headers: corsHeaders()
                                                                                                          });
                                                                                                              }

                                                                                                                  if (!ALLOWED_HOSTS.includes(parsedTarget.hostname)) {
                                                                                                                        return new Response(
                                                                                                                                "Dominio non consentito da questo Worker: " + parsedTarget.hostname,
                                                                                                                                        { status: 403, headers: corsHeaders() }
                                                                                                                                              );
                                                                                                                                                  }

                                                                                                                                                      try {

                                                                                                                                                            const response = await fetch(parsedTarget.toString(), {
                                                                                                                                                                    headers: { "User-Agent": "Mozilla/5.0 (compatible; LagunaLiveProxy/1.0)" }
                                                                                                                                                                          });

                                                                                                                                                                                const body = await response.text();

                                                                                                                                                                                      return new Response(body, {
                                                                                                                                                                                              status: response.status,
                                                                                                                                                                                                      headers: {
                                                                                                                                                                                                                "Content-Type": response.headers.get("Content-Type") || "text/plain; charset=utf-8",
                                                                                                                                                                                                                          "Cache-Control": "no-store",
                                                                                                                                                                                                                                    ...corsHeaders()
                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                  });

                                                                                                                                                                                                                                                      } catch (err) {

                                                                                                                                                                                                                                                            return new Response("Errore proxy: " + err.message, {
                                                                                                                                                                                                                                                                    status: 502,
                                                                                                                                                                                                                                                                            headers: corsHeaders()
                                                                                                                                                                                                                                                                                  });
                                                                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                                                        };
                                                                                                                                                                                                                                                                                        