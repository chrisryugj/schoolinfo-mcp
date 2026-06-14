// 웹 UI 페이지 (단일 HTML). 학부모용 — 시도/시군구/학교급 선택 → 학교 검색 → 수행평가.
//
// 보안: 외부(공공API/공문서) 데이터를 그대로 DOM에 넣지 않는다.
//  - 모든 동적 텍스트는 escapeHtml, href는 https 스킴만 허용
//  - 인라인 onclick 대신 data-* 속성 + 이벤트 위임 (값을 코드 컨텍스트에서 분리)
//  - 문서 마크다운은 DOMPurify로 정제 후 렌더

type Regions = Record<string, { code: string; sgg: Record<string, string> }>;

export function renderPage(regions: Regions, kinds: string[]): string {
  const regionsJson = JSON.stringify(
    Object.fromEntries(Object.entries(regions).map(([k, v]) => [k, Object.keys(v.sgg)]))
  );
  const kindOpts = kinds.map((k) => `<option>${k}</option>`).join("");
  const sidoOpts = Object.keys(regions).map((s) => `<option>${s}</option>`).join("");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>우리 학교 알리미 — 수행평가·공시정보</title>
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<style>
  :root { --bg:#f7f7fb; --card:#fff; --line:#e6e6ef; --pri:#3d5afe; --ink:#1c1c28; --mut:#6b6b80; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:-apple-system,'Segoe UI',Roboto,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;
         background:var(--bg); color:var(--ink); line-height:1.6; }
  header { background:linear-gradient(135deg,#3d5afe,#7c4dff); color:#fff; padding:28px 20px; }
  header h1 { margin:0 0 4px; font-size:22px; }
  header p { margin:0; opacity:.9; font-size:14px; }
  .wrap { max-width:860px; margin:0 auto; padding:20px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:18px; margin-bottom:16px; }
  .row { display:flex; gap:10px; flex-wrap:wrap; }
  .row > * { flex:1; min-width:120px; }
  label { display:block; font-size:12px; color:var(--mut); margin-bottom:4px; }
  select, input { width:100%; padding:11px 12px; border:1px solid var(--line); border-radius:10px; font-size:15px; background:#fff; }
  button { background:var(--pri); color:#fff; border:0; border-radius:10px; padding:12px 18px; font-size:15px; font-weight:600; cursor:pointer; }
  button:disabled { opacity:.5; cursor:default; }
  button.ghost { background:#eef0ff; color:var(--pri); }
  .school { border:1px solid var(--line); border-radius:12px; padding:14px; margin-bottom:10px; }
  .school h3 { margin:0 0 6px; font-size:17px; }
  .school .meta { font-size:13px; color:var(--mut); margin-bottom:10px; }
  .school .acts { display:flex; gap:8px; flex-wrap:wrap; }
  .out { background:#fbfbfe; border:1px dashed var(--line); border-radius:12px; padding:16px; margin-top:10px; overflow-x:auto; }
  .out table { border-collapse:collapse; width:100%; font-size:13px; margin:8px 0; }
  .out th, .out td { border:1px solid var(--line); padding:6px 8px; text-align:left; }
  .out th { background:#f0f0f7; }
  .out h2 { font-size:18px; } .out h3 { font-size:15px; color:var(--pri); }
  .spin { color:var(--mut); font-size:14px; }
  footer { text-align:center; color:var(--mut); font-size:12px; padding:24px; }
  a { color:var(--pri); }
</style>
</head>
<body>
<header>
  <div class="wrap" style="padding:0">
    <h1>🏫 우리 학교 알리미</h1>
    <p>내 아이 학교의 <b>수행평가 계획</b>·급식·학생수를 한 번에 — 학교알리미 공시정보 기반</p>
  </div>
</header>
<div class="wrap">
  <div class="card">
    <div class="row">
      <div><label>시도</label><select id="sido"><option value="">선택</option>${sidoOpts}</select></div>
      <div><label>시군구</label><select id="sgg"><option value="">시도 먼저</option></select></div>
      <div><label>학교급</label><select id="kind">${kindOpts}</select></div>
    </div>
    <div class="row" style="margin-top:10px">
      <div style="flex:3"><label>학교명 (일부만 입력해도 됨)</label><input id="name" placeholder="예: 개포중학교" maxlength="40"/></div>
      <div style="flex:1; display:flex; align-items:flex-end"><button id="find" style="width:100%">학교 찾기</button></div>
    </div>
  </div>
  <div id="results"></div>
  <div id="output"></div>
</div>
<footer>데이터 출처: 학교알리미(schoolinfo.go.kr) · 공공누리 제1유형 · hwp 변환: kordoc</footer>

<script>
const REGIONS = ${regionsJson};
const $ = (id) => document.getElementById(id);

// HTML 컨텍스트 이스케이프 (& < > " ' 전부)
function h(s){ return String(s==null?"":s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
// 안전한 링크만 (http/https)
function safeUrl(u){ return /^https?:\\/\\//i.test(String(u||"")) ? u : ""; }
// 마크다운 → 정제된 HTML
function safeMd(md){
  const html = (window.marked ? marked.parse(md) : h(md));
  return (window.DOMPurify ? DOMPurify.sanitize(html, {ADD_TAGS:['details','summary']}) : h(md));
}

$('sido').onchange = () => {
  const sgg = REGIONS[$('sido').value] || [];
  $('sgg').innerHTML = '<option value="">전체</option>' + sgg.map(s => '<option>'+h(s)+'</option>').join('');
};

$('find').onclick = async () => {
  const sido=$('sido').value, sgg=$('sgg').value, kind=$('kind').value, name=$('name').value.trim();
  if (!sido || !sgg) { alert('시도와 시군구를 선택하세요'); return; }
  $('results').innerHTML = '<div class="card spin">학교를 찾는 중…</div>';
  $('output').innerHTML = '';
  try {
    const r = await fetch('/api/search?'+new URLSearchParams({sido,sgg,kind,name}));
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    if (!d.schools.length) { $('results').innerHTML='<div class="card">검색 결과가 없습니다.</div>'; return; }
    const cards = d.schools.map((s,i) => {
      const hp = safeUrl(s.homepage);
      return '<div class="school">'
        + '<h3>'+h(s.name)+'</h3>'
        + '<div class="meta">'+h(s.foundation)+' · '+h(s.address)+' · ☎ '+h(s.tel||'-')+'</div>'
        + '<div class="acts">'
        + '<button class="ghost" data-act="eval" data-name="'+h(s.name)+'">📋 수행평가 계획</button>'
        + '<button class="ghost" data-act="digest" data-name="'+h(s.name)+'">📊 핵심 공시</button>'
        + (hp ? '<a href="'+h(hp)+'" target="_blank" rel="noopener noreferrer"><button class="ghost">🌐 홈페이지</button></a>' : '')
        + '</div></div>';
    }).join('');
    $('results').innerHTML = '<div class="card"><b>'+d.schools.length+'개 학교</b>'+cards+'</div>';
  } catch(e) { $('results').innerHTML = '<div class="card">검색 중 오류가 발생했습니다.</div>'; }
};

// 이벤트 위임 — 인라인 핸들러 없이 data-* 로 동작
document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const name = b.getAttribute('data-name');
  const act = b.getAttribute('data-act');
  if (act === 'eval') loadEval(name);
  else if (act === 'digest') loadDigest(name);
  else if (act === 'evalSeq') loadEval(name, b.getAttribute('data-seq'));
  else if (act === 'evalAll') loadAllEval(name);
});

function params(name){ return new URLSearchParams({sido:$('sido').value, sgg:$('sgg').value, kind:$('kind').value, name}); }

async function loadEval(name, seq){
  const what = seq ? '선택한 과목을' : '수행평가 계획을';
  $('output').innerHTML = '<div class="card spin">📋 '+h(name)+' '+what+' 가져오는 중… (다운로드+변환, 5~10초)</div>';
  try {
    const p = params(name); if (seq) p.set('seq', seq);
    const r = await fetch('/api/evaluation?'+p);
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    if (d.mode === 'list') {
      const btns = d.files.map(f => '<button class="ghost" style="margin:4px 4px 0 0" data-act="evalSeq" data-name="'+h(name)+'" data-seq="'+h(f.seq)+'">'+h(f.filename.replace(/\\.(pdf|hwpx?|docx)$/i,''))+'</button>').join('');
      $('output').innerHTML = '<div class="card"><h2>📋 '+h(d.school)+' — 과목/문서 선택</h2>'
        + '<p class="spin">이 학교는 과목별로 평가계획이 나뉘어 있어요. 원하는 과목을 누르세요.</p>'
        + btns + '<div style="margin-top:8px"><button data-act="evalAll" data-name="'+h(name)+'">📚 전체 한꺼번에 보기</button></div></div>';
      $('output').scrollIntoView({behavior:'smooth'});
      return;
    }
    render('📋 '+h(d.school)+' 수행평가 계획', d.markdown);
  } catch(e){ $('output').innerHTML='<div class="card">조회 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.</div>'; }
}
async function loadAllEval(name){
  $('output').innerHTML = '<div class="card spin">📚 '+h(name)+' 전체 과목을 가져오는 중… (과목 수만큼 시간이 걸려요)</div>';
  try {
    const p = params(name); p.set('all','1');
    const r = await fetch('/api/evaluation?'+p);
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    render('📚 '+h(d.school)+' 수행평가 계획 (전체)', d.markdown);
  } catch(e){ $('output').innerHTML='<div class="card">조회 중 오류가 발생했습니다.</div>'; }
}
async function loadDigest(name){
  $('output').innerHTML = '<div class="card spin">📊 '+h(name)+' 공시정보를 가져오는 중…</div>';
  try {
    const r = await fetch('/api/digest?'+params(name));
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    render('📊 '+h(d.school)+' 핵심 공시', d.markdown);
  } catch(e){ $('output').innerHTML='<div class="card">조회 중 오류가 발생했습니다.</div>'; }
}
function render(titleHtml, md){
  $('output').innerHTML = '<div class="card"><h2>'+titleHtml+'</h2><div class="out">'+safeMd(md)+'</div></div>';
  $('output').scrollIntoView({behavior:'smooth'});
}
</script>
</body>
</html>`;
}
