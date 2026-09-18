/**
 * Proxy Netatmo pubblico per LagunaLive.
 *
 * GET /netatmo/all
 * GET /netatmo/all?module=rain
 * GET /netatmo/all?module=wind
 * GET /netatmo/all?fresh=1
 * GET /netatmo/status
 * GET /netatmo/{stationId}
 *
 * Utilizza gli stessi servizi della mappa pubblica Netatmo.
 * Non richiede credenziali o account del proprietario.
 */

const ALLOWED_ORIGIN = '*';

const TOKEN_URL =
  'https://auth.netatmo.com/weathermap/token';

const DATA_URL =
  'https://app.netatmo.net/api/getpublicmeasures';

const BBOX = {
  latSW: 45.24,
  lonSW: 12.24,
  latNE: 45.55,
  lonNE: 12.52
};

const STATION_LIMIT = 100;
const CACHE_SECONDS = 300;
const STALE_AFTER_MINUTES = 30;

// Nomi già identificati con sufficiente sicurezza.
// Tutte le altre useranno via/città e una parte dell’ID.
const KNOWN_NAMES = {
  '70:ee:50:af:3d:96': 'Campo Santa Margherita',
  '70:ee:50:b0:a2:1c': 'Malamocco',
  '70:ee:50:b4:e8:0a': 'Pellestrina',
  '70:ee:50:af:5a:52': 'Laguna nord – Torcello'
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders()
      });
    }

    if (request.method !== 'GET') {
      return jsonResponse(
        { error: 'Metodo non consentito' },
        405
      );
    }

    try {
      const snapshot = await getSnapshot(request, ctx);

      if (
        url.pathname === '/' ||
        url.pathname === '/netatmo'
      ) {
        return jsonResponse({
          endpoints: [
            '/netatmo/status',
            '/netatmo/all',
            '/netatmo/all?module=rain',
            '/netatmo/all?module=wind',
            '/netatmo/all?fresh=1',
            '/netatmo/<stationId>'
          ]
        });
      }

      if (url.pathname === '/netatmo/status') {
        return jsonResponse({
          source: 'netatmo-public-map',
          fetchedAt: snapshot.fetchedAt,
          cache: snapshot.cacheStatus,
          bbox: BBOX,
          upstreamCount: snapshot.upstreamCount,
          count: snapshot.stations.length,
          withRain: snapshot.stations.filter(
            (station) => station.hasRain
          ).length,
          withWind: snapshot.stations.filter(
            (station) => station.hasWind
          ).length,
          withPressure: snapshot.stations.filter(
            (station) => station.pressure !== null
          ).length,
          stale: snapshot.stations.filter(
            (station) => station.stale
          ).length,
          possibleTruncation:
            snapshot.upstreamCount >= STATION_LIMIT
        });
      }
	// Rotte brevi e più comode da usare
if (url.pathname === '/netatmo/rain') {
  const stations = snapshot.stations.filter(
    (station) => station.hasRain
  );

  return jsonResponse(stations, 200, {
    'X-Netatmo-Cache': snapshot.cacheStatus,
    'X-Netatmo-Count': String(stations.length)
  });
}

if (url.pathname === '/netatmo/wind') {
  const stations = snapshot.stations.filter(
    (station) => station.hasWind
  );

  return jsonResponse(stations, 200, {
    'X-Netatmo-Cache': snapshot.cacheStatus,
    'X-Netatmo-Count': String(stations.length)
  });
}

// Alternativa semplice per cercare una stazione:
// /netatmo/station?id=70:ee:50:bf:7e:5a
if (url.pathname === '/netatmo/station') {
  const stationId = url.searchParams.get('id');

  if (!stationId) {
    return jsonResponse(
      { error: 'Manca il parametro id' },
      400
    );
  }

  const station = snapshot.stations.find(
    (item) =>
      item.id.toLowerCase() ===
      stationId.toLowerCase()
  );

  if (!station) {
    return jsonResponse(
      {
        error: 'Stazione non trovata',
        requestedId: stationId
      },
      404
    );
  }

  return jsonResponse(station);
}
      if (url.pathname === '/netatmo/all') {
        let stations = [...snapshot.stations];

        const moduleFilter =
          url.searchParams.get('module');

        if (moduleFilter === 'rain') {
          stations = stations.filter(
            (station) => station.hasRain
          );
        } else if (moduleFilter === 'wind') {
          stations = stations.filter(
            (station) => station.hasWind
          );
        } else if (
          moduleFilter &&
          moduleFilter !== 'all'
        ) {
          return jsonResponse(
            {
              error:
                'module può essere all, rain oppure wind'
            },
            400
          );
        }

        if (url.searchParams.get('fresh') === '1') {
          stations = stations.filter(
            (station) => !station.stale
          );
        }

        return jsonResponse(stations, 200, {
          'X-Netatmo-Cache': snapshot.cacheStatus,
          'X-Netatmo-Count': String(stations.length)
        });
      }

      const match = url.pathname.match(
        /^\/netatmo\/([^/]+)$/
      );

      if (match) {
        const stationId =
          decodeURIComponent(match[1]);

        if (
          !/^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$/i.test(
            stationId
          )
        ) {
          return jsonResponse(
            { error: 'ID Netatmo non valido' },
            400
          );
        }

        const station = snapshot.stations.find(
          (item) =>
            item.id.toLowerCase() ===
            stationId.toLowerCase()
        );

        if (!station) {
          return jsonResponse(
            {
              error:
                'Stazione non trovata nel riquadro geografico'
            },
            404
          );
        }

        return jsonResponse(station);
      }

      return jsonResponse(
        {
          error:
            'Usa /netatmo/all, /netatmo/status oppure /netatmo/<stationId>'
        },
        404
      );
    } catch (error) {
      return jsonResponse(
        {
          error: 'Errore nel recupero Netatmo',
          detail: error.message
        },
        502
      );
    }
  }
};

async function getSnapshot(request, ctx) {
  const cache = caches.default;

  const cacheUrl = new URL(request.url);
  cacheUrl.pathname = '/__cache/netatmo-snapshot-v1';
  cacheUrl.search = '';

  const cacheKey = new Request(cacheUrl.toString(), {
    method: 'GET'
  });

  const cached = await cache.match(cacheKey);

  if (cached) {
    const snapshot = await cached.json();

    return {
      ...snapshot,
      cacheStatus: 'HIT'
    };
  }

  const snapshot = await fetchNetatmoSnapshot();

  const cacheResponse = new Response(
    JSON.stringify(snapshot),
    {
      headers: {
        'Content-Type':
          'application/json; charset=utf-8',
        'Cache-Control':
          `public, max-age=${CACHE_SECONDS}`
      }
    }
  );

  ctx.waitUntil(
    cache.put(cacheKey, cacheResponse)
  );

  return {
    ...snapshot,
    cacheStatus: 'MISS'
  };
}

async function fetchNetatmoSnapshot() {
  // Token temporaneo utilizzato dalla mappa pubblica.
  const tokenPayload = await fetchJson(
    TOKEN_URL,
    {
      headers: {
        Accept: 'application/json'
      }
    },
    12000
  );

  const token = tokenPayload?.body;

  if (!token || typeof token !== 'string') {
    throw new Error(
      'Netatmo non ha restituito il token pubblico'
    );
  }

  const params = new URLSearchParams({
    zoom: '10',
    lat_ne: String(BBOX.latNE),
    lon_ne: String(BBOX.lonNE),
    lat_sw: String(BBOX.latSW),
    lon_sw: String(BBOX.lonSW),
    date_end: 'last',

    // Nei test 100 ha restituito tutte le 66
    // stazioni presenti nel rettangolo.
    limit: String(STATION_LIMIT),
    divider: '1',
    quality: '1',

    access_token: token
  });

  const payload = await fetchJson(
    `${DATA_URL}?${params.toString()}`,
    {
      headers: {
        Accept: 'application/json'
      }
    },
    20000
  );

  if (payload?.error) {
    throw new Error(
      payload.error.message ||
      JSON.stringify(payload.error)
    );
  }

  const rawStations = Array.isArray(payload?.body)
    ? payload.body
    : [];

  const fetchedAt = new Date().toISOString();

  const stations = rawStations
    .map((station) =>
      normalizeStation(station, fetchedAt)
    )
    .sort((a, b) =>
      a.name.localeCompare(b.name, 'it')
    );

  return {
    source: 'netatmo-public-map',
    fetchedAt,
    bbox: BBOX,
    upstreamCount: rawStations.length,
    stations
  };
}

function normalizeStation(station, fetchedAt) {
  const id = station._id;
  const place = station.place || {};
  const measures = station.measures || {};
  const moduleTypes = station.module_types || {};

  const outdoorId = findModuleId(
    moduleTypes,
    'NAModule1'
  );

  const windId = findModuleId(
    moduleTypes,
    'NAModule2'
  );

  const rainId = findModuleId(
    moduleTypes,
    'NAModule3'
  );

  const outdoor = latestValues(
    outdoorId ? measures[outdoorId] : null
  );

  // La pressione è normalmente associata
  // al modulo principale, cioè all’ID stazione.
  const mainModule = latestValues(measures[id]);

  const rain = rainId
    ? measures[rainId] || null
    : null;

  const wind = windId
    ? measures[windId] || null
    : null;

  const temp =
    numeric(outdoor.values.temperature);

  const humidity =
    numeric(outdoor.values.humidity);

  const pressure =
    numeric(mainModule.values.pressure);

  const rainLive =
    numeric(rain?.rain_live);

  const rain60min =
    numeric(rain?.rain_60min);

  const rain24h =
    numeric(rain?.rain_24h);

  const windSpeed =
    numeric(wind?.wind_strength);

  const windGust =
    numeric(wind?.gust_strength);

  const windDir =
    numeric(wind?.wind_angle);

  const windGustDir =
    numeric(wind?.gust_angle);

  const epochs = [
    outdoor.epoch,
    mainModule.epoch,
    numeric(rain?.rain_timeutc),
    numeric(wind?.wind_timeutc)
  ].filter((value) => value !== null);

  const updatedEpoch = epochs.length
    ? Math.max(...epochs)
    : null;

  const updatedAt = updatedEpoch
    ? updatedEpoch * 1000
    : null;

  const ageMinutes = updatedAt
    ? Math.max(
        0,
        Math.round(
          (Date.now() - updatedAt) / 60000
        )
      )
    : null;

  const street =
    place.street &&
    place.street.toLowerCase() !== 'unnamed road'
      ? place.street
      : null;

  const shortId = id
    ? id.split(':').slice(-2).join(':')
    : 'sconosciuta';

  const name =
    KNOWN_NAMES[id] ||
    street ||
    `${place.city || 'Netatmo'} · ${shortId}`;

  const coordinates =
    Array.isArray(place.location)
      ? place.location
      : [];

  const lon = numeric(coordinates[0]);
  const lat = numeric(coordinates[1]);

  return {
    id,
    source: 'netatmo',

    name,
    city: place.city || null,
    location:
      street && place.city
        ? `${street}, ${place.city}`
        : street || place.city || null,

    lat,
    lon,
    altitude: numeric(place.altitude),

    fetchedAt,
    updatedAt,
    updatedAtIso: updatedAt
      ? new Date(updatedAt).toISOString()
      : null,

    ageMinutes,
    stale:
      ageMinutes === null ||
      ageMinutes > STALE_AFTER_MINUTES,

    temp,
    humidity,
    dewPoint: calculateDewPoint(
      temp,
      humidity
    ),

    windChill: null,
    heatIndex: null,
    thw: null,

    pressure,

    windSpeed,
    windSpeedInstant: windSpeed,
    windGust,
    windDir,
    windDirInstant: windDir,
    windGustDir,

    /*
     * Questi valori rimangono separati:
     * non li trasformiamo ancora nel generico "rain",
     * perché Weathercloud e Netatmo usano periodi diversi.
     */
    rainLive,
    rain60min,
    rain24h,

    solarRad: null,
    uvIndex: null,

    hasRain: Boolean(rainId),
    hasWind: Boolean(windId),

    modules: {
      outdoor: outdoorId,
      rain: rainId,
      wind: windId,
      main: id
    },

    mapUrl:
      `https://weathermap.netatmo.com/` +
      `?stationid=${encodeURIComponent(id)}` +
      `&zoom=14`
  };
}

function findModuleId(moduleTypes, wantedType) {
  const found = Object.entries(moduleTypes).find(
    ([, type]) => type === wantedType
  );

  return found ? found[0] : null;
}

function latestValues(measure) {
  if (!measure || !measure.res) {
    return {
      epoch: null,
      values: {}
    };
  }

  const entries = Object.entries(measure.res);

  if (!entries.length) {
    return {
      epoch: null,
      values: {}
    };
  }

  entries.sort(
    ([epochA], [epochB]) =>
      Number(epochB) - Number(epochA)
  );

  const [epochText, rawValues] = entries[0];
  const types = Array.isArray(measure.type)
    ? measure.type
    : [];

  const values = {};

  types.forEach((type, index) => {
    values[type] =
      rawValues?.[index] ?? null;
  });

  return {
    epoch: numeric(epochText),
    values
  };
}

function calculateDewPoint(temp, humidity) {
  if (
    temp === null ||
    humidity === null ||
    humidity <= 0
  ) {
    return null;
  }

  const a = 17.62;
  const b = 243.12;

  const gamma =
    Math.log(humidity / 100) +
    (a * temp) / (b + temp);

  const dewPoint =
    (b * gamma) / (a - gamma);

  return Math.round(dewPoint * 10) / 10;
}

function numeric(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

async function fetchJson(
  url,
  options = {},
  timeoutMs = 15000
) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ` +
        text.slice(0, 200)
      );
    }

    if (!text) {
      throw new Error('Risposta Netatmo vuota');
    }

    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':
      ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods':
      'GET, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type'
  };
}

function jsonResponse(
  object,
  status = 200,
  extraHeaders = {}
) {
  return new Response(
    JSON.stringify(object, null, 2),
    {
      status,
      headers: {
        'Content-Type':
          'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...corsHeaders(),
        ...extraHeaders
      }
    }
  );
}