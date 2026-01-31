import { useState } from 'react';
import { Search, Menu, MessageSquarePlus, Settings, User } from 'lucide-react';
import './Sidebar.css';

function Sidebar({ chats, selectedChat, onChatSelect, currentUser }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showMenu, setShowMenu] = useState(false);

  const filteredChats = chats.filter(chat =>
    chat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (date) => {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString();
  };

  const getInitials = (name) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-header-left">
          <div className="avatar large">
            {currentUser && getInitials(currentUser.name)}
          </div>
        </div>
        <div className="sidebar-header-actions">
          <button className="icon-button" title="New Chat">
            <MessageSquarePlus size={20} />
          </button>
          <button className="icon-button" onClick={() => setShowMenu(!showMenu)} title="Menu">
            <Menu size={20} />
          </button>
        </div>
        
        {showMenu && (
          <div className="dropdown-menu">
            <button className="dropdown-item">
              <User size={18} />
              Profile
            </button>
            <button className="dropdown-item">
              <Settings size={18} />
              Settings
            </button>
            <div className="dropdown-divider"></div>
            <button className="dropdown-item">
              Log out
            </button>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="sidebar-search">
        <div className="search-container">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      {/* Encryption Notice */}
      <div className="encryption-notice">
        <div className="encryption-badge">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1L2 3V6C2 8.5 3.5 10.5 6 11C8.5 10.5 10 8.5 10 6V3L6 1Z" fill="currentColor"/>
          </svg>
          End-to-end encrypted
        </div>
      </div>

      {/* Chat List */}
      <div className="chat-list">
        {filteredChats.map(chat => (
          <div
            key={chat.id}
            className={`chat-item ${selectedChat?.id === chat.id ? 'active' : ''}`}
            onClick={() => onChatSelect(chat)}
          >
            <div className={`avatar ${chat.online ? 'online-indicator' : ''}`}>
              {getInitials(chat.name)}
            </div>
            <div className="chat-info">
              <div className="chat-header">
                <h3 className="chat-name">{chat.name}</h3>
                <span className="chat-time">{formatTime(chat.timestamp)}</span>
              </div>
              <div className="chat-preview">
                <p className="chat-message">{chat.lastMessage}</p>
                {chat.unreadCount > 0 && (
                  <span className="unread-badge">{chat.unreadCount}</span>
                )}
              </div>
            </div>
          </div>
        ))}

        {filteredChats.length === 0 && (
          <div className="empty-state">
            <p>No chats found</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Sidebar;
