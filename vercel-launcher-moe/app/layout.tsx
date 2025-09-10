export const metadata = {
  title: 'Prime Rose — MOE On‑Demand',
  description: 'Launch the MOE system on-demand. Ethereal Blends.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
