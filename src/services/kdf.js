import sodium from "libsodium-wrappers";

export async function deriveMessageKey(chainKey) {
  await sodium.ready;

  const newChainKey = sodium.crypto_generichash(
    32,
    chainKey,
    "CHAIN_KEY"
  );

  const messageKey = sodium.crypto_generichash(
    32,
    chainKey,
    "MESSAGE_KEY"
  );

  return { newChainKey, messageKey };
}
