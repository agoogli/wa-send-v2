import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { verifyJwt } from './jwt.utils';

const JWT_SECRET = process.env.JWT_SECRET || 'wa-send-v2-super-secret-key-change-this-in-production';
const COOKIE_NAME = 'auth_token';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const rawCookies = request.headers.cookie;
    let token: string | null = null;

    if (rawCookies) {
      const cookies = rawCookies.split(';');
      for (const cookie of cookies) {
        const [key, val] = cookie.trim().split('=');
        if (key === COOKIE_NAME) {
          token = val;
          break;
        }
      }
    }

    if (!token) {
      throw new UnauthorizedException('Accesso negato: Utente non autenticato');
    }

    const decoded = verifyJwt(token, JWT_SECRET);
    if (!decoded) {
      throw new UnauthorizedException('Sessione scaduta o non valida');
    }

    // Bind decoded user token data to request
    (request as any).user = decoded;
    return true;
  }
}
