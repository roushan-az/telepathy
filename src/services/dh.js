import sodium from "libsodium-wrappers";

export async function generateDHKeyPair() {
  await sodium.ready;
  return sodium.crypto_kx_keypair();
}

export async function dh(sharedPrivateKey, theirPublicKey) {
  await sodium.ready;
  return sodium.crypto_scalarmult(
    sharedPrivateKey,
    theirPublicKey
  );
}
