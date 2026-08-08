import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ReloadOutlined } from '@ant-design/icons';
import { Button, Empty, Pagination, Spin } from 'antd';
import { fetchProposals, type ProposalQueryParams } from '../api/client';
import { ProposalCard } from '../components/ProposalCard';
import { ProposalDetailModal } from '../components/ProposalDetailModal';
import { ProposalFilter } from '../components/ProposalFilter';
import {
  DEFAULT_PROPOSAL_SEARCH,
  validateProposalSearch,
} from './proposalSearch';

export function ProposalsPage() {
  const filters = useSearch({ from: '/' });
  const navigate = useNavigate({ from: '/' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['proposals', filters],
    queryFn: ({ signal }) => fetchProposals(filters, signal),
  });

  const updateFilters = (newFilters: ProposalQueryParams) => {
    void navigate({ search: validateProposalSearch({ ...newFilters }) });
  };

  const handlePageChange = (page: number, pageSize: number) => {
    const offset = (page - 1) * pageSize;
    updateFilters({ ...filters, limit: pageSize, offset });
  };

  const currentPage =
    Math.floor((filters.offset || 0) / (filters.limit || 24)) + 1;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* 头部 Slogan */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-slate-100 tracking-tight mb-2">
          TC39 提案大览
        </h1>
        <p className="text-slate-400 text-sm md:text-base">
          每天自动同步 ECMAScript
          官方提案，为您提供高质中文译文、阶段演进及多维检索支持。
        </p>
      </div>

      {/* 筛选面板 */}
      <ProposalFilter
        value={filters}
        onChange={updateFilters}
        onReset={() => void navigate({ search: DEFAULT_PROPOSAL_SEARCH })}
      />

      {/* 状态统计条 */}
      <div className="flex items-center justify-between text-xs text-slate-400 mb-4 px-1">
        <span>
          {data ? (
            <>
              共匹配到{' '}
              <strong className="text-indigo-400 font-semibold">
                {data.total}
              </strong>{' '}
              个提案
            </>
          ) : (
            '正在检索...'
          )}
        </span>
      </div>

      {/* 提案列表展厅 */}
      {isPending ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Spin size="large" />
          <span className="text-slate-400 text-sm">读取提案数据中...</span>
        </div>
      ) : error && !data ? (
        <div className="py-16 bg-slate-800/40 rounded-xl border border-slate-700/50">
          <Empty
            description={
              <span className="text-slate-300">{error.message}</span>
            }
          >
            <Button icon={<ReloadOutlined />} onClick={() => void refetch()}>
              重试
            </Button>
          </Empty>
        </div>
      ) : data && data.proposals.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 mb-8">
            {data.proposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                onClick={() => setSelectedId(proposal.id)}
              />
            ))}
          </div>

          {/* 分页控制器 */}
          <div className="flex justify-center py-4">
            <Pagination
              current={currentPage}
              pageSize={filters.limit || 24}
              total={data.total}
              onChange={handlePageChange}
              showSizeChanger
              pageSizeOptions={['12', '24', '48', '96']}
              className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 text-slate-200"
            />
          </div>
        </>
      ) : (
        <div className="py-16 bg-slate-800/40 rounded-xl border border-slate-700/50">
          <Empty
            description={
              <span className="text-slate-400">
                没有查找到符合条件的 TC39 提案
              </span>
            }
          />
        </div>
      )}

      {/* 提案详情 Modal */}
      <ProposalDetailModal
        proposalId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
