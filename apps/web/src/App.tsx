import { Outlet } from '@tanstack/react-router';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { Header } from './components/Header';

export function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#6366f1', // Indigo 500
          borderRadius: 8,
          colorBgContainer: '#1e293b', // Slate 800
          colorBgElevated: '#0f172a', // Slate 900
        },
      }}
    >
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white antialiased">
        {/* 顶栏 Header */}
        <Header />

        {/* 主要视图内容区 */}
        <main className="flex-1">
          <Outlet />
        </main>

        {/* 页脚 Footer */}
        <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500 bg-slate-900/40">
          <p>
            TC39 Atlas &copy; {new Date().getFullYear()} — 面向中文用户与 AI
            Agent 的 TC39 提案索引服务
          </p>
        </footer>
      </div>
    </ConfigProvider>
  );
}

export default App;
