let pc = null;
let localStream = null;

const iceServers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
    // add TURN here in production
  ]
};

export async function createPeerConnection(onIceCandidate, onTrack) {
  pc = new RTCPeerConnection(iceServers);

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      onIceCandidate(event.candidate);
    }
  };

  pc.ontrack = (event) => {
    onTrack(event.streams[0]);
  };

  return pc;
}

export async function getUserMedia(audio = true, video = false) {
  localStream = await navigator.mediaDevices.getUserMedia({
    audio,
    video
  });
  return localStream;
}

export function addTracks() {
  localStream.getTracks().forEach(track =>
    pc.addTrack(track, localStream)
  );
}

export async function createOffer() {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  return offer;
}

export async function createAnswer(offer) {
  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return answer;
}

export async function setRemoteAnswer(answer) {
  await pc.setRemoteDescription(answer);
}

export async function addIceCandidate(candidate) {
  await pc.addIceCandidate(candidate);
}

export function closeConnection() {
  pc?.close();
  localStream?.getTracks().forEach(t => t.stop());
}

export function toggleMute() {
  if (!localStream) return;
  localStream.getAudioTracks().forEach(track => {
    track.enabled = !track.enabled;
  });
}

export function toggleCamera() {
  if (!localStream) return;
  localStream.getVideoTracks().forEach(track => {
    track.enabled = !track.enabled;
  });
}

export async function switchCamera() {
  if (!localStream) return;

  const videoTrack = localStream.getVideoTracks()[0];
  if (!videoTrack) return;

  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter(d => d.kind === "videoinput");

  if (cameras.length < 2) return; // no alternative camera

  const currentDeviceId = videoTrack.getSettings().deviceId;
  const nextCamera = cameras.find(d => d.deviceId !== currentDeviceId);

  if (!nextCamera) return;

  const newStream = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: nextCamera.deviceId } },
    audio: true
  });

  // Replace track without renegotiation
  const sender = pc.getSenders().find(s => s.track.kind === "video");
  sender.replaceTrack(newStream.getVideoTracks()[0]);

  videoTrack.stop();
  localStream.removeTrack(videoTrack);
  localStream.addTrack(newStream.getVideoTracks()[0]);
}

export function pauseVideoTracks() {
  localStream?.getVideoTracks().forEach(t => (t.enabled = false));
}

export function resumeVideoTracks() {
  localStream?.getVideoTracks().forEach(t => (t.enabled = true));
}
