// Spec: 06-1 §4.2 foo profile ("{agentName}" page; J3 "Change name, face or vibe"): Hero (`--avatar-hero` 96 foo's face,
// `{agentName}`, "Your main helper"), "Name and look" (Name: field max 20 and 🎲; Face: 4 options + 🎲 Surprise me; "How I
// talk": radio rows "Calm, a bit funny" / "Straight to the point" / "Warm and chatty" / "Something else…" with a text field);
// header button "Message {foo}"; root `screen-foo-profile`, hero `profile-hero`, rows `profile-row-{rowId}`. 06-1 §2.3 for
// the name rules (more than 20 keeps the first 20 and shows the field error) and the face tiles. CR-0060 (X-217): the
// batch-1 part; "What I know about you", "My routines", "Files I made" and "Run setup again" arrive with their features.
import { useState, type KeyboardEvent } from 'react';
import { t } from '../../../shared/copy/t';
import { FIRST_TILES, glyphRef, surpriseName, surpriseTiles, type GlyphTile } from '../../../shared/firstRunPools';
import { TID } from '../../../shared/testids';
import { invoke } from '../../ipc/client';
import { openChat } from '../../shell/actions';
import { back, useStore } from '../../store/index';
import { selectFooChatId } from '../../store/chats';
import { faceGlyph } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Face } from '../../ui/Face';
import { TextField } from '../../ui/TextField';
import { cx } from '../../ui/cx';
import { glyphAria } from '../../cards/setup/FirstRunCards';
import { PageHeader } from '../shared/PageHeader';
import styles from './FooProfile.module.css';

const NAME_MAX = 20;
const graphemes = (s: string) => [...new Intl.Segmenter('en-IN', { granularity: 'grapheme' }).segment(s)].map((g) => g.segment);
const offered = new Set<string>();

const VIBES = [
  { optionId: 'o1', vibe: 'calm_funny', label: () => t('setup.vibe.option.calm_funny') },
  { optionId: 'o2', vibe: 'direct', label: () => t('setup.vibe.option.direct') },
  { optionId: 'o3', vibe: 'warm', label: () => t('setup.vibe.option.warm') },
] as const;

function NameRow({ name }: { name: string }) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState<'too_long' | 'no_letter' | null>(null);
  const [busy, setBusy] = useState(false);
  const save = () => {
    if (!/[\p{L}\p{N}]/u.test(value)) return setError('no_letter');
    setBusy(true);
    void invoke('profile:setName', { name: value })
      .then((r) => {
        if (!r.ok && (r.error.message === 'too_long' || r.error.message === 'no_letter')) setError(r.error.message);
      })
      .finally(() => setBusy(false));
  };
  return (
    <div className={styles.row} data-testid={TID.profileRowName}>
      <span className={styles.rowLabel}>{t('profile.foo.name')}</span>
      <div className={styles.fieldRow}>
        <TextField
          className={styles.field}
          aria-label={t('profile.foo.name')}
          aria-invalid={error !== null || undefined}
          value={value}
          onChange={(e) => {
            const g = graphemes(e.target.value);
            setValue(g.slice(0, NAME_MAX).join(''));
            setError(g.length > NAME_MAX ? 'too_long' : null);
          }}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && !busy) save();
          }}
        />
        <Button variant="primary" size="sm" disabled={busy || value.trim() === name} onClick={save}>
          {t('profile.foo.save')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          aria-label={t('setup.name.surprise_aria')}
          onClick={() => {
            const n = surpriseName(offered);
            offered.add(n);
            setValue(n);
            setError(null);
          }}
        >
          {t('setup.name.surprise')}
        </Button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error === 'too_long' ? t('setup.name.error.too_long') : t('setup.name.error.no_letter')}
        </p>
      )}
    </div>
  );
}

function FaceRow({ face }: { face: string }) {
  const [tiles, setTiles] = useState<GlyphTile[]>(FIRST_TILES);
  const pick = (ref: string, tile?: GlyphTile) =>
    void invoke('profile:setFace', { face: ref, ...(tile ? { colour: tile.colour.token } : {}) });
  return (
    <div className={styles.row} data-testid={TID.profileRowFace}>
      <span className={styles.rowLabel}>{t('profile.foo.face')}</span>
      <div className={styles.tiles} role="radiogroup" aria-label={t('setup.face.grid_aria')}>
        <button
          type="button"
          role="radio"
          aria-checked={face === 'living:default'}
          aria-label={t('setup.face.tile_living_aria')}
          className={cx(styles.tile, face === 'living:default' && styles.tileOn)}
          onClick={() => pick('living:default')}
        >
          <Face faceRef="living:default" size={48} ring={false} />
        </button>
        {tiles.map((tile, i) => {
          const ref = glyphRef(tile);
          const on = face === ref;
          return (
            <button
              key={ref + tile.colour.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={glyphAria(tile, i + 2)}
              className={cx(styles.tile, on && styles.tileOn)}
              onClick={() => pick(ref, tile)}
            >
              <span className={styles.glyph} style={{ background: `var(${tile.colour.token})` }} aria-hidden="true">
                {tile.glyph.glyph}
              </span>
            </button>
          );
        })}
        <Button variant="secondary" size="sm" aria-label={t('setup.face.surprise_aria')} onClick={() => setTiles((s) => surpriseTiles(s))}>
          {t('setup.face.surprise')}
        </Button>
      </div>
    </div>
  );
}

function VibeRow({ vibe, line }: { vibe: string | undefined; line: string }) {
  const [words, setWords] = useState('');
  const [other, setOther] = useState(vibe === 'custom');
  return (
    <div className={styles.row} data-testid={TID.profileRowVibe}>
      <span className={styles.rowLabel}>{t('profile.foo.vibe')}</span>
      <div className={styles.radios} role="radiogroup" aria-label={t('profile.foo.vibe')}>
        {VIBES.map((v) => (
          <label key={v.optionId} className={styles.radio}>
            <input
              type="radio"
              name="foo-vibe"
              checked={!other && vibe === v.vibe}
              onChange={() => {
                setOther(false);
                void invoke('profile:setVibe', { optionId: v.optionId });
              }}
            />
            {v.label()}
          </label>
        ))}
        <label className={styles.radio}>
          <input type="radio" name="foo-vibe" checked={other} onChange={() => setOther(true)} />
          {t('profile.foo.vibe_other')}
        </label>
        {other && (
          <div className={styles.fieldRow}>
            <TextField
              className={styles.field}
              aria-label={t('profile.foo.vibe_other')}
              placeholder={vibe === 'custom' ? line : ''}
              value={words}
              onChange={(e) => setWords(e.target.value)}
            />
            <Button variant="primary" size="sm" disabled={!words.trim()} onClick={() => void invoke('profile:setVibe', { words })}>
              {t('profile.foo.save')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function FooProfile() {
  const settings = useStore((s) => s.settings.value);
  const fooId = useStore(selectFooChatId);
  const chat = useStore((s) => (fooId ? s.chats.byId[fooId] : undefined));
  const name = settings?.identity.agentName ?? '';
  return (
    <div className={styles.page} data-testid={TID.screenFooProfile} data-page="foo-profile" tabIndex={-1}>
      <PageHeader title={name} backLabel={t('settings.page.back')} onBack={back}>
        {fooId && (
          <Button variant="secondary" size="sm" data-testid={TID.profileMessage} onClick={() => openChat(fooId)}>
            {t('profile.foo.message', { name })}
          </Button>
        )}
      </PageHeader>
      <main className={styles.body}>
        <div className={styles.column}>
          <section className={styles.hero} data-testid={TID.profileHero}>
            {chat?.face.startsWith('living:') || !chat ? (
              <Face faceRef={chat?.face ?? 'living:default'} size={96} />
            ) : (
              <span
                className={styles.heroGlyph}
                style={chat.colorToken ? { background: `var(${chat.colorToken})` } : undefined}
                aria-hidden="true"
              >
                {faceGlyph(chat.face, name, 'foo')}
              </span>
            )}
            <h2 className={styles.heroName}>{name}</h2>
            <p className={styles.heroLine}>{t('profile.foo.subtitle')}</p>
          </section>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('profile.foo.section_look')}</h3>
            <NameRow key={name} name={name} />
            <FaceRow face={chat?.face ?? 'living:default'} />
            <VibeRow vibe={settings?.identity.vibe} line={settings?.identity.vibeLine ?? ''} />
          </section>
        </div>
      </main>
    </div>
  );
}
