// ==========================================
// ENHANCED WEBRTC WITH AUTO-RECONNECTION
// Quality Adaptation & Connection Recovery
// ==========================================

let pc = null;
let localStream = null;
let dataChannel = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
let qualityCheckInterval = null;
let statsInterval = null;
let connectionCallbacks = {};

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000;
const STATS_CHECK_INTERVAL = 1000;

// Enhanced ICE servers with TURN for better connectivity
const iceServers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" }
  ],
  iceCandidatePoolSize: 10
};

// Video quality presets
const VIDEO_QUALITY = {
  ultra: {
    width: { ideal: 3840, max: 3840 },
    height: { ideal: 2160, max: 2160 },
    frameRate: { ideal: 30 },
    bitrate: 8000000 // 8 Mbps
  },
  high: {
    width: { ideal: 1920, max: 1920 },
    height: { ideal: 1080, max: 1080 },
    frameRate: { ideal: 30 },
    bitrate: 4000000 // 4 Mbps
  },
  medium: {
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
    frameRate: { ideal: 30 },
    bitrate: 2000000 // 2 Mbps
  },
  low: {
    width: { ideal: 640, max: 640 },
    height: { ideal: 480, max: 480 },
    frameRate: { ideal: 24 },
    bitrate: 1000000 // 1 Mbps
  },
  minimal: {
    width: { ideal: 320, max: 320 },
    height: { ideal: 240, max: 240 },
    frameRate: { ideal: 15 },
    bitrate: 500000 // 500 Kbps
  }
};

let currentQuality = 'high';
let currentVideoConstraints = null;

const CHUNK_SIZE = 16 * 1024;
let incomingFile = { meta: null, chunks: [], received: 0 };

// Connection state tracking
let connectionState = {
  isConnected: false,
  isReconnecting: false,
  networkQuality: 'good', // good, fair, poor
  lastStableConnection: null
};

/* ==========================================
   CORE PEER CONNECTION
   ========================================== */

export async function createPeerConnection(onIceCandidate, onTrack, callbacks = {}) {
  // Store callbacks for reconnection
  connectionCallbacks = { onIceCandidate, onTrack, ...callbacks };
  
  pc = new RTCPeerConnection(iceServers);

  // ICE candidate handler
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("🧊 ICE candidate generated");
      onIceCandidate(event.candidate);
    }
  };

  // Track handler
  pc.ontrack = (event) => {
    console.log("📺 Remote track received");
    onTrack(event.streams[0]);
  };

  // Connection state monitoring
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    console.log(`🔗 Connection state: ${state}`);
    
    connectionState.isConnected = state === 'connected';
    
    if (callbacks.onConnectionStateChange) {
      callbacks.onConnectionStateChange(state);
    }

    if (state === 'connected') {
      connectionState.lastStableConnection = Date.now();
      reconnectAttempts = 0;
      clearReconnectTimer();
      startQualityMonitoring();
      if (callbacks.onConnected) callbacks.onConnected();
    } else if (state === 'disconnected') {
      if (callbacks.onDisconnected) callbacks.onDisconnected();
      attemptReconnection();
    } else if (state === 'failed') {
      console.error("❌ Connection failed");
      if (callbacks.onFailed) callbacks.onFailed();
      attemptReconnection();
    } else if (state === 'closed') {
      stopQualityMonitoring();
      if (callbacks.onClosed) callbacks.onClosed();
    }
  };

  // ICE connection state
  pc.oniceconnectionstatechange = () => {
    console.log(`❄️ ICE state: ${pc.iceConnectionState}`);
    if (callbacks.onIceStateChange) {
      callbacks.onIceStateChange(pc.iceConnectionState);
    }
  };

  // Signaling state
  pc.onsignalingstatechange = () => {
    console.log(`📡 Signaling state: ${pc.signalingState}`);
  };

  // ICE gathering state
  pc.onicegatheringstatechange = () => {
    console.log(`🧊 ICE gathering: ${pc.iceGatheringState}`);
  };

  return pc;
}

/* ==========================================
   MEDIA ACQUISITION
   ========================================== */

export async function getUserMedia(audio = true, video = false, quality = 'high') {
  currentQuality = quality;
  
  const constraints = {
    audio: audio ? {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
      channelCount: 2
    } : false,
    video: video ? getVideoConstraints(quality) : false
  };

  currentVideoConstraints = constraints.video;

  try {
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log(`✅ Media acquired: audio=${audio}, video=${video}, quality=${quality}`);
    return localStream;
  } catch (error) {
    console.error("❌ Failed to get user media:", error);
    
    // Fallback: try lower quality
    if (video && quality !== 'low') {
      console.log("⚠️ Trying lower quality...");
      return getUserMedia(audio, video, 'low');
    }
    throw error;
  }
}

function getVideoConstraints(quality) {
  const preset = VIDEO_QUALITY[quality] || VIDEO_QUALITY.high;
  return {
    width: preset.width,
    height: preset.height,
    frameRate: preset.frameRate,
    facingMode: 'user'
  };
}

export function addTracks() {
  if (!pc || !localStream) return;
  
  localStream.getTracks().forEach(track => {
    const sender = pc.addTrack(track, localStream);
    
    // Set encoding parameters for quality
    if (track.kind === 'video') {
      const preset = VIDEO_QUALITY[currentQuality] || VIDEO_QUALITY.high;
      const params = sender.getParameters();
      
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      
      params.encodings[0].maxBitrate = preset.bitrate;
      
      sender.setParameters(params).catch(err => {
        console.warn("⚠️ Could not set encoding parameters:", err);
      });
    }
  });
  
  console.log("✅ Tracks added to peer connection");
}

/* ==========================================
   SIGNALING
   ========================================== */

export async function createOffer() {
  if (!pc) throw new Error("Peer connection not initialized");
  
  const offer = await pc.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: true
  });
  
  await pc.setLocalDescription(offer);
  console.log("📤 Offer created");
  return offer;
}

export async function createAnswer(offer) {
  if (!pc) throw new Error("Peer connection not initialized");
  
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  console.log("📥 Answer created");
  return answer;
}

export async function setRemoteAnswer(answer) {
  if (!pc) throw new Error("Peer connection not initialized");
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
  console.log("✅ Remote answer set");
}

export async function addIceCandidate(candidate) {
  if (!pc) return;
  
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
    console.log("✅ ICE candidate added");
  } catch (error) {
    console.error("❌ Error adding ICE candidate:", error);
  }
}

/* ==========================================
   QUALITY ADAPTATION
   ========================================== */

function startQualityMonitoring() {
  stopQualityMonitoring();
  
  statsInterval = setInterval(async () => {
    if (!pc) return;
    
    try {
      const stats = await pc.getStats();
      analyzeStats(stats);
    } catch (error) {
      console.error("Error getting stats:", error);
    }
  }, STATS_CHECK_INTERVAL);
}

function stopQualityMonitoring() {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
}

function analyzeStats(stats) {
  let inboundRtp = null;
  let outboundRtp = null;
  
  stats.forEach(report => {
    if (report.type === 'inbound-rtp' && report.kind === 'video') {
      inboundRtp = report;
    }
    if (report.type === 'outbound-rtp' && report.kind === 'video') {
      outboundRtp = report;
    }
  });

  if (inboundRtp) {
    const packetsLost = inboundRtp.packetsLost || 0;
    const packetsReceived = inboundRtp.packetsReceived || 0;
    
    if (packetsReceived > 0) {
      const lossRate = packetsLost / (packetsLost + packetsReceived);
      
      // Determine network quality
      let quality = 'good';
      if (lossRate > 0.1) quality = 'poor';
      else if (lossRate > 0.05) quality = 'fair';
      
      if (quality !== connectionState.networkQuality) {
        connectionState.networkQuality = quality;
        console.log(`📊 Network quality: ${quality} (loss: ${(lossRate * 100).toFixed(2)}%)`);
        
        // Auto-adjust quality
        if (quality === 'poor' && currentQuality !== 'low') {
          console.log("⚠️ Poor network, reducing quality");
          adjustVideoQuality('low');
        } else if (quality === 'fair' && currentQuality === 'ultra') {
          console.log("⚠️ Fair network, reducing from ultra");
          adjustVideoQuality('medium');
        } else if (quality === 'good' && currentQuality === 'low') {
          console.log("✅ Good network, increasing quality");
          adjustVideoQuality('medium');
        }
        
        // Notify callback
        if (connectionCallbacks.onNetworkQualityChange) {
          connectionCallbacks.onNetworkQualityChange(quality, lossRate);
        }
      }
    }
  }
}

export async function adjustVideoQuality(quality) {
  if (!pc || !localStream) return;
  
  const videoTrack = localStream.getVideoTracks()[0];
  if (!videoTrack) return;
  
  currentQuality = quality;
  const constraints = getVideoConstraints(quality);
  
  try {
    await videoTrack.applyConstraints(constraints);
    console.log(`✅ Video quality adjusted to: ${quality}`);
    
    // Update bitrate
    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
    if (sender) {
      const preset = VIDEO_QUALITY[quality];
      const params = sender.getParameters();
      
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      
      params.encodings[0].maxBitrate = preset.bitrate;
      await sender.setParameters(params);
    }
  } catch (error) {
    console.error("❌ Failed to adjust quality:", error);
  }
}

/* ==========================================
   RECONNECTION LOGIC
   ========================================== */

function attemptReconnection() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error("❌ Max reconnection attempts reached");
    if (connectionCallbacks.onReconnectFailed) {
      connectionCallbacks.onReconnectFailed();
    }
    return;
  }

  if (connectionState.isReconnecting) return;
  
  connectionState.isReconnecting = true;
  reconnectAttempts++;
  
  console.log(`🔄 Attempting reconnection (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
  
  if (connectionCallbacks.onReconnecting) {
    connectionCallbacks.onReconnecting(reconnectAttempts);
  }

  clearReconnectTimer();
  reconnectTimer = setTimeout(async () => {
    try {
      // Try to restart ICE
      if (pc && pc.connectionState !== 'closed') {
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        
        if (connectionCallbacks.onIceRestart) {
          connectionCallbacks.onIceRestart(offer);
        }
      }
    } catch (error) {
      console.error("❌ Reconnection failed:", error);
      attemptReconnection();
    } finally {
      connectionState.isReconnecting = false;
    }
  }, RECONNECT_DELAY * reconnectAttempts);
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/* ==========================================
   MEDIA CONTROLS
   ========================================== */

export function toggleMute() {
  if (!localStream) return false;
  
  const audioTracks = localStream.getAudioTracks();
  audioTracks.forEach(track => {
    track.enabled = !track.enabled;
  });
  
  const isMuted = audioTracks.length > 0 && !audioTracks[0].enabled;
  console.log(`🎤 Microphone ${isMuted ? 'muted' : 'unmuted'}`);
  return isMuted;
}

export function toggleCamera() {
  if (!localStream) return false;
  
  const videoTracks = localStream.getVideoTracks();
  videoTracks.forEach(track => {
    track.enabled = !track.enabled;
  });
  
  const isOff = videoTracks.length > 0 && !videoTracks[0].enabled;
  console.log(`📹 Camera ${isOff ? 'off' : 'on'}`);
  return isOff;
}

export async function switchCamera() {
  if (!localStream) return;
  
  const videoTrack = localStream.getVideoTracks()[0];
  if (!videoTrack) return;

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(d => d.kind === "videoinput");
    
    if (cameras.length < 2) {
      console.log("⚠️ Only one camera available");
      return;
    }

    const currentDeviceId = videoTrack.getSettings().deviceId;
    const nextCamera = cameras.find(d => d.deviceId !== currentDeviceId) || cameras[0];
    
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: nextCamera.deviceId },
        ...currentVideoConstraints
      },
      audio: false
    });

    const sender = pc.getSenders().find(s => s.track?.kind === "video");
    if (sender) {
      await sender.replaceTrack(newStream.getVideoTracks()[0]);
      videoTrack.stop();
      localStream.removeTrack(videoTrack);
      localStream.addTrack(newStream.getVideoTracks()[0]);
      console.log("✅ Camera switched");
    }
  } catch (error) {
    console.error("❌ Failed to switch camera:", error);
  }
}

export function getLocalStream() {
  return localStream;
}

export function getMuteState() {
  if (!localStream) return { audio: true, video: true };
  
  const audioTracks = localStream.getAudioTracks();
  const videoTracks = localStream.getVideoTracks();
  
  return {
    audio: audioTracks.length > 0 ? !audioTracks[0].enabled : true,
    video: videoTracks.length > 0 ? !videoTracks[0].enabled : true
  };
}

/* ==========================================
   DATA CHANNEL
   ========================================== */

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
    throw new Error("DataChannel not ready");
  }

  const buffer = await file.arrayBuffer();
  const total = buffer.byteLength;

  dataChannel.send(JSON.stringify({
    type: "meta",
    name: file.name,
    size: total,
    mime: file.type || "application/octet-stream"
  }));

  let offset = 0;
  while (offset < total) {
    const chunk = buffer.slice(offset, Math.min(offset + CHUNK_SIZE, total));
    
    while (dataChannel.bufferedAmount > CHUNK_SIZE * 10) {
      await new Promise(r => setTimeout(r, 10));
    }

    dataChannel.send(chunk);
    offset += chunk.byteLength;
    onProgress?.(Math.floor((offset / total) * 100));
  }

  dataChannel.send(JSON.stringify({ type: "done" }));
}

export function handleIncomingData(data, onFileReceived, onProgress) {
  if (typeof data === "string") {
    try {
      const msg = JSON.parse(data);

      if (msg.type === "meta") {
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

/* ==========================================
   CONNECTION MANAGEMENT
   ========================================== */

export function closeConnection() {
  console.log("🔴 Closing connection");
  
  stopQualityMonitoring();
  clearReconnectTimer();
  
  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }
  
  if (pc) {
    pc.close();
    pc = null;
  }
  
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  
  reconnectAttempts = 0;
  connectionState = {
    isConnected: false,
    isReconnecting: false,
    networkQuality: 'good',
    lastStableConnection: null
  };
  
  connectionCallbacks = {};
}

export function getConnectionState() {
  return { ...connectionState };
}

export function getPeerConnection() {
  return pc;
}