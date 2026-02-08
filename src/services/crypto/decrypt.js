export async function decrypt(peerId, payload) {
  const s = sessions[peerId];
  const theirDhPub = sodium.from_base64(payload.dhPublicKey);

  // 🔁 DH RATChet step (if key changed)
  if (!s.theirDhPublicKey ||
      !sodium.memcmp(theirDhPub, s.theirDhPublicKey)) {

    const dhOut = await dh(s.dhKeyPair.privateKey, theirDhPublicKey);
    const { newRootKey, chainKey } =
      await kdfRoot(s.rootKey, dhOut);

    s.rootKey = newRootKey;
    s.receivingChainKey = chainKey;
    s.recvCount = 0;

    // Generate new DH keypair for next send
    s.dhKeyPair = await generateDHKeyPair();
    s.theirDhPublicKey = theirDhPublicKey;
  }

  // Advance receiving chain
  while (s.recvCount < payload.counter) {
    const step = await deriveMessageKey(s.receivingChainKey);
    s.receivingChainKey = step.newChainKey;
    s.recvCount++;
  }

  const { messageKey } =
    await deriveMessageKey(s.receivingChainKey);

  const plaintext = sodium.crypto_secretbox_open_easy(
    sodium.from_base64(payload.ciphertext),
    sodium.from_base64(payload.nonce),
    messageKey
  );

  return new TextDecoder().decode(plaintext);
}
