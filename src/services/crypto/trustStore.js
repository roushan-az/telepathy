export function markVerified(peerId) {
  localStorage.setItem(`verified:${peerId}`, "true");
}

export function isVerified(peerId) {
  return localStorage.getItem(`verified:${peerId}`) === "true";
}
