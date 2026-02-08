import sodium from "libsodium-wrappers";

export async function generateSafetyNumber(
  myPublicKey,
  theirPublicKey
) {
  await sodium.ready;

  // Sort keys so both sides get same result
  const combined =
    myPublicKey < theirPublicKey
      ? myPublicKey + theirPublicKey
      : theirPublicKey + myPublicKey;

  const hash = sodium.crypto_generichash(
    32,
    combined,
    "SIGNAL_SAFETY"
  );

  return formatSafetyNumber(hash);
}
