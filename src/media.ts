// An image a tool returned leaves the conversation with its result (ADR 0012).
//
// A rebuilt message carries text and tool blocks only, so the image cannot
// stay. The result's text and its images are stored together as one text, and
// one ticket stands in the result's place, as for any result that was moved out.

/** One block of a tool result that held an image, in the order the result held them. */
export type MediaPart = { type: 'text'; text: string } | { type: 'image'; media_type: string; data: string };

// How a stored result that holds images begins. What follows is the parts as
// JSON. That an entry holds an image is told by this alone: an entry beside it
// can be one another tool wrote for the same text.
const HEAD = '[lossless-compaction] a tool result holding images, version 1\n';

// The kinds of image the API takes, each with how its bytes begin in base64. A
// stored text is taken for an image only when its bytes begin as its kind does,
// so a tool's output that merely has the shape of an entry stays text.
const KINDS = new Map([
  ['image/png', 'iVBORw0KGgo'],
  ['image/jpeg', '/9j/'],
  ['image/gif', 'R0lGOD'],
  ['image/webp', 'UklGR'],
]);
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** True for the bytes of an image of that kind, in base64. What is stored and what is handed back are held to it alike. */
export function isImage(mediaType: unknown, data: unknown): data is string {
  if (typeof mediaType !== 'string' || typeof data !== 'string') return false;
  const start = KINDS.get(mediaType);
  return start !== undefined && data.startsWith(start) && BASE64.test(data);
}

// Text the host puts after a result's own blocks, taken off the end only. It is not what the tool returned.
const HOST_NOTE = /^<system-reminder>/;

/** A rough figure for what one image takes of the context: one of 1,092 by 1,092 pixels comes to about 1,590 tokens. */
export const IMAGE_TOKENS = 1500;

export function encodeMedia(parts: readonly MediaPart[]): string {
  return HEAD + JSON.stringify(parts);
}

function partOf(value: unknown): MediaPart | null {
  if (typeof value !== 'object' || value === null) return null;
  const part = value as Record<string, unknown>;
  if (part['type'] === 'text' && typeof part['text'] === 'string') return { type: 'text', text: part['text'] };
  if (part['type'] === 'image' && isImage(part['media_type'], part['data'])) {
    return { type: 'image', media_type: part['media_type'] as string, data: part['data'] };
  }
  return null;
}

/** The parts of a stored result that holds images, or null for any other stored text. */
export function decodeMedia(text: string): MediaPart[] | null {
  if (!text.startsWith(HEAD)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(HEAD.length));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const parts = parsed.map(partOf);
  return parts.every((part): part is MediaPart => part !== null) && parts.some((part) => part.type === 'image') ? parts : null;
}

/** The text of a stored result that holds images: its text parts alone, never the bytes of an image. */
export function textOf(parts: readonly MediaPart[]): string {
  return parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
}

/**
 * A stored result that holds images as the blocks a tool hands back, in the
 * form the Messages API takes and in the order they were stored, with nothing
 * added. Read again from the conversation and stored again, they come to the
 * same text, so a result that was recalled is stored once.
 */
export function blocksOf(parts: readonly MediaPart[]): unknown[] {
  return parts.map((part) =>
    part.type === 'text' ? { type: 'text', text: part.text } : { type: 'image', source: { type: 'base64', media_type: part.media_type, data: part.data } },
  );
}

export type Media = {
  /** By the id of its call, every tool result that holds an image, with its parts. */
  results: Map<string, MediaPart[]>;
  images: number;
  /** Why one of them cannot be moved out, or null. */
  why: string | null;
};

/**
 * The tool results of a conversation that hold an image, read from the
 * conversation with its blocks intact. An image anywhere else is not looked
 * at here: `whyNotRebuilt` leaves such a conversation to the built-in compaction.
 */
export function mediaIn(api: unknown): Media {
  const media: Media = { results: new Map(), images: 0, why: null };
  if (!Array.isArray(api)) return media;
  for (const message of api) {
    const content = (message as { content?: unknown } | null)?.content;
    if (!Array.isArray(content)) continue;
    for (const raw of content) {
      if (typeof raw !== 'object' || raw === null) continue;
      const block = raw as Record<string, unknown>;
      if (block['type'] !== 'tool_result') continue;
      if (!Array.isArray(block['content'])) {
        // An image that is the whole content and not one of a list: not a form to take one from.
        if ((block['content'] as { type?: unknown } | null)?.type === 'image') media.why = 'an image in a tool result that is not a list of blocks';
        continue;
      }
      const inside = block['content'] as unknown[];
      if (!inside.some((b) => (b as { type?: unknown } | null)?.type === 'image')) continue;
      const id = block['tool_use_id'];
      if (typeof id !== 'string') {
        media.why = 'an image in a tool result without the id of its call';
        continue;
      }
      const parts: MediaPart[] = [];
      for (const b of inside) {
        const one = (typeof b === 'object' && b !== null ? b : {}) as Record<string, unknown>;
        if (one['type'] === 'text' && typeof one['text'] === 'string') {
          parts.push({ type: 'text', text: one['text'] });
          continue;
        }
        const source = one['source'] as Record<string, unknown> | undefined;
        if (one['type'] !== 'image') {
          media.why = 'an image in a tool result next to a block that is not text';
        } else if (typeof source !== 'object' || source === null || source['type'] !== 'base64' || typeof source['data'] !== 'string') {
          media.why = 'an image that is not held as its bytes';
        } else if (!isImage(source['media_type'], source['data'])) {
          media.why = 'an image of a kind that is not kept';
        } else {
          parts.push({ type: 'image', media_type: source['media_type'] as string, data: source['data'] });
          media.images += 1;
        }
      }
      // What the host put after the result's own blocks is not the result's.
      for (let last = parts.at(-1); last?.type === 'text' && HOST_NOTE.test(last.text); last = parts.at(-1)) parts.pop();
      media.results.set(id, parts);
    }
  }
  return media;
}
