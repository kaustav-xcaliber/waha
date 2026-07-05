import { ensureSuffix } from '@waha/core/abc/session.abc';
import { parseMessageIdSerialized } from '@waha/core/utils/ids';
import {
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  isLidUser,
  isPnUser,
  normalizeJid,
  toCusFormat,
  toJID,
} from '@waha/core/utils/jids';
import { WAHAEngine, WAHAEvents } from '@waha/structures/enums.dto';

export function normalizeChatIdForMatch(chatId: string): string[] {
  if (!chatId) {
    return [];
  }

  const forms = new Set<string>();

  if (/^\d+$/.test(chatId)) {
    const cus = ensureSuffix(chatId);
    forms.add(cus);
    forms.add(normalizeJid(cus));
    forms.add(toJID(cus));
    return [...forms];
  }

  forms.add(normalizeJid(chatId));

  if (
    isJidGroup(chatId) ||
    isJidNewsletter(chatId) ||
    isJidBroadcast(chatId) ||
    isLidUser(chatId)
  ) {
    forms.add(chatId);
    return [...forms];
  }

  if (isPnUser(chatId) || chatId.includes('@')) {
    forms.add(toCusFormat(chatId));
    forms.add(toJID(chatId));
  }

  return [...forms].filter(Boolean);
}

function extractMessageChatId(
  engine: WAHAEngine,
  message: any,
): string | null {
  if (!message) {
    return null;
  }

  switch (engine) {
    case WAHAEngine.NOWEB:
    case WAHAEngine.GOWS:
      return message.from ?? null;
    case WAHAEngine.WEBJS:
      return message._data?.id?.remote ?? message.from ?? null;
    case WAHAEngine.WPP: {
      if (!message.id) {
        return message.from ?? null;
      }
      try {
        const parsed = parseMessageIdSerialized(message.id, true);
        return toCusFormat(parsed.remoteJid) ?? message.from ?? null;
      } catch {
        return message.from ?? null;
      }
    }
    default:
      return message.from ?? null;
  }
}

function extractCallChatId(engine: WAHAEngine, call: any): string | null {
  if (!call) {
    return null;
  }
  if (engine === WAHAEngine.GOWS) {
    return call._data?.CallCreator ?? call.from ?? null;
  }
  return call.from ?? null;
}

function extractMessageDestinationChatId(
  destination: any,
): string | null {
  if (!destination) {
    return null;
  }
  return destination.from ?? destination.to ?? null;
}

export function extractWebhookChatId(
  event: WAHAEvents,
  engine: WAHAEngine,
  payload: any,
): string | null {
  if (!payload) {
    return null;
  }

  switch (event) {
    case WAHAEvents.SESSION_STATUS:
    case WAHAEvents.LABEL_UPSERT:
    case WAHAEvents.LABEL_DELETED:
    case WAHAEvents.STATE_CHANGE:
    case WAHAEvents.ENGINE_EVENT:
      return null;

    case WAHAEvents.MESSAGE:
    case WAHAEvents.MESSAGE_ANY:
    case WAHAEvents.MESSAGE_REACTION:
    case WAHAEvents.MESSAGE_WAITING:
    case WAHAEvents.MESSAGE_EDITED:
      return extractMessageChatId(engine, payload);

    case WAHAEvents.MESSAGE_REVOKED:
      return extractMessageChatId(
        engine,
        payload.after ?? payload.before ?? payload,
      );

    case WAHAEvents.MESSAGE_ACK:
    case WAHAEvents.MESSAGE_ACK_GROUP:
      return payload.from ?? payload.to ?? null;

    case WAHAEvents.GROUP_JOIN:
    case WAHAEvents.GROUP_LEAVE:
      return payload.chatId ?? null;

    case WAHAEvents.GROUP_V2_JOIN:
    case WAHAEvents.GROUP_V2_LEAVE:
    case WAHAEvents.GROUP_V2_UPDATE:
    case WAHAEvents.GROUP_V2_PARTICIPANTS:
      return payload.group?.id ?? null;

    case WAHAEvents.PRESENCE_UPDATE:
      return payload.id ?? null;

    case WAHAEvents.CALL_RECEIVED:
    case WAHAEvents.CALL_ACCEPTED:
    case WAHAEvents.CALL_REJECTED:
      return extractCallChatId(engine, payload);

    case WAHAEvents.POLL_VOTE:
    case WAHAEvents.POLL_VOTE_FAILED:
      return (
        extractMessageDestinationChatId(payload.vote) ??
        extractMessageDestinationChatId(payload.poll) ??
        null
      );

    case WAHAEvents.CHAT_ARCHIVE:
    case WAHAEvents.LABEL_CHAT_ADDED:
    case WAHAEvents.LABEL_CHAT_DELETED:
      return payload.chatId ?? null;

    case WAHAEvents.EVENT_RESPONSE:
    case WAHAEvents.EVENT_RESPONSE_FAILED:
      return payload.from ?? payload.to ?? null;

    default:
      return payload.chatId ?? payload.from ?? payload.id ?? null;
  }
}

export class WebhookChatIncludeFilter {
  private readonly allowed: Set<string>;

  constructor(includeChats?: string[]) {
    this.allowed = new Set();
    if (!includeChats?.length) {
      return;
    }
    for (const chat of includeChats) {
      for (const form of normalizeChatIdForMatch(chat)) {
        this.allowed.add(form);
      }
    }
  }

  get hasFilter(): boolean {
    return this.allowed.size > 0;
  }

  shouldDeliver(
    event: WAHAEvents,
    engine: WAHAEngine,
    payload: any,
  ): boolean {
    if (!this.hasFilter) {
      return true;
    }
    const chatId = extractWebhookChatId(event, engine, payload);
    if (!chatId) {
      return true;
    }
    const forms = normalizeChatIdForMatch(chatId);
    return forms.some((form) => {
      return this.allowed.has(form);
    });
  }
}
