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
}

export interface GeminiModel {
  name: string;
  displayName?: string;
  supportedGenerationMethods: string[];
  thinking?: boolean;
}
