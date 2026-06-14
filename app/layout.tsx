import type { Metadata } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/components/LocaleProvider";
import { AudioProvider } from "@/components/AudioProvider";
import AudioControl from "@/components/AudioControl";
import FullscreenButton from "@/components/FullscreenButton";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Constellation — An Atlas of Art History",
  description:
    "A zoomable star-map of art history and a walkable 3D gallery for every artist. Every fact and painting drawn from Wikipedia and Wikimedia Commons.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <LocaleProvider>
          <AudioProvider>
            {children}
            <AudioControl />
            <FullscreenButton />
          </AudioProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
