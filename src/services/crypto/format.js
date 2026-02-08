export function formatSafetyNumber(bytes) {
  const digits = Array.from(bytes)
    .map(b => (b % 10).toString())
    .join("");

  return digits.match(/.{1,5}/g).join(" ");
}
