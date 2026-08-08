import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDark, useLang } from '@rspress/core/runtime';
import { Layout as BasicLayout } from '@rspress/core/theme-original';
import { ConfigProvider, theme } from 'antd';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';

import { ProposalMeta } from './ProposalMeta';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Number.POSITIVE_INFINITY,
      retry: 1,
    },
  },
});

function Layout() {
  const isDark = useDark();
  const lang = useLang();

  return (
    <ConfigProvider
      locale={lang === 'zh' ? zhCN : enUS}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { colorPrimary: '#6366f1', borderRadius: 8 },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <BasicLayout beforeDocContent={<ProposalMeta />} />
      </QueryClientProvider>
    </ConfigProvider>
  );
}

export { Layout };
export * from '@rspress/core/theme-original';
