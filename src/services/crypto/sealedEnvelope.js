import sodium from "libsodium-wrappers";

export async function sealMessage(
  recipientPublicKey,
  innerMessage
) {
  await sodium.ready;

  const messageBytes = new TextEncoder().encode(
    JSON.stringify(innerMessage)
  );

  const sealed = sodium.crypto_box_seal(
    messageBytes,
    sodium.from_base64(recipientPublicKey)
  );

  return sodium.to_base64(sealed);
}
