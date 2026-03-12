import { systemCmp } from '../util/rinex';
import { SYS_SHORT, systemColor } from '../util/gnss-constants';

const OBS_TYPE_LABELS: Record<string, string> = {
  C: 'Pseudorange', L: 'Carrier phase', S: 'Signal strength', D: 'Doppler',
};

export default function ObsTypeMatrix({ obsTypes, systems }: { obsTypes: Record<string, string[]>; systems: string[] }) {
  const isV2 = !!obsTypes['_v2'];
  const sysList = isV2 ? systems : Object.keys(obsTypes).filter(s => s !== '_v2').sort(systemCmp);
  if (sysList.length === 0) return null;

  const codesBySys: Record<string, Set<string>> = {};
  for (const sys of sysList) {
    codesBySys[sys] = new Set(isV2 ? obsTypes['_v2'] : (obsTypes[sys] ?? []));
  }

  const allCodes = new Set<string>();
  for (const set of Object.values(codesBySys)) {
    for (const c of set) allCodes.add(c);
  }
  const grouped: Record<string, string[]> = {};
  for (const code of allCodes) {
    const type = code.charAt(0);
    if (!grouped[type]) grouped[type] = [];
    grouped[type]!.push(code);
  }
  const typeOrder = ['C', 'L', 'D', 'S'];
  const sortedTypes = Object.keys(grouped).sort((a, b) => (typeOrder.indexOf(a) - typeOrder.indexOf(b)));
  for (const t of sortedTypes) grouped[t]!.sort();

  return (
    <div className="col-span-2 mt-1">
      <div className="section-divider" />
      <div className="section-label">Observation types</div>
      <div className="mt-2 overflow-x-auto">
        {sortedTypes.map(type => {
          const codes = grouped[type]!;
          return (
            <div key={type} className="mb-2.5 last:mb-0">
              <div className="text-[10px] uppercase tracking-wider text-fg/30 mb-1">
                {OBS_TYPE_LABELS[type] ?? type}
              </div>
              <div className="grid gap-px" style={{
                gridTemplateColumns: `36px repeat(${codes.length}, minmax(28px, 1fr))`,
              }}>
                <div />
                {codes.map(code => (
                  <div key={code} className="text-center text-[9px] font-mono text-fg/30 pb-0.5">
                    {code}
                  </div>
                ))}
                {sysList.map(sys => {
                  const sysSet = codesBySys[sys]!;
                  const color = systemColor(sys);
                  return (
                    <div key={sys} className="contents">
                      <div className="text-[10px] font-medium h-5 flex items-center" style={{ color }}>
                        {SYS_SHORT[sys] ?? sys}
                      </div>
                      {codes.map(code => {
                        const has = sysSet.has(code);
                        return (
                          <div key={code} className="flex items-center justify-center h-5">
                            {has ? (
                              <span className="size-2.5 rounded-full" style={{ backgroundColor: color, opacity: 0.85 }} />
                            ) : (
                              <span className="size-1.5 rounded-full bg-fg/6" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
