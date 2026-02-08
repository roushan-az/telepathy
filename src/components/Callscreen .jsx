import { useState, useEffect, useRef } from "react";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCw,
  Settings
} from "lucide-react";
import "./CallScreen.css";

function CallScreen({
  localStream,
  remoteStream,
  peerName,
  isVideoCall,
  onEndCall,
  onToggleMute,
  onToggleVideo,
  onSwitchCamera,
  isMuted,
  isVideoOff,
  callDuration,
  connectionQuality,
  isReconnecting
}) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const containerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);

  // Set video streams
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Auto-hide controls after inactivity
  useEffect(() => {
    const resetControlsTimeout = () => {
      setShowControls(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      controlsTimeoutRef.current = setTimeout(() => {
        if (!isMinimized) {
          setShowControls(false);
        }
      }, 3000);
    };

    const handleMouseMove = () => resetControlsTimeout();
    const handleTouchStart = () => resetControlsTimeout();

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('touchstart', handleTouchStart);

    resetControlsTimeout();

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('touchstart', handleTouchStart);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [isMinimized]);

  // Format call duration
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Quality indicator
  const getQualityIndicator = () => {
    if (isReconnecting) return { text: 'Reconnecting...', color: '#f59e0b' };
    
    switch (connectionQuality) {
      case 'good':
        return { text: 'HD', color: '#10b981' };
      case 'fair':
        return { text: 'SD', color: '#f59e0b' };
      case 'poor':
        return { text: 'Low', color: '#ef4444' };
      default:
        return { text: 'Connecting...', color: '#6366f1' };
    }
  };

  const quality = getQualityIndicator();

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Toggle speaker (for mobile)
  const toggleSpeaker = () => {
    setIsSpeakerOn(!isSpeakerOn);
    // Note: Actual speaker routing would need native APIs
  };

  return (
    <div 
      ref={containerRef}
      className={`call-screen ${isMinimized ? 'minimized' : ''} ${isVideoCall ? 'video-call' : 'audio-call'}`}
    >
      {/* Remote Video/Avatar */}
      {isVideoCall && remoteStream ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="remote-video-full"
        />
      ) : (
        <div className="audio-call-view">
          <div className="peer-avatar-large">
            {peerName?.charAt(0).toUpperCase()}
          </div>
          <h2 className="peer-name">{peerName}</h2>
          <p className="call-status">
            {isReconnecting ? 'Reconnecting...' : 
             remoteStream ? formatDuration(callDuration) : 'Calling...'}
          </p>
        </div>
      )}

      {/* Quality Indicator */}
      <div className="quality-indicator" style={{ color: quality.color }}>
        <div className="quality-dot" style={{ backgroundColor: quality.color }} />
        {quality.text}
      </div>

      {/* Local Video (Picture-in-Picture) */}
      {isVideoCall && localStream && (
        <div className={`local-video-pip ${isVideoOff ? 'video-off' : ''}`}>
          {isVideoOff ? (
            <div className="local-avatar">
              <VideoOff size={24} />
            </div>
          ) : (
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="local-video-element"
            />
          )}
        </div>
      )}

      {/* Call Info Overlay */}
      <div className={`call-info-overlay ${showControls ? 'visible' : ''}`}>
        <div className="call-info-top">
          <div className="peer-info">
            <span className="peer-name-text">{peerName}</span>
            {remoteStream && !isReconnecting && (
              <span className="call-duration">{formatDuration(callDuration)}</span>
            )}
          </div>
          
          {!isMinimized && (
            <button 
              className="minimize-btn"
              onClick={() => setIsMinimized(true)}
              title="Minimize"
            >
              <Minimize size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Reconnecting Indicator */}
      {isReconnecting && (
        <div className="reconnecting-banner">
          <RotateCw size={16} className="spin-animation" />
          <span>Reconnecting...</span>
        </div>
      )}

      {/* Call Controls */}
      <div className={`call-controls ${showControls ? 'visible' : ''}`}>
        <div className="controls-grid">
          {/* Toggle Microphone */}
          <button
            className={`control-btn ${isMuted ? 'active danger' : ''}`}
            onClick={onToggleMute}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
            <span className="control-label">{isMuted ? "Unmuted" : "Mute"}</span>
          </button>

          {/* Toggle Video (if video call) */}
          {isVideoCall && (
            <button
              className={`control-btn ${isVideoOff ? 'active danger' : ''}`}
              onClick={onToggleVideo}
              title={isVideoOff ? "Turn on camera" : "Turn off camera"}
            >
              {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
              <span className="control-label">{isVideoOff ? "Camera" : "Camera"}</span>
            </button>
          )}

          {/* Switch Camera (mobile) */}
          {isVideoCall && (
            <button
              className="control-btn"
              onClick={onSwitchCamera}
              title="Switch camera"
            >
              <RotateCw size={24} />
              <span className="control-label">Flip</span>
            </button>
          )}

          {/* Toggle Speaker */}
          <button
            className={`control-btn ${!isSpeakerOn ? 'active' : ''}`}
            onClick={toggleSpeaker}
            title={isSpeakerOn ? "Speaker on" : "Speaker off"}
          >
            {isSpeakerOn ? <Volume2 size={24} /> : <VolumeX size={24} />}
            <span className="control-label">Speaker</span>
          </button>

          {/* Fullscreen Toggle */}
          {isVideoCall && (
            <button
              className="control-btn"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
              <span className="control-label">Full</span>
            </button>
          )}

          {/* End Call */}
          <button
            className="control-btn end-call-btn-large"
            onClick={onEndCall}
            title="End call"
          >
            <PhoneOff size={28} />
            <span className="control-label">End</span>
          </button>
        </div>
      </div>

      {/* Minimized View */}
      {isMinimized && (
        <div className="minimized-controls">
          <button
            className="minimize-expand-btn"
            onClick={() => setIsMinimized(false)}
          >
            <Maximize size={20} />
          </button>
          <div className="minimized-info">
            <span>{peerName}</span>
            <span className="minimized-duration">{formatDuration(callDuration)}</span>
          </div>
          <button
            className="minimized-end-btn"
            onClick={onEndCall}
          >
            <PhoneOff size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

export default CallScreen;