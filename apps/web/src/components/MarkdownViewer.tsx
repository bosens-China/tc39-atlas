import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownViewerProps {
  content: string;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ content }) => {
  return (
    <div className="markdown-body bg-slate-900/60 p-6 rounded-xl border border-slate-800 text-slate-200 overflow-x-auto leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold text-slate-100 border-b border-slate-700 pb-2 mb-4 mt-6">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-semibold text-slate-100 border-b border-slate-800 pb-1.5 mb-3 mt-5">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-semibold text-slate-200 mb-2 mt-4">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="mb-4 text-slate-300">{children}</p>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-400 hover:text-indigo-300 underline font-medium"
            >
              {children}
            </a>
          ),
          pre: ({ children }) => (
            <pre className="bg-slate-950 p-4 rounded-lg overflow-x-auto font-mono text-sm border border-slate-800 text-slate-200 mb-4">
              {children}
            </pre>
          ),
          code({ className, children, ...props }) {
            const isInline = !className;
            return isInline ? (
              <code
                className="bg-slate-800 text-indigo-300 px-1.5 py-0.5 rounded font-mono text-sm border border-slate-700/60"
                {...props}
              >
                {children}
              </code>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1 mb-4 text-slate-300">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 mb-4 text-slate-300">
              {children}
            </ol>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-indigo-500 bg-indigo-500/10 px-4 py-2 my-4 rounded-r text-slate-300 italic">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="w-full text-left border-collapse border border-slate-700">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-slate-700 bg-slate-800 p-2 text-slate-100 font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-slate-700 p-2 text-slate-300">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
