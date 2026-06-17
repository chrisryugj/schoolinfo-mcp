# 2028 권역별 대학별 권장과목 xlsx → admission.json 생성기.
# 대학마다 기재 형식이 제각각이라 원문 텍스트를 충실히 보존(core/recommended/note 문자열).
# xlsx에 없는 연세·성균관은 기존 공동안내(2022) 데이터로 보완.
import openpyxl, json, collections, re, sys, os

XLSX = os.path.expanduser("~/Downloads/2028학년도 권역별 대학별 권장과목(반영과목).xlsx")
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "admission.json")
JOINT_SRC = os.path.join(os.path.dirname(__file__), "..", "src", "admission.joint.json")

def clean(v):
    if v is None: return ""
    s = str(v).replace("\r", "").strip()
    s = re.sub(r"[ \t]*\n[ \t]*", " · ", s)   # 셀 내 줄바꿈 → ' · '
    s = re.sub(r"\s{2,}", " ", s).strip()
    s = re.sub(r"^[-·\s]+", "", s)            # 선두 '-'/'·' 제거
    return s

def is_guidance(s):
    # 과목 나열이 아니라 '진로·적성 고려' 류 안내문이면 core가 아니라 note로
    return any(k in s for k in ["고려하여", "선택 이수", "구분 없이", "적성을 고려", "진로 및 적성", "진로와 적성"])

def dash(s):
    return "" if s in ("-", "—", "") else s

wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
rows = list(wb["Sheet1"].iter_rows(values_only=True))[4:]

unis = collections.OrderedDict()
cur = {"region": "", "area": "", "uni": "", "college": ""}
for r in rows:
    region = clean(r[0]) or cur["region"]
    area = clean(r[1]) or cur["area"]
    uni = (str(r[2]).replace("\n", "").strip() if r[2] else "") or cur["uni"]
    # 모집단위는 col3(계열/단과대) + col4(학과)로 나뉨. 학과(col4)가 있으면 그게 모집단위,
    # 단과대(col3)는 분류로. col3는 여러 학과 행에 걸쳐 병합될 수 있어 carry-forward.
    c3 = clean(r[3])
    c4 = clean(r[4])
    if c4:
        college = c3 or cur["college"]
        unit = c4
    else:
        college = ""
        unit = c3
    cur.update(region=region, area=area, uni=uni, college=(college or cur["college"] if c4 else ""))
    if not uni or not unit:
        continue
    core = dash(clean(r[5]))
    rec = dash(clean(r[6]))
    note = dash(clean(r[7]))
    if core and is_guidance(core):
        note = (core + ("  " + note if note else "")).strip()
        core = ""
    if rec and is_guidance(rec):
        note = ((note + "  ") if note else "") + rec
        rec = ""
    key = uni
    if key not in unis:
        unis[key] = {"name": uni, "region": region, "area": area,
                     "source": "2028학년도 권역별 대학별 권장과목(반영과목)",
                     "majors": []}
    m = {"unit": unit, "core": core, "recommended": rec, "note": note}
    if college:
        m["college"] = college
    unis[key]["majors"].append(m)

universities = list(unis.values())

# ── 연세·성균관 보완: 기존 공동안내(2022) → 문자열 스키마로 변환 ──
have = {re.sub(r"[\s·]", "", u["name"]).replace("대학교", "").replace("대학", "").replace("대", "") for u in universities}
if os.path.exists(JOINT_SRC):
    joint = json.load(open(JOINT_SRC, encoding="utf-8"))
    for uniName in joint["universities"]:
        k = re.sub(r"[\s·]", "", uniName).replace("대학교", "").replace("대학", "").replace("대", "")
        if k in have:
            continue  # xlsx에 이미 있으면 2028 우선
        majors = []
        for f in joint["fields"]:
            for unit in f["units"].get(uniName, []):
                majors.append({
                    "unit": unit, "college": f["name"],
                    "core": ", ".join(f["core"]),
                    "recommended": ", ".join(f["recommended"]),
                    "note": "",
                })
        if majors:
            universities.append({
                "name": uniName, "region": "수도권", "area": "서울",
                "source": joint["source"], "sourceUrl": joint.get("sourceUrl"),
                "guide": joint.get("guide"),
                "majors": majors,
            })

db = {
    "version": "2028",
    "updated": "2025-06",
    "note": "대학 모집단위별 전공 연계 권장(반영) 이수과목. '핵심과목'은 필수적 이수 권장, '권장과목'은 가급적 이수 권장, '기준'은 과목 수·순위 등 대학 부가 안내. 대학마다 기재 형식이 달라 원문을 충실히 보존했습니다. 미기재 모집단위는 진로·적성에 따른 선택과목 이수 권장.",
    "sources": [
        "2028학년도 권역별 대학별 권장과목(반영과목) — 47개 대학",
        "경희·고려·성균관·연세·중앙 공동 「대학 자연계열 전공 학문 분야의 교과 이수 권장과목 안내」(2022) — 연세·성균관 보완",
    ],
    "universities": universities,
}
json.dump(db, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("대학 수:", len(universities))
print("총 모집단위:", sum(len(u["majors"]) for u in universities))
print("권역:", collections.Counter(u["region"] for u in universities))
