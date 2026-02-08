import sodium from "libsodium-wrappers";
import { RatchetState } from "./ratchetState";
import { deriveMessageKey } from "./kdf";
import { generateDHKeyPair, dh } from "./dh";
import { kdfRoot } from "./rootKdf";

const sessions = {}; // peerId → RatchetState

export async function initSession(peerId, sharedSecret, theirDhPublicKey) {
  await sodium.ready;

  const myDh = await generateDHKeyPair();

  const dhOut = await dh(myDh.privateKey, theirDhPublicKey);
  const { newRootKey, chainKey } = await kdfRoot(sharedSecret, dhOut);

  const state = new RatchetState(
    newRootKey,
    myDh,
    theirDhPublicKey
  );

  state.sendingChainKey = chainKey;
  sessions[peerId] = state;
}
