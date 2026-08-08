import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Badge, Tooltip } from 'antd';
import {
  ApiOutlined,
  CompassOutlined,
  GithubOutlined,
  HistoryOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { fetchHealth } from '../api/client';
import { DEFAULT_PROPOSAL_SEARCH } from '../pages/proposalSearch';

const NAV_LINK_CLASS =
  'flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all';

export function Header() {
  const { data: health, isPending: loading } = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => fetchHealth(signal),
    refetchInterval: 60_000,
    retry: false,
  });

  const formatSyncTime = (timeStr: string | null) => {
    if (!timeStr) return '暂无同步数据';
    const date = new Date(timeStr);
    return `最近同步: ${date.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-900/80 border-b border-slate-800 text-slate-100 px-4 md:px-8 py-3 flex items-center justify-between transition-all">
      {/* 品牌标识 */}
      <div className="flex items-center space-x-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
          <CompassOutlined className="text-xl text-white animate-pulse" />
        </div>
        <div>
          <span className="text-lg font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            TC39 Atlas
          </span>
          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            中文索引
          </span>
        </div>
      </div>

      {/* 导航菜单 */}
      <nav className="flex items-center space-x-1 md:space-x-2 bg-slate-800/60 p-1 rounded-lg border border-slate-700/50">
        <Link
          to="/"
          search={DEFAULT_PROPOSAL_SEARCH}
          activeOptions={{ exact: true }}
          className={NAV_LINK_CLASS}
          activeProps={{ className: 'bg-indigo-600 text-white shadow-sm' }}
          inactiveProps={{
            className:
              'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50',
          }}
        >
          <CompassOutlined />
          <span>提案大全</span>
        </Link>

        <Link
          to="/changes"
          search={{ period: 'day' }}
          className={NAV_LINK_CLASS}
          activeProps={{ className: 'bg-indigo-600 text-white shadow-sm' }}
          inactiveProps={{
            className:
              'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50',
          }}
        >
          <HistoryOutlined />
          <span>周期动态</span>
        </Link>
      </nav>

      {/* 工具栏与健康状态 */}
      <div className="flex items-center space-x-4">
        {/* 服务健康状态 */}
        <Tooltip
          title={
            loading
              ? '检测服务连通性...'
              : health?.status === 'ok'
                ? `服务在线 (${formatSyncTime(health.latest_sync)})`
                : '同步服务未就绪或超过48小时未同步'
          }
        >
          <div className="flex items-center space-x-2 text-xs bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-700">
            {loading ? (
              <SyncOutlined spin className="text-slate-400" />
            ) : (
              <Badge status={health?.status === 'ok' ? 'success' : 'error'} />
            )}
            <span className="hidden sm:inline text-slate-300">
              {health?.status === 'ok' ? '同步运行中' : '同步未就绪'}
            </span>
          </div>
        </Tooltip>

        {/* MCP HTTP 端点信息 */}
        <Tooltip title="REST API 文档">
          <a
            href="/api/docs"
            target="_blank"
            rel="noreferrer"
            className="text-slate-400 hover:text-indigo-400 transition-colors text-lg"
          >
            <ApiOutlined />
          </a>
        </Tooltip>

        {/* GitHub 项目链接 */}
        <a
          href="https://github.com/tc39/proposals"
          target="_blank"
          rel="noreferrer"
          className="text-slate-400 hover:text-white transition-colors text-lg"
        >
          <GithubOutlined />
        </a>
      </div>
    </header>
  );
}
