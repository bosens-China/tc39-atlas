import { usePageData } from '@rspress/core/runtime';
import { EditLink as BasicEditLink } from '@rspress/core/theme-original';
import { createElement } from 'react';

const GENERATED_DOCUMENT_PATH = /(?:^|\/)(?:changes|proposals)\//u;

export function EditLink({ isOutline }: { isOutline?: boolean }) {
  const { page } = usePageData();
  const relativePath =
    typeof page._relativePath === 'string'
      ? page._relativePath.replaceAll('\\', '/')
      : '';

  // 生成页面在仓库中没有对应 Markdown，避免产生无效的 GitHub 编辑链接。
  if (GENERATED_DOCUMENT_PATH.test(relativePath)) return null;

  return createElement(BasicEditLink, { isOutline });
}

export * from '@rspress/core/theme-original';
