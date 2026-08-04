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
  // Ausentes en los chats creados antes de que estos ajustes fueran por chat:
  // el modelo se resuelve contra la preferencia global y el nivel contra el modelo.
  model?: string;
  reasoningLevel?: string;
}

export interface GeminiModel {
  name: string;
  displayName?: string;
  supportedGenerationMethods: string[];
  thinking?: boolean;
}
