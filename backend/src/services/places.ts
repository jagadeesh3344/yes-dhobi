/**
 * Address search for the customer app's "pick your exact location" screen
 * (the Uber/Rapido pattern: type to search, then drag the pin to fine-tune).
 *
 * Backed by Amazon Location Service **Places API v2** (`geo-places`), which is
 * callable with a plain API key - no SigV4 signing and no place-index resource
 * to create. Three operations are used:
 *
 *   Autocomplete   - suggestions as the customer types (no coordinates)
 *   GetPlace       - coordinates + full address for a chosen suggestion
 *   ReverseGeocode - address for a point, used when the pin is dragged
 *
 * `IntendedUse=Storage` is set on the two calls whose result we persist on the
 * customer's address record; AWS requires it and bills those at a higher rate.
 * Autocomplete only supports `SingleUse`, which is why picking a suggestion
 * costs a second (GetPlace) call.
 *
 * Set AWS_LOCATION_API_KEY to switch this on. Without it every function throws
 * a clean 503 so the app can fall back to manual address entry.
 */
import { env } from '../config/env.js';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const API_TIMEOUT_MS = 6_000;

export interface PlaceSuggestion {
  placeId: string;
  /** short display name, e.g. "HSR Layout Sector 2" */
  title: string;
  /** full one-line address, what the app shows under the title */
  label: string;
  placeType?: string;
  /** metres from the bias position, when one was supplied */
  distanceM?: number;
}

export interface ResolvedPlace extends PlaceSuggestion {
  lat: number;
  lng: number;
  pincode?: string;
  city?: string;
  state?: string;
  country?: string;
}

/** AWS address block; only the parts we surface are typed. */
interface AwsAddress {
  Label?: string;
  PostalCode?: string;
  Locality?: string;
  District?: string;
  SubRegion?: { Name?: string };
  Region?: { Name?: string; Code?: string };
  Country?: { Name?: string; Code2?: string };
}

export function placesConfigured(): boolean {
  return Boolean(env.AWS_LOCATION_API_KEY && region());
}

function region(): string | undefined {
  // the Places endpoint is regional; fall back to the backend's own region
  return env.AWS_REGION || undefined;
}

function assertConfigured() {
  if (!placesConfigured()) {
    throw new HttpError(
      503,
      'PLACES_NOT_CONFIGURED',
      'Address search is not switched on yet. Please type the address manually.',
    );
  }
}

async function callPlaces<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown; query?: Record<string, string> }): Promise<T> {
  assertConfigured();
  const url = new URL(`https://places.geo.${region()}.amazonaws.com${path}`);
  url.searchParams.set('key', env.AWS_LOCATION_API_KEY!);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: init.method,
      signal: controller.signal,
      ...(init.body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // the key itself is in the URL - never log the url, only the status
      logger.warn({ status: res.status, path, body: text.slice(0, 300) }, 'places api error');
      if (res.status === 403) throw new HttpError(503, 'PLACES_NOT_CONFIGURED', 'Address search is misconfigured (the location API key was rejected).');
      if (res.status === 429) throw new HttpError(429, 'PLACES_THROTTLED', 'Address search is busy. Please try again.');
      throw new HttpError(502, 'PLACES_FAILED', 'Address search is unavailable right now.');
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if ((err as Error)?.name === 'AbortError') throw new HttpError(504, 'PLACES_TIMEOUT', 'Address search timed out. Please try again.');
    logger.warn({ err, path }, 'places api call failed');
    throw new HttpError(502, 'PLACES_FAILED', 'Address search is unavailable right now.');
  } finally {
    clearTimeout(timer);
  }
}

/** Pull the bits the apps actually need out of an AWS address block. */
function flatten(address: AwsAddress | undefined, title: string) {
  return {
    label: address?.Label ?? title,
    pincode: address?.PostalCode,
    city: address?.Locality ?? address?.District ?? address?.SubRegion?.Name,
    state: address?.Region?.Name ?? address?.Region?.Code,
    country: address?.Country?.Name ?? address?.Country?.Code2,
  };
}

/**
 * Suggestions for a partial address. `bias` (the device's current position)
 * pulls nearby results to the top, which is what makes the list feel right.
 * Results are restricted to India.
 */
export async function autocomplete(q: string, bias?: { lat: number; lng: number }, limit = 8): Promise<PlaceSuggestion[]> {
  const body: Record<string, unknown> = {
    QueryText: q,
    MaxResults: Math.min(Math.max(limit, 1), 20),
    Language: 'en',
    Filter: { IncludeCountries: ['IND'] },
  };
  // BiasPosition and Filter.Circle are mutually exclusive; bias is the better default
  if (bias) body.BiasPosition = [bias.lng, bias.lat];

  const out = await callPlaces<{
    ResultItems?: { PlaceId?: string; Title?: string; PlaceType?: string; Distance?: number; Address?: AwsAddress }[];
  }>('/v2/autocomplete', { method: 'POST', body });

  return (out.ResultItems ?? [])
    .filter((r) => r.PlaceId && r.Title)
    .map((r) => ({
      placeId: r.PlaceId!,
      title: r.Title!,
      ...flatten(r.Address, r.Title!),
      placeType: r.PlaceType,
      ...(r.Distance == null ? {} : { distanceM: r.Distance }),
    }));
}

/**
 * Coordinates + full address for a suggestion the customer tapped. This is the
 * call that turns a suggestion into something we can save and dispatch against.
 */
export async function getPlace(placeId: string): Promise<ResolvedPlace> {
  const out = await callPlaces<{
    PlaceId?: string;
    Title?: string;
    PlaceType?: string;
    Position?: number[];
    Address?: AwsAddress;
  }>(`/v2/place/${encodeURIComponent(placeId)}`, {
    method: 'GET',
    // we persist this on the customer's address record
    query: { 'intended-use': 'Storage', language: 'en' },
  });

  const [lng, lat] = out.Position ?? [];
  if (lat == null || lng == null) throw new HttpError(422, 'PLACE_NO_POSITION', 'That place has no coordinates. Please drop the pin manually.');
  const title = out.Title ?? '';
  return { placeId: out.PlaceId ?? placeId, title, placeType: out.PlaceType, lat, lng, ...flatten(out.Address, title) };
}

/** Address for a point - used every time the customer drags the map pin. */
export async function reverseGeocode(lat: number, lng: number): Promise<ResolvedPlace | null> {
  const out = await callPlaces<{
    ResultItems?: { PlaceId?: string; Title?: string; PlaceType?: string; Position?: number[]; Address?: AwsAddress }[];
  }>('/v2/reverse-geocode', {
    method: 'POST',
    body: {
      QueryPosition: [lng, lat],
      MaxResults: 1,
      Language: 'en',
      QueryRadius: 200,
      IntendedUse: 'Storage', // saved on the customer's address record
    },
  });

  const top = out.ResultItems?.[0];
  if (!top) return null;
  const [rlng, rlat] = top.Position ?? [];
  const title = top.Title ?? '';
  return {
    placeId: top.PlaceId ?? '',
    title,
    placeType: top.PlaceType,
    // prefer the exact point the customer chose over the matched building
    lat: rlat ?? lat,
    lng: rlng ?? lng,
    ...flatten(top.Address, title),
  };
}
