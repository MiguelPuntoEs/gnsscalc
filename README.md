# gnsscalc.com

A free online calculator for GNSS engineers. Convert between time scales, transform coordinates, and compute distances — instantly, in your browser.

**[Try it now at gnsscalc.com](https://gnsscalc.com)**

## GPS Time Converter

Convert timestamps across every major GNSS and astronomical time scale in one place:

- **GNSS times** — GPS, Galileo, BeiDou, GLONASS
- **Standard scales** — UTC, TAI, TT, UNIX
- **Astronomical dates** — Julian Date, Modified Julian Date, MJD2000
- **GPS-specific** — Week number, Time of Week (TOW), RINEX format
- **Calendar info** — Day of year, week of year, hour code
- **Time differences** — Elapsed time between any two timestamps
- **Live GPS clock** — Current GPS time, week, and seconds updated in real time

All conversions are bidirectional. Change any field and every other field updates instantly. Leap seconds are handled automatically.

## Positioning Calculator

A full geodetic toolkit for coordinate conversion and spatial computations:

- **Coordinate formats** — ECEF, geodetic (lat/lon/height), DMS, UTM, Maidenhead grid locator, geohash
- **Distances** — Orthodromic (great-circle), loxodromic (rhumb line), and Euclidean, with bearings and midpoint
- **Local frames** — AER (Azimuth/Elevation/Range) and ENU (East/North/Up) from a reference position
- **Horizon distance** — Geometric line-of-sight distance from a given altitude
- **Interactive map** — Visualize positions, great-circle arcs, and distances on a Leaflet map
- **Geolocation** — Use your device location or search an address
- **Shareable links** — Positions are encoded in the URL so you can share or bookmark any result

All computations use the WGS84 ellipsoid with Vincenty's formulae for geodetic accuracy.

## Why gnsscalc?

- **No install, no sign-up** — open the site and start calculating
- **Everything runs in the browser** — your data never leaves your device
- **Instant feedback** — all fields update as you type
- **Copy any value** — one-click copy on every computed result
- **Mobile-friendly** — works on any screen size
- **Built by a GNSS engineer** — designed around the computations you actually need every day

## Built With

[Astro](https://astro.build) + [React](https://react.dev) · [TypeScript](https://www.typescriptlang.org) · [Tailwind CSS](https://tailwindcss.com) · [gnss-js](https://www.npmjs.com/package/gnss-js) · [Leaflet](https://leafletjs.com) · Deployed on [Cloudflare Workers](https://workers.cloudflare.com)

## Development

```bash
pnpm install
pnpm dev
```

| Command        | Description                  |
| -------------- | ---------------------------- |
| `pnpm build`   | Build for production         |
| `pnpm preview` | Preview the production build |
| `pnpm format`  | Format code with Prettier    |

## Author

Miguel González — [miguel.es](https://www.miguel.es)
