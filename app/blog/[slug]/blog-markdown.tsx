"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";

interface BlogMarkdownProps {
  content: string;
}

export function BlogMarkdown({ content }: BlogMarkdownProps) {
  return (
    <div className="prose prose-slate prose-emerald max-w-none prose-headings:tracking-tight prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3 prose-p:leading-relaxed prose-li:leading-relaxed prose-a:text-emerald-600 prose-a:no-underline hover:prose-a:underline prose-blockquote:border-emerald-300 prose-blockquote:bg-emerald-50/50 prose-blockquote:rounded-xl prose-blockquote:py-4 prose-blockquote:px-6 prose-blockquote:not-italic prose-strong:text-slate-900 prose-table:text-sm prose-th:text-left prose-th:font-semibold prose-th:text-slate-600 prose-td:py-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith("/")) {
              return (
                <Link href={href} className="text-emerald-600 hover:underline font-medium">
                  {children}
                </Link>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
                {children}
              </a>
            );
          },
          h1: () => null, // Skip H1 since we render it in the header
          blockquote: ({ children }) => (
            <blockquote className="rounded-xl border-l-4 border-emerald-400 bg-emerald-50/50 px-6 py-4 my-6 not-italic">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-6">
              <table className="w-full text-sm border-collapse">
                {children}
              </table>
            </div>
          ),
          hr: () => <hr className="my-10 border-slate-200" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
