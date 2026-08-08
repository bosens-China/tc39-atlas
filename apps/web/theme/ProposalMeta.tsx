import { useLang, useNavigate, usePage } from '@rspress/core/runtime';
import { GithubOutlined, TranslationOutlined } from '@ant-design/icons';
import { Button, Tag } from 'antd';

import type { ProposalStage, ProposalStatus } from '../src/api/client';
import { EditionTag, StageTag, StatusTag } from '../src/components/StageTag';
import { proposalRoutePath } from '../src/proposalRoute';

const stages: readonly number[] = [0, 1, 2, 2.7, 3, 4];
const statuses: readonly string[] = [
  'active',
  'finished',
  'inactive',
  'withdrawn',
];

function readString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

export function ProposalMeta() {
  const { page } = usePage();
  const lang = useLang();
  const navigate = useNavigate();
  const metadata = page.frontmatter;
  const id = readString(metadata.proposalId);
  const repositoryUrl = readString(metadata.proposalRepositoryUrl);
  const officialTitle = readString(metadata.proposalTitle);
  const titleZh = readString(metadata.proposalTitleZh);
  if (!id || !repositoryUrl) return null;

  const stage = stages.includes(metadata.proposalStage as number)
    ? (metadata.proposalStage as ProposalStage)
    : null;
  const status = statuses.includes(metadata.proposalStatus as string)
    ? (metadata.proposalStatus as ProposalStatus)
    : 'active';
  const edition =
    typeof metadata.proposalEdition === 'number'
      ? metadata.proposalEdition
      : null;
  const syncedAt = readString(metadata.proposalSyncedAt);
  const translationAvailable = metadata.proposalTranslationAvailable === true;
  const alternativePath = proposalRoutePath(id, lang === 'zh' ? 'en' : 'zh');

  return (
    <section className="proposal-meta mb-6 rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StageTag stage={stage} />
          <StatusTag status={status} />
          <EditionTag edition={edition} />
          <Tag className="font-mono">{id}</Tag>
          {lang === 'zh' && !translationAvailable ? (
            <Tag color="warning">暂无中文译文</Tag>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            icon={<TranslationOutlined />}
            onClick={() => navigate(alternativePath)}
          >
            {lang === 'zh' ? 'English' : '中文'}
          </Button>
          <Button
            icon={<GithubOutlined />}
            href={repositoryUrl}
            target="_blank"
          >
            GitHub
          </Button>
        </div>
      </div>
      {syncedAt ? (
        <p className="mb-0 mt-3 text-xs text-slate-500 dark:text-slate-400">
          {lang === 'zh' ? '数据同步于 ' : 'Data synced at '}
          {new Date(syncedAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en')}
        </p>
      ) : null}
      {lang === 'zh' && officialTitle && titleZh !== officialTitle ? (
        <p className="mb-0 mt-2 text-xs text-slate-500 dark:text-slate-400">
          英文标题：{officialTitle}
        </p>
      ) : null}
    </section>
  );
}
