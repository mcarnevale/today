import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

// ── AUTH CONFIGURATION ──
// Only the email address in AUTH_ALLOWED_EMAIL can sign in.
// Even if someone knows the URL, they can't access the app.

const allowedEmail = process.env.AUTH_ALLOWED_EMAIL?.toLowerCase().trim();

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!allowedEmail) {
        console.error('[auth] AUTH_ALLOWED_EMAIL is not set — blocking all sign-ins.');
        return false;
      }
      const email = user.email?.toLowerCase().trim();
      if (email !== allowedEmail) {
        console.warn(`[auth] Blocked sign-in attempt from: ${email}`);
        return false;
      }
      return true;
    },
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
});
