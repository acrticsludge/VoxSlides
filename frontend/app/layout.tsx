import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "VoxSlides — Expressive AI Text-to-Speech",
    template: "%s — VoxSlides",
  },
  description:
    "Generate expressive, emotion-rich speech from text using AI voice cloning. Add condition tags to control delivery style.",
  metadataBase: new URL("https://voxslides.com"),
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "VoxSlides",
    title: "VoxSlides — Expressive AI Text-to-Speech",
    description:
      "Generate expressive, emotion-rich speech from text using AI voice cloning.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "VoxSlides — Expressive AI Text-to-Speech",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "VoxSlides — Expressive AI Text-to-Speech",
    description:
      "Generate expressive, emotion-rich speech from text using AI voice cloning.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "VoxSlides",
              applicationCategory: "MultimediaApplication",
              operatingSystem: "Web",
              description:
                "Expressive AI text-to-speech with voice cloning and emotion tags",
              url: "https://voxslides.com",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
              },
            }),
          }}
        />
      </head>
      <body className={`${inter.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
