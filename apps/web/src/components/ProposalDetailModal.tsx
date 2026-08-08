import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Drawer, Empty, Spin, Tabs, Tag } from 'antd';
import {
  FileTextOutlined,
  GithubOutlined,
  GlobalOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { fetchProposalDetail } from '../api/client';
import { MarkdownViewer } from './MarkdownViewer';
import { EditionTag, StageTag, StatusTag } from './StageTag';

interface ProposalDetailModalProps {
  proposalId: string | null;
  onClose: () => void;
}

export const ProposalDetailModal: React.FC<ProposalDetailModalProps> = ({
  proposalId,
  onClose,
}) => {
  const {
    data: detail,
    error,
    isPending,
    refetch,
  } = useQuery({
    queryKey: ['proposal', proposalId],
    queryFn: ({ signal }) => {
      if (!proposalId) throw new Error('缺少提案 ID');
      return fetchProposalDetail(proposalId, signal);
    },
    enabled: Boolean(proposalId),
  });

  return (
    <Drawer
      open={Boolean(proposalId)}
      onClose={onClose}
      width="85%"
      style={{ maxWidth: '900px' }}
      styles={{
        header: {
          backgroundColor: '#0f172a',
          borderBottom: '1px solid #1e293b',
        },
        body: {
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          padding: '1.5rem',
        },
      }}
      title={
        detail ? (
          <div className="flex items-center space-x-2 text-slate-100">
            <span className="font-semibold text-lg">{detail.title}</span>
          </div>
        ) : (
          <span className="text-slate-300">提案详情</span>
        )
      }
    >
      {isPending ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Spin size="large" />
          <p className="text-slate-400">读取提案 README 与中文译文...</p>
        </div>
      ) : error && !detail ? (
        <div className="py-12">
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
      ) : detail ? (
        <div className="space-y-6">
          {/* 元信息卡片 */}
          <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <StageTag stage={detail.stage} />
              <StatusTag status={detail.status} />
              <EditionTag edition={detail.edition} />
              <Tag color="geekblue" className="font-mono">
                {detail.id}
              </Tag>
            </div>

            <a
              href={detail.repository_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white transition-all text-sm font-medium"
            >
              <GithubOutlined />
              <span>访问官方仓库</span>
            </a>
          </div>

          {/* 双语 README Tabs */}
          <Tabs
            key={detail.id}
            defaultActiveKey={detail.readme_zh ? 'zh' : 'en'}
            items={[
              {
                key: 'zh',
                label: (
                  <span className="flex items-center space-x-2 px-1">
                    <GlobalOutlined />
                    <span>中文译文</span>
                  </span>
                ),
                children: detail.readme_zh ? (
                  <MarkdownViewer content={detail.readme_zh} />
                ) : (
                  <div className="py-12 bg-slate-900/40 rounded-xl border border-slate-800">
                    <Empty
                      description={
                        <div className="space-y-1">
                          <p className="text-slate-300 font-medium">
                            暂无中文译文
                          </p>
                          <p className="text-slate-500 text-xs">
                            可能尚未进行 AI 翻译同步，您可以切换到英文原文阅读
                          </p>
                        </div>
                      }
                    />
                  </div>
                ),
              },
              {
                key: 'en',
                label: (
                  <span className="flex items-center space-x-2 px-1">
                    <FileTextOutlined />
                    <span>英文原文</span>
                  </span>
                ),
                children: <MarkdownViewer content={detail.readme} />,
              },
            ]}
          />
        </div>
      ) : null}
    </Drawer>
  );
};
