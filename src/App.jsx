import { useEffect, useRef, useState, useCallback } from "react";
import ChatWindow from "./components/ChatWindow.jsx";
import Sidebar from "./components/Sidebar.jsx";
import "./App.css";
import WebSocketService from "./services/websocket";
import CallScreen from "./components/Callscreen .jsx";

// Enhanced WebRTC helpers
import {
  createPeerConnection,
  getUserMedia,
  addTracks,
  createOffer,
  createAnswer,
  setRemoteAnswer,
  addIceCandidate,
  closeConnection,
  createDataChannel,
  setupDataChannelForReceiver,
  handleIncomingData,
  toggleMute,
  toggleCamera,
  switchCamera,
  getMuteState,
  getConnectionState,
  adjustVideoQuality
} from "./services/webrtc";


function App() {
  const [dataReady, setDataReady] = useState(false);
  
  /* -------------------- USER -------------------- */
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  /* -------------------- DEMO PEER MAPPING -------------------- */
  const [peerUserId, setPeerUserId] = useState(null);
  const [peerName, setPeerName] = useState(null);

  /* -------------------- CHATS -------------------- */
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  
  const chatsRef = useRef([]);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  const selectedChat = chats.find(c => c.id === selectedChatId) || chats[0];

  /* -------------------- WebRTC -------------------- */
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [inCall, setInCall] = useState(false);
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [dataOnlyMode, setDataOnlyMode] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  /* -------------------- CALL STATE -------------------- */
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [connectionQuality, setConnectionQuality] = useState('good');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [callStartTime, setCallStartTime] = useState(null);
  
  // ✅ NEW: Queue for ICE candidates that arrive before remote description
  const [pendingIceCandidates, setPendingIceCandidates] = useState([]);

  const callDurationInterval = useRef(null);
  const wsConnectedRef = useRef(false);
  const handlersRegisteredRef = useRef(false);
  const currentPeerIdRef = useRef(null);
  
  // ✅ NEW: Track peer connection for ICE candidate validation
  const peerConnectionRef = useRef(null);

  /* -------------------- CALL DURATION TIMER -------------------- */
  useEffect(() => {
    if (inCall && remoteStream && !isReconnecting) {
      if (!callStartTime) {
        setCallStartTime(Date.now());
      }
      
      callDurationInterval.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - (callStartTime || Date.now())) / 1000);
        setCallDuration(elapsed);
      }, 1000);
    } else {
      if (callDurationInterval.current) {
        clearInterval(callDurationInterval.current);
        callDurationInterval.current = null;
      }
    }

    return () => {
      if (callDurationInterval.current) {
        clearInterval(callDurationInterval.current);
      }
    };
  }, [inCall, remoteStream, isReconnecting, callStartTime]);

  /* -------------------- BOOTSTRAP AUTH -------------------- */
  useEffect(() => {
    const bootstrap = async () => {
      const params = new URLSearchParams(window.location.search);
      const userParam = params.get("user");

      let storedToken = localStorage.getItem(`token_${userParam}`);
      let storedUserId = localStorage.getItem(`userId_${userParam}`);

      if (!storedToken) {
        console.log("🔐 Creating new anonymous user...");
        const res = await fetch("http://localhost:8080/api/auth/anonymous", {
          method: "POST"
        });
        const data = await res.json();

        storedToken = data.accessToken;
        storedUserId = data.user.userId;

        localStorage.setItem(`token_${userParam}`, storedToken);
        localStorage.setItem(`userId_${userParam}`, storedUserId);

        console.log(`✅ User created: ${storedUserId}`);
      } else {
        console.log(`✅ User loaded: ${storedUserId}`);
      }

      setUser({ id: storedUserId, name: userParam === "alice" ? "Alice" : "Bob" });
      setToken(storedToken);

      if (userParam === "alice") {
        const bobUserId = localStorage.getItem("userId_bob");
        if (bobUserId) {
          setPeerUserId(bobUserId);
          setPeerName("Bob");
        }
      } else if (userParam === "bob") {
        const aliceUserId = localStorage.getItem("userId_alice");
        if (aliceUserId) {
          setPeerUserId(aliceUserId);
          setPeerName("Alice");
        }
      }
    };

    bootstrap();
  }, []);

  /* -------------------- INITIALIZE DEFAULT CHAT -------------------- */
  useEffect(() => {
    if (!user || !peerUserId) return;

    console.log(`💬 Setting up chat: ${user.name} → ${peerName} (${peerUserId})`);

    const defaultChat = {
      id: "chat-1",
      peerId: peerUserId,
      name: peerName,
      participants: [user.id, peerUserId],
      online: true,
      messages: [],
      lastMessage: "",
      lastTimestamp: null,
      unreadCount: 0
    };

    setChats([defaultChat]);
    setSelectedChatId("chat-1");
  }, [user, peerUserId, peerName]);

  /* -------------------- WEBSOCKET (ONCE) -------------------- */
  useEffect(() => {
    if (!token) return;
    if (wsConnectedRef.current) return;

    wsConnectedRef.current = true;
    WebSocketService.connect(token);

    return () => {
      wsConnectedRef.current = false;
      WebSocketService.disconnect();
    };
  }, [token]);

  /* -------------------- FILE RECEIVED -------------------- */
  const handleFileReceived = useCallback((file) => {
    console.log("📥 File received:", file.name);

    const fileMessage = {
      id: crypto.randomUUID(),
      senderId: peerUserId,
      type: "file",
      fileName: file.name,
      fileUrl: file.url,
      mime: file.mime,
      fileSize: file.size,
      timestamp: new Date(),
      status: "delivered"
    };

    setChats(prev =>
      prev.map(chat => {
        if (chat.peerId === peerUserId) {
          return {
            ...chat,
            messages: [...chat.messages, fileMessage],
            lastMessage: `📎 ${file.name}`,
            lastTimestamp: new Date()
          };
        }
        return chat;
      })
    );
  }, [peerUserId]);

  /* -------------------- HELPER: Process Pending ICE Candidates -------------------- */
  // ✅ NEW: Process queued ICE candidates after remote description is set
  const processPendingIceCandidates = useCallback(async () => {
    if (pendingIceCandidates.length === 0) return;
    
    console.log(`📦 Processing ${pendingIceCandidates.length} pending ICE candidates`);
    
    for (const candidate of pendingIceCandidates) {
      try {
        await addIceCandidate(candidate);
      } catch (error) {
        console.error('❌ Error adding queued ICE candidate:', error);
      }
    }
    
    setPendingIceCandidates([]);
  }, [pendingIceCandidates]);

  /* -------------------- WEBSOCKET HANDLERS -------------------- */
  const handleIncomingMessage = useCallback((msg) => {
    let senderId = msg.from || msg.senderId || msg.sender || msg.userId;
    
    if (!senderId && msg.to) {
      const chat = chatsRef.current.find(c => c.participants?.includes(msg.to));
      if (chat?.peerId) {
        senderId = chat.peerId;
      }
    }
    
    console.log(`📥 Received message from ${senderId}:`, msg.payload?.content);

    if (!senderId) {
      console.error("❌ Cannot determine sender ID");
      return;
    }

    const incoming = {
      id: crypto.randomUUID(),
      senderId: senderId,
      content: msg.payload?.content || msg.payload,
      timestamp: new Date(),
      status: "delivered"
    };

    setChats(prev =>
      prev.map(chat =>
        chat.peerId === senderId
          ? {
              ...chat,
              messages: [...chat.messages, incoming],
              lastMessage: incoming.content,
              lastTimestamp: new Date(),
              unreadCount: chat.id === selectedChatId ? 0 : chat.unreadCount + 1
            }
          : chat
      )
    );
  }, [selectedChatId]);

  const handleOffer = useCallback(async (msg) => {
    console.log(`📞 Received OFFER from ${msg.from}`);
    
    currentPeerIdRef.current = msg.from;
    const isDataOnly = msg.dataOnly === true;
    setDataOnlyMode(isDataOnly);
    
    if (!isDataOnly) {
      setInCall(true);
      setIsVideoCall(msg.isVideo || false);
      setCallStartTime(Date.now());
      setCallDuration(0);
    }

    const pc = await createPeerConnection(
      (candidate) => {
        // ✅ FIXED: Include 'to' field
        WebSocketService.send({
          type: "ICE",
          to: msg.from,
          candidate
        });
      },
      (stream) => {
        console.log("📺 Received remote stream");
        setRemoteStream(stream);
      },
      {
        onConnectionStateChange: (state) => {
          console.log(`Connection state: ${state}`);
        },
        onConnected: () => {
          console.log("✅ Connected");
          setIsReconnecting(false);
        },
        onDisconnected: () => {
          console.log("⚠️ Disconnected");
        },
        onReconnecting: (attempt) => {
          console.log(`🔄 Reconnecting (attempt ${attempt})`);
          setIsReconnecting(true);
        },
        onReconnectFailed: () => {
          console.log("❌ Reconnection failed");
          alert("Connection lost. Call ended.");
          endCall();
        }
      }
    );

    // Store peer connection reference for ICE candidate validation
    peerConnectionRef.current = pc;

    // Set remote description from the offer
    await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: msg.offer }));
    
    // ✅ NEW: Process any pending ICE candidates now that remote description is set
    await processPendingIceCandidates();

    if (!isDataOnly) {
      const quality = connectionQuality === 'poor' ? 'low' : 'high';
      const stream = await getUserMedia(true, msg.isVideo, quality);
      setLocalStream(stream);
      addTracks();
    }

    setupDataChannelForReceiver(
      (data) => handleIncomingData(data, handleFileReceived),
      () => {
        console.log("✅ DataChannel ready (receiver)");
        setDataReady(true);
      }
    );

    const answer = await createAnswer();
    
    // ✅ FIXED: Include 'to' field
    WebSocketService.send({
      type: "ANSWER",
      to: msg.from,
      answer
    });
  }, [connectionQuality, handleFileReceived, processPendingIceCandidates]);

  const handleAnswer = useCallback(async (msg) => {
    console.log(`✅ Received ANSWER from ${msg.from}`);
    
    try {
      await setRemoteAnswer(msg.answer);
      
      // ✅ NEW: Process any pending ICE candidates now that remote description is set
      await processPendingIceCandidates();
      
    } catch (error) {
      console.error("❌ Error setting remote answer:", error);
    }
  }, [processPendingIceCandidates]);

  const handleIceCandidate = useCallback(async (msg) => {
    console.log("🧊 Received ICE candidate");
    
    // ✅ NEW: Check if we have remote description before adding candidate
    const pc = peerConnectionRef.current;
    
    if (!pc) {
      console.log('📦 Queueing ICE candidate (no peer connection yet)');
      setPendingIceCandidates(prev => [...prev, msg.candidate]);
      return;
    }
    
    try {
      // If no remote description yet, queue the candidate
      if (!pc.remoteDescription) {
        console.log('📦 Queueing ICE candidate (waiting for remote description)');
        setPendingIceCandidates(prev => [...prev, msg.candidate]);
        return;
      }

      // We have remote description, add the candidate immediately
      await addIceCandidate(msg.candidate);
      
    } catch (error) {
      console.error("❌ Error adding ICE candidate:", error);
      // If error, queue it for retry
      setPendingIceCandidates(prev => [...prev, msg.candidate]);
    }
  }, []);

  /* -------------------- REGISTER WebSocket HANDLERS (ONCE) -------------------- */
  useEffect(() => {
    if (handlersRegisteredRef.current) return;
    handlersRegisteredRef.current = true;

    console.log("🔌 Registering WebSocket handlers");

    WebSocketService.on("TEXT", handleIncomingMessage);
    WebSocketService.on("OFFER", handleOffer);
    WebSocketService.on("ANSWER", handleAnswer);
    WebSocketService.on("ICE", handleIceCandidate);

    return () => {
      WebSocketService.off("TEXT", handleIncomingMessage);
      WebSocketService.off("OFFER", handleOffer);
      WebSocketService.off("ANSWER", handleAnswer);
      WebSocketService.off("ICE", handleIceCandidate);
      handlersRegisteredRef.current = false;
    };
  }, [handleIncomingMessage, handleOffer, handleAnswer, handleIceCandidate]);

  /* -------------------- SEND MESSAGE -------------------- */
  const handleSendMessage = (content, file = null) => {
    if (!selectedChat || (!content.trim() && !file)) return;

    if (file) {
      console.log("📎 Sending file via DataChannel:", file.name);
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const arrayBuffer = e.target.result;
        const chunkSize = 16384;
        const totalChunks = Math.ceil(arrayBuffer.byteLength / chunkSize);

        const metadata = JSON.stringify({
          type: "file-meta",
          name: file.name,
          size: file.size,
          mime: file.type,
          totalChunks
        });
        
        createDataChannel().send(metadata);

        for (let i = 0; i < totalChunks; i++) {
          const start = i * chunkSize;
          const end = Math.min(start + chunkSize, arrayBuffer.byteLength);
          const chunk = arrayBuffer.slice(start, end);
          createDataChannel().send(chunk);
        }

        const fileMessage = {
          id: crypto.randomUUID(),
          senderId: user.id,
          type: "file",
          fileName: file.name,
          fileSize: file.size,
          timestamp: new Date(),
          status: "sent"
        };

        setChats(prev =>
          prev.map(chat =>
            chat.id === selectedChat.id
              ? {
                  ...chat,
                  messages: [...chat.messages, fileMessage],
                  lastMessage: `📎 ${file.name}`,
                  lastTimestamp: new Date()
                }
              : chat
          )
        );
      };
      reader.readAsArrayBuffer(file);

    } else {
      const newMessage = {
        id: crypto.randomUUID(),
        senderId: user.id,
        content: content,
        timestamp: new Date(),
        status: "sending"
      };

      setChats(prev =>
        prev.map(chat =>
          chat.id === selectedChat.id
            ? {
                ...chat,
                messages: [...chat.messages, newMessage],
                lastMessage: content,
                lastTimestamp: new Date()
              }
            : chat
        )
      );

      // ✅ FIXED: Use the helper method with recipient
      WebSocketService.sendTextMessage(selectedChat.peerId, content);

      setTimeout(() => {
        setChats(prev =>
          prev.map(chat =>
            chat.id === selectedChat.id
              ? {
                  ...chat,
                  messages: chat.messages.map(m =>
                    m.id === newMessage.id ? { ...m, status: "delivered" } : m
                  )
                }
              : chat
          )
        );
      }, 500);
    }
  };

  /* -------------------- DATA-ONLY CONNECTION -------------------- */
  const initiateDataConnection = async () => {
    if (!selectedChat) return;
    
    console.log(`🔗 Starting data-only connection for file transfer`);
    currentPeerIdRef.current = selectedChat.peerId;
    setDataOnlyMode(true);

    const pc = await createPeerConnection(
      (candidate) => {
        // ✅ FIXED: Use helper method with recipient
        WebSocketService.sendIceCandidate(selectedChat.peerId, candidate);
      },
      (stream) => {
        console.log("📺 Received remote stream");
        setRemoteStream(stream);
      }
    );

    // Store peer connection reference
    peerConnectionRef.current = pc;

    createDataChannel(
      (data) => handleIncomingData(data, handleFileReceived),
      () => {
        console.log("✅ DataChannel ready (caller)");
        setDataReady(true);
      }
    );
    
    const offer = await createOffer();
    
    // ✅ FIXED: Use helper method with recipient
    WebSocketService.send({
      type: "OFFER",
      to: selectedChat.peerId,
      offer,
      dataOnly: true
    });
  };

  /* -------------------- WEBRTC CALL -------------------- */
  const startCall = async (video = false) => {
    if (!selectedChat) return;
    
    console.log(`📞 Starting ${video ? 'video' : 'audio'} call`);
    currentPeerIdRef.current = selectedChat.peerId;
    setInCall(true);
    setIsVideoCall(video);
    setDataOnlyMode(false);
    setCallStartTime(Date.now());
    setCallDuration(0);
    setIsMuted(false);
    setIsVideoOff(false);
    setPendingIceCandidates([]); // Clear any pending candidates

    const pc = await createPeerConnection(
      (candidate) => {
        // ✅ FIXED: Use helper method with recipient
        WebSocketService.sendIceCandidate(selectedChat.peerId, candidate);
      },
      (stream) => {
        console.log("📺 Received remote stream");
        setRemoteStream(stream);
      },
      {
        onConnectionStateChange: (state) => {
          console.log(`Connection state: ${state}`);
        },
        onConnected: () => {
          console.log("✅ Connected");
          setIsReconnecting(false);
        },
        onDisconnected: () => {
          console.log("⚠️ Disconnected");
        },
        onReconnecting: (attempt) => {
          console.log(`🔄 Reconnecting (attempt ${attempt})`);
          setIsReconnecting(true);
        },
        onReconnectFailed: () => {
          console.log("❌ Reconnection failed");
          alert("Connection lost. Call ended.");
          endCall();
        },
        onIceRestart: (offer) => {
          console.log("🧊 ICE restart");
          // ✅ FIXED: Use send with 'to' field
          WebSocketService.send({
            type: "OFFER",
            to: currentPeerIdRef.current,
            offer,
            iceRestart: true,
            isVideo: video
          });
        },
        onNetworkQualityChange: (quality, lossRate) => {
          setConnectionQuality(quality);
        }
      }
    );

    // Store peer connection reference
    peerConnectionRef.current = pc;

    const quality = 'high'; // Start with high quality, will auto-adapt
    const stream = await getUserMedia(true, video, quality);
    setLocalStream(stream);
    addTracks();

    createDataChannel(
      (data) => handleIncomingData(data, handleFileReceived),
      () => {
        console.log("✅ DataChannel ready (caller)");
        setDataReady(true);
      }
    );
    
    const offer = await createOffer();
    
    // ✅ FIXED: Use send with 'to' field
    WebSocketService.send({
      type: "OFFER",
      to: selectedChat.peerId,
      offer,
      dataOnly: false,
      isVideo: video
    });
  };

  const endCall = () => {
    console.log("🔴 Ending call");
    closeConnection();
    setLocalStream(null);
    setRemoteStream(null);
    setInCall(false);
    setIsVideoCall(false);
    setDataOnlyMode(false);
    setDataReady(false);
    setIsMuted(false);
    setIsVideoOff(false);
    setCallDuration(0);
    setCallStartTime(null);
    setConnectionQuality('good');
    setIsReconnecting(false);
    setPendingIceCandidates([]); // Clear pending candidates
    currentPeerIdRef.current = null;
    peerConnectionRef.current = null;
    
    if (callDurationInterval.current) {
      clearInterval(callDurationInterval.current);
      callDurationInterval.current = null;
    }
  };

  /* -------------------- CALL CONTROLS -------------------- */
  const handleToggleMute = () => {
    const muted = toggleMute();
    setIsMuted(muted);
  };

  const handleToggleVideo = () => {
    const videoOff = toggleCamera();
    setIsVideoOff(videoOff);
  };

  const handleSwitchCamera = () => {
    switchCamera();
  };

  /* -------------------- UI -------------------- */
  if (!user || !token) {
    return <div className="init-screen">Initializing secure session…</div>;
  }

  if (!peerUserId) {
    return (
      <div className="init-screen">
        <p>Waiting for peer connection...</p>
        <small>Open both tabs: ?user=alice and ?user=bob</small>
      </div>
    );
  }

  const addChat = () => {
    const peerName = prompt("Enter peer name:");
    if (!peerName) return;

    const peerId = prompt("Enter peer user ID:");
    if (!peerId) return;

    const newChat = {
      id: crypto.randomUUID(),
      peerId: peerId,
      participants: [user.id, peerId],
      name: peerName,
      online: true,
      messages: [],
      lastMessage: "",
      lastTimestamp: null,
      unreadCount: 0
    };

    setChats(prev => [...prev, newChat]);
    setSelectedChatId(newChat.id);
  };

  const handleCall = (type) => {
    if (type === "audio") {
      startCall(false);
    } else if (type === "video") {
      startCall(true);
    }
  };

  const handleSelectChat = (chat) => {
    setSelectedChatId(chat.id);
    if (window.innerWidth <= 768) {
      setShowSidebar(false);
    }
  };

  const handleBackToChats = () => {
    setShowSidebar(true);
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className={`sidebar-wrapper ${!showSidebar ? 'hidden' : ''}`}>
        <Sidebar
          chats={chats}
          selectedChat={selectedChat}
          onSelectChat={handleSelectChat}
          onAddChat={addChat}
          currentUser={user}
        />
      </div>

      {/* Chat Window */}
      <div className="chat-wrapper">
        <ChatWindow
          chat={selectedChat}
          messages={selectedChat?.messages || []}
          currentUser={user}
          onSendMessage={handleSendMessage}
          onCall={handleCall}
          inCall={inCall}
          dataReady={dataReady}
          endCall={endCall}
          onInitiateDataConnection={initiateDataConnection}
          onBack={handleBackToChats}
          showBackButton={!showSidebar}
        />
      </div>

      {/* Full-Screen Call Interface */}
      {inCall && !dataOnlyMode && (
        <CallScreen
          localStream={localStream}
          remoteStream={remoteStream}
          peerName={selectedChat?.name}
          isVideoCall={isVideoCall}
          onEndCall={endCall}
          onToggleMute={handleToggleMute}
          onToggleVideo={handleToggleVideo}
          onSwitchCamera={handleSwitchCamera}
          isMuted={isMuted}
          isVideoOff={isVideoOff}
          callDuration={callDuration}
          connectionQuality={connectionQuality}
          isReconnecting={isReconnecting}
        />
      )}
    </div>
  );
}

export default App;