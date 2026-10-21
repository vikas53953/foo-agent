# Spec: 09-windows s.9.2 (identity), s.9.5 (single instance), s.9.12 (native window: caption buttons), 03-shell-1 (the window).
# UI Automation checks on the INSTALLED foo.exe with pywinauto, the way Windows' own accessibility tools see foo: the
# window opens with the title "foo", the composer is reachable by its accessible name, minimise and restore work, and a
# second launch never makes a second window (it hands over to the first and exits). Prints one JSON line per check.
# Usage: python window_checks.py <path to foo.exe>   (FOO_DATA_DIR / FOO_LOCAL_DIR point at a throwaway profile)
import json
import subprocess
import sys
import time

from pywinauto import Application, Desktop

EXE = sys.argv[1]
results = []


def check(name, ok, detail=''):
    results.append({'check': name, 'ok': bool(ok), 'detail': str(detail)[:300]})
    print(json.dumps(results[-1]), flush=True)


def foo_windows():
    return [w for w in Desktop(backend='uia').windows(title='foo', visible_only=True) if w.process_id() == proc.pid]


proc = subprocess.Popen([EXE])
try:
    app = Application(backend='uia').connect(process=proc.pid, timeout=60)
    win = app.window(title='foo')
    win.wait('visible ready', timeout=60)
    rect = win.rectangle()
    check('window opens with the title "foo"', True, f'{rect.width()}x{rect.height()}')
    check('window is a usable size (at least 800 x 600)', rect.width() >= 800 and rect.height() >= 600, f'{rect.width()}x{rect.height()}')

    # The composer has an accessible name; an empty profile shows it locked until an AI is set up (AT-006).
    time.sleep(5)
    composer = None
    for _ in range(30):
        found = [c for c in win.descendants(control_type='Edit') if (c.window_text() or '').startswith('Message foo')]
        found = found or [c for c in win.descendants() if (c.window_text() or '').startswith('Message foo')]
        if found:
            composer = found[0]
            break
        time.sleep(1)
    check('composer is reachable by its accessible name "Message foo"', composer is not None,
          composer.element_info.control_type if composer else 'not found')

    names = [c.window_text() for c in win.descendants(control_type='Button')]
    check('buttons have accessible names (no unnamed buttons)', all(n.strip() for n in names), f'{len(names)} buttons')

    win.minimize()
    time.sleep(1)
    minimized = win.is_minimized()
    win.restore()
    time.sleep(1)
    check('minimise and restore work', minimized and not win.is_minimized(), f'minimized={minimized}')

    second = subprocess.Popen([EXE])
    try:
        second.wait(timeout=30)
        second_exited = True
    except subprocess.TimeoutExpired:
        second_exited = False
        second.kill()
    time.sleep(2)
    count = len(foo_windows())
    check('a second launch exits and leaves one window (single instance)', second_exited and count == 1,
          f'second exited={second_exited}, windows={count}')
    check('the window is brought to the front after a second launch', win.is_active() or win.has_keyboard_focus(), '')
finally:
    try:
        Application(backend='uia').connect(process=proc.pid, timeout=5).kill()
    except Exception:
        proc.kill()

failed = [r for r in results if not r['ok']]
sys.exit(1 if failed else 0)
