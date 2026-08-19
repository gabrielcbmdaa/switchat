export interface MessagePart {
  text: string;
}

export interface Message {
  _id?: string;
  role: 'user' | 'model' | 'system';
  parts: MessagePart[];
  createdAt?: string;
  isTemporary?: boolean;
  model?: string;
  // El nivel con el que se generó esta respuesta, no el que tenga el chat ahora: mover
  // el slider después no reescribe lo ya respondido. Ausente en los mensajes anteriores
  // a este campo y en los del usuario, igual que model.
  reasoningLevel?: string;
}

export interface Chat {
  id: string;
  title: string;
  draft: string;
  messages: Message[];
  systemPrompt?: string;
  systemPromptEnabled?: boolean;
  // Absent on chats created before this field; absent means off.
  notesEnabled?: boolean;
  notes?: string;
  // Absent on chats created before these settings were per-chat:
  // the model falls back to the global preference and the level to the model.
  model?: string;
  reasoningLevel?: string;
  // When the chat was born and when it last saw a message. Both optional: chats created
  // before these fields exist without them, and the ordering helper falls back rather than
  // assuming a value. lastMessageAt belongs to the server — it arrives with the chat and is
  // never written from here, or a stale copy would undo the server's own bump.
  createdAt?: string;
  lastMessageAt?: string;
}

export interface GeminiModel {
  name: string;
  displayName?: string;
  supportedGenerationMethods: string[];
  thinking?: boolean;
}
