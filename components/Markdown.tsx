"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0 leading-relaxed">{children}</p>,
        h1: ({ children }) => <h1 className="display text-[1.3em] mt-3 mb-1 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="display text-[1.18em] mt-3 mb-1 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="display text-[1.05em] mt-2.5 mb-1 first:mt-0">{children}</h3>,
        h4: ({ children }) => <h4 className="font-semibold text-[1em] mt-2 mb-0.5 first:mt-0">{children}</h4>,
        ul: ({ children }) => <ul className="my-1.5 list-disc pl-5 space-y-0.5 marker:text-[var(--faint)]">{children}</ul>,
        ol: ({ children }) => <ol className="my-1.5 list-decimal pl-5 space-y-0.5 marker:text-[var(--faint)]">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-[var(--text)]">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent)] underline underline-offset-2 hover:no-underline"
          >
            {children}
          </a>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.startsWith("language-");
          if (isBlock) {
            return (
              <code className={className}>{children}</code>
            );
          }
          return (
            <code className="rounded bg-[var(--border)]/60 px-1 py-0.5 font-mono text-[0.9em]">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="my-2 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-[12.5px] leading-relaxed font-mono">
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-2 border-[var(--accent)]/40 pl-3 text-[var(--muted)] italic">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-3 border-[var(--border)]" />,
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="border-b border-[var(--border)]">{children}</thead>,
        th: ({ children }) => <th className="px-2 py-1 text-left font-semibold">{children}</th>,
        td: ({ children }) => <td className="border-t border-[var(--border)]/60 px-2 py-1">{children}</td>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
