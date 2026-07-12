export interface MessagePart {
  text: string;
}

export interface Message {
  _id?: string;
  role: 'user' | 'model' | 'system';
  parts: MessagePart[];
  createdAt?: string;
}

export interface Chat {
  id: string;
  title: string;
  draft: string;
  messages: Message[];
}
