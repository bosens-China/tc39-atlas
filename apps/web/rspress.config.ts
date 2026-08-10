import { defineConfig } from '@rspress/core';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderLlmsTxt } from './src/llms.js';

const webRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: join(webRoot, 'docs'),
  outDir: join(webRoot, 'doc_build'),
  base: process.env.BASE_PATH ?? '/',
  lang: 'zh',
  title: 'TC39 Atlas',
  description: '面向中文用户与 AI Agent 的 TC39 提案知识库',
  llms: { llmsTxt: renderLlmsTxt },
  icon: '/favicon.png',
  logo: '/favicon.png',
  logoText: 'TC39 Atlas',
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
    lastUpdated: true,
    editLink: {
      docRepoBaseUrl:
        'https://github.com/bosens-China/tc39-atlas/edit/main/apps/web/docs',
    },
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/bosens-China/tc39-atlas',
      },
    ],
  },
  markdown: {
    // 站内链接已经显式区分中文根路径与 /en，避免 locale 自动补前缀形成 /en/en。
    link: { checkDeadLinks: true, autoPrefix: false },
    image: { checkDeadImages: true },
  },
});
