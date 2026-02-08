export async function encrypt(peerId, plaintext) {
  const s = sessions[peerId];

  // Advance sending chain
  const { newChainKey, messageKey } =
    await deriveMessageKey(s.sendingChainKey);

  s.sendingChainKey = newChainKey;
  s.sendCount++;

  const nonce = sodium.randombytes_buf(
    sodium.crypto_secretbox_NONCEBYTES
  );

  const ciphertext = sodium.crypto_secretbox_easy(
    plaintext,
    nonce,
    messageKey
  );

  return {
    dhPublicKey: sodium.to_base64(s.dhKeyPair.publicKey),
    counter: s.sendCount,
    nonce: sodium.to_base64(nonce),
    ciphertext: sodium.to_base64(ciphertext)
  };
}
