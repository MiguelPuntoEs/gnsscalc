export default function getArrayFromObject(object) {
  const arrayLike = Object.assign(object, {
    length: Object.keys(object).length,
  });
  return Array.from(arrayLike);
}
