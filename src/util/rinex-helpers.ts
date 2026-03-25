/* ─── Formatting helpers ──────────────────────────────────────── */

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatTime(d: Date): string {
  return d.toISOString().replace('T', ' ').replace('Z', ' UTC');
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

/* ─── File type detection ─────────────────────────────────────── */

export function isNavFileName(name: string): boolean {
  const lower = name.toLowerCase();
  if (/_[MGRECJI]N\.rnx(\.gz)?$/i.test(lower)) return true;
  if (/\.\d{2}[nglpfhiq](\.gz)?$/i.test(lower)) return true;
  if (
    lower.endsWith('.nav') ||
    lower.endsWith('.nnav') ||
    lower.endsWith('.gnav')
  )
    return true;
  return false;
}

export async function sniffFileType(
  file: File,
): Promise<'nav' | 'obs' | 'unknown'> {
  let text: string;
  if (file.name.toLowerCase().endsWith('.gz')) {
    try {
      const ds = new DecompressionStream('gzip');
      const decompressed = file.stream().pipeThrough(ds);
      const reader = decompressed.getReader();
      const decoder = new TextDecoder();
      let head = '';
      while (head.length < 4096) {
        const { done, value } = await reader.read();
        if (done) break;
        head += decoder.decode(value, { stream: true });
      }
      void reader.cancel();
      text = head;
    } catch {
      return 'unknown';
    }
  } else {
    text = await file.slice(0, 4096).text();
  }
  if (
    /N:\s*(GNSS NAV|GPS NAV|GLO NAV|GAL NAV|GEO NAV|BDS NAV|MIXED NAV)/i.test(
      text,
    )
  )
    return 'nav';
  if (/NAVIGATION DATA/i.test(text)) return 'nav';
  if (/OBSERVATION DATA|COMPACT RINEX/i.test(text)) return 'obs';
  return 'unknown';
}

/** Guess constellation from a nav file name. Returns system letter (G/R/E/C/J/I/S) or null. */
export function navFileConstellation(name: string): string | null {
  const lower = name.toLowerCase();
  // RINEX 3/4 long name: _GN, _RN, _EN, _CN, _JN, _IN, _SN, _MN
  const r3 = lower.match(/_([grecjism])n\.rnx/i);
  if (r3) {
    const map: Record<string, string> = {
      g: 'G',
      r: 'R',
      e: 'E',
      c: 'C',
      j: 'J',
      i: 'I',
      s: 'S',
      m: 'M',
    };
    return map[r3[1]!.toLowerCase()] ?? null;
  }
  // Legacy .YYx extension
  const leg = lower.match(/\.\d{2}([nglpfhiq])(?:\.gz)?$/);
  if (leg) {
    const map: Record<string, string> = {
      n: 'G',
      g: 'R',
      l: 'E',
      f: 'C',
      q: 'J',
      i: 'I',
      h: 'S',
      p: 'M',
    };
    return map[leg[1]!] ?? null;
  }
  return null;
}

/** Human label for a constellation letter */
export function constellationLabel(sys: string): string {
  const labels: Record<string, string> = {
    G: 'GPS',
    R: 'GLONASS',
    E: 'Galileo',
    C: 'BeiDou',
    J: 'QZSS',
    I: 'NavIC',
    S: 'SBAS',
    M: 'Mixed',
  };
  return labels[sys] ?? sys;
}

/* ─── IGS broadcast ephemeris download ────────────────────────── */

function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - start) / 86_400_000) + 1;
}

const IGS_PROXY = 'https://ntrip-proxy.gnsscalc.com';

export async function fetchIgsEphemeris(date: Date): Promise<File> {
  const yyyy = String(date.getUTCFullYear());
  const doy = String(dayOfYear(date)).padStart(3, '0');
  const name = `BRDC00IGS_R_${yyyy}${doy}0000_01D_MN.rnx`;

  const res = await fetch(IGS_PROXY, {
    headers: { 'X-Igs-Brdc': `${yyyy}/${doy}` },
  });
  if (!res.ok)
    throw new Error(`Failed to download ephemeris (HTTP ${res.status})`);

  const ds = new DecompressionStream('gzip');
  const decompressed = res.body!.pipeThrough(ds);
  const blob = await new Response(decompressed).blob();
  return new File([blob], name, { type: 'text/plain' });
}

/* ─── File accept strings ─────────────────────────────────────── */

export const OBS_ACCEPT =
  '.obs,.rnx,.crx,.gz,.Z,.26o,.25o,.24o,.23o,.22o,.21o,.20o,.19o,.18o,.17o,.16o,.15o,.14o,.13o,.12o,.11o,.10o,.09o,.08o,.07o,.06o,.05o,.04o,.03o,.02o,.01o,.00o,.26d,.25d,.24d,.23d,.22d,.21d,.20d,.19d,.18d,.17d,.16d,.15d,.14d,.13d,.12d,.11d,.10d,.09d,.08d,.07d,.06d,.05d,.04d,.03d,.02d,.01d,.00d';
export const NAV_ACCEPT = [
  '.rnx,.nav,.nnav,.gnav,.gz',
  // Legacy per-constellation nav extensions (.YYx): n=GPS, g=GLONASS, l=Galileo, f=BeiDou, h=SBAS, i=NavIC, q=QZSS, p=mixed
  ...['n', 'g', 'l', 'f', 'h', 'i', 'q', 'p'].flatMap((c) =>
    Array.from({ length: 27 }, (_, y) => `.${String(y).padStart(2, '0')}${c}`),
  ),
].join(',');
