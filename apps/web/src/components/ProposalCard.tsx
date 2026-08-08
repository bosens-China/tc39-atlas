import React from 'react';
import { Card, Tooltip } from 'antd';
import { GithubOutlined, RightOutlined } from '@ant-design/icons';
import { EditionTag, StageTag, StatusTag } from './StageTag';
import type { ProposalSummary } from '../api/client';

interface ProposalCardProps {
  proposal: ProposalSummary;
  onClick: () => void;
}

export const ProposalCard: React.FC<ProposalCardProps> = ({
  proposal,
  onClick,
}) => {
  const formattedTime = new Date(proposal.data_updated_at).toLocaleDateString(
    'zh-CN',
    {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    },
  );

  return (
    <Card
      hoverable
      onClick={onClick}
      className="bg-slate-800/90 border-slate-700/80 rounded-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10 hover:border-indigo-500/40 group overflow-hidden"
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
              onClick={(e) => e.stopPropagation()}
              className="text-slate-400 hover:text-white transition-colors p-1"
            >
              <GithubOutlined className="text-lg" />
            </a>
          </Tooltip>
        </div>

        {/* 卡片主体：标题与 ID */}
        <div>
          <h3 className="text-base font-semibold text-slate-100 group-hover:text-indigo-400 transition-colors line-clamp-2 mb-1">
            {proposal.title}
          </h3>
          <p className="text-xs font-mono text-slate-400 tracking-wide">
            id: {proposal.id}
          </p>
        </div>

        {/* 卡片底部：更新时间与查看详情箭头 */}
        <div className="pt-3 border-t border-slate-700/50 flex items-center justify-between text-xs text-slate-400">
          <span>更新于 {formattedTime}</span>
          <span className="flex items-center text-indigo-400 font-medium group-hover:translate-x-1 transition-transform">
            详情 <RightOutlined className="ml-1 text-[10px]" />
          </span>
        </div>
      </div>
    </Card>
  );
};
