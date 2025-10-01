import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Block WordPress/PHP probe attempts
  if (
    pathname.includes('wp-admin') ||
    pathname.includes('wordpress') ||
    pathname.includes('.php') ||
    pathname.includes('xmlrpc') ||
    pathname.includes('wp-content') ||
    pathname.includes('wp-includes')
  ) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
