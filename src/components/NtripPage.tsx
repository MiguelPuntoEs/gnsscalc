import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  lazy,
  Suspense,
} from 'react';
import type { NtripVersion, Sourcetable } from 'gnss-js/ntrip';
import type { StreamStats, MsmEpoch } from 'gnss-js/rtcm3';
import { fetchSourcetable, connectToMountpoint } from '../util/ntrip';
import {
  Rtcm3Decoder,
  createStreamStats,
  updateStreamStats,
  decodeMsmFull,
  resetGloFreqCache,
  msmEpochToDate,
} from 'gnss-js/rtcm3';
import { writeRinexObs } from '../util/rinex-writer';
import ConnectionForm from './ntrip/ConnectionForm';
import SourcetableView from './ntrip/SourcetableView';
import StreamMonitor from './ntrip/StreamMonitor';
import { SpinnerIcon } from './ntrip/Icons';

/* ─── Mountpoint map (lazy-loaded) ─────────────────────────────── */

const MountpointMap = lazy(() => import('./NtripMap'));

/* ─── Main page component ─────────────────────────────────────── */

type PageState = 'idle' | 'loading' | 'sourcetable' | 'streaming';

export default function NtripPage() {
  const [state, setState] = useState<PageState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [sourcetable, setSourcetable] = useState<Sourcetable | null>(null);
  const [connectionInfo, setConnectionInfo] = useState<{
    host: string;
    port: number;
    version: NtripVersion;
    username: string;
    password: string;
  } | null>(null);

  // Stream state
  const [streamMountpoint, setStreamMountpoint] = useState<string | null>(null);
  const [streamConnecting, setStreamConnecting] = useState<string | null>(null);
  const [streamStats, setStreamStats] = useState<StreamStats | null>(null);
  const statsRef = useRef<StreamStats | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const updateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const reconnectAttemptsRef = useRef(0);

  // RINEX recording state
  const [rinexRecording, setRinexRecording] = useState(false);
  const [rinexEpochCount, setRinexEpochCount] = useState(0);
  const rinexRecordingRef = useRef(false);
  const rinexEpochsRef = useRef<MsmEpoch[]>([]);
  const rinexEpochTowsRef = useRef(new Set<number>());
  const rinexRefTimeRef = useRef(new Date());

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.();
      if (updateTimerRef.current) clearInterval(updateTimerRef.current);
    };
  }, []);

  // Warn before closing tab while recording
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (rinexRecordingRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const handleConnect = useCallback(
    async (
      host: string,
      port: number,
      version: NtripVersion,
      username: string,
      password: string,
    ) => {
      setError(null);
      setState('loading');
      setConnectionInfo({ host, port, version, username, password });

      try {
        const st = await fetchSourcetable({
          host,
          port,
          version,
          username,
          password,
        });
        if (
          st.streams.length === 0 &&
          st.casters.length === 0 &&
          st.networks.length === 0
        ) {
          throw new Error('Caster returned an empty sourcetable.');
        }
        setSourcetable(st);
        setState('sourcetable');
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : 'Failed to connect to caster',
        );
        setState('idle');
      }
    },
    [],
  );

  const handleStreamConnect = useCallback(
    async (mountpoint: string) => {
      if (!connectionInfo) return;
      setError(null);
      setStreamConnecting(mountpoint);
      reconnectAttemptsRef.current = 0;

      try {
        const conn = await connectToMountpoint({
          ...connectionInfo,
          mountpoint,
        });

        const stats = createStreamStats();
        statsRef.current = stats;
        setStreamStats({ ...stats });
        setStreamMountpoint(mountpoint);
        setStreamConnecting(null);
        setState('streaming');

        abortRef.current = conn.abort;
        const decoder = new Rtcm3Decoder();
        resetGloFreqCache();

        // Periodic UI update (clone Maps so React sees new references)
        updateTimerRef.current = setInterval(() => {
          if (statsRef.current) {
            const obsTypesClone: Record<string, Set<string>> = {};
            for (const [sys, set] of Object.entries(
              statsRef.current.obsTypes,
            )) {
              obsTypesClone[sys] = new Set(set);
            }
            setStreamStats({
              ...statsRef.current,
              messageTypes: new Map(statsRef.current.messageTypes),
              satellites: new Map(statsRef.current.satellites),
              ephemerides: new Map(statsRef.current.ephemerides),
              obsTypes: obsTypesClone,
              stationMeta: { ...statsRef.current.stationMeta },
            });
          }
          setRinexEpochCount(rinexEpochTowsRef.current.size);
        }, 1000);

        // Read loop
        const readLoop = async () => {
          try {
            while (true) {
              const { done, value } = await conn.reader.read();
              if (done) break;
              const frames = decoder.decode(value);
              updateStreamStats(stats, frames, value.byteLength);

              // Decode MSM for RINEX recording
              if (rinexRecordingRef.current) {
                for (const frame of frames) {
                  const epoch = decodeMsmFull(frame);
                  if (epoch) {
                    rinexEpochsRef.current.push(epoch);
                    // Round to 10ms to group concurrent MSM messages (same as rinex-writer)
                    const date = msmEpochToDate(
                      epoch.system,
                      epoch.epochMs,
                      rinexRefTimeRef.current,
                    );
                    const key = Math.round(date.getTime() / 10) * 10;
                    rinexEpochTowsRef.current.add(key);
                  }
                }
              }
            }
          } catch (err: unknown) {
            if (!(err instanceof DOMException && err.name === 'AbortError')) {
              // Auto-reconnect with exponential backoff (max 3 attempts)
              const attempts = reconnectAttemptsRef.current;
              if (attempts < 3 && mountpoint) {
                reconnectAttemptsRef.current = attempts + 1;
                setReconnecting(true);
                const delay = Math.min(1000 * Math.pow(2, attempts), 8000);
                setTimeout(() => {
                  setReconnecting(false);
                  void handleStreamConnect(mountpoint);
                }, delay);
              } else {
                setError(
                  `Stream disconnected: ${err instanceof Error ? err.message : 'unknown error'}`,
                );
                reconnectAttemptsRef.current = 0;
              }
            }
          } finally {
            if (updateTimerRef.current) clearInterval(updateTimerRef.current);
            setStreamStats(statsRef.current ? { ...statsRef.current } : null);
          }
        };
        void readLoop();
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to connect to mountpoint',
        );
        setStreamConnecting(null);
      }
    },
    [connectionInfo],
  );

  const handleToggleRecord = useCallback(() => {
    if (rinexRecordingRef.current) {
      // Stop recording
      rinexRecordingRef.current = false;
      setRinexRecording(false);
    } else {
      // Start recording — clear previous data
      rinexEpochsRef.current = [];
      rinexEpochTowsRef.current.clear();
      rinexRefTimeRef.current = new Date();
      rinexRecordingRef.current = true;
      setRinexRecording(true);
      setRinexEpochCount(0);
    }
  }, []);

  const handleDownloadRinex = useCallback(() => {
    const epochs = rinexEpochsRef.current;
    if (epochs.length === 0) return;

    const mount = streamMountpoint ?? 'UNKN';
    const meta = statsRef.current?.stationMeta;
    const rinex = writeRinexObs(
      epochs,
      {
        markerName: mount,
        comment: `NTRIP stream: ${connectionInfo?.host ?? ''}:${connectionInfo?.port ?? 2101}/${mount}`,
        receiverType: meta?.receiverType ?? undefined,
        receiverVersion: meta?.receiverFirmware ?? undefined,
        receiverNumber: meta?.receiverSerial ?? undefined,
        antennaType: meta?.antennaType ?? undefined,
        antennaNumber: meta?.antennaSerial ?? undefined,
        approxPosition: meta?.position ?? undefined,
        antennaDelta:
          meta?.antennaHeight != null ? [meta.antennaHeight, 0, 0] : undefined,
      },
      rinexRefTimeRef.current,
    );

    const blob = new Blob([rinex], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    // RINEX 3 long filename (Appendix A1, RINEX 3.05):
    // SSSSMRCCC_S_YYYYDDDHHMM_PER_FREQ_MO.rnx
    // S = streamed data source
    const start = rinexRefTimeRef.current;
    const yyyy = start.getUTCFullYear();
    const doy = String(
      Math.floor((start.getTime() - Date.UTC(yyyy, 0, 1)) / 86400000) + 1,
    ).padStart(3, '0');
    const hh = String(start.getUTCHours()).padStart(2, '0');
    const mm = String(start.getUTCMinutes()).padStart(2, '0');
    // File period (DDU): M=minutes, H=hours, D=days
    const durSec = Math.round((Date.now() - start.getTime()) / 1000);
    const durH = Math.floor(durSec / 3600);
    const durM = Math.floor((durSec % 3600) / 60);
    const per =
      durH > 0
        ? `${String(durH).padStart(2, '0')}H`
        : `${String(Math.max(durM, 1)).padStart(2, '0')}M`;
    // Data frequency (DDU): Z=Hertz, S=seconds, M=minutes, H=hours
    let freq = '01S';
    if (epochs.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < Math.min(epochs.length, 20); i++) {
        const dtMs = Math.abs(epochs[i]!.epochMs - epochs[i - 1]!.epochMs);
        if (dtMs > 0 && dtMs < 300000) intervals.push(dtMs / 1000);
      }
      if (intervals.length > 0) {
        const median = intervals.sort((a, b) => a - b)[
          Math.floor(intervals.length / 2)
        ]!;
        if (median < 1) {
          // Sub-second → use Hertz
          freq = `${String(Math.round(1 / median)).padStart(2, '0')}Z`;
        } else if (median >= 60) {
          freq = `${String(Math.round(median / 60)).padStart(2, '0')}M`;
        } else {
          freq = `${String(Math.round(median)).padStart(2, '0')}S`;
        }
      }
    }
    // Pad station name to 9 chars (RINEX convention)
    const siteId =
      mount.length >= 9 ? mount.substring(0, 9) : mount.padEnd(9, '0');

    a.href = url;
    a.download = `${siteId}_S_${yyyy}${doy}${hh}${mm}_${per}_${freq}_MO.rnx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [streamMountpoint, connectionInfo]);

  const handleDisconnect = useCallback(() => {
    abortRef.current?.();
    abortRef.current = null;
    if (updateTimerRef.current) {
      clearInterval(updateTimerRef.current);
      updateTimerRef.current = null;
    }
    rinexRecordingRef.current = false;
    setRinexRecording(false);
    setStreamMountpoint(null);
    setStreamConnecting(null);
    setState('sourcetable');
  }, []);

  const handleBack = useCallback(() => {
    abortRef.current?.();
    abortRef.current = null;
    if (updateTimerRef.current) {
      clearInterval(updateTimerRef.current);
      updateTimerRef.current = null;
    }
    rinexRecordingRef.current = false;
    setRinexRecording(false);
    rinexEpochsRef.current = [];
    rinexEpochTowsRef.current.clear();
    setRinexEpochCount(0);
    setSourcetable(null);
    setStreamMountpoint(null);
    setStreamConnecting(null);
    setStreamStats(null);
    setState('idle');
    setError(null);
  }, []);

  // Streams with valid coordinates for map
  const mappableStreams = useMemo(
    () =>
      sourcetable?.streams.filter(
        (s) => s.latitude !== 0 || s.longitude !== 0,
      ) ?? [],
    [sourcetable],
  );

  // Look up the connected stream entry from the sourcetable
  const streamEntry = useMemo(() => {
    if (!streamMountpoint || !sourcetable) return null;
    return (
      sourcetable.streams.find((s) => s.mountpoint === streamMountpoint) ?? null
    );
  }, [streamMountpoint, sourcetable]);

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Connection form — always visible in idle/loading state */}
      {(state === 'idle' || state === 'loading') && (
        <ConnectionForm
          onConnect={(...args) => void handleConnect(...args)}
          loading={state === 'loading'}
        />
      )}

      {/* Back button when showing results */}
      {(state === 'sourcetable' || state === 'streaming') && (
        <button
          className="btn-secondary flex items-center gap-1.5 mb-2"
          onClick={handleBack}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="size-3.5"
          >
            <path
              fillRule="evenodd"
              d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
              clipRule="evenodd"
            />
          </svg>
          New connection
        </button>
      )}

      {/* Sourcetable view */}
      {state === 'sourcetable' && sourcetable && connectionInfo && (
        <>
          <SourcetableView
            sourcetable={sourcetable}
            host={connectionInfo.host}
            port={connectionInfo.port}
            version={connectionInfo.version}
            username={connectionInfo.username}
            password={connectionInfo.password}
            onStreamConnect={(mp) => void handleStreamConnect(mp)}
            streamConnecting={streamConnecting}
          />
          {mappableStreams.length > 0 && (
            <Suspense
              fallback={
                <div className="h-[400px] rounded-lg bg-bg-raised/30 animate-pulse" />
              }
            >
              <MountpointMap streams={mappableStreams} />
            </Suspense>
          )}
        </>
      )}

      {/* Reconnecting indicator */}
      {reconnecting && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300 flex items-center gap-2">
          <SpinnerIcon className="size-3.5 animate-spin" />
          Reconnecting to stream…
        </div>
      )}

      {/* Live stream monitor */}
      {state === 'streaming' && streamMountpoint && streamStats && (
        <StreamMonitor
          mountpoint={streamMountpoint}
          stats={streamStats}
          onDisconnect={handleDisconnect}
          recording={rinexRecording}
          onToggleRecord={handleToggleRecord}
          onDownloadRinex={handleDownloadRinex}
          rinexEpochs={rinexEpochCount}
          streamEntry={streamEntry}
        />
      )}
    </div>
  );
}
