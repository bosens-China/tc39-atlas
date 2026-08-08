import React from 'react';
import { useLang } from '@rspress/core/runtime';
import { Tag } from 'antd';
import type { ProposalStage, ProposalStatus } from '../api/client';

interface StageTagProps {
  stage: ProposalStage | null;
}

interface StatusTagProps {
  status: ProposalStatus;
}

interface EditionTagProps {
  edition: number | null;
}

/**
 * TC39 阶段徽章
 */
export const StageTag: React.FC<StageTagProps> = ({ stage }) => {
  if (stage === null) {
    return <Tag color="default">Stage -</Tag>;
  }

  const config: Record<ProposalStage, { color: string; label: string }> = {
    0: { color: 'orange', label: 'Stage 0' },
    1: { color: 'gold', label: 'Stage 1' },
    2: { color: 'blue', label: 'Stage 2' },
    2.7: { color: 'cyan', label: 'Stage 2.7' },
    3: { color: 'purple', label: 'Stage 3' },
    4: { color: 'green', label: 'Stage 4' },
  };

  const { color, label } = config[stage];
  return (
    <Tag color={color} style={{ fontWeight: 600, borderRadius: '4px' }}>
      {label}
    </Tag>
  );
};

/**
 * 提案状态徽章
 */
export const StatusTag: React.FC<StatusTagProps> = ({ status }) => {
  const lang = useLang();
  const config: Record<ProposalStatus, { color: string; label: string }> = {
    active: { color: 'processing', label: lang === 'zh' ? '进行中' : 'Active' },
    finished: {
      color: 'success',
      label: lang === 'zh' ? '已完成' : 'Finished',
    },
    inactive: {
      color: 'warning',
      label: lang === 'zh' ? '不活跃' : 'Inactive',
    },
    withdrawn: {
      color: 'error',
      label: lang === 'zh' ? '已撤回' : 'Withdrawn',
    },
  };

  const { color, label } = config[status];
  return <Tag color={color}>{label}</Tag>;
};

/**
 * ECMAScript 版本徽章
 */
export const EditionTag: React.FC<EditionTagProps> = ({ edition }) => {
  if (!edition) return null;
  return (
    <Tag color="magenta" style={{ fontWeight: 500 }}>
      ES{edition}
    </Tag>
  );
};
