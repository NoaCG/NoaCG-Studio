// TWITCH CHAT, read anonymously over IRC-on-WebSocket.
//
// Twitch's chat is IRC, and READING a public channel needs no account and no OAuth: the server
// accepts any nickname of the form `justinfanNNNN` as an anonymous read-only client. That is
// what makes Twitch the right first platform for the browser-side intake - an operator types a
// channel name and is connected, with no key, no quota and no consent screen.
//
// The driver is deliberately a dumb pipe: connect, join, parse PRIVMSG lines into the intake's
// normalized message shape, answer PING so the server keeps the socket, reconnect with backoff
// when it drops. Everything about identity, throttling and moderation happens in chatIntake.ts
// - this file must not grow opinions about what to do with a message.

import type { ChatDriver, ChatDriverHandlers } from './chatIntake';

const TWITCH_IRC_WSS = 'wss://irc-ws.chat.twitch.tv:443';

/**
 * The operator may paste a channel name, `#name`, or the channel's whole URL - all of them
 * mean the same channel. Returns the bare lowercase login, or null when nothing usable is in
 * the string (Twitch logins are 1-25 word characters).
 */
export function normalizeTwitchChannel(input: string): string | null {
  let name = input.trim().toLowerCase();
  const url = name.match(/twitch\.tv\/([a-z0-9_]+)/);
  if (url) name = url[1];
  name = name.replace(/^#/, '');
  return /^[a-z0-9_]{1,25}$/.test(name) ? name : null;
}

/** IRCv3 tag-value unescaping (`\s` space, `\:` semicolon, `\\` backslash) - display names
 *  with spaces arrive escaped, and showing `Nina\sK` on air would be wrong in a silly way. */
function unescapeTag(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const c = value[i];
    if (c !== '\\') {
      out += c;
      continue;
    }
    const next = value[i + 1];
    if (next === 's') out += ' ';
    else if (next === ':') out += ';';
    else if (next === '\\') out += '\\';
    else if (next === 'r') out += '\r';
    else if (next === 'n') out += '\n';
    else out += next ?? '';
    i += 1;
  }
  return out;
}

function parseTags(raw: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const pair of raw.split(';')) {
    const eq = pair.indexOf('=');
    if (eq > 0) tags[pair.slice(0, eq)] = unescapeTag(pair.slice(eq + 1));
  }
  return tags;
}

/**
 * Read one channel's chat. `handlers.onStatus('live')` fires once the JOIN is confirmed (the
 * 366 end-of-names reply), so the UI's indicator means "actually in the room", not "socket
 * opened". Stop() is final; a stopped driver never reconnects.
 */
export function twitchChatDriver(channel: string, handlers: ChatDriverHandlers): ChatDriver {
  const login = normalizeTwitchChannel(channel);
  let socket: WebSocket | null = null;
  let stopped = false;
  let retryMs = 1_000;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  if (!login) {
    // Report asynchronously so the caller has its handlers in place before the verdict lands -
    // the intake wires status into a row it is still creating.
    setTimeout(() => handlers.onStatus('error', 'Not a Twitch channel name.'), 0);
    return { stop: () => undefined };
  }

  const connect = () => {
    if (stopped) return;
    handlers.onStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(TWITCH_IRC_WSS);
    } catch {
      scheduleRetry();
      return;
    }
    socket = ws;

    ws.onopen = () => {
      // Tags give message ids (the dedupe key) and display names; membership is not requested
      // - joins and parts are noise the intake has no use for.
      ws.send('CAP REQ :twitch.tv/tags');
      ws.send(`NICK justinfan${Math.floor(10_000 + Math.random() * 80_000)}`);
      ws.send(`JOIN #${login}`);
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      for (const line of event.data.split('\r\n')) {
        if (!line) continue;
        if (line.startsWith('PING')) {
          ws.send(line.replace('PING', 'PONG'));
          continue;
        }
        // `:tmi... 366 justinfan #chan :End of /NAMES list` - the join is confirmed. The numeric
        // must be the command: a chat line about "366 votes" is chat.
        if (/^:\S+ 366 /.test(line)) {
          retryMs = 1_000; // a confirmed join resets the backoff ladder
          handlers.onStatus('live');
          continue;
        }
        const message = parsePrivmsg(line);
        if (message) handlers.onMessage(message);
      }
    };

    ws.onclose = () => {
      if (socket === ws) socket = null;
      scheduleRetry();
    };
    // onerror always precedes onclose; the close handler owns the retry so it runs once.
    ws.onerror = () => undefined;
  };

  const scheduleRetry = () => {
    if (stopped || retryTimer) return;
    handlers.onStatus('error', 'Connection lost - reconnecting.');
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, retryMs);
    retryMs = Math.min(retryMs * 2, 30_000);
  };

  connect();

  return {
    stop() {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      socket?.close();
      socket = null;
    },
    // Pausing costs Twitch nothing (one idle socket), so the driver keeps the room joined and
    // the intake simply ignores what arrives - resuming is instant, with no rejoin gap.
  };
}

/** `@tags :login!login@login.tmi.twitch.tv PRIVMSG #channel :the text` - anything else is not
 *  a chat line and returns null. */
function parsePrivmsg(line: string): { id: string | null; authorId: string; authorName: string; text: string } | null {
  let rest = line;
  let tags: Record<string, string> = {};
  if (rest.startsWith('@')) {
    const space = rest.indexOf(' ');
    if (space < 0) return null;
    tags = parseTags(rest.slice(1, space));
    rest = rest.slice(space + 1);
  }
  const match = rest.match(/^:([a-z0-9_]+)![^ ]+ PRIVMSG #[^ ]+ :(.*)$/i);
  if (!match) return null;
  let text = match[2];
  // A `/me` action arrives wrapped in CTCP framing (a control char, ACTION, the words, a
  // closing control char). String surgery rather than a regex - a control character inside a
  // regex literal trips no-control-regex, and rightly.
  const ctcp = String.fromCharCode(1);
  if (text.startsWith(ctcp + "ACTION ") && text.endsWith(ctcp)) text = text.slice(8, -1);
  return {
    id: tags.id || null,
    authorId: match[1],
    authorName: tags['display-name'] || match[1],
    text,
  };
}
