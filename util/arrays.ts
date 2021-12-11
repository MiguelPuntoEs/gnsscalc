export default function getArrayFromObject(object: Record<string, unknown>) {
  const arrayLike = Object.assign(object, {
    length: Object.keys(object).length,
  });
  return Array.from(arrayLike);
}
