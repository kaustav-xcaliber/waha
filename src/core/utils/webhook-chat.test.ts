import {
  extractWebhookChatId,
  normalizeChatIdForMatch,
  WebhookChatIncludeFilter,
} from './webhook-chat';
import { WAHAEngine, WAHAEvents } from '@waha/structures/enums.dto';

describe('normalizeChatIdForMatch', () => {
  it('normalizes bare phone numbers to @c.us forms', () => {
    const forms = normalizeChatIdForMatch('11111111111');
    expect(forms).toContain('11111111111@c.us');
  });

  it('matches @c.us and @s.whatsapp.net for the same contact', () => {
    const cus = normalizeChatIdForMatch('11111111111@c.us');
    const net = normalizeChatIdForMatch('11111111111@s.whatsapp.net');
    expect(cus.some((form) => net.includes(form))).toBe(true);
  });

  it('preserves group JIDs', () => {
    const groupId = '120363012345678901@g.us';
    const forms = normalizeChatIdForMatch(groupId);
    expect(forms).toContain(groupId);
  });
});

describe('extractWebhookChatId', () => {
  it('returns null for session.status', () => {
    expect(
      extractWebhookChatId(
        WAHAEvents.SESSION_STATUS,
        WAHAEngine.NOWEB,
        { name: 'default', status: 'WORKING' },
      ),
    ).toBeNull();
  });

  it('extracts message chat id for NOWEB', () => {
    expect(
      extractWebhookChatId(WAHAEvents.MESSAGE, WAHAEngine.NOWEB, {
        from: '11111111111@c.us',
      }),
    ).toBe('11111111111@c.us');
  });

  it('extracts message chat id for WEBJS from _data.id.remote', () => {
    expect(
      extractWebhookChatId(WAHAEvents.MESSAGE, WAHAEngine.WEBJS, {
        from: '22222222222@c.us',
        _data: { id: { remote: '11111111111@c.us' } },
      }),
    ).toBe('11111111111@c.us');
  });

  it('extracts group v2 chat id from payload.group.id', () => {
    expect(
      extractWebhookChatId(WAHAEvents.GROUP_V2_JOIN, WAHAEngine.NOWEB, {
        group: { id: '120363012345678901@g.us' },
      }),
    ).toBe('120363012345678901@g.us');
  });

  it('extracts call chat id for GOWS from _data.CallCreator', () => {
    expect(
      extractWebhookChatId(WAHAEvents.CALL_RECEIVED, WAHAEngine.GOWS, {
        from: '22222222222@c.us',
        _data: { CallCreator: '11111111111@c.us' },
      }),
    ).toBe('11111111111@c.us');
  });
});

describe('WebhookChatIncludeFilter', () => {
  it('allows all events when includeChats is empty', () => {
    const filter = new WebhookChatIncludeFilter([]);
    expect(
      filter.shouldDeliver(WAHAEvents.MESSAGE, WAHAEngine.NOWEB, {
        from: '99999999999@c.us',
      }),
    ).toBe(true);
  });

  it('allows matching chat events', () => {
    const filter = new WebhookChatIncludeFilter(['11111111111@c.us']);
    expect(
      filter.shouldDeliver(WAHAEvents.MESSAGE, WAHAEngine.NOWEB, {
        from: '11111111111@c.us',
      }),
    ).toBe(true);
  });

  it('blocks non-matching chat events', () => {
    const filter = new WebhookChatIncludeFilter(['11111111111@c.us']);
    expect(
      filter.shouldDeliver(WAHAEvents.MESSAGE, WAHAEngine.NOWEB, {
        from: '22222222222@c.us',
      }),
    ).toBe(false);
  });

  it('allows non-chat events even when includeChats is set', () => {
    const filter = new WebhookChatIncludeFilter(['11111111111@c.us']);
    expect(
      filter.shouldDeliver(
        WAHAEvents.SESSION_STATUS,
        WAHAEngine.NOWEB,
        { name: 'default', status: 'WORKING' },
      ),
    ).toBe(true);
  });

  it('matches bare phone numbers in includeChats', () => {
    const filter = new WebhookChatIncludeFilter(['11111111111']);
    expect(
      filter.shouldDeliver(WAHAEvents.MESSAGE, WAHAEngine.NOWEB, {
        from: '11111111111@c.us',
      }),
    ).toBe(true);
  });
});
