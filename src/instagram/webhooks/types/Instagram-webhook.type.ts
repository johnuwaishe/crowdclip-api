export interface InstagramWebhookPayload {
  object: string;
  entry: InstagramWebhookEntry[];
}

export interface InstagramWebhookEntry {
  id: string;
  time: number;
  messaging?: InstagramMessagingEvent[];
}

export interface InstagramMessagingEvent {
  sender: InstagramWebhookParticipant;
  recipient: InstagramWebhookParticipant;
  timestamp: number;
  message?: InstagramMessage;
  reaction?: InstagramReaction;
}

export interface InstagramWebhookParticipant {
  id: string;
}

export interface InstagramMessage {
  mid: string;
  text?: string;
  attachments?: InstagramAttachment[];
}

export interface InstagramAttachment {
  type: string;
  payload?: {
    url?: string;
  };
}

export interface InstagramReaction {
  mid?: string;
  action?: string;
  reaction?: string;
}
