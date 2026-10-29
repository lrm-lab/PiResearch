// An assistant reply: the report's Markdown renderer at chat size, with 【§标题】 citations drawn as
// chips. Lazy chunk (shares react-markdown with the report).

import { memo, useMemo } from "react";
import Markdown, { defaultUrlTransform, type Components } from "react-markdown";
import { CITE_SCHEME, citationFromHref, citationsToMarkdown, shortTitle, trimOpenCitation } from "../../lib/citations";
import { cx } from "../../ui/cx";
import { COMPONENTS, DocLink, REMARK_PLUGINS } from "../ReportMarkdown";
import "../report.css";
import "./chat.css";

const urlTransform = (url: string) => (url.startsWith(CITE_SCHEME) ? url : defaultUrlTransform(url));

function ChatMarkdown({
  text,
  live,
  cited,
  onCite,
}: {
  text: string;
  live: boolean;
  /** Whether a citation's heading exists in the report. */
  cited: (title: string) => boolean;
  onCite: (title: string) => void;
}) {
  const source = useMemo(() => citationsToMarkdown(live ? trimOpenCitation(text) : text), [text, live]);
  const components = useMemo<Components>(
    () => ({
      ...COMPONENTS,
      a(props) {
        const title = citationFromHref(props.href);
        if (title === null) return DocLink(props);
        const found = cited(title);
        return (
          <button
            type="button"
            className="prism-cite"
            title={title}
            data-missing={!found}
            aria-disabled={!found}
            onClick={() => found && onCite(title)}
          >
            <span aria-hidden="true">§</span>
            <span>{shortTitle(title)}</span>
          </button>
        );
      },
    }),
    [cited, onCite],
  );
  return (
    <div className={cx("prism-doc prism-chat-doc", live && "prism-chat-live")}>
      <Markdown remarkPlugins={REMARK_PLUGINS} components={components} urlTransform={urlTransform}>
        {source}
      </Markdown>
    </div>
  );
}

export default memo(ChatMarkdown);
