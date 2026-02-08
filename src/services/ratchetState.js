export class RatchetState {
  constructor(rootKey, dhKeyPair, theirDhPublicKey) {
    this.rootKey = rootKey;

    this.dhKeyPair = dhKeyPair;               // my DH
    this.theirDhPublicKey = theirDhPublicKey; // their DH

    this.sendingChainKey = null;
    this.receivingChainKey = null;

    this.sendCount = 0;
    this.recvCount = 0;
  }
}
