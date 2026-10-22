// "Galaxy · Prism · 2D" segmented control. Links, so middle-click and keyboard work as usual; the
// click saves the preference first (piresearch-ui) and the browser then navigates to the same
// page in the chosen frontend (the same study on a study page).

import { saveUi, UI_OPTIONS, uiHref, type UiChoice } from "../lib/uiSwitch";

export function UiSwitch({ studyId, className = "" }: { studyId?: string | null; className?: string }) {
  return (
    <nav className={`ui-switch ${className}`} aria-label="切换界面">
      {UI_OPTIONS.map((option) => {
        const current = option.id === "galaxy";
        return (
          <a
            key={option.id}
            className="ui-switch-item"
            href={uiHref(option.id as UiChoice, studyId)}
            aria-current={current ? "page" : undefined}
            title={`${option.name} ${option.label}`}
            onClick={() => saveUi(option.id)}
            onAuxClick={() => saveUi(option.id)}
          >
            <span>{option.name}</span>
            <span className="ui-switch-zh">{option.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
