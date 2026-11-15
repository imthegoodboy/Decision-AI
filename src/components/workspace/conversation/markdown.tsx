"use client";

import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ClaimChip, SourceChip } from "../chips";

const CITATION_GROUP = /\[((?:\s*[CS]:[A-Za-z0-9_-]+\s*[,;]?)+)\]/g;

/** Turns `[C:clm_x]` / `[S:src_y]` (also grouped `[C:a, C:b]`) into links the renderer maps to chips. */
export function linkCitations(text: string): string {
  return text.replace(CITATION_GROUP, (_, inner: string) =>
    inner
      .split(/[\s,;]+/)
      .filter(Boolean)
      .map((tok) => {
        const kind = tok[0];
        const id = tok.slice(2);
        return `[${kind}](#cite-${kind}-${id})`;
      })
      .join(" "),
  );
}

const components: Components = {
  a({ href, children }) {
    if (href?.startsWith("#cite-")) {
      const kind = href.charAt(6);
      const id = href.slice(8);
      return kind === "S" ? <SourceChip id={id} className="mx-0.5" /> : <ClaimChip id={id} className="mx-0.5" />;
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
};

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-chat text-[0.9375rem] text-ink">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {linkCitations(text)}
      </ReactMarkdown>
    </div>
  );
});
