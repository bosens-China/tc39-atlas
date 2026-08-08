import { defineConfig } from '@rspress/core';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: join(webRoot, 'docs'),
  outDir: join(webRoot, 'doc_build'),
  base: process.env.BASE_PATH ?? '/',
  lang: 'zh',
  title: 'TC39 Atlas',
  description: '面向中文用户与 AI Agent 的 TC39 提案知识库',
  icon: '/favicon.png',
  logo: '/favicon.png',
  logoText: 'TC39 Atlas',
  globalStyles: join(webRoot, 'src/index.css'),
  locales: [
    {
      lang: 'zh',
      label: '简体中文',
      title: 'TC39 Atlas',
      description: 'TC39 提案中文知识库',
    },
    {
      lang: 'en',
      label: 'English',
      title: 'TC39 Atlas',
      description: 'A searchable knowledge base for TC39 proposals',
    },
  ],
  themeConfig: {
    fallbackHeadingTitle: true,
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/bosens-China/tc39-atlas',
      },
    ],
  },
  markdown: {
    link: { checkDeadLinks: true },
    image: { checkDeadImages: true },
  },
});
