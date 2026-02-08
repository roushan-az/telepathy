// services/websocket-chunk-handler.js

/**
 * WebSocket Chunk Handler
 * Handles streamed/chunked messages from server
 * Based on how Zoom/Signal handle large WebRTC messages
 */

class ChunkHandler {
  constructor() {
    this.chunks = new Map(); // messageId -> { chunks: [], totalChunks, receivedChunks, metadata }
  }

  /**
   * Process incoming message - handles both regular and chunked messages
   */
  handleMessage(data, onCompleteMessage) {
    try {
      const message = JSON.parse(data);

      // Handle chunk metadata
      if (message.type === 'CHUNK_META') {
        this.initializeChunkCollection(message);
        return null; // No complete message yet
      }

      // Handle chunk data
      if (message.type === 'CHUNK') {
        return this.handleChunk(message, onCompleteMessage);
      }

      // Regular message (not chunked)
      return message;
    } catch (error) {
      console.error('❌ Error handling message:', error);
      return null;
    }
  }

  /**
   * Initialize storage for collecting chunks
   */
  initializeChunkCollection(metadata) {
    const { messageId, totalChunks, totalSize, originalType } = metadata;
    
    this.chunks.set(messageId, {
      metadata: { totalChunks, totalSize, originalType },
      chunks: new Array(totalChunks),
      receivedChunks: 0
    });

    console.log(`📦 Expecting chunked message: id=${messageId}, chunks=${totalChunks}, size=${totalSize}`);

    // Set timeout to clean up if all chunks don't arrive
    setTimeout(() => {
      if (this.chunks.has(messageId)) {
        console.warn(`⚠️ Chunk timeout for message ${messageId}`);
        this.chunks.delete(messageId);
      }
    }, 30000); // 30 second timeout
  }

  /**
   * Handle individual chunk and reassemble when complete
   */
  handleChunk(chunkMessage, onCompleteMessage) {
    const { messageId, chunkIndex, data } = chunkMessage;
    
    const collection = this.chunks.get(messageId);
    if (!collection) {
      console.warn(`⚠️ Received chunk for unknown message: ${messageId}`);
      return null;
    }

    // Store chunk
    collection.chunks[chunkIndex] = data;
    collection.receivedChunks++;

    console.log(`📥 Chunk received: ${collection.receivedChunks}/${collection.metadata.totalChunks} for ${messageId}`);

    // Check if all chunks received
    if (collection.receivedChunks === collection.metadata.totalChunks) {
      return this.reassembleMessage(messageId, collection, onCompleteMessage);
    }

    return null; // Not complete yet
  }

  /**
   * Reassemble all chunks into original message
   */
  reassembleMessage(messageId, collection, onCompleteMessage) {
    try {
      // Combine all base64 chunks
      const combinedBase64 = collection.chunks.join('');
      
      // Decode base64 to string
      const decodedString = atob(combinedBase64);
      
      // Convert to bytes then to UTF-8 string
      const bytes = new Uint8Array(decodedString.length);
      for (let i = 0; i < decodedString.length; i++) {
        bytes[i] = decodedString.charCodeAt(i);
      }
      const decoder = new TextDecoder('utf-8');
      const originalMessage = decoder.decode(bytes);

      // Parse back to JSON
      const message = JSON.parse(originalMessage);

      console.log(`✅ Message reassembled: id=${messageId}, size=${originalMessage.length}`);

      // Clean up
      this.chunks.delete(messageId);

      // Notify callback if provided
      if (onCompleteMessage) {
        onCompleteMessage(message);
      }

      return message;
    } catch (error) {
      console.error(`❌ Error reassembling message ${messageId}:`, error);
      this.chunks.delete(messageId);
      return null;
    }
  }

  /**
   * Clean up any pending chunks
   */
  cleanup() {
    this.chunks.clear();
  }

  /**
   * Get stats for monitoring
   */
  getStats() {
    return {
      pendingMessages: this.chunks.size,
      messagesDetail: Array.from(this.chunks.entries()).map(([id, collection]) => ({
        messageId: id,
        receivedChunks: collection.receivedChunks,
        totalChunks: collection.metadata.totalChunks,
        progress: `${collection.receivedChunks}/${collection.metadata.totalChunks}`
      }))
    };
  }
}

export default ChunkHandler;