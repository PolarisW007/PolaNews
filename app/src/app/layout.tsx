import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ToastProvider } from '@/components/ui/Toast';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: '一念三千 - 全球资讯AI聚合阅读平台',
  description: '全球资讯 RSS 聚合阅读平台，AI 驱动的新闻摘要与分析',
};

const themeInitScript = `
(() => {
  try {
    const stored = localStorage.getItem('polanews_theme') || 'dark';
    const font = localStorage.getItem('polanews_font') || 'system';
    const fontMap = {
      harmonyos: '"HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
      nanowood: '"NanoWoodHei", "PingFang SC", "Microsoft YaHei", sans-serif',
      sourcehansans: '"Source Han Sans CN", "Noto Sans SC", "PingFang SC", sans-serif',
      alibaba: '"Alibaba PuHuiTi 3.0", "PingFang SC", "Microsoft YaHei", sans-serif',
      vivosans: '"vivo Sans", "PingFang SC", "Microsoft YaHei", sans-serif'
    };
    const theme = stored === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : stored;
    document.documentElement.setAttribute('data-theme', theme);
    if (fontMap[font]) {
      document.documentElement.style.setProperty('--user-font-family', fontMap[font]);
    }
  } catch {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${inter.variable} antialiased`}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
