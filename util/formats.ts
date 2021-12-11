type DegMinSecs = {
  degrees: number;
  minutes: number;
  seconds: number;
  direction: string;
};

export function formatNumWithDecimals(num: number | string, limit: number) {
  let val = "";
  if (typeof num === "number") {
    val = num.toString();
  } else {
    val = num.replace(/,/g, ".");
  }

  const decimals = val.split(".");

  if (decimals.length === 1) {
    return val;
  }

  if (decimals[1].length <= limit) {
    return val;
  }

  return Number(val).toFixed(limit);
}

export function formatLatitudeDegMinSecs({
  degrees,
  minutes,
  seconds,
  direction,
}: DegMinSecs) {
  return `${degrees.toString().padStart(2, "0")}º ${minutes
    .toString()
    .padStart(2, "0")}' ${seconds.toFixed(3).padStart(6, "0")}" ${direction}`;
}

export function formatLongitudeDegMinSecs({
  degrees,
  minutes,
  seconds,
  direction,
}: DegMinSecs) {
  return `${degrees.toString().padStart(3, "0")}º ${minutes
    .toString()
    .padStart(2, "0")}' ${seconds.toFixed(3).padStart(6, "0")}" ${direction}`;
}
