/**
 * Service-area zones come from the backend, not from a hardcoded list.
 *
 * The onboarding form used to ship its own list of zone names and guess the
 * numeric id the backend wanted. The guess only covered the ten Delhi zones,
 * so a Hyderabad vendor who picked "Madhapur" was silently registered in
 * "Lajpat Nagar, New Delhi" (id 1). Reading the zones from the API means the
 * vendor can only pick a zone that exists, and we send back the id the backend
 * actually gave us.
 */

export interface Zone {
  id: number;
  name: string;
  city: string;
  state?: string | null;
}

const ZONES_ENDPOINT = '/api/v1/catalog/zones';
const DIRECT_ZONES_ENDPOINT =
  'http://yesdhobi-alb-648458477.ap-southeast-2.elb.amazonaws.com/api/v1/catalog/zones';

/**
 * Used only when the API cannot be reached, so the form stays usable offline.
 * These are the ids the backend seed assigns; anything added server-side later
 * arrives through the API without a change here.
 */
const FALLBACK_ZONES: Zone[] = [
  { id: 1, name: 'Lajpat Nagar', city: 'New Delhi' },
  { id: 2, name: 'Saket', city: 'New Delhi' },
  { id: 3, name: 'Hauz Khas', city: 'New Delhi' },
  { id: 4, name: 'Karol Bagh', city: 'New Delhi' },
  { id: 5, name: 'Dwarka', city: 'New Delhi' },
  { id: 6, name: 'Rohini', city: 'New Delhi' },
  { id: 7, name: 'Connaught Place', city: 'New Delhi' },
  { id: 8, name: 'Janakpuri', city: 'New Delhi' },
  { id: 9, name: 'Vasant Kunj', city: 'New Delhi' },
  { id: 10, name: 'Greater Kailash', city: 'New Delhi' },
  { id: 11, name: 'Indiranagar', city: 'Bangalore' },
  { id: 12, name: 'HSR Layout', city: 'Bangalore' },
  { id: 13, name: 'Koramangala', city: 'Bangalore' },
  { id: 14, name: 'Bellandur', city: 'Bangalore' },
  { id: 15, name: 'Andheri West', city: 'Mumbai' },
  { id: 16, name: 'Bandra', city: 'Mumbai' },
  { id: 17, name: 'Kothrud', city: 'Pune' },
  { id: 18, name: 'Viman Nagar', city: 'Pune' },
];

let cached: Promise<Zone[]> | null = null;

async function get(url: string): Promise<Zone[]> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Zones request failed (${response.status})`);
  const body = await response.json();
  const rows: unknown = body?.data;
  if (!Array.isArray(rows)) throw new Error('Zones response had no data array');
  const zones = rows
    .map((row: Record<string, unknown>) => ({
      id: Number(row?.id),
      name: typeof row?.name === 'string' ? row.name : '',
      city: typeof row?.city === 'string' ? row.city : '',
      state: typeof row?.state === 'string' ? row.state : null,
    }))
    .filter((z) => Number.isInteger(z.id) && z.id > 0 && z.name.length > 0);
  if (zones.length === 0) throw new Error('Zones response was empty');
  return zones;
}

/** Zones available to pick, fetched once per page load. */
export function fetchZones(): Promise<Zone[]> {
  if (!cached) {
    cached = get(ZONES_ENDPOINT)
      .catch(() => get(DIRECT_ZONES_ENDPOINT))
      .catch(() => FALLBACK_ZONES);
  }
  return cached;
}

/** Turns the zone names held in form state into the ids the backend expects. */
export function resolveZoneIds(selected: string[], zones: Zone[]): number[] {
  const byName = new Map(zones.map((z) => [z.name.toLowerCase(), z.id]));
  const ids: number[] = [];
  for (const entry of selected) {
    if (typeof entry === 'number') {
      ids.push(entry);
      continue;
    }
    const id = byName.get(String(entry).trim().toLowerCase());
    // A name we cannot resolve is dropped rather than defaulted to a real zone
    // in another city.
    if (id !== undefined && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
