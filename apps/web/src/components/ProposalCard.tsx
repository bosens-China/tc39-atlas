import React from 'react';
import { Link, useLang } from '@rspress/core/runtime';
import { Card, Tooltip } from 'antd';
import { GithubOutlined, RightOutlined } from '@ant-design/icons';
import { EditionTag, StageTag, StatusTag } from './StageTag';
import type { ProposalSummary } from '../api/client';

interface ProposalCardProps {
  proposal: ProposalSummary;
  href: string;
}

export const ProposalCard: React.FC<ProposalCardProps> = ({
  proposal,
  href,
}) => {
  const lang = useLang();
  const formattedTime = new Date(proposal.data_updated_at).toLocaleDateString(
    lang === 'zh' ? 'zh-CN' : 'en',
    {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    },
  );
  const title =
    lang === 'zh' ? (proposal.title_zh ?? proposal.title) : proposal.title;

  return (
    <Card
      hoverable
      className="group overflow-hidden rounded-xl border-slate-200 bg-white/90 transition-all duration-300 hover:-translate-y-1 hover:border-indigo-500/40 hover:shadow-xl hover:shadow-indigo-500/10 dark:border-slate-700/80 dark:bg-slate-800/90"
      styles={{
        body: { padding: '1.25rem' },
      }}
    >
      <div className="flex flex-col h-full justify-between space-y-4">
        {/* 卡片头部：状态 Tag 组与仓库图标 */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <StageTag stage={proposal.stage} />
            <StatusTag status={proposal.status} />
            <EditionTag edition={proposal.edition} />
          </div>

          <Tooltip title="查看 GitHub 原仓库">
            <a
              href={proposal.repository_url}
              target="_blank"
              rel="noreferrer"
              className="p-1 text-slate-500 transition-colors hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
            >
              <GithubOutlined className="text-lg" />
            </a>
          </Tooltip>
        </div>

        {/* 卡片主体：标题与 ID */}
        <div>
          <Link
            to={href}
            className="mb-1 line-clamp-2 text-base font-semibold text-slate-900 transition-colors group-hover:text-indigo-500 dark:text-slate-100 dark:group-hover:text-indigo-400"
          >
            {title}
          </Link>
          {lang === 'zh' && title !== proposal.title ? (
            <p className="mb-1 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
              {proposal.title}
            </p>
          ) : null}
          <p className="text-xs font-mono text-slate-400 tracking-wide">
            id: {proposal.id}
          </p>
        </div>

        {/* 卡片底部：更新时间与查看详情箭头 */}
        <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-700/50 dark:text-slate-400">
          <span>
            {lang === 'zh' ? '更新于 ' : 'Updated '}
            {formattedTime}
          </span>
          <Link
            to={href}
            className="flex items-center font-medium text-indigo-500 transition-transform group-hover:translate-x-1 dark:text-indigo-400"
          >
            {lang === 'zh' ? '详情' : 'Details'}
            <RightOutlined className="ml-1 text-[10px]" />
          </Link>
        </div>
      </div>
    </Card>
  );
};
