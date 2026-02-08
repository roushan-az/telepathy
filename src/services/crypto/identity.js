import sodium from "libsodium-wrappers";

export async function createIdentity() {
  await sodium.ready;

  const keyPair = sodium.crypto_kx_keypair();
  return {
    publicKey: sodium.to_base64(keyPair.publicKey),
    privateKey: sodium.to_base64(keyPair.privateKey)
  };
}
