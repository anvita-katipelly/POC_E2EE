// Type definitions

export interface Message {
  id: string;
  from: string;
  to?: string;
  text: string;
  timestamp: string;
  type: 'text' | 'file';
  fileId?: string;
  sent?: boolean;
}

export interface Peer {
  phoneNumber: string;
  connectedAt: string;
  lastSeen: string;
}

export interface FileMetadata {
  fileId: string;
  fileName: string;
  totalChunks: number;
  mediaKeyHex: string;
  ivHex: string;
  hmacHex: string;
}

export interface SocketMessage {
  type: 'text' | 'file';
  from: string;
  to: string;
  message?: string;
  fileId?: string;
  originalName?: string;
  totalChunks?: number;
  timestamp: string;
  messageId: string;
}

