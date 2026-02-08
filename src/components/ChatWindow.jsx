import { useState, useRef, useEffect } from "react";
import {
  Phone,
  Video,
  MoreVertical,
  Send,
  Paperclip,
  Smile,
  Check,
  CheckCheck,
  Clock,
  X
} from "lucide-react";
import { sendFile, isDataChannelReady } from "../services/webrtc";
import "./ChatWindow.css";

function ChatWindow({ 
  chat, 
  messages = [], 
  currentUser, 
  onSendMessage, 
  onCall, 
  inCall, 
  dataReady,
  endCall,
  onInitiateDataConnection 
}) {
  const [messageInput, setMessageInput] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [connectingForFile, setConnectingForFile] = useState(false);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const pendingFileRef = useRef(null);

  /* -------------------- Auto scroll -------------------- */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* -------------------- Auto-send pending file when DataChannel is ready -------------------- */
  useEffect(() => {
    if (dataReady && pendingFileRef.current) {
      const file = pendingFileRef.current;
      pendingFileRef.current = null;
      setConnectingForFile(false);
      handleFileSend(file);
    }
  }, [dataReady]);

  /* -------------------- Send message -------------------- */
  const handleSend = () => {
    if (!messageInput.trim()) return;
    onSendMessage(messageInput.trim());
    setMessageInput("");
    inputRef.current?.focus();
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* -------------------- File handling -------------------- */
  const handleFileSend = async (file) => {
    try {
      setUploading(true);
      setUploadProgress(0);
      
      // Create a local blob URL for the sender to see the file immediately
      const fileUrl = URL.createObjectURL(file);
      
      // Add file message to sender's chat immediately
      const fileMessage = {
        id: crypto.randomUUID(),
        senderId: currentUser?.id,
        type: "file",
        fileName: file.name,
        fileUrl: fileUrl,
        mime: file.type || "application/octet-stream",
        fileSize: file.size,
        timestamp: new Date(),
        status: "sending"
      };
      
      // Show file in sender's chat
      onSendMessage(fileMessage, true); // true indicates it's a file message
      
      // Send via WebRTC
      await sendFile(file, (progress) => {
        setUploadProgress(progress);
      });
      
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
      }, 1000);
      
    } catch (error) {
      console.error("File send error:", error);
      alert(error.message || "Failed to send file");
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFileSelect = async (file) => {
    if (!file) return;
    
    // Check if DataChannel is ready
    if (!isDataChannelReady()) {
      // Store the file and initiate data connection
      pendingFileRef.current = file;
      setConnectingForFile(true);
      
      // Initiate data-only connection
      if (onInitiateDataConnection) {
        onInitiateDataConnection();
      }
      return;
    }

    // DataChannel is ready, send immediately
    handleFileSend(file);
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    e.target.value = ''; // Reset input
  };

  /* -------------------- Drag & Drop -------------------- */
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  /* -------------------- Helpers -------------------- */
  const formatMessageTime = (date) =>
    new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });

  const formatFileSize = (bytes) => {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getInitials = (name = "") =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const renderStatus = (status) => {
    switch (status) {
      case "sending":
        return <Clock size={14} />;
      case "sent":
        return <Check size={14} />;
      case "delivered":
      case "read":
        return <CheckCheck size={14} />;
      default:
        return null;
    }
  };

  /* -------------------- Empty state -------------------- */
  if (!chat) {
    return (
      <div className="chat-window empty">
        <div className="empty-chat-state">
          <h2>Premium Chat</h2>
          <p>Select a conversation to start messaging</p>
          <span className="feature-badge">🔒 End-to-end encrypted</span>
        </div>
      </div>
    );
  }

  /* -------------------- UI -------------------- */
  return (
    <div className="chat-window">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-info">
          <div className={`avatar ${chat.online ? "online-indicator" : ""}`}>
            {getInitials(chat.name)}
          </div>
          <div>
            <h2>{chat.name}</h2>
            <p className="chat-status">
              {chat.online ? "online" : "offline"}
            </p>
          </div>
        </div>

        <div className="chat-header-actions">
          {!inCall ? (
            <>
              <button className="icon-button" title="Voice call" onClick={() => onCall?.("audio")}>
                <Phone size={18} />
              </button>
              <button className="icon-button" title="Video call" onClick={() => onCall?.("video")}>
                <Video size={18} />
              </button>
            </>
          ) : (
            <button className="icon-button end-call-btn" title="End call" onClick={endCall}>
              <X size={18} />
            </button>
          )}
          <button className="icon-button">
            <MoreVertical size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div 
        className={`messages-container ${dragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {dragging && (
          <div className="drop-overlay">
            <div className="drop-zone">
              <Paperclip size={48} />
              <p>Drop file to send</p>
            </div>
          </div>
        )}

        <div className="encryption-banner">
          🔒 Messages are end-to-end encrypted
        </div>

        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
            No messages yet. Start the conversation!
          </div>
        )}

        {messages.map((msg, index) => {
          const isOwn = msg.senderId === currentUser?.id;
          const isFile = msg.type === "file";
          const isImage = isFile && msg.mime?.startsWith("image/");

          return (
            <div
              key={msg.id || index}
              className={`message ${isOwn ? "own" : "other"}`}
            >
              <div className="message-bubble">
                {isFile ? (
                  <div className="file-message">
                    {isImage ? (
                      <div className="image-preview">
                        <img 
                          src={msg.fileUrl} 
                          alt={msg.fileName}
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <a 
                        href={msg.fileUrl} 
                        download={msg.fileName}
                        className="file-attachment"
                      >
                        <div className="file-icon">📄</div>
                        <div className="file-info">
                          <div className="file-name">{msg.fileName}</div>
                          <div className="file-size">{formatFileSize(msg.fileSize)}</div>
                        </div>
                        <div className="download-icon">⬇️</div>
                      </a>
                    )}
                  </div>
                ) : (
                  <p>{msg.content}</p>
                )}
                
                <div className="message-meta">
                  <span>{formatMessageTime(msg.timestamp)}</span>
                  {isOwn && renderStatus(msg.status)}
                </div>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Connection Status */}
      {connectingForFile && (
        <div className="upload-progress">
          <span className="progress-text">Establishing secure connection...</span>
        </div>
      )}

      {/* Upload Progress */}
      {uploading && (
        <div className="upload-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <span className="progress-text">{uploadProgress}%</span>
        </div>
      )}

      {/* Input */}
      <div className="chat-input-container">
        <input
          type="file"
          ref={fileInputRef}
          hidden
          onChange={handleFileInputChange}
        />
        
        <button 
          className="icon-button"
          onClick={() => fileInputRef.current?.click()}
          title="Attach file"
        >
          <Paperclip size={18} />
        </button>

        <textarea
          ref={inputRef}
          className="message-input"
          placeholder="Type a message…"
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyDown={handleKeyPress}
          rows={1}
        />

        <button className="icon-button">
          <Smile size={18} />
        </button>

        <button
          className={`send-button ${messageInput.trim() ? "active" : ""}`}
          onClick={handleSend}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

export default ChatWindow;