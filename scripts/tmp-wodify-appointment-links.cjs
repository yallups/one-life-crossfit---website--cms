const fs = require('fs');
const path = require('path');

async function loadEnv() {
  const envPath = path.join(process.cwd(), 'apps/web/.env.local');
  if (fs.existsSync(envPath)) {
    const txt = fs.readFileSync(envPath, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const idx = line.indexOf('=');
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

async function fetchSanitySettings() {
  const projectId = process.env.SANITY_STUDIO_PROJECT_ID || process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.SANITY_STUDIO_DATASET || process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
  const token = process.env.SANITY_API_TOKEN || process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_API_READ_TOKEN;
  if (!projectId || !dataset || !token) {
    throw new Error('Missing Sanity env (projectId/dataset/token).');
  }
  const query = `*[_type == "settings"][0]{ "token": wodifyApiToken, "locationId": wodifyLocationId }`;
  const url = new URL(`https://${projectId}.api.sanity.io/v2025-02-10/data/query/${dataset}`);
  url.searchParams.set('query', query);
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Sanity query failed ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data?.result || {};
}

async function fetchWodify(pathname, params = {}) {
  const token = global.__wodifyToken;
  if (!token) throw new Error('Missing Wodify token.');
  const url = new URL(`https://api.wodify.com${pathname}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && `${v}` !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'X-Api-Key': token, Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Wodify request failed ${res.status}: ${text}`);
  }
  return res.json();
}

async function tryFetchDurations(serviceId) {
  const endpoints = [
    `/v1/appointments/services/${serviceId}/durations`,
    `/v1/appointments/services/${serviceId}/service-durations`,
    `/v1/appointments/services/${serviceId}`,
    `/v1/appointments/service-durations`,
  ];
  for (const path of endpoints) {
    try {
      const data = await fetchWodify(path, { serviceId });
      return { path, data };
    } catch (err) {
      continue;
    }
  }
  return null;
}

function normalizeArray(data) {
  if (Array.isArray(data)) return data;
  const candidates = [data?.services, data?.data, data?.items, data?.membership_templates];
  for (const c of candidates) if (Array.isArray(c)) return c;
  return [];
}

function buildPaymentPlanUrl({ onlineMembershipId, locationId, serviceId, serviceDurationId }) {
  const q = `PaymentPlans|OnlineMembershipId=${onlineMembershipId}&LocationId=${locationId}&ServiceId=${serviceId}&ServiceDurationId=${serviceDurationId}`;
  return `https://onelifefitness.wodify.com/OnlineSalesPage/Main?q=${encodeURIComponent(q)}`;
}

(async () => {
  await loadEnv();
  const settings = await fetchSanitySettings();
  const wodifyToken = settings?.token?.trim();
  if (!wodifyToken) throw new Error('Wodify API token not found in Sanity settings.');
  global.__wodifyToken = wodifyToken;

  const locationId = settings?.locationId || process.env.WODIFY_LOCATION_ID || 9721;

  const servicesRaw = await fetchWodify('/v1/appointments/services');
  const services = normalizeArray(servicesRaw);

  let templatesRaw = null;
  let templates = [];
  try {
    templatesRaw = await fetchWodify('/v1/memberships/templates');
    templates = normalizeArray(templatesRaw);
  } catch (err) {
    templates = [];
  }

  const results = [];
  const durationRawByService = {};
  for (const svc of services) {
    const serviceId = svc.id || svc.serviceId || svc.service_id || svc.serviceID;
    const serviceName = svc.name || svc.service_name || svc.serviceName;
    let durations = svc.durations || svc.service_durations || svc.serviceDurations || [];
    if ((!Array.isArray(durations) || durations.length === 0) && serviceId) {
      const probe = await tryFetchDurations(serviceId);
      if (probe) {
        durationRawByService[serviceId] = { path: probe.path, data: probe.data };
        const normalized = normalizeArray(probe.data);
        durations = normalized.length ? normalized : (probe.data?.durations || []);
      }
    }
    if (!Array.isArray(durations) || durations.length === 0) {
      results.push({ serviceName, serviceId, durations: [], note: 'No durations found' });
      continue;
    }
    const durationEntries = durations.map((d) => {
      const serviceDurationId = d.id || d.duration_id || d.serviceDurationId || d.service_duration_id;
      return { serviceDurationId, durationName: d.name || d.duration_name || d.durationName || d.minutes || d.length || null };
    });
    results.push({ serviceName, serviceId, durations: durationEntries });
  }

  const templateIndex = new Map();
  for (const t of templates) {
    const svcId = t.serviceId || t.service_id || t.serviceID;
    const onlineMembershipId = t.id || t.onlineMembershipId || t.online_membership_id;
    if (svcId && onlineMembershipId) templateIndex.set(String(svcId), onlineMembershipId);
  }

  const links = [];
  for (const svc of results) {
    const onlineMembershipId = templateIndex.get(String(svc.serviceId));
    for (const d of svc.durations) {
      if (onlineMembershipId && d.serviceDurationId) {
        links.push({
          serviceName: svc.serviceName,
          serviceId: svc.serviceId,
          serviceDurationId: d.serviceDurationId,
          onlineMembershipId,
          locationId,
          url: buildPaymentPlanUrl({ onlineMembershipId, locationId, serviceId: svc.serviceId, serviceDurationId: d.serviceDurationId }),
        });
      }
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    locationId,
    serviceCount: results.length,
    services: results,
    templatesFound: templates.length,
    paymentPlanLinks: links,
    _debug: {
      templatesRaw: templatesRaw || null,
      durationRawByService,
    },
  };

  const outPath = path.join(process.cwd(), 'content-specs/appointment-service-urls.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(`Services: ${results.length}, Templates: ${templates.length}, Links: ${links.length}`);
})();
