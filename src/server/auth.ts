import { timingSafeEqual } from 'node:crypto';
const encoder = new TextEncoder();
async function key(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
export async function digest(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export async function passwordMatches(given: string, expected: string) {
  const a = await digest(given),
    b = await digest(expected);
  return timingSafeEqual(encoder.encode(a), encoder.encode(b));
}
export async function session(secret: string) {
  const payload = `${Date.now() + 8 * 3600000}:${crypto.randomUUID()}`;
  const signature = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload));
  return btoa(payload) + '.' + btoa(String.fromCharCode(...new Uint8Array(signature)));
}
export async function authorized(request: Request, secret: string | undefined) {
  if (!secret || secret.length < 32) return false;
  const cookie = request.headers
    .get('Cookie')
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith('pen_session='))
    ?.slice(12);
  if (!cookie) return false;
  try {
    const [p, s] = cookie.split('.');
    const payload = atob(p);
    if (Number(payload.split(':')[0]) < Date.now()) return false;
    return crypto.subtle.verify(
      'HMAC',
      await key(secret),
      Uint8Array.from(atob(s), (x) => x.charCodeAt(0)),
      encoder.encode(payload),
    );
  } catch {
    return false;
  }
}
export async function boundedBytes(request: Request, max = 65536) {
  if (Number(request.headers.get('Content-Length') ?? 0) > max) throw Error('body_too_large');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > max) {
      await reader.cancel();
      throw Error('body_too_large');
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  return buffer;
}

export async function boundedBody(request: Request, max = 65536) {
  return new TextDecoder().decode(await boundedBytes(request, max));
}
