import React from "react";

function Sidebar({ user, selectedChat, onSelectChat, chats = [] }) {
  // 🔐 Defensive default: chats is always an array
  const safeChats = Array.isArray(chats) ? chats : [];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h3>{user?.name || "Secure Chat"}</h3>
      </div>

      <div className="chat-list">
        {safeChats.length === 0 && (
          <div className="empty-state">No conversations</div>
        )}

        {safeChats.map((chat) => (
          <div
            key={chat.id}
            className={
              selectedChat?.id === chat.id
                ? "chat-item active"
                : "chat-item"
            }
            onClick={() => onSelectChat(chat)}
          >
            <div className="chat-name">{chat.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Sidebar;
