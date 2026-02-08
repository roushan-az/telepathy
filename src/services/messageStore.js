const conversations = new Map();
const listeners = [];

export const MessageStore = {
  addMessage(msg) {
    const peerId = msg.from || msg.to;

    if (!conversations.has(peerId)) {
      conversations.set(peerId, {
        peerId,
        messages: []
      });
    }

    conversations.get(peerId).messages.push(msg);

    listeners.forEach(cb => cb(this.getConversations()));
  },

  getConversations() {
    return Array.from(conversations.values());
  },

  subscribe(cb) {
    listeners.push(cb);
    cb(this.getConversations());
    return () => {
      const i = listeners.indexOf(cb);
      if (i > -1) listeners.splice(i, 1);
    };
  }
};
