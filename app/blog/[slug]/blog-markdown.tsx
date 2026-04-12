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
    <div className="blog-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Skip H1 (rendered in page header)
          h1: () => null,

          // H2 — Main sections
          h2: ({ children }) => {
            const text = extractText(children);
            const id = slugify(text);
            return (
              <h2
                id={id}
                className="text-2xl md:text-[1.75rem] font-extrabold text-slate-900 tracking-tight mt-16 mb-6 leading-tight scroll-mt-24 pb-3 border-b border-slate-100"
              >
                {children}
              </h2>
            );
          },

          // H3 — Sub-sections (BIGGER than paragraph)
          h3: ({ children }) => {
            const text = extractText(children);
            const id = slugify(text);
            return (
              <h3
                id={id}
                className="text-xl md:text-[1.35rem] font-bold text-slate-900 mt-10 mb-4 leading-snug scroll-mt-24"
              >
                {children}
              </h3>
            );
          },

          // H4 — Minor sub-sections
          h4: ({ children }) => (
            <h4 className="text-base font-bold text-slate-800 mt-8 mb-3">
              {children}
            </h4>
          ),

          // Paragraphs — comfortable reading
          p: ({ children }) => (
            <p className="text-[15px] leading-[1.85] text-slate-700 mb-5">
              {children}
            </p>
          ),

          // Links — internal vs external
          a: ({ href, children }) => {
            if (href?.startsWith("/")) {
              return (
                <Link href={href} className="text-emerald-600 font-semibold hover:underline hover:text-emerald-700 transition-colors">
                  {children}
                </Link>
              );
            }
            if (href?.startsWith("#")) {
              return (
                <a href={href} className="text-emerald-600 font-semibold hover:underline">
                  {children}
                </a>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-emerald-600 font-medium hover:underline">
                {children}
              </a>
            );
          },

          // Strong — emphasis
          strong: ({ children }) => (
            <strong className="font-bold text-slate-900">{children}</strong>
          ),

          // Emphasis
          em: ({ children }) => (
            <em className="italic text-slate-600">{children}</em>
          ),

          // Blockquotes — callouts with accent
          blockquote: ({ children }) => (
            <div className="my-8 rounded-2xl border-l-4 border-emerald-400 bg-gradient-to-r from-emerald-50 to-teal-50/30 px-6 py-5 shadow-sm">
              <div className="text-[14px] text-slate-700 leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_a]:text-emerald-700 [&_a]:font-bold [&_strong]:text-slate-900">
                {children}
              </div>
            </div>
          ),

          // Unordered lists
          ul: ({ children }) => (
            <ul className="my-5 space-y-2.5 pl-0 list-none">
              {children}
            </ul>
          ),

          // Ordered lists
          ol: ({ children }) => (
            <ol className="my-5 space-y-2.5 pl-6 list-decimal marker:text-emerald-500 marker:font-bold">
              {children}
            </ol>
          ),

          // List items
          li: ({ children }) => (
            <li className="text-[15px] leading-[1.75] text-slate-700 pl-6 relative before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">
              {children}
            </li>
          ),

          // Tables — styled cards
          table: ({ children }) => (
            <div className="my-8 overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
              <table className="w-full text-sm border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-50 border-b border-slate-200">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="text-left font-semibold text-slate-700 px-4 py-3 text-xs uppercase tracking-wider">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-3 border-b border-slate-50 text-slate-600 text-[13px]">
              {children}
            </td>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-slate-50/50 transition-colors">{children}</tr>
          ),

          // Horizontal rules — section dividers
          hr: () => (
            <div className="my-12 flex items-center justify-center gap-2">
              <span className="h-1 w-1 rounded-full bg-emerald-300" />
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="h-1 w-1 rounded-full bg-emerald-300" />
            </div>
          ),

          // Code blocks
          code: ({ className, children }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <code className="block bg-slate-900 text-slate-100 rounded-xl p-5 text-sm leading-relaxed overflow-x-auto my-6 font-mono">
                  {children}
                </code>
              );
            }
            return (
              <code className="text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5 text-[13px] font-semibold">
                {children}
              </code>
            );
          },

          // Pre (code wrapper)
          pre: ({ children }) => (
            <pre className="my-6 [&_code]:p-0 [&_code]:bg-transparent [&_code]:text-inherit">
              {children}
            </pre>
          ),

          // Images — with caption and placeholder frame
          img: ({ alt, src }) => (
            <figure className="my-10">
              <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
                {src ? (
                  <img src={src} alt={alt || ""} className="w-full" loading="lazy" />
                ) : (
                  <div className="aspect-[16/9] bg-slate-50 flex items-center justify-center">
                    <div className="text-center">
                      <svg className="h-10 w-10 text-slate-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-xs text-slate-400">{alt || "Imagen"}</p>
                    </div>
                  </div>
                )}
              </div>
              {alt && (
                <figcaption className="text-center text-xs text-slate-400 mt-2 italic">
                  {alt}
                </figcaption>
              )}
            </figure>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
