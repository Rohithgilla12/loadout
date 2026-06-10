import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/// Renders SKILL.md body with frontmatter stripped.
export function SkillMarkdown({ content }: { content: string }) {
  let body = content;
  if (body.startsWith("---")) {
    const end = body.indexOf("\n---", 3);
    if (end !== -1) body = body.slice(end + 4);
  }
  return (
    <div className="prose-skill text-[13px]">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
    </div>
  );
}
