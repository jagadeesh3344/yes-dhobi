import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, parseQuery } from '../../lib/http.js';
import { notFound } from '../../lib/errors.js';
import { distanceKm, round2 } from '../../lib/utils.js';
import { autocomplete, getPlace, placesConfigured, reverseGeocode } from '../../services/places.js';

/**
 * Address lookup for the "pick your exact location" screen.
 *
 * The flow the customer app should follow:
 *   1. GET /geo/autocomplete?q=hsr&lat=..&lng=..   as the customer types
 *   2. GET /geo/place/:placeId                     when they tap a suggestion -> lat/lng
 *   3. GET /geo/reverse?lat=..&lng=..              every time they drag the pin
 *   4. GET /geo/serviceability?lat=..&lng=..       before letting them continue
 *
 * Steps 1-3 need AWS_LOCATION_API_KEY. Step 4 is local and always works.
 */
export const geoRouter = Router();

const latLng = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });

/** Is address search switched on? The app can use this to hide the search box. */
geoRouter.get(
  '/config',
  asyncHandler(async (_req, res) => {
    res.json({ searchEnabled: placesConfigured() });
  }),
);

geoRouter.get(
  '/autocomplete',
  asyncHandler(async (req, res) => {
    const q = parseQuery(
      z.object({
        q: z.string().trim().min(2, 'Type at least 2 characters').max(200),
        lat: z.coerce.number().min(-90).max(90).optional(),
        lng: z.coerce.number().min(-180).max(180).optional(),
        limit: z.coerce.number().int().min(1).max(20).default(8),
      }),
      req.query,
    );
    const bias = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : undefined;
    res.json({ data: await autocomplete(q.q, bias, q.limit) });
  }),
);

/** Turn a tapped suggestion into coordinates we can save and dispatch against. */
geoRouter.get(
  '/place/:placeId',
  asyncHandler(async (req, res) => {
    res.json(await getPlace(req.params.placeId!));
  }),
);

/** The pin was dragged (or the device just reported GPS): what address is this? */
geoRouter.get(
  '/reverse',
  asyncHandler(async (req, res) => {
    const { lat, lng } = parseQuery(latLng, req.query);
    const place = await reverseGeocode(lat, lng);
    if (!place) throw notFound('Address for this point');
    res.json(place);
  }),
);

/**
 * Do we deliver here? Checks the point against the active zones' circles.
 * Zones without a centre are treated as city-wide and matched on name/city.
 */
geoRouter.get(
  '/serviceability',
  asyncHandler(async (req, res) => {
    const q = parseQuery(latLng.extend({ city: z.string().trim().max(80).optional() }), req.query);
    const zones = await prisma.zone.findMany({ where: { isActive: true } });

    const scored = zones
      .filter((z) => z.centerLat != null && z.centerLng != null)
      .map((z) => ({ zone: z, distance: round2(distanceKm(q.lat, q.lng, z.centerLat!, z.centerLng!)) }))
      .sort((a, b) => a.distance - b.distance);

    const inside = scored.find((s) => s.distance <= (s.zone.radiusKm ?? 10));
    // fall back to a city-name match for zones that have no circle configured
    const byCity = inside
      ? null
      : q.city
        ? zones.find((z) => !z.centerLat && z.city.toLowerCase() === q.city!.toLowerCase())
        : null;
    const match = inside?.zone ?? byCity ?? null;
    const nearest = scored[0];

    res.json({
      serviceable: Boolean(match),
      zone: match ? { id: match.id, name: match.name, city: match.city } : null,
      ...(match
        ? {}
        : {
            message: nearest
              ? `We do not deliver here yet. Our nearest service area is ${nearest.zone.name} (${nearest.distance} km away).`
              : 'We do not deliver here yet.',
            nearestZone: nearest ? { id: nearest.zone.id, name: nearest.zone.name, city: nearest.zone.city, distanceKm: nearest.distance } : null,
          }),
    });
  }),
);
