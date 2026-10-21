#!/usr/bin/env python3
"""Build the test coverage matrix: 160 features x 15 test types.

Inputs (all in the repo):
  docs/testing/features.tsv        the 160 built features (milestone, id, journey, text)
  spec/trace.csv                   spec id -> test file + live/pending
  docs/testing/real-ai-results.tsv real-AI results, one row per judged feature
  docs/testing/suite-status.tsv    facts that apply to many features (CI runs, PRs not merged)
  test/real-pc/journeys/*.json     which real-user journeys name which feature

Outputs:
  docs/testing/coverage-matrix.tsv  one row per feature, one column per test type
  docs/testing/coverage-matrix.md   the same, readable, with totals
  docs/testing/coverage-matrix.json data for the coverage page

Evidence rule: a cell is "proven" only when a passing run on CURRENT main is linked.
Anything that passed on a branch, an older build, or a real PC with no log is "partial".
Run: python3 docs/testing/build_matrix.py
"""
import csv, json, glob, os, re, collections

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
P = lambda *a: os.path.join(ROOT, *a)
GH = 'https://github.com/vikas53953/foo-agent'

TYPES = [
    ('unit', 'Unit'), ('integration', 'Integration'), ('e2e', 'E2E (pretend AI)'),
    ('real_ai', 'Real-AI journey'), ('bdd', 'BDD spec'), ('ai_eval', 'AI eval'),
    ('visual', 'Visual regression'), ('motion', 'Animation / motion'), ('a11y', 'Accessibility'),
    ('perf', 'Performance'), ('install', 'Install / upgrade'), ('mutation', 'Mutation'),
    ('smoke', 'Smoke'), ('regression', 'Regression'), ('ux', 'Usability / UX'),
]

def tsv(path):
    with open(path, newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f, delimiter='\t'))

features = tsv(P('docs/testing/features.tsv'))
suite = {r['key']: r for r in tsv(P('docs/testing/suite-status.tsv'))}
real = {r['id']: r for r in tsv(P('docs/testing/real-ai-results.tsv'))}
with open(P('spec/trace.csv'), newline='', encoding='utf-8') as f:
    trace = collections.defaultdict(list)
    for r in csv.DictReader(f):
        trace[r['AT / ART / PERF']].append(r)

# Real-user journeys that name a feature id, plus spec journey (J7 -> J07-*) links.
journeys = collections.defaultdict(set)
spec_j = collections.defaultdict(set)
for path in glob.glob(P('test/real-pc/journeys/*.json')):
    name = os.path.basename(path)[:-5]
    text = open(path, encoding='utf-8').read()
    for i in set(re.findall(r'AT-\d+[a-z]?', text)):
        journeys[i].add(name)
    for m in re.findall(r'J(\d\d)', name.split('-')[0] + '-' + '-'.join(name.split('-')[1:2])):
        spec_j['J' + str(int(m))].add(name)

MAIN_OK = suite['main_ci']['state'] == 'green'
MAIN_LINK = suite['main_ci']['link']
MAIN_SHA = suite['main_ci']['sha']

# Feature groups used by the rules below (by id, from the feature text in features.tsv).
ENGINE_ONLY = set('AT-225 AT-083 AT-106 AT-008 AT-053 AT-056 AT-059 AT-073 AT-074 AT-075 AT-076 AT-137 AT-138 AT-139 '
                  'AT-140 AT-141 AT-143 AT-144 AT-155a AT-219 AT-315 AT-322 AT-357 AT-358 AT-360 AT-371 AT-018 '
                  'AT-054 AT-133 AT-015'.split())
AI_OUTPUT = set('AT-027 AT-030 AT-031 AT-019 AT-032 AT-033 AT-036 AT-051 AT-054 AT-055 AT-056 AT-072 AT-074 AT-076 '
                'AT-077b AT-119 AT-142 AT-145 AT-219 AT-308 AT-310 AT-312 AT-353 AT-354 AT-356 AT-363 AT-364 AT-366 '
                'AT-367 AT-018 AT-070 AT-016 AT-370'.split())
JUDGE_97 = {  # promptfoo asks in PR #97 test/judge/promptfooconfig.yaml
    'AT-031': 'tone-*', 'AT-030': 'tone-short', 'AT-027': 'tone-praise', 'AT-366': 'route-*', 'AT-364': 'route-*',
    'AT-310': 'plan-*', 'AT-019': 'plan-*', 'AT-018': 'honest-whatsapp', 'AT-054': 'honest-*', 'AT-055': 'honest-send-email',
    'AT-072': 'honest-memory', 'AT-076': 'honest-memory', 'AT-142': 'safety-*', 'AT-056': 'safety-*', 'AT-370': 'safety-card-number'}
MOTION = set('AT-300 AT-301 AT-302 AT-303 AT-326 AT-327 AT-304 AT-305 AT-313 AT-323 AT-324 AT-325 AT-309 AT-310 '
             'AT-311 AT-312 AT-314 AT-353'.split())
PERF = set('AT-019 AT-081 AT-116 AT-116a AT-322 AT-326 AT-327 AT-302 AT-270 AT-353 AT-365 AT-360 AT-359 AT-053'.split())
INSTALL = set('AT-089 AT-118 AT-118a AT-008 AT-059 AT-075 AT-319 AT-155'.split())
MUTATION_101 = set('AT-005 AT-006 AT-106 AT-155 AT-155a AT-031 AT-308 AT-310'.split())  # stryker.config.json in #101
SMOKE = set('AT-005 AT-006 AT-008 AT-009 AT-155 AT-155a AT-313 AT-314'.split())  # first-run journey J01-J02
BP_SURFACE = {  # picture checks (test/fidelity/bp) that capture the feature's card or screen
    'M2': 'BP-messages', 'M3': 'BP-messages', 'M4': 'BP-cards-m4', 'M5': 'BP-cards-m5-*', 'M6': 'BP-m6',
    'M8': 'BP-cards-m8', 'M9': 'BP-cards-m9 / BP-screens-m9'}

def cell(s, why, link=''):
    return {'s': s, 'why': why, 'link': link}

def build(f):
    i, m = f['id'], f['milestone']
    rows = trace.get(i, [])
    by = collections.defaultdict(list)
    for r in rows:
        kind = r['Test file'].split('/')[1] if '/' in r['Test file'] else 'other'
        kind = {'articles': 'unit'}.get(kind, kind)
        by[kind].append(r)
    c = {}

    def code_cell(kind):
        rs = by.get(kind, [])
        if not rs:
            return None
        live = [r for r in rs if r['Status'] == 'live']
        file = (live or rs)[0]['Test file']
        link = f'{GH}/blob/main/{file}'
        if not live:
            return cell('missing', f'{file} is listed but still pending (not written or skipped)', link)
        if MAIN_OK:
            return cell('proven', f'{file} passes in main CI {MAIN_SHA}', MAIN_LINK)
        return cell('partial', f'{file} passed on its PR before merge; main CI on {MAIN_SHA} not finished green yet', link)

    any_code = False
    for kind in ('unit', 'integration', 'e2e'):
        got = code_cell(kind)
        if got:
            c[kind] = got
            any_code = any_code or got['s'] != 'missing'
    for kind in ('unit', 'integration', 'e2e'):
        if kind not in c:
            other = [k for k in ('unit', 'integration', 'e2e') if k in c and c[k]['s'] != 'missing']
            c[kind] = cell('na', f'checked at the {other[0]} level instead') if other else cell('missing', 'no test of this kind')

    # Real AI
    r = real.get(i)
    js = sorted(journeys.get(i, set()).union(*[spec_j.get(j.strip(), set()) for j in f['journey'].split(',')]))
    if r:
        tag = {'pass': 'passed', 'fail': 'FAILS', 'wrong': 'works but wrong', 'blocked': 'blocked by setup',
               'unclear': 'unclear', 'partial': 'partly passed'}[r['result']]
        where = 'on Vikas\'s PC (report, no log)' if r['build'] == 'real-pc-report' else (
            'needs setup' if r['build'] == 'setup' else f'real Claude, build {r["build"]} (not current main)')
        s = 'partial'
        if r['result'] == 'pass' and r['build'] == MAIN_SHA:
            s = 'proven'
        if r['result'] in ('fail', 'wrong'):
            s = 'fail'
        c['real_ai'] = cell(s, f'{tag} {where}: {r["note"]}', r['evidence'])
    elif js:
        c['real_ai'] = cell('partial', f'journey {", ".join(js)} runs with real Claude but no judged result for this feature yet',
                            f'{GH}/tree/evidence/real-ai')
    else:
        c['real_ai'] = cell('missing', 'no real-user journey names this feature')

    c['bdd'] = cell('missing', 'no Given/When/Then feature file yet')

    if i in AI_OUTPUT:
        c['ai_eval'] = (cell('partial', f'AI judge ask {JUDGE_97[i]} built in PR #97, not merged or run', f'{GH}/pull/97')
                        if i in JUDGE_97 else cell('missing', 'AI output feature with no eval case'))
    else:
        c['ai_eval'] = cell('na', 'no AI-written output to judge')

    ui = i not in ENGINE_ONLY
    if ui:
        bp = BP_SURFACE.get(m, '')
        c['visual'] = cell('partial', f'its screen is picture-checked ({bp}, pretend AI); this exact state is not', f'{GH}/tree/main/test/fidelity/bp') if bp else cell('missing', 'no picture check')
        c['a11y'] = cell('partial', 'axe sweep of every surface built in PR #97, not merged', f'{GH}/pull/97')
        c['ux'] = cell('missing', 'no real-person usability test; no AI heuristic review yet')
    else:
        c['visual'] = cell('na', 'nothing on screen')
        c['a11y'] = cell('na', 'nothing on screen')
        c['ux'] = cell('na', 'nothing on screen')

    if i in MOTION:
        mot = [r for r in rows if 'motion' in r['Test file'] and r['Status'] == 'live']
        if mot and MAIN_OK:
            c['motion'] = cell('proven', f'{mot[0]["Test file"]} passes in main CI', MAIN_LINK)
        elif mot:
            c['motion'] = cell('partial', f'{mot[0]["Test file"]} passed on its PR; main run not green yet', f'{GH}/blob/main/{mot[0]["Test file"]}')
        else:
            c['motion'] = cell('missing', 'motion rule with no motion check')
    else:
        c['motion'] = cell('na', 'no motion rule')

    if i in PERF:
        timed = by.get('e2e') or by.get('integration') or by.get('perf')
        c['perf'] = cell('partial', 'time limit asserted in a functional test with pretend AI; no perf budget run') if timed else cell('missing', 'time limit with no test')
    else:
        c['perf'] = cell('na', 'no time or size limit')

    if i in INSTALL:
        c['install'] = cell('partial' if any_code else 'missing', 'restart/data kept tested inside one build; upgrade from the old build never tested')
    else:
        c['install'] = cell('na', 'not affected by install or upgrade')

    c['mutation'] = (cell('partial', 'Stryker on its code at 72% in PR #101, not merged', f'{GH}/pull/101') if i in MUTATION_101
                     else cell('missing', 'its code is not mutation-tested'))

    if i in SMOKE:
        c['smoke'] = cell(c['real_ai']['s'] if c['real_ai']['s'] != 'proven' else 'proven',
                          'in the first-run smoke journey J01-J02 (real Claude on every main merge): ' + c['real_ai']['why'],
                          c['real_ai']['link'])
    else:
        c['smoke'] = cell('na', 'not part of the smoke set')

    if any_code:
        c['regression'] = cell('proven' if MAIN_OK else 'partial',
                               'its tests run on every PR and every main merge' + ('' if MAIN_OK else '; main run not green yet'),
                               MAIN_LINK)
    else:
        c['regression'] = cell('missing', 'no automated test, so nothing guards it')
    return c

out = []
for f in features:
    out.append({'milestone': f['milestone'], 'id': f['id'], 'journey': f['journey'], 'text': f['text'], 'cells': build(f)})

totals = {k: collections.Counter(r['cells'][k]['s'] for r in out) for k, _ in TYPES}
real_proven = sum(1 for r in out if r['cells']['real_ai']['s'] == 'proven')
all_proven = sum(1 for r in out if all(r['cells'][k]['s'] in ('proven', 'na') for k, _ in TYPES))
meta = {'main_sha': MAIN_SHA, 'main_ci': suite['main_ci'], 'real_proven': real_proven, 'all_proven': all_proven,
        'types': TYPES, 'suite': list(suite.values())}

with open(P('docs/testing/coverage-matrix.json'), 'w', encoding='utf-8') as f:
    json.dump({'meta': meta, 'totals': totals, 'rows': out}, f, ensure_ascii=False, indent=1)
with open(P('docs/testing/coverage-matrix.tsv'), 'w', encoding='utf-8', newline='') as f:
    w = csv.writer(f, delimiter='\t')
    w.writerow(['milestone', 'id'] + [k for k, _ in TYPES] + ['evidence'])
    for r in out:
        w.writerow([r['milestone'], r['id']] + [r['cells'][k]['s'] for k, _ in TYPES] +
                   [' | '.join(f'{k}: {r["cells"][k]["link"]}' for k, _ in TYPES if r['cells'][k]['link'] and r['cells'][k]['s'] != 'na')])

ICON = {'proven': 'P', 'partial': '~', 'missing': '-', 'fail': 'X', 'na': '.'}
with open(P('docs/testing/coverage-matrix.md'), 'w', encoding='utf-8') as f:
    f.write('# Test coverage matrix (generated, do not edit by hand)\n\n')
    f.write(f'Built by `python3 docs/testing/build_matrix.py` against main `{MAIN_SHA}` (main CI: {suite["main_ci"]["state"]}, {MAIN_LINK}).\n\n')
    f.write('Rule: **proven** = a passing run on current main is linked. Older builds, PR branches and real-PC reports without a log count as partial.\n\n')
    f.write(f'- Features proven with real AI on current main: **{real_proven} of {len(out)}**\n')
    f.write(f'- Features proven by every test type that applies: **{all_proven} of {len(out)}**\n\n')
    f.write('| Test type | proven | partial | fails | missing | not applicable |\n|---|---|---|---|---|---|\n')
    for k, name in TYPES:
        t = totals[k]
        f.write(f'| {name} | {t["proven"]} | {t["partial"]} | {t["fail"]} | {t["missing"]} | {t["na"]} |\n')
    f.write('\nKey: P proven, ~ partial, X fails, - missing, . not applicable. Reasons and links per cell: coverage-matrix.json.\n\n')
    f.write('| Id | M | ' + ' | '.join(k for k, _ in TYPES) + ' |\n|' + '---|' * (len(TYPES) + 2) + '\n')
    for r in out:
        f.write(f'| {r["id"]} | {r["milestone"]} | ' + ' | '.join(ICON[r['cells'][k]['s']] for k, _ in TYPES) + ' |\n')
print(json.dumps({'real_proven': real_proven, 'all_proven': all_proven,
                  'totals': {k: dict(v) for k, v in totals.items()}}, indent=0))

# Long form for the coverage page: one row per feature x test type.
AREA = lambda r: ('P1 polish' if r['milestone'] == 'M9' and 'AT-300' <= r['id'][:6] <= 'AT-327' else
                  'Kit and AI pages' if r['milestone'] == 'M9' and r['id'][:6] >= 'AT-340' else
                  {'M2': 'Messages', 'M3': 'Replies', 'M4': 'Jobs', 'M5': 'Cards and approvals', 'M6': 'Memory',
                   'M8': 'Connectors', 'M9': 'Web and booking'}[r['milestone']])
with open(P('docs/testing/coverage-cells.tsv'), 'w', encoding='utf-8', newline='') as f:
    w = csv.writer(f, delimiter='\t')
    w.writerow(['feature', 'milestone', 'area', 'type_order', 'type', 'status', 'why', 'link', 'text'])
    for r in out:
        for n, (k, name) in enumerate(TYPES):
            c = r['cells'][k]
            w.writerow([r['id'], r['milestone'], AREA(r), n, name, c['s'], c['why'], c['link'],
                        re.sub(r'\s+', ' ', r['text'])[:160]])
