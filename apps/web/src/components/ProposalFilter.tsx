import React from 'react';
import { Button, Input, Select, Tooltip } from 'antd';
import { ClearOutlined, SearchOutlined } from '@ant-design/icons';
import type {
  ProposalQueryParams,
  ProposalStage,
  ProposalStatus,
} from '../api/client';

interface ProposalFilterProps {
  value: ProposalQueryParams;
  onChange: (filters: ProposalQueryParams) => void;
  onReset: () => void;
}

const STAGE_OPTIONS: { label: string; value: ProposalStage }[] = [
  { label: 'Stage 4 (已完成)', value: 4 },
  { label: 'Stage 3 (候选)', value: 3 },
  { label: 'Stage 2.7 (规范草稿)', value: 2.7 },
  { label: 'Stage 2 (草稿)', value: 2 },
  { label: 'Stage 1 (提案)', value: 1 },
  { label: 'Stage 0 (稻草人)', value: 0 },
];

const STATUS_OPTIONS: { label: string; value: ProposalStatus }[] = [
  { label: '进行中 (Active)', value: 'active' },
  { label: '已完成 (Finished)', value: 'finished' },
  { label: '不活跃 (Inactive)', value: 'inactive' },
  { label: '已撤回 (Withdrawn)', value: 'withdrawn' },
];

const EDITION_OPTIONS = Array.from({ length: 12 }, (_, i) => 2015 + i).map(
  (year) => ({
    label: `ES${year}`,
    value: year,
  }),
);

export const ProposalFilter: React.FC<ProposalFilterProps> = ({
  value,
  onChange,
  onReset,
}) => {
  const handleKeywordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    const keywords = text ? text.split(/\s+/).filter(Boolean) : undefined;
    onChange({ ...value, keywords, offset: 0 });
  };

  const hasActiveFilters = Boolean(
    value.stages?.length ||
    value.statuses?.length ||
    value.editions?.length ||
    value.keywords?.length,
  );

  return (
    <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-700/70 rounded-xl p-4 mb-6 shadow-md">
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
        {/* 关键词搜索框 & 模式 */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <Input
            placeholder="搜索提案标题、ID 或 README 关键字..."
            prefix={<SearchOutlined className="text-slate-400" />}
            value={value.keywords?.join(' ') || ''}
            onChange={handleKeywordChange}
            allowClear
            className="w-full sm:w-80"
          />

          <Select
            value={value.keyword_mode || 'all'}
            onChange={(mode) =>
              onChange({ ...value, keyword_mode: mode, offset: 0 })
            }
            options={[
              { label: '匹配全部关键词 (ALL)', value: 'all' },
              { label: '匹配任一关键词 (ANY)', value: 'any' },
            ]}
            className="w-48"
          />
        </div>

        {/* 条件筛选下拉框 */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Stage 阶段 */}
          <Select
            mode="multiple"
            maxTagCount="responsive"
            placeholder="提案阶段 (Stage)"
            value={value.stages}
            onChange={(stages) => onChange({ ...value, stages, offset: 0 })}
            options={STAGE_OPTIONS}
            className="min-w-44 max-w-xs flex-1"
            allowClear
          />

          {/* Status 状态 */}
          <Select
            mode="multiple"
            maxTagCount="responsive"
            placeholder="提案状态 (Status)"
            value={value.statuses}
            onChange={(statuses) => onChange({ ...value, statuses, offset: 0 })}
            options={STATUS_OPTIONS}
            className="min-w-40 max-w-xs flex-1"
            allowClear
          />

          {/* ES Version 版本 */}
          <Select
            mode="multiple"
            maxTagCount="responsive"
            placeholder="ES 版本 (Edition)"
            value={value.editions}
            onChange={(editions) => onChange({ ...value, editions, offset: 0 })}
            options={EDITION_OPTIONS}
            className="min-w-36 max-w-xs flex-1"
            allowClear
          />

          {/* 重置过滤器按钮 */}
          {hasActiveFilters && (
            <Tooltip title="重置所有筛选条件">
              <Button
                icon={<ClearOutlined />}
                onClick={onReset}
                danger
                type="dashed"
              >
                重置
              </Button>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
};
