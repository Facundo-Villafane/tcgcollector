import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tamer Binder",
  description: "Digimon TCG collection tracker and deck builder",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
