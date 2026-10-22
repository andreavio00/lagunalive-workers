/*
 * previsionimarea — LagunaLive
 * Fonte: Open Data del Comune di Venezia.
 * Converte il JSON ufficiale nel formato atteso da previsioni-data.js.
 */
const URL_FONTE = "https://dati.venezia.it/sites/default/files/dataset/opendata/previsione.json";

export default {
  async fetch(request) {
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Cache-Control": "no-store"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    try {
      const response = await fetch(URL_FONTE, {
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) {
        return new Response(JSON.stringify({
          ok: false,
          errore: "La fonte Open Data del Comune non è raggiungibile",
          status_fonte: response.status,
          previsioni: []
        }), { status: 502, headers });
      }

      const raw = await response.json();
      if (!Array.isArray(raw)) {
        return new Response(JSON.stringify({
          ok: false,
          errore: "Formato inatteso dalla fonte Open Data",
          previsioni: []
        }), { status: 502, headers });
      }

      const previsioni = raw.map(item => {
        const estremale = String(item.DATA_ESTREMALE || "");
        const parti = estremale.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?$/);
        const valore = Number(item.VALORE);
        const tipo = String(item.TIPO_ESTREMALE || "").toLowerCase();

        if (!parti || !Number.isFinite(valore) || !["min", "max"].includes(tipo)) {
          return null;
        }

        return {
          data: parti[1],
          ora: parti[2],
          datetime: `${parti[1]}T${parti[2]}:00`,
          valore,
          tipo,
          titolo: item.TITOLO || "",
          data_previsione: item.DATA_PREVISIONE || null
        };
      }).filter(Boolean).sort((a, b) => a.datetime.localeCompare(b.datetime));

      return new Response(JSON.stringify({
        ok: true,
        fonte: "Centro Previsioni e Segnalazioni Maree - Comune di Venezia (Open Data)",
        url_fonte: URL_FONTE,
        data_previsione: raw[0]?.DATA_PREVISIONE || null,
        numero_previsioni: previsioni.length,
        previsioni
      }), { status: 200, headers });
    } catch (error) {
      return new Response(JSON.stringify({
        ok: false,
        errore: "Errore durante il recupero delle previsioni di marea",
        dettaglio: String(error?.message || error),
        previsioni: []
      }), { status: 502, headers });
    }
  }
};
