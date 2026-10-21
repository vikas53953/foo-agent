// Spec: 04-2 §21.7 (one row of `Chip`s above the pill, `role="group"` named "Suggestions" (`composer.suggest.label`),
// `composer-suggestions`, each chip `composer-suggestion-chip`; a click fills the field and focuses it, never sends; chips rise
// in 60ms apart with --ease-spring and fade on the first keystroke), 02 §F7.1 "Composer", FE-24 (`<Presence>` keeps the row
// for its exit), CR-0021 pick 10. CR-0024 F8: each chip leads with its 16px icon from the fixed word map (`chipIcon`).
import { useState, type CSSProperties } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { Chip } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { Presence } from '../ui/Presence';
import { chipIcon } from './chipIcon';
import type { SuggestView } from './suggestions';
import styles from './Composer.module.css';

export function SuggestionChips({ view, onPick }: { view: SuggestView; onPick: (text: string) => void }) {
  // The row keeps its last chips while it fades out.
  const [last, setLast] = useState(view);
  if (view && view !== last) setLast(view);
  const shown = view ?? last;
  return (
    <Presence show={!!view}>
      <div
        className={styles.suggestions}
        role="group"
        aria-label={t('composer.suggest.label')}
        data-testid={TID.composerSuggestions}
        data-kind={shown?.kind}
      >
        {shown?.items.map((s, i) => (
          <Chip
            key={`${shown.kind}-${s}`}
            className={styles.suggestion}
            style={{ '--i': i } as CSSProperties}
            data-testid={TID.composerSuggestionChip}
            onClick={() => onPick(s)}
          >
            <Icon name={chipIcon(s)} size={16} />
            {s}
          </Chip>
        ))}
      </div>
    </Presence>
  );
}
