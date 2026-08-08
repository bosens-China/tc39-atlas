import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Button, Card, Empty, Radio, Spin, Tag } from 'antd';
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DisconnectOutlined,
  PlusCircleOutlined,
  ReloadOutlined,
  RiseOutlined,
} from '@ant-design/icons';
import { fetchChanges, type ProposalChangeKind } from '../api/client';
import { ProposalDetailModal } from '../components/ProposalDetailModal';
import { StageTag, StatusTag } from '../components/StageTag';
import type { ChangePeriod } from '../routes/changes';

export function ChangesPage() {
  const { period } = useSearch({ from: '/changes' });
  const navigate = useNavigate({ from: '/changes' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['changes', period],
    queryFn: ({ signal }) => fetchChanges(period, 500, signal),
  });
  const changes = data?.changes ?? [];

  const renderKindBadge = (kind: ProposalChangeKind) => {
    const config: Record<
      ProposalChangeKind,
      { color: string; icon: React.ReactNode; label: string }
    > = {
      added: {
        color: 'cyan',
        icon: <PlusCircleOutlined />,
        label: '新增提案',
      },
      stage_changed: {
        color: 'purple',
        icon: <RiseOutlined />,
        label: '阶段跃迁',
      },
      finished: {
        color: 'green',
        icon: <CheckCircleOutlined />,
        label: '完成入规范',
      },
      withdrawn: {
        color: 'red',
        icon: <DisconnectOutlined />,
        label: '提案撤回',
      },
      inactive: {
        color: 'orange',
        icon: <ClockCircleOutlined />,
        label: '转不活跃',
      },
    };

    const { color, icon, label } = config[kind];
    return (
      <Tag
        color={color}
        className="flex items-center space-x-1 px-2.5 py-0.5 text-xs font-semibold rounded-md"
      >
        {icon}
        <span>{label}</span>
      </Tag>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* 头部标题与周期切换 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-100 tracking-tight mb-2">
            TC39 周期变化动态
          </h1>
          <p className="text-slate-400 text-sm">
            追踪 TC39
            委员会提案阶段演进、新增草稿、撤回及正式列入规范的变更轨迹。
          </p>
        </div>

        <Radio.Group
          value={period}
          onChange={(event) =>
            void navigate({
              search: { period: event.target.value as ChangePeriod },
            })
          }
          buttonStyle="solid"
          className="bg-slate-800 p-1 rounded-xl border border-slate-700"
        >
          <Radio.Button value="day">过去 24 小时</Radio.Button>
          <Radio.Button value="week">过去 7 天</Radio.Button>
          <Radio.Button value="month">过去 30 天</Radio.Button>
        </Radio.Group>
      </div>

      {/* 动态内容 */}
      {isPending ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Spin size="large" />
          <span className="text-slate-400 text-sm">拉取动态数据中...</span>
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
      ) : changes.length > 0 ? (
        <div className="space-y-4">
          {changes.map((change) => {
            const time = new Date(change.occurred_at).toLocaleString('zh-CN', {
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <Card
                key={change.id}
                className="bg-slate-800/80 border-slate-700/70 rounded-xl transition-all hover:border-indigo-500/40"
                styles={{ body: { padding: '1.25rem' } }}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* 左侧：类型徽章与标题 */}
                  <div className="space-y-2">
                    <div className="flex items-center space-x-3">
                      {renderKindBadge(change.kind)}
                      <span className="text-xs text-slate-400 font-mono">
                        {time}
                      </span>
                    </div>

                    <h3 className="text-base font-semibold text-slate-100">
                      {change.after.title}
                    </h3>
                  </div>

                  {/* 右侧：变更前后对照与查看按钮 */}
                  <div className="flex items-center space-x-4 bg-slate-900/60 px-4 py-2 rounded-lg border border-slate-800/80">
                    {change.before && (
                      <div className="flex items-center space-x-1.5 opacity-70">
                        <StageTag stage={change.before.stage} />
                        <StatusTag status={change.before.status} />
                      </div>
                    )}

                    {change.before && (
                      <ArrowRightOutlined className="text-slate-500 text-xs" />
                    )}

                    <div className="flex items-center space-x-1.5">
                      <StageTag stage={change.after.stage} />
                      <StatusTag status={change.after.status} />
                    </div>

                    <Button
                      type="link"
                      size="small"
                      onClick={() => setSelectedId(change.proposal_id)}
                      className="text-indigo-400 hover:text-indigo-300 font-medium"
                    >
                      查看提案
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="py-16 bg-slate-800/40 rounded-xl border border-slate-700/50">
          <Empty
            description={
              <span className="text-slate-400">
                所选时间段（
                {period === 'day'
                  ? '过去 24 小时'
                  : period === 'week'
                    ? '过去 7 天'
                    : '过去 30 天'}
                ）内暂无变化事件
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
