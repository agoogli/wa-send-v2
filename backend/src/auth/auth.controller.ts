import { Controller, Post, Get, Body, Req, Res, UnauthorizedException, HttpStatus, HttpCode } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { signJwt, verifyJwt } from './jwt.utils';

// 6 months in milliseconds (6 * 30 * 24 * 60 * 60 * 1000)
const COOKIE_MAX_AGE = 15552000000;
const JWT_SECRET = process.env.JWT_SECRET || 'wa-send-v2-super-secret-key-change-this-in-production';
const COOKIE_NAME = 'auth_token';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: { password?: string },
    @Res({ passthrough: true }) res: Response
  ) {
    const password = body.password || '';
    const isValid = await this.authService.validatePassword(password);

    if (!isValid) {
      throw new UnauthorizedException('Password errata');
    }

    // Generate JWT token
    const token = signJwt({ loggedIn: true }, JWT_SECRET, COOKIE_MAX_AGE / 1000);

    // Set cookie
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: false, // Set to true if using HTTPS in production
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    });

    return { success: true };
  }

  @Get('check')
  async check(@Req() req: Request) {
    const rawCookies = req.headers.cookie;
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
      throw new UnauthorizedException('Non autenticato');
    }

    const decoded = verifyJwt(token, JWT_SECRET);
    if (!decoded) {
      throw new UnauthorizedException('Sessione scaduta o non valida');
    }

    return { authenticated: true };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: Response) {
    res.cookie(COOKIE_NAME, '', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    });
    return { success: true };
  }
}
