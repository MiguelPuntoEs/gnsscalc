import { Scale } from 'gnss-js';

export const SECONDS_IN_WEEK: number = 604800;
export const SECONDS_IN_DAY: number = 86400;
export const SECONDS_IN_HOUR: number = 3600;
export const SECONDS_IN_MINUTE: number = 60;
export const MILLISECONDS_IN_WEEK: number = 604800000;
export const MILLISECONDS_IN_DAY: number = 86400000;
export const MILLISECONDS_IN_HOUR: number = 3600000;
export const MILLISECONDS_IN_MINUTE: number = 60000;
export const MILLISECONDS_IN_SECOND: number = 1000;
export const SECONDS_TT_TAI: number = 32.184;
export const START_LEAP_SECS_GPS: number = 19;
export const START_GPS_TIME: Date = new Date(Date.UTC(1980, 0, 6, 0, 0, 0, 0));
export const START_GAL_TIME: Date = new Date(Date.UTC(1999, 7, 22, 0, 0, 0));
export const START_BDS_TIME: Date = new Date(Date.UTC(2006, 0, 1, 0, 0, 0));
export const START_UNIX_TIME: Date = new Date(Date.UTC(1970, 0, 1, 0, 0, 0));
export const START_MJD2000_TIME: Date = new Date(Date.UTC(2000, 0, 1, 0, 0, 0));
export const ALPHABET: string[] = 'abcdefghijklmnopqrstuvwxyz'.split('');
export const START_GLO_LEAP: Date = new Date(Date.UTC(1996, 0, 1, 0, 0, 0, 0));
export const START_JULIAN_CALENDAR_UNIX_SECONDS = 2440587.5;
export const START_MJD_UNIX_SECONDS: number = 40587.0;
export const SCALE: Scale = Scale.TT;
