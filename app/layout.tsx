import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: "Today",
  description: 'Personal AI command center — Gmail · Granola · HubSpot',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/icon?family=Material+Icons+Round"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
