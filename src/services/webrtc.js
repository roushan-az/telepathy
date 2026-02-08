let pc = null;
let localStream = null;
let dataChannel = null;

const iceServers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

const CHUNK_SIZE = 16 * 1024; // 16KB chunks
let incomingFile = { meta: null, chunks: [], received: 0 };

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

  pc.onconnectionstatechange = () => {
    console.log(`🔗 Connection state: ${pc.connectionState}`);
  };

  return pc;
}

export async function getUserMedia(audio = true, video = false) {
  localStream = await navigator.mediaDevices.getUserMedia({ audio, video });
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
  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }
  pc?.close();
  localStream?.getTracks().forEach(t => t.stop());
  pc = null;
  localStream = null;
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
  if (cameras.length < 2) return;

  const currentDeviceId = videoTrack.getSettings().deviceId;
  const nextCamera = cameras.find(d => d.deviceId !== currentDeviceId);
  if (!nextCamera) return;

  const newStream = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: nextCamera.deviceId } },
    audio: true
  });

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

/* ========== DATA CHANNEL FOR FILE TRANSFER ========== */

export function createDataChannel(onMessage, onOpen) {
  if (!pc) return;
  
  dataChannel = pc.createDataChannel("files", { ordered: true });
  dataChannel.binaryType = "arraybuffer";

  dataChannel.onopen = () => {
    console.log("📡 DataChannel OPEN (caller)");
    onOpen?.();
  };

  dataChannel.onmessage = (e) => onMessage(e.data);
  dataChannel.onclose = () => console.log("📡 DataChannel CLOSED");
  dataChannel.onerror = (err) => console.error("📡 DataChannel error:", err);
}

export function setupDataChannelForReceiver(onMessage, onOpen) {
  if (!pc) return;

  pc.ondatachannel = (event) => {
    dataChannel = event.channel;
    dataChannel.binaryType = "arraybuffer";
    
    dataChannel.onopen = () => {
      console.log("📡 DataChannel OPEN (receiver)");
      onOpen?.();
    };
    
    dataChannel.onmessage = (ev) => onMessage(ev.data);
    dataChannel.onclose = () => console.log("📡 DataChannel CLOSED");
    dataChannel.onerror = (err) => console.error("📡 DataChannel error:", err);
  };
}

export function isDataChannelReady() {
  return dataChannel?.readyState === "open";
}

export async function sendFile(file, onProgress) {
  if (!isDataChannelReady()) {
    throw new Error("DataChannel not ready. Please start a call first.");
  }

  console.log(`📤 Sending file: ${file.name} (${file.size} bytes)`);

  const buffer = await file.arrayBuffer();
  const total = buffer.byteLength;

  // Send metadata
  dataChannel.send(JSON.stringify({
    type: "meta",
    name: file.name,
    size: total,
    mime: file.type || "application/octet-stream"
  }));

  // Send chunks
  let offset = 0;
  while (offset < total) {
    const chunk = buffer.slice(offset, Math.min(offset + CHUNK_SIZE, total));
    
    while (dataChannel.bufferedAmount > CHUNK_SIZE * 10) {
      await new Promise(r => setTimeout(r, 10));
    }

    dataChannel.send(chunk);
    offset += chunk.byteLength;
    onProgress?.(Math.floor((offset / total) * 100));
    
    if (offset % (CHUNK_SIZE * 10) === 0) {
      await new Promise(r => setTimeout(r, 5));
    }
  }

  dataChannel.send(JSON.stringify({ type: "done" }));
  console.log(`✅ File sent: ${file.name}`);
}

export function handleIncomingData(data, onFileReceived, onProgress) {
  if (typeof data === "string") {
    try {
      const msg = JSON.parse(data);

      if (msg.type === "meta") {
        console.log("📋 Received metadata:", msg);
        incomingFile = { meta: msg, chunks: [], received: 0 };
      }

      if (msg.type === "done") {
        const blob = new Blob(incomingFile.chunks, {
          type: incomingFile.meta.mime
        });
        const url = URL.createObjectURL(blob);

        onFileReceived?.({
          name: incomingFile.meta.name,
          url,
          mime: incomingFile.meta.mime,
          size: incomingFile.meta.size
        });

        incomingFile = { meta: null, chunks: [], received: 0 };
        console.log("✅ File received");
      }
    } catch (err) {
      console.error("Error parsing message:", err);
    }
  } else if (data instanceof ArrayBuffer) {
    if (!incomingFile.meta) return;

    incomingFile.chunks.push(data);
    incomingFile.received += data.byteLength;

    const progress = Math.floor(
      (incomingFile.received / incomingFile.meta.size) * 100
    );
    onProgress?.(progress);
  }
}