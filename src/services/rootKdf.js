import sodium from "libsodium-wrappers";

export async function kdfRoot(rootKey, dhOut) {
  await sodium.ready;

  const combined = new Uint8Array([
    ...rootKey,
    ...dhOut
  ]);

  const newRootKey = sodium.crypto_generichash(32, combined, "ROOT");
  const chainKey = sodium.crypto_generichash(32, combined, "CHAIN");

  return { newRootKey, chainKey };
}
