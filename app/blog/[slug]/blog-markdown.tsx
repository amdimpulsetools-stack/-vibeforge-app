"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import type { ReactNode } from "react";

interface BlogMarkdownProps {
  content: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function extractText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(extractText).join("");
  if (children && typeof children === "object" && "props" in children) {
    return extractText((children as { props: { children: ReactNode } }).props.children);
  }
  return "";
}

export function BlogMarkdown({ content }: BlogMarkdownProps) {
  return (
    <div className="prose prose-slate max-w-none prose-headings:tracking-tight prose-headings:scroll-mt-24 prose-h2:text-[1.75rem] prose-h2:font-extrabold prose-h2:mt-14 prose-h2:mb-5 prose-h2:leading-tight prose-h3:text-xl prose-h3:font-bold prose-h3:mt-10 prose-h3:mb-4 prose-p:text-[15px] prose-p:leading-[1.8] prose-p:text-slate-700 prose-li:text-[15px] prose-li:leading-[1.8] prose-li:text-slate-700 prose-a:text-emerald-600 prose-a:font-medium prose-a:no-underline hover:prose-a:underline prose-strong:text-slate-900 prose-strong:font-bold prose-table:text-sm prose-th:bg-slate-50 prose-th:text-left prose-th:font-semibold prose-th:text-slate-700 prose-th:px-4 prose-th:py-3 prose-td:px-4 prose-td:py-2.5 prose-td:border-slate-200 prose-code:text-emerald-700 prose-code:bg-emerald-50 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:font-medium prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: () => null,
          h2: ({ children }) => {
            const text = extractText(children);
            const id = slugify(text);
            return (
              <h2 id={id} className="group">
                {children}
              </h2>
            );
          },
          h3: ({ children }) => {
            const text = extractText(children);
            const id = slugify(text);
            return <h3 id={id}>{children}</h3>;
          },
          a: ({ href, children }) => {
            if (href?.startsWith("/")) {
              return <Link href={href} className="text-emerald-600 font-medium hover:underline">{children}</Link>;
            }
            return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
          },
          blockquote: ({ children }) => (
            <div className="not-prose my-8 rounded-2xl border-l-4 border-emerald-400 bg-gradient-to-r from-emerald-50 to-teal-50/50 px-6 py-5">
              <div className="text-sm text-slate-700 leading-relaxed [&_p]:mb-0 [&_a]:text-emerald-600 [&_a]:font-semibold [&_strong]:text-slate-900">
                {children}
              </div>
            </div>
          ),
          table: ({ children }) => (
            <div className="not-prose overflow-x-auto my-8 rounded-xl border border-slate-200">
              <table className="w-full text-sm border-collapse">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="bg-slate-50 text-left font-semibold text-slate-700 px-4 py-3 border-b border-slate-200">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2.5 border-b border-slate-100 text-slate-600">
              {children}
            </td>
          ),
          hr: () => <hr className="my-12 border-slate-200" />,
          img: ({ alt, src }) => (
            <div className="my-8 rounded-xl overflow-hidden border border-slate-200">
              <img src={src} alt={alt || ""} className="w-full" loading="lazy" />
              {alt && <p className="text-center text-xs text-slate-400 py-2 bg-slate-50">{alt}</p>}
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
