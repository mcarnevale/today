'use client';

import { signIn } from 'next-auth/react';

export default function LoginPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#111113',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 32,
      }}>
        {/* Wordmark */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: 28,
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: '-0.5px',
          }}>
            TODAY
          </div>
          <div style={{
            fontSize: 13,
            color: '#636366',
            marginTop: 6,
          }}>
            Your AI command center
          </div>
        </div>

        {/* Sign-in card */}
        <div style={{
          background: '#1f1f23',
          border: '1px solid #2e2e33',
          borderRadius: 14,
          padding: '32px 40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          width: 320,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#f0f0f5' }}>
              Sign in
            </div>
            <div style={{ fontSize: 12, color: '#8e8e99', marginTop: 4 }}>
              Access is restricted to authorized accounts.
            </div>
          </div>

          <button
            onClick={() => signIn('google', { callbackUrl: '/' })}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              width: '100%',
              padding: '10px 16px',
              background: '#ffffff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              color: '#1a1a1a',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'opacity 0.12s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '0.92')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
          >
            {/* Google logo */}
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  );
}
