import sodium from "libsodium-wrappers";

export async function deriveSessionKey(
  myPrivateKey,
  theirPublicKey
) {
  await sodium.ready;

  const rx = sodium.crypto_kx_client_session_keys(
    sodium.from_base64(myPublicKey),
    sodium.from_base64(myPrivateKey),
    sodium.from_base64(theirPublicKey)
  );

  return rx.sharedRx; // symmetric session key
}
