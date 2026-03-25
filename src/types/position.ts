export type Coordinate = {
  value?: number;
  degrees: number;
  minutes: number;
  seconds: number;
  direction: 'N' | 'S' | 'E' | 'W';
};

export type PositionResult = {
  latitude: Coordinate;
  longitude: Coordinate;
  height: number;
};

export type AERResult = {
  elevationDeg: number;
  azimuthDeg: number;
  slant: number;
};

export type ENUResult = {
  deltaE: number;
  deltaN: number;
  deltaU: number;
};

export type Position = [number, number, number];

export type DistanceResult = {
  orthodromic: number;
  loxodromic: number;
  euclidean: number;
  initialBearing: number;
  finalBearing: number;
  rhumbBearing: number;
  midpoint: [number, number]; // [lat, lon] in degrees
  horizonA: number;
  horizonB: number;
};

export type CoordinateFormats = {
  utm: {
    easting: number;
    northing: number;
    zone: number;
    hemisphere: 'N' | 'S';
  };
  maidenhead: string;
  geohash: string;
};
