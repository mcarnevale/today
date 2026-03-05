import { auth } from '@/auth';

// ── ROUTE PROTECTION ──
// Every route is protected by default.
// Unauthenticated requests are redirected to /login.
// The /login page and /api/auth/* are always public.

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Always allow auth endpoints and the login page
  if (
    pathname.startsWith('/api/auth') ||
    pathname === '/login'
  ) {
    return;
  }

  // Redirect to login if not authenticated
  if (!req.auth) {
    const loginUrl = new URL('/login', req.url);
    return Response.redirect(loginUrl);
  }
});

export const config = {
  // Run middleware on all routes except static files and Next.js internals
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
