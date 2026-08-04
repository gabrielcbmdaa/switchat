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
  // Ausente en los chats creados antes de que el modelo fuera por chat:
  // quien lo lea debe resolverlo contra la preferencia global.
  model?: string;
}

export interface GeminiModel {
  name: string;
  displayName?: string;
  supportedGenerationMethods: string[];
  thinking?: boolean;
}
