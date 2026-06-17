# admission.json 무결성·정합성 검증 — 원본 xlsx와 독립 대조.
import openpyxl, json, collections, re, os, sys

XLSX = os.path.expanduser("~/Downloads/2028학년도 권역별 대학별 권장과목(반영과목).xlsx")
JSON_PATH = os.path.join(os.path.dirname(__file__), "..", "src", "admission.json")

def clean(v):
    if v is None: return ""
    s = str(v).replace("\r", "").strip()
    s = re.sub(r"[ \t]*\n[ \t]*", " · ", s)
    s = re.sub(r"\s{2,}", " ", s).strip()
    s = re.sub(r"^[-·\s]+", "", s)
    return s

db = json.load(open(JSON_PATH, encoding="utf-8"))
errors, warns = [], []

# ── 0) JSON 자체 구조 ──
xlsx_unis = [u for u in db["universities"] if u["source"].startswith("2028")]
joint_unis = [u for u in db["universities"] if not u["source"].startswith("2028")]
print(f"JSON: 총 {len(db['universities'])}개 대학 (xlsx {len(xlsx_unis)} + 보완 {len(joint_unis)})")
print(f"     총 모집단위 {sum(len(u['majors']) for u in db['universities'])}개")

# ── 1) 원본 xlsx 독립 재계산: 대학별 모집단위 수 ──
wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
rows = list(wb["Sheet1"].iter_rows(values_only=True))[4:]
src_counts = collections.OrderedDict()
src_region = {}
cur_uni = ""
raw_unit_rows = 0
for r in rows:
    uni = (str(r[2]).replace("\n", "").strip() if r[2] else "") or cur_uni
    cur_uni = uni
    c3, c4 = clean(r[3]), clean(r[4])
    unit = c4 if c4 else c3
    if not uni or not unit:
        continue
    raw_unit_rows += 1
    src_counts[uni] = src_counts.get(uni, 0) + 1
    src_region.setdefault(uni, set()).add(clean(r[0]) if r[0] else "")

# ── 2) 대학별 모집단위 수 일치 ──
json_counts = {u["name"]: len(u["majors"]) for u in xlsx_unis}
for uni, sc in src_counts.items():
    jc = json_counts.get(uni)
    if jc is None:
        errors.append(f"[누락] 원본에 '{uni}'({sc}개) 있으나 JSON에 없음")
    elif jc != sc:
        errors.append(f"[불일치] {uni}: 원본 {sc} vs JSON {jc}")
for uni in json_counts:
    if uni not in src_counts:
        errors.append(f"[추가오류] JSON에 '{uni}' 있으나 원본에 없음")

print(f"\n원본 유효 모집단위 행: {raw_unit_rows} / JSON xlsx 모집단위: {sum(json_counts.values())}")

# ── 3) 필드 위생: 빈 unit, None/nan 문자열, 깨진 값 ──
for u in db["universities"]:
    for m in u["majors"]:
        for f in ("unit", "core", "recommended", "note"):
            v = m.get(f, "")
            if v in ("None", "nan", "-", "—"):
                errors.append(f"[위생] {u['name']} {m['unit']} .{f}={v!r}")
        if not m.get("unit", "").strip():
            errors.append(f"[빈 unit] {u['name']}")

# ── 4) 권역/지역 단일성 (carry-forward 오염 탐지) ──
for u in xlsx_unis:
    reg = src_region.get(u["name"], set())
    reg = {x for x in reg if x}
    if len(reg) > 1:
        warns.append(f"[권역 다중] {u['name']}: {reg}")

# ── 5) 내용 충실성: JSON core/rec/note가 원본 셀의 정제본인지 (대학별 1행 샘플) ──
sample_checked = 0
src_by_uni = collections.defaultdict(list)
cur_uni = ""
for r in rows:
    uni = (str(r[2]).replace("\n", "").strip() if r[2] else "") or cur_uni
    cur_uni = uni
    c3, c4 = clean(r[3]), clean(r[4])
    unit = c4 if c4 else c3
    if not uni or not unit: continue
    src_by_uni[uni].append({"unit": unit, "c5": clean(r[5]), "c6": clean(r[6]), "c7": clean(r[7])})
for u in xlsx_unis:
    src = src_by_uni.get(u["name"], [])
    if len(src) != len(u["majors"]):
        errors.append(f"[순서/수 불일치] {u['name']}")
        continue
    for sm, jm in zip(src, u["majors"]):
        if sm["unit"] != jm["unit"]:
            errors.append(f"[unit 순서] {u['name']}: 원본 {sm['unit']!r} vs JSON {jm['unit']!r}")
            break
        # core/rec/note 텍스트가 원본 3개 셀(c5,c6,c7)에서 유래했는지
        # (note는 c5 안내문+c7을 합칠 수 있으므로 구분자·공백 제거 후 대조)
        norm = lambda s: re.sub(r"[\s|·]", "", s)
        joined_src = norm(sm["c5"] + sm["c6"] + sm["c7"])
        for f in ("core", "recommended", "note"):
            val = norm(jm.get(f, ""))
            if val and val not in joined_src:
                errors.append(f"[내용유래오류] {u['name']} {jm['unit']} .{f}={jm.get(f)!r}")
                break
        sample_checked += 1

print(f"내용 대조 행: {sample_checked}")

# ── 6) 보완 대학 검증 ──
names = {u["name"] for u in db["universities"]}
key = lambda s: re.sub(r"[\s·]", "", s).replace("대학교","").replace("대학","").replace("대","")
keys = collections.Counter(key(n) for n in names)
dups = {k: c for k, c in keys.items() if c > 1}
if dups:
    errors.append(f"[대학 중복키] {dups}")
for need in ["연세대학교", "성균관대학교"]:
    if need not in names:
        warns.append(f"[보완 누락] {need} 없음")

# ── 결과 ──
print("\n=== 검증 결과 ===")
if errors:
    print(f"❌ 오류 {len(errors)}건:")
    for e in errors[:40]:
        print("  -", e)
else:
    print("✅ 오류 0건 — 원본과 완전 정합")
if warns:
    print(f"⚠️ 경고 {len(warns)}건:")
    for w in warns[:20]:
        print("  -", w)
sys.exit(1 if errors else 0)
