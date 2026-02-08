export function storeIdentity(identity) {
  localStorage.setItem("identity", JSON.stringify(identity));
}

export function loadIdentity() {
  return JSON.parse(localStorage.getItem("identity"));
}
