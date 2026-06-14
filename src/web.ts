// 웹 UI 페이지 (단일 HTML). 학부모용 — 시도/시군구/학교급 선택 → 학교 검색 → 수행평가.

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
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
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
      <div style="flex:3"><label>학교명 (일부만 입력해도 됨)</label><input id="name" placeholder="예: 개포중학교"/></div>
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

$('sido').onchange = () => {
  const sgg = REGIONS[$('sido').value] || [];
  $('sgg').innerHTML = '<option value="">전체</option>' + sgg.map(s => '<option>'+s+'</option>').join('');
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
    $('results').innerHTML = '<div class="card"><b>'+d.schools.length+'개 학교</b>' + d.schools.map(s => \`
      <div class="school">
        <h3>\${s.name}</h3>
        <div class="meta">\${s.foundation} · \${s.address} · ☎ \${s.tel||'-'}</div>
        <div class="acts">
          <button class="ghost" onclick="loadEval('\${esc(s.name)}')">📋 수행평가 계획</button>
          <button class="ghost" onclick="loadDigest('\${esc(s.name)}')">📊 핵심 공시</button>
          \${s.homepage?'<a href="'+s.homepage+'" target="_blank"><button class="ghost">🌐 홈페이지</button></a>':''}
        </div>
      </div>\`).join('') + '</div>';
  } catch(e) { $('results').innerHTML = '<div class="card">오류: '+e.message+'</div>'; }
};

function esc(s){ return s.replace(/'/g,"\\\\'"); }
function params(name){ return new URLSearchParams({sido:$('sido').value, sgg:$('sgg').value, kind:$('kind').value, name}); }

async function loadEval(name){
  $('output').innerHTML = '<div class="card spin">📋 '+name+' 수행평가 계획을 학교알리미에서 가져오는 중… (hwp 다운로드+변환, 10초 정도)</div>';
  try {
    const r = await fetch('/api/evaluation?'+params(name));
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    render('📋 '+d.school+' 수행평가 계획', d.markdown);
  } catch(e){ $('output').innerHTML='<div class="card">오류: '+e.message+'</div>'; }
}
async function loadDigest(name){
  $('output').innerHTML = '<div class="card spin">📊 '+name+' 공시정보를 가져오는 중…</div>';
  try {
    const r = await fetch('/api/digest?'+params(name));
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    render('📊 '+d.school+' 핵심 공시', d.markdown);
  } catch(e){ $('output').innerHTML='<div class="card">오류: '+e.message+'</div>'; }
}
function render(title, md){
  $('output').innerHTML = '<div class="card"><h2>'+title+'</h2><div class="out">'+marked.parse(md)+'</div></div>';
  $('output').scrollIntoView({behavior:'smooth'});
}
</script>
</body>
</html>`;
}
