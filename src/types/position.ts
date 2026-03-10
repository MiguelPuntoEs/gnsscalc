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
