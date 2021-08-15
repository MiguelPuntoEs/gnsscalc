export function formatNumWithDecimals(num, limit) {
  let val = num;
  if (typeof num === "number") {
    val = num.toString();
  } else {
    val = val.replace(/,/g, ".");
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
