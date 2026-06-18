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
  metadataBase: new URL("https://nuit-etoilee.vercel.app"),
  title: "ars gratia artis — An Atlas of Art History",
  description:
    "A fancy night walk under the shining masters that illuminate the world's art galleries — a zoomable star-map of art history and a walkable 3D gallery for every master. Every fact and painting from Wikipedia and Wikimedia Commons.",
  openGraph: {
    type: "website",
    siteName: "ars gratia artis",
    title: "ars gratia artis — An Atlas of Art History",
    description:
      "Step through any star into a master's gallery — their real paintings in a 3D museum, zoomable to the brushstroke.",
  },
  twitter: { card: "summary_large_image" },
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
