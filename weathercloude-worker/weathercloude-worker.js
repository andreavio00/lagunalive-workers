/**
 * Proxy Weathercloud per LagunaLive.
 *
 * GET /weathercloud/all           -> array di tutte le stazioni configurate
 * GET /weathercloud/{deviceId}     -> singola stazione
 *
 * Per ciascuna stazione unisce due fonti:
 *  - https://app.weathercloud.net/d{id}                 (pagina, per nome/città/posizione/coordinate)
 *  - https://app.weathercloud.net/device/values/{id}    (dati meteo live)
 *
 * NOTA: i nomi dei campi restituiti (temp, humidity, windSpeed, ecc.) sono
 * una proposta ragionevole in attesa di confermare con app.js la
 * convenzione già usata per le altre stazioni — vanno probabilmente
 * riallineati dopo il primo test.
 */

const ALLOWED_ORIGIN = '*'; // in produzione: il dominio GitHub Pages

const UA = 'Mozilla/5.0 (compatible; LagunaLive/1.0; +https://andreavio00.github.io/LagunaLive/)';

// Gli ID che ci hai mandato dalle pagine /map#...
const STATION_IDS = [
  '2414314087',
  '2483866015',
  '2591958863',
  '2361312782',
  '5383712743',
  '1998774847',
  '8732543148',
  '9573904880',
  '8414577935',
  '1316727457',
  '9454656179'
];

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === '/weathercloud/all') {
      const results = await Promise.all(STATION_IDS.map((id) => fetchStation(id)));
      return jsonResponse(results);
    }

    const match = url.pathname.match(/^\/weathercloud\/(\d+)$/);
    if (match) {
      const result = await fetchStation(match[1]);
      return jsonResponse(result);
    }

    return jsonResponse(
      { error: 'Usa /weathercloud/all oppure /weathercloud/<deviceId>' },
      404
    );
  }
};

async function fetchStation(id) {
  const [meta, values] = await Promise.all([
    fetchStationPage(id).catch((err) => ({ metaError: err.message })),
    fetchStationValues(id).catch((err) => ({ valuesError: err.message }))
  ]);

  if (!values || values.valuesError) {
    return {
      id,
      source: 'weathercloud',
      name: meta && meta.name ? meta.name : null,
      city: meta && meta.city ? meta.city : null,
      error: (values && values.valuesError) || 'Nessun dato live disponibile'
    };
  }

  return {
    id,
    source: 'weathercloud',
    name: meta.name ?? null,
    city: meta.city ?? null,
    location: meta.location ?? null,
    lat: meta.lat ?? null,
    lon: meta.lon ?? null,
    altitude: meta.altitude ?? null,
    updatedAt: values.epoch ? values.epoch * 1000 : null,
    temp: values.temp ?? null,
    humidity: values.hum ?? null,
    dewPoint: values.dew ?? null,
    windChill: values.chill ?? null,
    heatIndex: values.heat ?? null,
    thw: values.thw ?? null,
    pressure: values.bar ?? null,
    windSpeed: values.wspdavg ?? null,
    windSpeedInstant: values.wspd ?? null,
    windGust: values.wspdhi ?? null,
    windDir: values.wdiravg ?? null,
    windDirInstant: values.wdir ?? null,
    rainRate: values.rainrate ?? null,
    rain: values.rain ?? null,
    solarRad: values.solarrad ?? null,
    uvIndex: values.uvi ?? null
  };
}

async function fetchStationPage(id) {
  const res = await fetchWithTimeout(`https://app.weathercloud.net/d${id}`, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html'
    }
  });
  const html = await res.text();
  return parseStationPage(html);
}

function parseStationPage(html) {
  const nameMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
  const name = nameMatch ? nameMatch[1].replace(/\s*-\s*Weathercloud\s*$/i, '').trim() : null;

  const cityMatch = html.match(/id="profile-city"[^>]*>\s*<strong>([^<]*)<\/strong>/);
  const city = cityMatch ? cityMatch[1].trim() : null;

  const locationMatch = html.match(/id="profile-location"[^>]*>\s*<strong>([^<]*)<\/strong>/);
  const location = locationMatch ? locationMatch[1].trim() : null;

  const altitudeMatch = html.match(/id="profile-altitude"[^>]*>\s*<strong>([^<]*)<\/strong>/);
  const altitude = altitudeMatch ? parseFloat(altitudeMatch[1].replace(',', '.').replace(/[^\d.\-]/g, '')) : null;

  const coordMatch = html.match(/SunCalc\.getTimes\(now,\s*([\-0-9.]+),\s*([\-0-9.]+)\)/);
  const lat = coordMatch ? parseFloat(coordMatch[1]) : null;
  const lon = coordMatch ? parseFloat(coordMatch[2]) : null;

  return { name, city, location, altitude, lat, lon };
}

async function fetchStationValues(id) {
  const res = await fetchWithTimeout(`https://app.weathercloud.net/device/values/${id}`, {
    headers: {
      'User-Agent': UA,
      'Accept': 'application/json, text/plain, */*',
      'Referer': `https://app.weathercloud.net/d${id}`,
      'X-Requested-With': 'XMLHttpRequest'
    }
  });
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}

async function fetchWithTimeout(url, options = {}, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders()
    }
  });
}
