
export default {
  async fetch() {
    const r = await fetch(
      "https://dati.venezia.it/sites/default/files/dataset/opendata/previsione.json"
    );

    return new Response(await r.text(), {
      status: r.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      }
    });
  }
};
