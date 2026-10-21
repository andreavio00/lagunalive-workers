const TARGET =
  "https://www.comune.venezia.it/it/content/centro-previsioni-e-segnalazioni-maree-beta";

const MAX_TENTATIVI = 3;
const KV_KEY = "ultima_previsione_valida";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Cache-Control": "no-store"
};

const JSON_HEADERS = {
  ...CORS,
  "Content-Type": "application/json; charset=utf-8"
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: JSON_HEADERS
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== "GET") {
      return new Response("Metodo non consentito", { status: 405, headers: CORS });
    }

    const debug = url.searchParams.get("debug") === "1";
    const raw = url.searchParams.get("raw") === "1";
    const diagnostica = [];

    try {
      let previsioni = [];
      let ultimoHtml = "";
      let ultimaResponse = null;

      for (let i = 1; i <= MAX_TENTATIVI; i++) {
        // Dal secondo tentativo in poi aggiungiamo un parametro
        // casuale per aggirare eventuali varianti in cache lato Comune.
        const target = i === 1 ? TARGET : TARGET + "?_=" + Date.now() + i;

        let response;
        try {
          response = await fetch(target, {
            method: "GET",
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              "Accept":
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
              "Cache-Control": "no-cache",
              "Pragma": "no-cache"
            },
            cf: { cacheTtl: 0, cacheEverything: false }
          });
        } catch (e) {
          diagnostica.push({ tentativo: i, errore_fetch: String(e) });
          console.log(JSON.stringify({ tentativo: i, errore_fetch: String(e) }));
          continue;
        }

        const html = await response.text();
        const parsed = estraiPrevisioni(html);

        const info = {
          tentativo: i,
          status: response.status,
          cf_ray: response.headers.get("cf-ray"),
          server: response.headers.get("server"),
          cache_comune: response.headers.get("x-cache") ||
                        response.headers.get("cf-cache-status") ||
                        response.headers.get("age"),
          lunghezza: html.length,
          ha_marker: html.includes("[data_previsione]"),
          previsioni_trovate: parsed.length,
          inizio_body: parsed.length ? undefined : html.slice(0, 300)
        };
        diagnostica.push(info);
        // Questo finisce nei Logs / wrangler tail
        console.log(JSON.stringify(info));

        ultimaResponse = response;
        ultimoHtml = html;

        if (response.ok && parsed.length > 0) {
          previsioni = parsed;
          break;
        }
      }

      if (raw) {
        return new Response(ultimoHtml, {
          status: 200,
          headers: {
            ...CORS,
            "Content-Type":
              (ultimaResponse && ultimaResponse.headers.get("content-type")) ||
              "text/html; charset=utf-8"
          }
        });
      }

      // ---------- Nessun dato dopo i tentativi ----------
      if (previsioni.length === 0) {
        // Fallback: ultimo risultato valido salvato in KV (se configurato)
        if (env && env.MAREE_KV) {
          const salvato = await env.MAREE_KV.get(KV_KEY, "json");
          if (salvato) {
            salvato.da_cache = true;
            if (debug) salvato.diagnostica = diagnostica;
            return json(salvato, 200);
          }
        }

        return json(
          {
            ok: false,
            errore: "Nessuna previsione trovata nella pagina del Comune",
            diagnostica
          },
          502
        );
      }

      // ---------- Dati OK ----------
      const dataPrevisione = previsioni[0].data_previsione;
      ricostruisciDate(previsioni);

      const risultato = {
        ok: true,
        da_cache: false,
        fonte: "Centro Previsioni e Segnalazioni Maree - Comune di Venezia",
        url_fonte: TARGET,
        data_previsione: dataPrevisione,
        aggiornato_il: new Date().toISOString(),
        numero_previsioni: previsioni.length,
        previsioni: previsioni.map(item => ({
          data: item.data,
          ora: item.ora,
          datetime: item.data + "T" + item.ora,
          valore: item.valore,
          tipo: item.tipo
        }))
      };

      // Salviamo l'ultimo risultato valido (la previsione cambia
      // più volte al giorno, quindi lo sovrascriviamo sempre).
      if (env && env.MAREE_KV) {
        try {
          await env.MAREE_KV.put(KV_KEY, JSON.stringify(risultato));
        } catch (e) {
          console.log("Errore salvataggio KV: " + String(e));
        }
      }

      if (debug) risultato.diagnostica = diagnostica;
      return json(risultato, 200);

    } catch (error) {
      return json({ ok: false, errore: error.toString(), diagnostica }, 500);
    }
  }
};

/*
==========================================================
ESTRAZIONE DELLE PREVISIONI
==========================================================
La pagina del Comune contiene (probabilmente per un output
di debug PHP) blocchi del tipo:
[data_previsione] => ... [valore] => ... [tipo] => ... [ora] => ...
*/
function estraiPrevisioni(html) {
  const regex =
    /\[data_previsione\]\s*=>\s*([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9]{2}:[0-9]{2}:[0-9]{2})[\s\S]*?\[valore\]\s*=>\s*(-?[0-9]+(?:\.[0-9]+)?)[\s\S]*?\[tipo\]\s*=>\s*(min|max)[\s\S]*?\[ora\]\s*=>\s*([0-9]{2}:[0-9]{2})/g;

  const risultati = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    risultati.push({
      data_previsione: match[1],
      valore: Number(match[2]),
      tipo: match[3],
      ora: match[4],
      data: null
    });
  }

  return risultati;
}

/*
==========================================================
RICOSTRUZIONE DELLE DATE
==========================================================
*/
function ricostruisciDate(previsioni) {
  if (previsioni.length === 0) return;

  const dataBase = previsioni[0].data_previsione.substring(0, 10);
  const giorno = new Date(dataBase + "T00:00:00Z");
  let oraPrecedente = null;

  for (const previsione of previsioni) {
    const ora = previsione.ora;

    // Se l'ora è minore della precedente siamo al giorno dopo
    if (oraPrecedente !== null && ora < oraPrecedente) {
      giorno.setUTCDate(giorno.getUTCDate() + 1);
    }

    previsione.data = giorno.toISOString().substring(0, 10);
    oraPrecedente = ora;
  }
}
