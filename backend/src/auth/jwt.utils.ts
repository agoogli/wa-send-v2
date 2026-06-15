import * as crypto from 'crypto';

function base64url(str: string | Buffer): string {
  const base64 = typeof str === 'string' ? Buffer.from(str).toString('base64') : str.toString('base64');
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64urlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Signs a payload to generate a JWT using HMAC SHA-256
 */
export function signJwt(payload: any, secret: string, expiresInSeconds: number): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload = { ...payload, exp };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(fullPayload));

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();

  const encodedSignature = base64url(signature);
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

/**
 * Verifies a JWT and returns its decoded payload, or null if invalid/expired
 */
export function verifyJwt(token: string, secret: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    const expectedSignature = base64url(
      crypto
        .createHmac('sha256', secret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest()
    );

    if (encodedSignature !== expectedSignature) {
      return null;
    }

    const payload = JSON.parse(base64urlDecode(encodedPayload));
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return null; // Expired
    }
    return payload;
  } catch (err) {
    return null;
  }
}
