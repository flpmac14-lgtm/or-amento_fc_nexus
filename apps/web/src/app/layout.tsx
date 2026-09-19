import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FC Nexus — Orçamento Industrial I.A.",
  description: "Análise automática de desenhos técnicos e orçamento industrial",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      data-theme="dark"
      // O script abaixo pode trocar data-theme antes da hidratação (lê
      // localStorage), o que sempre diverge do "dark" renderizado no
      // servidor — esperado nesse padrão anti-flash, não um bug real.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Evita flash: aplica o tema salvo ANTES do primeiro paint.
            O padrão do <html> acima é sempre "dark" — só troca se o
            usuário já escolheu "light" antes (localStorage). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{if(localStorage.getItem("fcnexus-theme")==="light"){document.documentElement.setAttribute("data-theme","light")}}catch(e){}',
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
