import re, json, datetime, unicodedata, shutil
from pathlib import Path
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'source.xlsx'
DATA_JS = ROOT / 'data.js'
OUT = DATA_JS

PREFIX = 'window.RP_DATA = '
raw = DATA_JS.read_text(encoding='utf-8').strip()
base = json.loads(raw[len(PREFIX):].rstrip(';'))

STORY_ORDER = base.get('storyOrder') or [
    '떡잎마을','진실호수','201번도로','잔모래마을','202번도로','축복시티','축복시티 트레이너 스쿨',
    '203번도로','무쇠게이트','무쇠시티','무쇠박물관','207번도로','204번도로','험한샛길','꽃향기마을','골짜기발전소','골풀무제철소','205번도로','영원의 숲','숲의 양옥집','영원시티','갤럭시단 영원 빌딩','206번도로','미혹의 동굴','천관산','208번도로','연고시티','209번도로','로스트타워','신수마을','신수유적','210번도로','봉신마을','215번도로','장막시티','214번도로','입지호수근처','입지호수','입지호수의 공동','213번도로','들판시티','212번도로','포켓몬저택','자랑의 뒷마당','218번도로','운하시티','강철섬','진실호수의 공동','216번도로','217번도로','예지호수근처','예지호수','예지호수의 공동','선단시티','선단신전','갤럭시단 장막 빌딩','갤럭시단 본부','창기둥','깨어진세계','222번도로','물가시티','223번수로','챔피언로드','포켓몬리그','224번도로','만월섬','신월섬','시작의 방','꽃의 낙원','배틀존','파이트에리어','225번도로','서바이벌에리어','226번수로','227번도로','하드마운틴','228번도로','229번도로','리조트에리어','230번수로','NPC 교환','특수 이벤트'
]
VALID_TYPES = {'노말','불꽃','물','풀','전기','얼음','격투','독','땅','비행','에스퍼','벌레','바위','고스트','드래곤','악','강철','페어리'}
REF_RE = re.compile(r'#\s*(\d{1,4})\s*([^\s\n#\(\),，:：\[\]]+)')
METHOD_PREFIXES = ('풀','동굴','파도타기','낚싯대','포켓트레','달콤한꿀','고정','선물','조우 방법','마박사','카우걸에게 받은 알','땅','물','바위깨기','낡은낚싯대','좋은낚싯대','대단한낚싯대','무리','대량발생','로밍','락클라임','정전기 조우')
LOCATION_KEYWORDS = ('번도로','번수로','시티','마을','호수','숲','게이트','동굴','산','섬','유적','신전','저택','발전소','제철소','에리어','로드','낙원','세계','샛길','타워','고개','리그','사파리','리조트','하드마운틴','챔피언','방','본부','빌딩','트레이너 스쿨','꽃밭','탄갱')
WILD_METHOD_RE = re.compile(r'^(풀|동굴|파도타기|낚싯대|낡은낚싯대|좋은낚싯대|대단한낚싯대|포켓트레|달콤한꿀|땅|물|바위깨기|대량발생|무리)')
EVENT_TEXT_RE = re.compile(r'(고정\s*심볼|조우\s*방법|상세\s*조건|선물|특수|이벤트|NPC|교환|알\s*선물|포털|획득처|획득\s*방법|카우걸|주피터|난천|정전기 조우)')
STAT_WORDS = {'HP','공격','방어','특공','특방','스피드','합계','특성','도구 없음'}
LEGENDARY_IDS = {144,145,146,150,151,243,244,245,249,250,251,377,378,379,380,381,382,383,384,385,386,480,481,482,483,484,485,486,487,488,489,490,491,492,493}


def clean(v):
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    if isinstance(v, int):
        return str(v)
    if isinstance(v, datetime.datetime):
        if v.year == 2025:
            a, b = sorted([v.month, v.day])
            return f'{a}-{b}'
        return v.strftime('%Y-%m-%d')
    s = str(v).replace('\n', ' ').strip()
    s = ''.join(ch for ch in s if unicodedata.category(ch)[0] != 'C')
    s = re.sub(r'\s+', ' ', s)
    s = s.replace('：', ':').replace('레벨.', '레벨:').replace('위치 :', '위치:')
    s = s.replace('(!)', '').strip()
    s = re.sub(r'\s+([,.])', r'\1', s)
    if s == '#NAME?':
        return ''
    if s.endswith('.0') and re.match(r'^-?\d+\.0$', s):
        s = s[:-2]
    return s

def refs_in(v):
    s = clean(v)
    out = []
    for m in REF_RE.finditer(s):
        no = int(m.group(1))
        name = m.group(2).strip()
        if 1 <= no <= 493:
            out.append((no, name))
    return out

def parse_ref(v):
    refs = refs_in(v)
    return refs[0] if refs else None

def looks_method(s):
    s = clean(s)
    if not s: return False
    return s.startswith(METHOD_PREFIXES) or any(k in s for k in ['조우','획득처','획득 방법','낚싯대','포켓트레','상세 조건','카우걸','주피터','난천'])

def looks_location(s):
    s = clean(s)
    if not s or s.startswith('-') or s.startswith('#') or '출현 포켓몬' in s:
        return False
    if re.match(r'^위치\s*:', s):
        return True
    if s in ('엔딩 후','깨어진세계','꽃의 낙원','시작의 방','배틀존','NPC 교환','특수 이벤트'):
        return True
    return any(k in s for k in LOCATION_KEYWORDS)

def normalize_location(s):
    s = clean(s)
    s = re.sub(r'^위치\s*:\s*', '', s).strip()
    s = s.replace(' ~ ', ' ~ ').strip()
    if s == '트레이너 스쿨':
        return '축복시티 트레이너 스쿨'
    if '영원시티. 어디서든 부화' in s:
        return '영원시티'
    if '포켓몬저택. 어디서든 부화' in s:
        return '포켓몬저택'
    if '신수마을. 어디서든 부화' in s:
        return '신수마을'
    return s or '특수 이벤트'

def base_location(s):
    s = normalize_location(s)
    s = re.sub(r'\s*\([^)]*\)', '', s)
    s = re.sub(r'\s*[~/].*$', '', s)
    s = re.sub(r'\.\s*어디서든.*$', '', s)
    return s.strip()

def story_rank(name):
    b = base_location(name)
    for i, key in enumerate(STORY_ORDER):
        if b == key or b.startswith(key) or key in b or key in name:
            return i
    return 9999

def clean_note(text=''):
    text = clean(text)
    text = re.sub(r'^[-•]\s*', '', text).strip()
    text = re.sub(r'\s+', ' ', text)
    text = text.replace('포켓몬 센터', '포켓몬센터')
    return text.rstrip('.')

def clean_method(method):
    m = clean(method)
    m = m.replace('획득 방법 상세:', '상세 조건').replace('조우 방법 상세:', '상세 조건')
    m = m.replace('선물 획득처:', '선물')
    m = re.sub(r'\s+', ' ', m).strip(' :')
    if m == '상세 조건 확인':
        return '상세 조건'
    return m or '상세 조건'

def is_event_like(location, method, source=''):
    txt = f'{location} {method} {source}'
    if source in ('GiFTSEVENTS','NPCTRADES'):
        return True
    if EVENT_TEXT_RE.search(txt):
        return True
    # If the current location is itself a method-like heading, it should not be treated as a wild region.
    if WILD_METHOD_RE.match(clean(location)):
        return False
    if '고정' in clean(location) or '조우' in clean(location):
        return True
    return False

def add_unique(arr, e):
    e = dict(e)
    e['location'] = normalize_location(e.get('location'))
    e['method'] = clean_method(e.get('method'))
    e['notes'] = [clean_note(n) for n in (e.get('notes') or []) if clean_note(n)]
    e['level'] = clean(e.get('level'))
    e['rates'] = [r for r in (e.get('rates') or []) if clean(r.get('value')) and clean(r.get('value')) != '0']
    key = (e.get('pokemonId'), e.get('category'), e['location'], e['method'], e.get('level',''), tuple(e['notes']), tuple((r.get('label',''),r.get('value','')) for r in e.get('rates') or []))
    seen = getattr(add_unique, 'seen', set())
    if key not in seen:
        seen.add(key); setattr(add_unique, 'seen', seen); arr.append(e)

def infer_event_method(notes, loc, level, raw_anchor=''):
    text = ' '.join([raw_anchor, loc or '', level or '', *notes])
    if '알' in text and ('부화' in text or '알' in raw_anchor or '알을' in text):
        return '알 선물'
    if '포털' in text:
        return '포털 조우'
    if '교환' in text:
        return 'NPC 교환'
    if '조우' in text or '배틀' in text or '고정 심볼' in text:
        return '특수 이벤트'
    return '선물'

def extract_level(texts):
    candidates = []
    for dist,t in texts:
        m = re.search(r'레벨\s*[:.]\s*([0-9]+)', t)
        if m:
            candidates.append((dist,m.group(1)))
        elif re.fullmatch(r'Lv\.?\s*([0-9]+)', t):
            candidates.append((dist,re.sub(r'\D','',t)))
    return sorted(candidates)[0][1] if candidates else ''

# Load workbook
wb = load_workbook(SOURCE, data_only=True)
pokemons = base['pokemons']
pokemon_by_id = {p['id']: p for p in pokemons}

# --- Parse ENCOUNTERS: wild only for route filters; event-like rows are fallback only. ---
enc_wild, enc_special = [], []
add_unique.seen = set()
ws = wb['ENCOUNTERS']
for c in range(5, ws.max_column + 1, 7):
    current_location = ''
    current_method = ''
    current_headers = ['아침','낮','밤']
    initial = clean(ws.cell(2,c).value)
    if looks_location(initial):
        current_location = normalize_location(initial)
    for r in range(2, ws.max_row + 1):
        first = clean(ws.cell(r,c).value)
        ref = parse_ref(ws.cell(r,c+1).value)
        if first and not parse_ref(first) and not ref:
            if looks_method(first):
                current_method = first
                h = [clean(ws.cell(r, c+i).value) for i in range(3,6)]
                mapper = {'M':'아침','D':'낮','N':'밤','O':'낡은낚싯대','G':'좋은낚싯대','S':'대단한낚싯대'}
                h = [mapper.get(x,x) for x in h if x]
                current_headers = h if h else ['아침','낮','밤']
            elif looks_location(first):
                current_location = normalize_location(first)
                current_method = ''
                current_headers = ['아침','낮','밤']
            continue
        if ref:
            no, _ = ref
            if no not in pokemon_by_id: continue
            level = clean(ws.cell(r,c+2).value)
            rates = []
            for i, head in zip(range(3,6), current_headers[:3]):
                rv = clean(ws.cell(r,c+i).value)
                if rv and rv not in ('0','-'):
                    rates.append({'label': head, 'value': rv})
            method = clean_method(current_method or '야생 출현')
            loc = normalize_location(current_location or '')
            category = 'event' if is_event_like(loc, method, 'ENCOUNTERS') else 'wild'
            if loc == '미분류 지역' and category == 'wild':
                continue
            entry = {'pokemonId': no, 'pokemonName': pokemon_by_id[no]['name'], 'location': loc or '미분류 지역', 'method': method, 'level': level, 'rates': rates, 'source':'ENCOUNTERS', 'category': category, 'notes': []}
            add_unique(enc_special if category == 'event' else enc_wild, entry)

# --- Parse GiFTSEVENTS robustly. ---
gifts = []
add_unique.seen = set()
if 'GiFTSEVENTS' in wb.sheetnames:
    ws = wb['GiFTSEVENTS']
    anchors_by_col = {}
    anchor_cells = []
    for r in range(1, ws.max_row + 1):
        for c in range(1, ws.max_column + 1):
            t = clean(ws.cell(r,c).value)
            if not t or t.startswith('-'):
                continue
            refs = refs_in(t)
            if not refs:
                continue
            # Event anchors are compact target declarations, not prose or trainer rows.
            if not (t.startswith('#') or t.startswith('알 of #') or re.match(r'^#\d', t)):
                continue
            # Skip broad trainer party/stat cells if they clearly look like a trainer table and have no event context later.
            ids = [no for no,_ in refs if no in pokemon_by_id]
            if not ids:
                continue
            anchor_cells.append((r,c,t,ids))
            anchors_by_col.setdefault(c, []).append(r)

    def block_bounds(r,c):
        rows = sorted(anchors_by_col.get(c, []))
        prevs = [x for x in rows if x < r]
        nexts = [x for x in rows if x > r]
        # Event blocks normally keep location/notes in the same row or below the target.
        # Looking too far above merges the previous legendary event into the next one.
        top = max(1, r - 6)
        bottom = min(ws.max_row, (nexts[0] - 1) if nexts else r + 16)
        return top, bottom

    for r,c,anchor_text,ids in anchor_cells:
        top,bottom = block_bounds(r,c)
        # In GiFTSEVENTS, the target is usually in column C; its location is in C-1,
        # its level is often in C+5, and long instructions are mainly in C-1 or C+6.
        # Restricting to these columns prevents adjacent legendary/event blocks from merging.
        structural_cols = {x for x in (c-1, c, c+5, c+6) if 1 <= x <= ws.max_column}
        note_cols = {x for x in (c-1, c, c+6) if 1 <= x <= ws.max_column}

        # First pass: choose the location belonging to this anchor and derive a local segment.
        loc_rows = []
        for rr in range(top, bottom+1):
            for cc in sorted(note_cols | {c-1, c}):
                if not (1 <= cc <= ws.max_column):
                    continue
                t = clean(ws.cell(rr,cc).value)
                if re.match(r'^위치\s*:', t):
                    loc_rows.append((abs(rr-r)+abs(cc-c), rr, cc, normalize_location(t)))
        selected_loc = sorted(loc_rows)[0] if loc_rows else None
        if selected_loc:
            _, loc_row, loc_col, loc_value = selected_loc
            # Stop before the next location marker in the same detail columns. This prevents
            # e.g. the baby-egg block from swallowing the following starter/fossil block.
            next_locs = [rr for _, rr, cc, _ in loc_rows if rr > loc_row and cc in note_cols]
            seg_top = max(top, min(r, loc_row) - 2)
            seg_bottom = min(bottom, (min(next_locs) - 1) if next_locs else bottom)
        else:
            loc_row, loc_col, loc_value = r, c, '특수 이벤트'
            seg_top, seg_bottom = top, bottom

        loc_candidates = []
        level_texts = []
        raw_notes_by_id = {no: [] for no in ids}
        nearby_labels = []
        for rr in range(seg_top, seg_bottom+1):
            for cc in sorted(structural_cols | note_cols):
                t = clean(ws.cell(rr,cc).value)
                if not t or t in STAT_WORDS:
                    continue
                dist = abs(rr-r) + abs(cc-c)
                if re.match(r'^위치\s*:', t):
                    loc_candidates.append((dist, normalize_location(t)))
                    continue
                if re.match(r'^레벨\s*[:.]', t):
                    level_texts.append((dist, t))
                    continue
                if ('선물 포켓몬' in t or '특수 조우' in t or '전설의 포켓몬' in t or '알 선물' in t):
                    nearby_labels.append(t)
                    continue
                if cc not in note_cols:
                    continue
                # Bullet notes contain the detailed event route. Include if target-relevant.
                if t.startswith('-'):
                    note_refs = [no for no,_ in refs_in(t)]
                    for no in ids:
                        # Include generic notes in the selected event segment, or notes that mention this target.
                        if note_refs and no not in note_refs:
                            continue
                        note = clean_note(t)
                        if note and note not in raw_notes_by_id[no]:
                            raw_notes_by_id[no].append(note)
        loc = sorted(loc_candidates)[0][1] if loc_candidates else '특수 이벤트'
        lvl = extract_level(level_texts)
        for no in ids:
            notes = raw_notes_by_id.get(no, [])
            # Drop trainer/stat anchors that do not have enough event semantics.
            if loc == '특수 이벤트' and not notes and no not in LEGENDARY_IDS:
                continue
            method = infer_event_method(notes, loc, lvl, ' '.join([anchor_text, *nearby_labels]))
            add_unique(gifts, {'pokemonId': no, 'pokemonName': pokemon_by_id[no]['name'], 'location': loc, 'method': method, 'level': lvl, 'rates': [], 'source':'GiFTSEVENTS', 'category':'event', 'notes': notes[:12]})

# --- NPC trades as events. ---
trades = []
add_unique.seen = set()
if 'NPCTRADES' in wb.sheetnames:
    ws = wb['NPCTRADES']
    last_loc = ''
    for r in range(1, ws.max_row + 1):
        row_locs = []
        for c in range(1, 12):
            t = clean(ws.cell(r,c).value)
            if looks_location(t):
                row_locs.append(normalize_location(t))
        if row_locs:
            last_loc = row_locs[-1]
        for c in range(1, ws.max_column + 1):
            t = clean(ws.cell(r,c).value)
            if '받는 교환' not in t:
                continue
            m = re.search(r'(.+?)를 주고 (.+?)를 받는 교환', t)
            received = m.group(2).strip() if m else ''
            target_id = None
            for p in pokemons:
                if p['name'] == received or p['name'] in received:
                    target_id = p['id']; break
            if not target_id:
                continue
            add_unique(trades, {'pokemonId': target_id, 'pokemonName': pokemon_by_id[target_id]['name'], 'location': last_loc or 'NPC 교환', 'method': 'NPC 교환', 'level':'', 'rates': [], 'source':'NPCTRADES', 'category':'event', 'notes':[t]})

# Fallback ENCOUNTERS specials only when GiFTSEVENTS/Trade does not already describe that Pokémon at that location or when no event exists.
gift_event_keys = {(e['pokemonId'], base_location(e['location'])) for e in gifts + trades}
gift_ids = {e['pokemonId'] for e in gifts + trades}
enc_special_filtered = []
add_unique.seen = set()
for e in enc_special:
    # If event sheet has the Pokémon, prefer the richer event data. This prevents fixed-symbol rows from appearing as "출현지역".
    if e['pokemonId'] in gift_ids:
        continue
    # Keep only meaningful fixed-symbol/roaming rows; skip malformed method/location combos.
    if not is_event_like(e.get('location'), e.get('method'), e.get('source')):
        continue
    e = dict(e)
    e['source'] = 'ENCOUNTERS_SPECIAL'
    e['category'] = 'event'
    if '고정' in e.get('location',''):
        e['method'] = '고정 심볼 조우'
        e['notes'] = [e.get('location')]
        e['location'] = '특수 이벤트'
    add_unique(enc_special_filtered, e)

# Merge data.
all_encounters = []
add_unique.seen = set()
for e in enc_wild + gifts + trades + enc_special_filtered:
    add_unique(all_encounters, e)

# Assign locations to pokemon.
for p in pokemons:
    p['locations'] = []
for e in all_encounters:
    p = pokemon_by_id.get(e['pokemonId'])
    if p:
        p['locations'].append(e)
for p in pokemons:
    seen = set(); locs=[]
    for e in sorted(p['locations'], key=lambda e: (0 if e.get('category') == 'wild' else 1, story_rank(e['location']), e['location'], e['method'], e.get('level',''))):
        key = (e.get('category'), e['location'], e['method'], e.get('level',''), tuple(e.get('notes') or []))
        if key not in seen:
            seen.add(key); locs.append(e)
    p['locations'] = locs

# Wild locations only for the dex region buttons.
loc_map = {}
for e in all_encounters:
    if e.get('category') != 'wild':
        continue
    loc = e.get('location') or '미분류 지역'
    if loc == '미분류 지역':
        continue
    loc_map.setdefault(loc, {'name': loc, 'order': story_rank(loc), 'encounters': []})['encounters'].append(e)
locations = sorted(loc_map.values(), key=lambda x: (x['order'], x['name']))

# Manual v17 corrections requested by user.
ability_replacements = {
    '대짱이': {'습기': '쓱쓱'},
    '나무킹': {'곡예': '색안경'},
    '초염몽': {'철주먹': '스킬링크'},
    '엘레이드': {'불굴의마음': '적응력'},
    '엠페르트': {'의기양양': '클리어바디'},
}
for p in pokemons:
    repl = ability_replacements.get(p['name'])
    if repl:
        p['abilities'] = [repl.get(a, a) for a in (p.get('abilities') or [])]
    # Move rename: 혼내기 -> 더블촙.
    for bucket in (p.get('learnset') or {}).values():
        for m in bucket:
            if m.get('move') == '혼내기':
                m['move'] = '더블촙'
                m['note'] = (m.get('note') or '변경').strip() or '변경'

# Recursive text replacement in items/changes too.
def deep_replace(obj):
    if isinstance(obj, str):
        return obj.replace('혼내기', '더블촉').replace('더블촉', '더블촑').replace('더블촑', '더블촙')
    if isinstance(obj, list):
        return [deep_replace(x) for x in obj]
    if isinstance(obj, dict):
        return {k: deep_replace(v) for k,v in obj.items()}
    return obj

base['items'] = deep_replace(base.get('items', []))
base['changes'] = deep_replace(base.get('changes', []))

# Add user-specified move/ability change notes to the readable Changes tab.
manual_changes = [
    {'category':'기술/특성 변경점','title':'기술명 변경: 혼내기 → 더블촙','body':'기술 "혼내기"의 표시명을 "더블촙"으로 정리했습니다. 배우는 기술 목록에서도 더블촙으로 표시됩니다.'},
    {'category':'기술/특성 변경점','title':'손바닥치기 위력 변경','body':'손바닥치기의 위력이 15에서 25로 조정되었습니다.'},
    {'category':'기술/특성 변경점','title':'특성 변경: 대짱이','body':'대짱이의 특성 "습기"가 "쓱쓱"으로 변경되었습니다.'},
    {'category':'기술/특성 변경점','title':'특성 변경: 나무킹','body':'나무킹의 특성 "곡예"가 "색안경"으로 변경되었습니다.'},
    {'category':'기술/특성 변경점','title':'특성 변경: 초염몽','body':'초염몽의 특성 "철주먹"이 "스킬링크"로 변경되었습니다.'},
    {'category':'기술/특성 변경점','title':'특성 변경: 엘레이드','body':'엘레이드의 특성 "불굴의마음"이 "적응력"으로 변경되었습니다.'},
    {'category':'기술/특성 변경점','title':'특성 변경: 엠페르트','body':'엠페르트의 특성 "의기양양"이 "클리어바디"로 변경되었습니다.'},
]
existing_change_keys = {(c.get('category'), c.get('title')) for c in base.get('changes', [])}
for ch in manual_changes:
    if (ch['category'], ch['title']) not in existing_change_keys:
        base.setdefault('changes', []).append(ch)

# Final data object.
base['pokemons'] = sorted(pokemons, key=lambda p: p['id'])
base['locations'] = locations
base['encounters'] = all_encounters
base['meta'] = dict(base.get('meta') or {})
base['meta'].update({
    'sourceWorkbook': '레니게이드_플레티넘_정보_2차_문장번역.xlsx',
    'pokemonCount': len(pokemons),
    'wildEncounterCount': len(enc_wild),
    'giftEventCount': len(gifts) + len(trades),
    'eventFallbackCount': len(enc_special_filtered),
    'locationCount': len(locations),
    'spriteSource': 'DP 앞모습 스프라이트',
    'version': 'v17-event-only-fixed'
})

OUT.write_text(PREFIX + json.dumps(base, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
print(base['meta'])
for no in [245,151,94,175,6,260,254,392,475,395]:
    p = pokemon_by_id.get(no)
    if not p: continue
    print('\n',no,p['name'],p.get('types'),p.get('abilities'))
    for e in p.get('locations', [])[:8]:
        print(' ', e.get('category'), e.get('source'), e.get('location'), e.get('method'), e.get('level'), e.get('notes')[:3])
