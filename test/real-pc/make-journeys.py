# Spec: 07 journeys, 10 acceptance §C (per-surface checklists), real-AI every-feature pass (Vikas 2026-10-21).
# Writes the U-series journeys (one per surface of 10-acceptance-2 §C) into journeys/ and appends them to journeys.txt.
# Each journey lists the features it covers ("covers": AT ids and §C surface names) and, per screenshot, the design
# reference it is judged against ("ref": a Blueprint BP-* or walkthrough UX-* frame). Steps that depend on what the real
# AI chooses to do are soft: a miss is recorded and judged from the screenshot, never a crash of the run.
# Run: python3 test/real-pc/make-journeys.py && npx prettier --write "test/real-pc/journeys/U*.json"
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'journeys')


def send(text):
    return {'do': 'send', 'text': text}


def reply(shot, expect, ref=None, timeout=150000):
    s = {'do': 'waitReply', 'timeoutMs': timeout, 'shot': shot, 'expect': expect}
    if ref:
        s['ref'] = ref
    return s


def shot(name, expect=None, ref=None):
    s = {'do': 'shot', 'name': name}
    if expect:
        s['expect'] = expect
    if ref:
        s['ref'] = ref
    return s


def click(tid=None, css=None, soft=True, **kw):
    s = {'do': 'click', 'soft': soft}
    if tid:
        s['tid'] = tid
    if css:
        s['css'] = css
    s.update(kw)
    return s


def key(k, shot_name=None, expect=None, ref=None):
    s = {'do': 'key', 'key': k}
    if shot_name:
        s['shot'] = shot_name
    if expect:
        s['expect'] = expect
    if ref:
        s['ref'] = ref
    return s


def wait(ms, shot_name=None, expect=None, ref=None):
    s = {'do': 'wait', 'ms': ms}
    if shot_name:
        s['shot'] = shot_name
    if expect:
        s['expect'] = expect
    if ref:
        s['ref'] = ref
    return s


def check(tid=None, css=None, note=None, count=None):
    s = {'do': 'check', 'soft': True}
    if tid:
        s['tid'] = tid
    if css:
        s['css'] = css
    if note:
        s['note'] = note
    if count is not None:
        s['count'] = count
    return s


def expect_text(re, tid=None, css=None, note=None, last=False, not_=False):
    s = {'do': 'expectText', 'soft': True, 're': re}
    if tid:
        s['tid'] = tid
    if css:
        s['css'] = css
    if note:
        s['note'] = note
    if last:
        s['last'] = True
    if not_:
        s['not'] = True
    return s


def fill(tid, value):
    return {'do': 'fill', 'tid': tid, 'value': value, 'soft': True}


def type_composer(text):
    return {'do': 'fill', 'tid': 'composer-field', 'value': text, 'soft': True}


def open_foo():
    return {'do': 'openChat', 'name': 'foo', 'soft': True}


def esc():
    return {'do': 'key', 'key': 'Escape'}


def dump():
    return {'do': 'dump', 'name': 'thread'}


FOO_LAST = 'bubble-foo'
ME_LAST = 'bubble-me'

J = []


def journey(jid, title, spec, covers, steps):
    J.append({'id': jid, 'title': title, 'spec': spec, 'covers': covers, 'steps': [open_foo()] + steps + [dump()]})


# --- C.3 messages: the bubble menu, reactions, edit, reply, copy, select, feedback -------------------------------
journey(
    'U01-bubble-menu',
    'Bubble menu: copy, react, reply, edit, try again, good and bad',
    '04 §1–§8, 10-2 §C.3 Your bubble / foo bubble / Reactions',
    ['C.3 Your bubble + status badge', 'C.3 foo / helper bubble', 'C.3 Reactions', 'AT-027'],
    [
        send('Give me one fun fact about Delhi in one sentence'),
        reply('fact', 'one short reply; my bubble shows a tick and a badge, never ⚠', 'BP-MSG-01'),
        {'do': 'shotEl', 'tid': ME_LAST, 'last': True, 'name': 'my-bubble', 'soft': True, 'ref': 'BP-MSG-02'},
        click(FOO_LAST, last=True, button='right'),
        wait(600, 'foo-menu', 'menu on foo bubble: Reply, Copy, React, Try again, Good, Bad, Select', 'UX-04-05'),
        click('bubble-menu-copy'),
        click(FOO_LAST, last=True, button='right'),
        click('bubble-menu-react'),
        wait(600, 'react-picker', 'reaction picker with emoji options', 'UX-04-06'),
        click('bubble-react-option'),
        wait(800, 'reacted', 'reaction chip under foo bubble'),
        check('bubble-reaction', note='reaction chip shows'),
        click('bubble-reaction', last=True),
        wait(800, 'reaction-removed', 'clicking my reaction again removes it'),
        click(ME_LAST, last=True, button='right'),
        wait(600, 'my-menu', 'menu on my bubble: Reply, Copy, React, Edit, Select, Delete'),
        click('bubble-menu-reply'),
        wait(500, 'reply-quote', 'reply quote above the composer with a close X', 'BP-COMP-04'),
        send('And one about Amritsar'),
        reply('reply-sent', 'my bubble shows the quoted message; foo answers about Amritsar'),
        check('bubble-quote', note='quote shows inside my bubble'),
        click(ME_LAST, last=True, button='right'),
        click('bubble-menu-edit'),
        wait(500, 'edit-mode', 'composer in edit mode with my text'),
        type_composer('And one about Ludhiana'),
        key('Enter'),
        wait(20000, 'edited', 'my bubble says edited; foo answers the edited question'),
        expect_text('edited', tid=ME_LAST, last=True, note='edited label'),
        click(FOO_LAST, last=True, button='right'),
        click('bubble-menu-good'),
        wait(800, 'good', 'thumbs up feedback recorded quietly'),
        click(FOO_LAST, last=True, button='right'),
        click('bubble-menu-bad'),
        wait(800, 'bad-feedback', 'feedback chips / field after thumbs down'),
        esc(),
        click(FOO_LAST, last=True, button='right'),
        click('bubble-menu-try-again'),
        reply('try-again', 'a fresh answer replaces or follows; no duplicate bubbles'),
    ],
)

journey(
    'U02-reactions-thanks',
    'Reactions: foo thumbs-up on thanks, react and un-react',
    '04 §12, 10-1 AT-027, 10-2 §C.3 Reactions',
    ['C.3 Reactions', 'AT-027'],
    [
        send('What is 12 times 12?'),
        reply('math', 'answer 144'),
        send('thanks!'),
        wait(15000, 'thanks', 'foo adds a 👍 reaction on my thanks and posts no message (AT-027)'),
        check('bubble-reaction', note='foo reacted to my thanks'),
        click(FOO_LAST, last=True, button='right'),
        click('bubble-menu-react'),
        click('bubble-react-more'),
        wait(700, 'react-more', 'more emoji'),
        esc(),
    ],
)

journey(
    'U03-select-delete',
    'Select messages, copy them, delete one (keep)',
    '04 §9, 03-2 selection header, 10-2 §C.3',
    ['C.3 Your bubble + status badge', 'C.2 Headers (left + main)'],
    [
        send('Say hello in Hindi'),
        reply('hello', 'short reply'),
        click(ME_LAST, last=True, button='right'),
        click('bubble-menu-select'),
        wait(600, 'select-mode', 'selection header with count, Copy, Delete, Cancel; check circles on bubbles'),
        click('bubble-select-check', last=True),
        wait(400, 'two-selected', 'count 2'),
        expect_text('2', tid='chat-header-selection-count', note='count shows 2'),
        click('chat-header-selection-copy'),
        click('chat-header-selection-cancel'),
        click(ME_LAST, last=True, button='right'),
        click('bubble-menu-delete'),
        wait(600, 'delete-dialog', 'confirm dialog; Esc keeps the message', 'UX-23-04'),
        esc(),
        check(ME_LAST, note='message kept after Esc'),
    ],
)

journey(
    'U04-find-in-chat',
    'Find in chat: Ctrl+F, count, next, previous, close',
    '06 §9 find in chat, 10-2 §C.5 Search palette + find in chat',
    ['C.5 Search palette + find in chat'],
    [
        send('List three Indian rivers'),
        reply('rivers', 'a short list'),
        key('Control+F', 'find-open', 'find bar in the chat header with a field and count'),
        fill('thread-find-field', 'river'),
        wait(800, 'find-results', 'matches highlighted; count "1 of n"'),
        click('thread-find-next'),
        click('thread-find-prev'),
        click('thread-find-close'),
        key('Control+K', None),
        wait(800, 'ctrl-k', 'Ctrl+K search overlay (J22) if built; else nothing happens'),
        esc(),
    ],
)

# --- C.2 shell --------------------------------------------------------------------------------------------------
journey(
    'U05-chat-list',
    'Chat list: filters, row menu (pin, mute, mark unread), search chats',
    '03-1 §3.4, 10-2 §C.2 Left shell / Filter chips',
    ['C.2 Left shell: chat list', 'C.2 Filter chips + "Search chats" box'],
    [
        shot('list', 'chat list with foo row (and any helpers); filter chips All · Needs you · Working · Done', 'BP-ANAT-LIST'),
        click('chatlist-filter-needs-you'),
        wait(500, 'filter-needs-you', 'filter selected; empty state if nothing needs me'),
        click('chatlist-filter-working'),
        wait(500, 'filter-working'),
        click('chatlist-filter-done'),
        wait(500, 'filter-done'),
        click('chatlist-filter-all'),
        click('chatlist-row', button='right'),
        wait(500, 'row-menu', 'row menu: Pin, Mark unread, Mute, Profile, Find, Clear, Delete', 'UX-02-04'),
        click('chatlist-menu-pin'),
        wait(500, 'pinned', 'pin icon on the row'),
        check('chatlist-row-pin', note='pinned mark'),
        click('chatlist-row', button='right'),
        click('chatlist-menu-mute'),
        wait(400, 'mute-sub', 'mute choices 8 hours, 1 week, Always'),
        click('chatlist-menu-mute-8h'),
        check('chatlist-row-mute', note='muted mark'),
        click('chatlist-row', button='right'),
        click('chatlist-menu-unread'),
        wait(500, 'unread', 'unread dot/count on the row'),
        click('chatlist-row', button='right'),
        click('chatlist-menu-pin'),
        click('chatlist-row', button='right'),
        click('chatlist-menu-mute'),
        click('chatlist-menu-mute-8h'),
        fill('sidebar-search-field', 'foo'),
        wait(600, 'search-chats', 'list filtered to foo'),
        fill('sidebar-search-field', 'zzzz-nothing'),
        wait(600, 'search-none', 'empty result message'),
        click('sidebar-search-clear'),
        open_foo(),
    ],
)

journey(
    'U06-header-panel',
    'Chat header, ⋮ menu, details panel (Doing, Using, What I know, Spent)',
    '03-2 §3.6, 10-2 §C.2 Headers / Right shell',
    ['C.2 Headers (left + main)', 'C.2 Right shell', 'C.2 Main shell + banner strip'],
    [
        shot('header', 'header 60px: face, name, status line, find, details toggle, ⋮', 'BP-ANAT-MHEAD'),
        click('chat-header-more'),
        wait(500, 'more-menu', 'header ⋮ menu items'),
        esc(),
        key('Control+Shift+D', 'panel-toggle', 'details panel toggles (Ctrl+Shift+D)'),
        wait(800, 'panel', 'right panel: Doing now, Using, What I know, Spent this month (AI ₹1,000 / purchases ₹25,000)', 'BP-APP-R'),
        {'do': 'shotEl', 'tid': 'app-panel-spent', 'name': 'spent', 'soft': True, 'ref': 'BP-ANAT-SPENT'},
        {'do': 'shotEl', 'tid': 'app-panel-using', 'name': 'using', 'soft': True, 'ref': 'BP-ANAT-USING'},
        {'do': 'shotEl', 'tid': 'app-panel-know', 'name': 'know', 'soft': True, 'ref': 'BP-ANAT-KNOW'},
        click('app-panel-know-see-all'),
        wait(800, 'know-all', 'memory page opens'),
        click('screen-back'),
        key('Control+Shift+D', 'panel-hidden', 'panel hidden again'),
    ],
)

journey(
    'U07-composer',
    'Composer: multi-line, attach menu, emoji, Esc, draft kept after restart',
    '04 §13–§16, 10-2 §C.3 Composer',
    ['C.3 Composer'],
    [
        shot('composer', 'composer: + attach, field "Message foo, or hold Ctrl+Space to talk", mic/send 36px', 'BP-COMP-01'),
        click('composer-field'),
        {'do': 'key', 'key': 'Shift+Enter'},
        type_composer('line one\nline two\nline three'),
        wait(400, 'multiline', 'composer grows upward for 3 lines', 'BP-COMP-02'),
        click('composer-attach'),
        wait(500, 'attach-menu', 'attach menu: Files, Screenshot, Secret, Emoji', 'BP-COMP-05'),
        click('composer-attach-menu-emoji'),
        wait(500, 'emoji', 'emoji picker'),
        esc(),
        type_composer('a draft I did not send'),
        {'do': 'relaunch'},
        open_foo(),
        wait(1000, 'draft-restored', 'the unsent draft is back in the composer'),
        {'do': 'eval', 'soft': True, 'note': 'draft restored', 'js': "(document.querySelector('[data-testid=composer-field]') || {}).value || (document.querySelector('[data-testid=composer-field]') || {}).innerText"},
        type_composer(''),
    ],
)

# --- C.3 rich text in foo bubbles ---------------------------------------------------------------------------------
journey(
    'U08-rich-text',
    'foo bubbles: code block copy, table, links, list, sources',
    '04 §3–§5, 10-2 §C.3 foo bubble, R1',
    ['C.3 foo / helper bubble', 'C.9 Rich replies'],
    [
        send('Show me a tiny Python hello world in a code block'),
        reply('code', 'code block in mono with a Copy button', 'BP-MSG-03'),
        click('bubble-code-copy', last=True),
        send('Make a 3-row table of Indian states and capitals'),
        reply('table', 'table renders (or label: value lines), not raw pipes'),
        send('Give me the link to the Indian Railways website'),
        reply('link', 'a clickable link; right-click shows open/copy'),
        click('bubble-autolink', last=True, button='right'),
        wait(500, 'link-menu', 'link menu: Open, Copy'),
        esc(),
    ],
)

# --- C.4 cards: plan, checklist, stop, proof ------------------------------------------------------------------------
journey(
    'U09-plan-checklist',
    'Plan card: pending, Change plan, Go, checklist steps, details, done with proof',
    '05-3 §5.24 Plan, §5.5 Checklist, §5.18 Proof, 10-2 §C.4',
    ['C.4 Plan (C11)', 'C.4 Checklist (C2) + link card', 'C.4 Proof chip + receipt footer (C12)'],
    [
        send('Research the 3 best budget laptops under ₹50,000 in India right now and compare them'),
        reply('plan', 'a Plan card with real step names (never "Work on it"), estimate, Go and Change plan', 'BP-CARD-11', 180000),
        {'do': 'shotEl', 'tid': 'card-plan', 'last': True, 'name': 'plan-card', 'soft': True, 'ref': 'BP-CARD-11'},
        click('card-plan-go', last=True),
        wait(5000, 'checklist', 'checklist appears with the current step spinning', 'BP-CARD-02'),
        click('card-checklist-details', last=True),
        wait(1000, 'checklist-details', 'details expanded'),
        wait(150000, 'done', 'job done: checklist collapsed "Done · n steps · m min", answer, sources/proof footer'),
        check('thread-receipt-footer', note='receipt footer'),
        check('card-checklist-sources', note='sources'),
    ],
)

journey(
    'U10-plan-change-stop',
    'Plan card: Change plan, then Stop a running job from the checklist',
    '05-3 §5.24, 05 §5.5 Stop, 10-2 §C.4',
    ['C.4 Plan (C11)', 'C.4 Checklist (C2) + link card', 'C.2 Right shell'],
    [
        send('Find me 5 weekend trek options near Pune with difficulty and cost'),
        reply('plan', 'plan card', 'BP-CARD-11', 180000),
        click('card-plan-change', last=True),
        wait(800, 'change', 'composer prompts for the change'),
        send('Only easy treks please'),
        reply('plan-2', 'a changed plan, the old one marked changed'),
        click('card-plan-go', last=True),
        wait(8000, 'running', 'checklist running; Doing now shows the job; chat pill Working'),
        key('Control+Shift+D'),
        wait(800, 'doing-now', 'right panel Doing now row with Stop', 'BP-ANAT-DOING'),
        click('card-checklist-stop', last=True),
        wait(5000, 'stopped', 'job stopped ⛔, checklist says stopped, no further steps'),
        key('Control+Shift+D'),
    ],
)

journey(
    'U11-approval-states',
    'Approval card: pending, Not now (declined), Change (never Approve)',
    '05-1 §5.7 Approval, 10-2 §C.4 Approval (C4), Article 6',
    ['C.4 Approval (C4)', 'C.4 Choice (C3)'],
    [
        send('Book me a table for 2 at a vegetarian restaurant in Connaught Place, Delhi this Saturday 8 PM'),
        reply('ask', 'options or a plan; never books without an Approval card', None, 240000),
        click('card-plan-go', last=True),
        wait(120000, 'options', 'restaurant options as a Choice/tiles card'),
        click('card-tiles-option', last=True),
        click('card-choice-option', last=True),
        wait(90000, 'approval', 'Approval card PENDING: accent top edge, lock, impact line, Book table / Change / Not now', 'BP-CARD-04'),
        {'do': 'shotEl', 'tid': 'card-approval', 'last': True, 'name': 'approval-card', 'soft': True, 'ref': 'BP-CARD-04'},
        send('yes'),
        wait(8000, 'typed-yes', 'typed "yes" never approves (ART-06a): card still pending'),
        click('card-approval-not-now', last=True),
        wait(3000, 'declined', 'card DECLINED; nothing booked'),
        click('card-approval-ask-again', last=True),
        wait(2000, 'ask-again', 'Ask me again shows a fresh pending card or note'),
    ],
)

journey(
    'U12-choice-variants',
    'Choice card: pick by click, by typing, by reaction 1️⃣, Something else',
    '05-1 §5.4 Choice, 10-2 §C.4 Choice (C3), AT-035',
    ['C.4 Choice (C3)', 'C.3 Reactions', 'AT-035'],
    [
        send('Help me pick a weekend activity in Bengaluru, give me 3 options to choose from'),
        reply('choice', 'Choice card with 3 options, Best fit tag, Something else', 'BP-CARD-03'),
        {'do': 'shotEl', 'tid': 'card-choice', 'last': True, 'name': 'choice-card', 'soft': True, 'ref': 'BP-CARD-03'},
        send('the second one'),
        reply('typed-pick', 'typed answer picks option 2; card collapses "question → answer"'),
        send('Now give me 3 dinner options to choose from'),
        reply('choice-2', 'another Choice card'),
        click('card-choice-something-else', last=True),
        wait(600, 'something-else', 'composer hint for my own answer'),
        send('Actually just a home-cooked dal chawal'),
        reply('own-answer', 'foo takes my own answer'),
    ],
)

journey(
    'U13-secret-box',
    'Secret box: type a fake key, show/hide, save, replace',
    '05-2 §5.8 Secret box, 10-2 §C.4 Secret box (C7), ART-08a',
    ['C.4 Secret box (C7) + code box + card form', 'C.4 Paste catcher (C8)'],
    [
        click('composer-attach'),
        click('composer-attach-menu-secret'),
        wait(1500, 'secret', 'Secret box card: masked field, eye toggle, Save', 'BP-CARD-07'),
        fill('card-secret-field', 'sk-test-0000000000000000000000000000'),
        wait(300, 'typed', 'value masked'),
        click('card-secret-eye', last=True),
        wait(300, 'shown', 'value shown after eye'),
        click('card-secret-eye', last=True),
        click('card-secret-save', last=True),
        wait(2000, 'saved', '"· saved {date}", only Replace offered; value never shown again', 'BP-CARD-08'),
        click('card-secret-replace', last=True),
        wait(800, 'replace', 'empty field to replace'),
        click('card-secret-cancel', last=True),
    ],
)

# --- C.4 memory chip + C.5 memory page --------------------------------------------------------------------------
journey(
    'U14-memory',
    'Memory: chip with Undo, memory page search, edit, forget with Undo',
    '05-3 §5.17 Memory chip, 06 Memory page, 10-2 §C.4 / §C.5',
    ['C.4 Memory chip (C14)', 'C.5 Memory page'],
    [
        send('Remember that I am vegetarian on Tuesdays'),
        reply('chip', 'memory chip "I\'ll remember · Undo"', 'BP-CARD-15'),
        check('thread-memory-undo', note='Undo on the chip'),
        send('Remember my favourite cricket team is Punjab Kings'),
        reply('chip-2', 'second memory chip'),
        click('thread-memory-undo', last=True),
        wait(1500, 'undone', 'chip says forgotten / undone'),
        click('sidebar-more'),
        click('sidebar-menu-memory'),
        wait(1200, 'memory-page', 'Memory page: rows with source and date, search, filters', 'UX-16-01'),
        # CR-0037 (run 8 showed "Uses about 0.0 emoji per message"): no guessed line built on an empty measure or a broken number.
        expect_text(r'about (0\.0|NaN|Infinity|undefined) (emoji|characters)|Mixes capital', tid='screen-memory', not_=True, note='no empty-measure guesses'),
        fill('memory-search', 'vegetarian'),
        wait(800, 'memory-search', 'row found'),
        click('memory-row-edit'),
        wait(600, 'memory-edit', 'inline edit'),
        esc(),
        click('memory-row-forget'),
        wait(800, 'forgot', 'row gone, 5 s Undo bar', 'UX-16-04'),
        click('app-undo-action'),
        wait(800, 'undo', 'row back'),
        click('screen-back'),
    ],
)

# --- C.4 routine + C.5 routines screen ---------------------------------------------------------------------------
journey(
    'U15-routines',
    'Routine: create by chat, routines screen, pause, run once',
    '05-3 §5.16 Routine, 06 Routines screen, 10-2 §C.4 / §C.5',
    ['C.4 Routine (C13)', 'C.5 Routines screen'],
    [
        send('Every weekday at 8 AM tell me the weather in Delhi'),
        reply('routine', 'Routine card: created, next run time with weekday and date', 'BP-CARD-16', 180000),
        click('sidebar-more'),
        click('sidebar-menu-routines'),
        wait(1200, 'routines', 'Routines screen with the new routine row', 'UX-18-01'),
        click('screen-back'),
    ],
)

# --- C.5 settings -------------------------------------------------------------------------------------------------
SET = ['account', 'appearance', 'notifications', 'permissions', 'money', 'privacy', 'routines-settings', 'connections', 'chat',
       'shortcuts', 'about']
steps = [key('Control+,', 'settings', 'Settings opens (Ctrl+,) on Account', 'UX-12-01')]
for i, sec in enumerate(SET):
    steps += [click(f'settings-nav-{sec}'), wait(700, f'settings-{sec}', f'Settings · {sec}: rows match the spec section', f'UX-12-{i + 1:02d}')]
steps += [click('screen-back')]
journey('U16-settings-all', 'Settings: every section', '06 Settings, 10-2 §C.5 Settings', ['C.5 Settings'], steps)

journey(
    'U17-settings-by-chat',
    'Change a setting by chat: mini line with Undo; theme and accent rows',
    '06 Settings changed-by-chat, settings:undo, 10-2 §C.5 Settings',
    ['C.5 Settings', 'C.8 Quiet premium polish'],
    [
        send('Switch to dark mode'),
        reply('dark', 'foo switches to dark and shows "Changed: Theme → Dark. [Undo]"', 'UX-12-02'),
        click('app-undo-action', last=True),
        wait(1500, 'undo', 'back to light'),
        key('Control+,'),
        click('settings-nav-appearance'),
        click('settings-row-appearance-theme'),
        wait(600, 'theme-row', 'theme options'),
        esc(),
        click('screen-back'),
    ],
)

# --- C.5 helpers and groups ---------------------------------------------------------------------------------------
journey(
    'U18-new-helper-group',
    'New helper and New group dialogs, helper chat, helper profile',
    '06 C-24/C-25/C-26 dialogs, 10-2 §C.4 New helper / New group dialogs',
    ['C.4 New helper / New group dialogs (06, not cards)', 'C.5 Helper profile / group'],
    [
        key('Control+N', 'new-helper', 'New helper dialog: templates, name field', 'UX-10-01'),
        esc(),
        click('sidebar-new-helper'),
        wait(800, 'new-helper-2', 'same dialog from the button'),
        esc(),
        key('Control+Shift+N', 'new-group', 'New group dialog: pick 2–6 members', 'UX-10-04'),
        esc(),
    ],
)

# --- C.5 other screens ---------------------------------------------------------------------------------------------
journey(
    'U19-screens',
    'Activity, Ideas, Spend, foo profile, Shortcuts screens',
    '06 screens, 10-2 §C.5',
    ['C.5 Helper profile / group', 'C.2 Main shell + banner strip'],
    [
        click('sidebar-more'),
        wait(500, 'more', 'sidebar ⋮ menu: New helper, New group, Memory, Routines, Ideas, Activity, Settings, Shortcuts, Quit'),
        click('sidebar-menu-activity'),
        wait(1200, 'activity', 'Activity screen'),
        click('screen-back'),
        click('sidebar-more'),
        click('sidebar-menu-ideas'),
        wait(1200, 'ideas', 'Ideas screen'),
        click('screen-back'),
        click('sidebar-more'),
        click('sidebar-menu-shortcuts'),
        wait(1200, 'shortcuts', 'keyboard shortcuts list'),
        esc(),
        click('chat-header-more'),
        click('chat-header-menu-profile'),
        wait(1200, 'foo-profile', 'foo profile: face, name, vibe'),
        click('screen-back'),
        click('app-panel-spent-change'),
        wait(1200, 'spend', 'Spend screen / caps'),
        click('screen-back'),
    ],
)

# --- C.4 error / stuck --------------------------------------------------------------------------------------------
journey(
    'U20-errors-honesty',
    'Things foo cannot do: honest error/connect, no fake success',
    '05-3 §5.19 Error, 08-4 rules, 10-2 §C.4 Error (C16)',
    ['C.4 Error (C16) / stuck / recovery', 'C.4 Connect (C10) + WhatsApp QR'],
    [
        send('Pay my electricity bill now'),
        reply('pay-bill', 'asks which bill / needs connection; never claims it paid', None, 180000),
        send('Order me a pizza from Dominos'),
        reply('order', 'honest about needing approval / not able; never fake success', None, 180000),
        send('Read my latest Gmail'),
        reply('gmail', 'Connect card for Gmail (C10), not a made-up inbox', 'BP-CARD-10'),
        click('card-connect-not-now', last=True),
        wait(800, 'not-now', 'connect card dismissed politely'),
    ],
)

# --- C.6 Windows bits that CI can see ---------------------------------------------------------------------------------
journey(
    'U21-window-dialogs',
    'Close to tray dialog, quit with a running job',
    '09 §9.2 close to tray, 06 dialogs, 10-2 §C.5 Dialogs / §C.6',
    ['C.5 Dialogs', 'C.6 Start at login, close to tray'],
    [
        send('Find the top 3 news headlines in India today'),
        wait(4000),
        {'do': 'key', 'key': 'Alt+F4'},
        wait(1500, 'first-close', 'first-close dialog: foo keeps running in the tray', 'UX-23-02'),
        esc(),
        reply('news', 'job still finishes after the dialog', None, 180000),
    ],
)

# --- C.7 face and C.8 polish ----------------------------------------------------------------------------------------
journey(
    'U22-face-polish',
    'Living face: thinking while working, resting; motion off in settings',
    '02 §F15.9 living face, 10-2 §C.7, §C.8',
    ['C.7.1', 'C.7.4', 'C.8 Quiet premium polish'],
    [
        send('Write a 4-line poem about monsoon in Mumbai'),
        wait(1500, 'thinking', '26px Thinking face only while the request is in flight (C.7.4)'),
        reply('poem', 'poem; face back to resting, blinks'),
        {'do': 'shotEl', 'tid': 'chat-header-avatar', 'name': 'face', 'soft': True},
        key('Control+,'),
        click('settings-nav-appearance'),
        click('settings-row-appearance-face-motion'),
        wait(600, 'face-motion', 'face motion setting'),
        esc(),
        click('screen-back'),
    ],
)

# --- C.9 rich replies extras: AI page, side strip, action chips ------------------------------------------------------
journey(
    'U23-ai-page-chips',
    'AI page, action chips, reply chips',
    '10-2 §C.9 Rich replies (X-180)',
    ['C.9 Rich replies'],
    [
        send('Make me a simple page that tracks my daily water intake with a goal of 8 glasses'),
        reply('ai-page', 'an AI page / kit card opens with the tracker', None, 240000),
        check('card-ai-page', note='AI page card'),
        check('bubble-action-chip', note='action chips under the reply'),
        click('composer-suggestion-chip', last=True),
        wait(800, 'chip-fills', 'reply chip fills the composer'),
        type_composer(''),
    ],
)

# --- Spec-coverage gaps (FID-21, CR-0031): shell anatomy at each breakpoint, composer states, flights honesty ---------
def el(tid, name, ref):
    return {'do': 'shotEl', 'tid': tid, 'name': name, 'ref': ref, 'soft': True}


def size(w, h, name, ref):
    return [{'do': 'resize', 'w': w, 'h': h, 'soft': True}, shot(name, f'window at {w}x{h}', ref)]


journey(
    'U25-anatomy-composer',
    'Shell anatomy at every width, composer states, honest flights reply',
    '03-shell-1 §3.1-§3.5, 03-shell-2 §3.6-§3.7, 04-2 §20-§23, AT-157',
    ['BP-ANAT-*', 'BP-APP-*', 'BP-COMP-*', 'BP-MSG-04', 'AT-157'],
    size(1280, 800, 'L-1280', 'BP-ANAT-L')
    + [
        el('titlebar-strip', 'tbar', 'BP-ANAT-TBAR'),
        el('sidebar', 'left', 'BP-APP-L'),
        el('sidebar-search-field', 'search', 'BP-ANAT-SEARCH'),
        el('chatlist-filters', 'chips', 'BP-ANAT-CHIPS'),
        el('chatlist', 'list', 'BP-ANAT-LIST'),
        el('sidebar-footer-status', 'lfoot', 'BP-ANAT-LFOOT'),
        el('chat-header', 'mhead', 'BP-ANAT-MHEAD'),
        el('app-panel', 'right', 'BP-APP-R'),
        el('app-panel-doing', 'doing', 'BP-ANAT-DOING'),
        el('app-panel-using', 'using', 'BP-ANAT-USING'),
        el('app-panel-know', 'know', 'BP-ANAT-KNOW'),
        el('app-panel-spent', 'spent', 'BP-ANAT-SPENT'),
        el('composer', 'comp-empty', 'BP-COMP-01'),
        type_composer('Can you remind me to call the bank tomorrow at 10'),
        el('composer', 'comp-typing', 'BP-COMP-02'),
        type_composer('Line one\nLine two\nLine three\nLine four'),
        el('composer', 'comp-multiline', 'BP-COMP-03'),
        type_composer(''),
        click('composer-attach'),
        wait(500, 'comp-attach-menu', 'attach menu', 'BP-COMP-05'),
        esc(),
    ]
    + size(1000, 760, 'M-1000', 'BP-ANAT-M')
    + size(760, 700, 'S-760', 'BP-ANAT-S')
    + size(520, 640, 'XS-520', 'BP-ANAT-XS')
    + size(1280, 800, 'L-again', 'BP-ANAT-L')
    + [
        send('book me a flight to Goa on Sat 12 Dec'),
        reply('flights', 'AT-157: says it can find and compare flights and open the booking page; filling passengers and paying comes later'),
        expect_text('compare', tid=FOO_LAST, last=True, note='AT-157 honest flights scope'),
    ],
)

# --- Composer keeps every letter: fast typing with no retry, a long paste (C.4, 04-2 §20-§22) ----------------------
FAST = ('Please just reply OK. Testing fast typing: The quick brown fox jumps over the lazy dog 1234567890, '
        'then Priya said "meet at 7:45 PM near Bandra station?" & Rahul replied (maybe) - ok! '
        'Mera naam Asha hai, kal Pune jaana hai; sat sri akal ji. Ending with symbols: @#%=+ [brackets] {braces} ~ done.')
PASTE = '\n'.join(
    f'Line {i:02d}: Please just reply OK. Paste check row {i} with numbers {i * 37} and words alpha beta gamma delta.'
    for i in range(1, 19)
)
journey(
    'U27-composer-no-dropped-letters',
    'Fast typing and a long paste reach foo letter for letter',
    '04-2 §20-§22 composer; AT-365 inline paste band',
    ['C.4 Composer', 'AT-365'],
    [
        {'do': 'typeSend', 'text': FAST, 'shot': 'fast-typed',
         'expect': 'typed at full speed with no retry: the sent text matches exactly'},
        reply('fast-reply', 'foo replies'),
        {'do': 'typeSend', 'text': FAST, 'delay': 5, 'shot': 'fast-typed-5ms',
         'expect': 'typed with 5 ms between keys: exact match'},
        reply('fast-reply-2', 'foo replies'),
        {'do': 'pasteSend', 'text': PASTE, 'shot': 'pasted',
         'expect': '18-line paste (inline band, under 2,000 chars) is sent exactly, line breaks kept'},
        reply('paste-reply', 'foo replies'),
    ],
)

# --- Crash then instant reopen (Windows single-instance lock held by leftover helpers?) ------------------------------
journey(
    'U26-crash-reopen',
    'foo crashes and is reopened at once: a window must appear',
    '07 J-crash recovery (CR-0029, X-187); single-instance lock',
    ['crash recovery', 'single instance'],
    [
        check('composer-field', note='foo is open'),
        {'do': 'crashRelaunch', 'shot': 'after-reopen',
         'expect': 'kill only the main foo.exe, reopen straight away: a foo window shows (not a silent quit)'},
        {'do': 'crashRelaunch', 'gapMs': 1500, 'shot': 'after-reopen-1500ms',
         'expect': 'same, reopening 1.5 s after the crash'},
    ],
)

with open(os.path.join(HERE, 'journeys.txt'), encoding='utf-8') as f:
    base = [ln.strip() for ln in f if ln.strip() and not ln.startswith('U')]
for j in J:
    with open(os.path.join(OUT, j['id'] + '.json'), 'w', encoding='utf-8') as f:
        json.dump(j, f, indent=2, ensure_ascii=False)
        f.write('\n')
with open(os.path.join(HERE, 'journeys.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(base + [j['id'] for j in J]) + '\n')
print(len(J), 'U journeys;', len(base) + len(J), 'in journeys.txt')
