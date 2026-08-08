import { useMemo } from 'react';
import { useLang, useSearchParams } from '@rspress/core/runtime';
import { useQuery } from '@tanstack/react-query';
import { ReloadOutlined } from '@ant-design/icons';
import { Button, Empty, Pagination, Spin } from 'antd';
import {
  fetchDataset,
  selectProposals,
  type ProposalQueryParams,
} from '../api/client';
import { ProposalCard } from '../components/ProposalCard';
import { ProposalFilter } from '../components/ProposalFilter';
import { proposalRoutePath } from '../proposalRoute';
import { readProposalSearch, writeProposalSearch } from './proposalSearch';

export function ProposalsPage() {
  const lang = useLang();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(
    () => readProposalSearch(searchParams),
    [searchParams],
  );
  const {
    data: dataset,
    error,
    isPending,
    refetch,
  } = useQuery({
    queryKey: ['dataset'],
    queryFn: ({ signal }) => fetchDataset(signal),
  });
  const data = useMemo(
    () => (dataset ? selectProposals(dataset, filters) : undefined),
    [dataset, filters],
  );

  const updateFilters = (newFilters: ProposalQueryParams) => {
    setSearchParams(writeProposalSearch(newFilters), { replace: true });
  };

  const handlePageChange = (page: number, pageSize: number) => {
    const offset = (page - 1) * pageSize;
    updateFilters({ ...filters, limit: pageSize, offset });
  };

  const currentPage =
    Math.floor((filters.offset || 0) / (filters.limit || 24)) + 1;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* 头部 Slogan */}
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-slate-950 dark:text-slate-100">
          {lang === 'zh' ? 'TC39 提案索引' : 'TC39 proposal index'}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 md:text-base">
          {lang === 'zh'
            ? '每天自动同步 ECMAScript 官方提案，提供中文译文、阶段演进和组合筛选。'
            : 'Browse daily-synchronized ECMAScript proposals by stage, status, edition, and keywords.'}
        </p>
      </div>

      {/* 筛选面板 */}
      <ProposalFilter
        value={filters}
        onChange={updateFilters}
        onReset={() =>
          setSearchParams(new URLSearchParams(), { replace: true })
        }
      />

      {/* 状态统计条 */}
      <div className="mb-4 flex items-center justify-between px-1 text-xs text-slate-500 dark:text-slate-400">
        <span>
          {data ? (
            <>
              {lang === 'zh' ? '共匹配到 ' : 'Matched '}
              <strong className="text-indigo-400 font-semibold">
                {data.total}
              </strong>
              {lang === 'zh' ? ' 个提案' : ' proposals'}
            </>
          ) : lang === 'zh' ? (
            '正在检索...'
          ) : (
            'Searching...'
          )}
        </span>
      </div>

      {/* 提案列表展厅 */}
      {isPending ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Spin size="large" />
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {lang === 'zh' ? '读取提案数据中...' : 'Loading proposal data...'}
          </span>
        </div>
      ) : error && !data ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 py-16 dark:border-slate-700/50 dark:bg-slate-800/40">
          <Empty description={<span>{error.message}</span>}>
            <Button icon={<ReloadOutlined />} onClick={() => void refetch()}>
              {lang === 'zh' ? '重试' : 'Retry'}
            </Button>
          </Empty>
        </div>
      ) : data && data.proposals.length > 0 ? (
        <>
          <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.proposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                href={proposalRoutePath(proposal.id, lang)}
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
              className="rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-slate-700/60 dark:bg-slate-800/60"
            />
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 py-16 dark:border-slate-700/50 dark:bg-slate-800/40">
          <Empty
            description={
              <span className="text-slate-500 dark:text-slate-400">
                {lang === 'zh'
                  ? '没有查找到符合条件的 TC39 提案'
                  : 'No TC39 proposals match these filters'}
              </span>
            }
          />
        </div>
      )}
    </div>
  );
}
