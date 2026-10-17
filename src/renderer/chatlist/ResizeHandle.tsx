// Spec: 03-shell-1 §3.4.1 resize handle (L and M only: an 8px strip centred on the right edge, `col-resize`; hover turns
// the edge 2px `--line-strong`, dragging 2px `--accent`; double-click resets to 340; `role="separator"`, vertical, "Resize
// chat list", aria-valuemin/max/now; ← / → by 20, Home = min, End = max; the width persists, §3.1.2). Test id
// `sidebar-resize`.
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { setSidebarWidth } from '../shell/actions';
import { clampWidth, LEFT_DEFAULT, leftRange, RESIZE_STEP, useLayout } from '../shell/layout';
import styles from './ResizeHandle.module.css';

export function ResizeHandle() {
  const layout = useLayout();
  const range = leftRange(layout.bp);
  const drag = useRef<{ x: number; w: number; last: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  if (!layout.resizable || !range) return null;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: layout.left, last: layout.left };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const w = clampWidth(d.w + e.clientX - d.x, range);
    if (w !== d.last) {
      d.last = w;
      setSidebarWidth(w);
    }
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (d.last !== d.w) setSidebarWidth(d.last, true);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let w: number | null = null;
    if (e.key === 'ArrowLeft') w = layout.left - RESIZE_STEP;
    else if (e.key === 'ArrowRight') w = layout.left + RESIZE_STEP;
    else if (e.key === 'Home') w = range.min;
    else if (e.key === 'End') w = range.max;
    if (w === null) return;
    e.preventDefault();
    setSidebarWidth(clampWidth(w, range), true);
  };

  return (
    <div
      className={styles.handle}
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={t('sidebar.resize.label')}
      aria-valuemin={range.min}
      aria-valuemax={range.max}
      aria-valuenow={layout.left}
      data-testid={TID.sidebarResize}
      data-state={dragging ? 'dragging' : 'rest'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => setSidebarWidth(LEFT_DEFAULT, true)}
      onKeyDown={onKeyDown}
    />
  );
}
