// 웹 UI 페이지 (단일 HTML). 학부모용 — 학교 이름만으로(또는 지역 선택으로) 검색 → 수행평가·공시.
//
// 디자인: 애플 스타일 미니멀리즘 (시스템 폰트 SF Pro/Apple SD Gothic Neo, 프로스티드 글래스 네비,
//         시스템 그레이, 애플블루 액센트, 라이트/다크 자동). AI슬롭(보라 그라데이션) 제거.
// 모바일: 가로 스크롤 없음, 단어단위 줄바꿈(한국어 keep-all), 표는 카드 안에서만 스크롤,
//         입력 폰트 17px(iOS 자동확대 방지), safe-area 대응.
//
// 보안: 외부(공공API/공문서) 데이터를 그대로 DOM에 넣지 않는다.
//  - 모든 동적 텍스트는 escapeHtml, href는 같은 출처/https만 허용
//  - 인라인 onclick 대신 data-* 속성 + 이벤트 위임
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
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<meta name="theme-color" content="#fbfbfd" media="(prefers-color-scheme: light)"/>
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)"/>
<title>우리 학교 알리미 — 수행평가·공시정보</title>
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js" integrity="sha384-/TQbtLCAerC3jgaim+N78RZSDYV7ryeoBCVqTuzRrFec2akfBkHS7ACQ3PQhvMVi" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js" integrity="sha384-+VfUPEb0PdtChMwmBcBmykRMDd+v6D/oFmB3rZM/puCMDYcIvF968OimRh4KQY9a" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<style>
  :root{
    --bg:#fbfbfd; --bg2:#f5f5f7; --card:#ffffff; --elev:#ffffff;
    --ink:#1d1d1f; --ink2:#424245; --mut:#6e6e73; --line:#d2d2d7; --line2:#e8e8ed;
    --accent:#0071e3; --accent-ink:#fff; --chip:#f5f5f7; --chip-ink:#1d1d1f;
    --ok:#1d1d1f; --shadow:0 1px 3px rgba(0,0,0,.06),0 8px 28px rgba(0,0,0,.06);
    --nav:rgba(251,251,253,.72);
    --radius:18px; --radius-sm:12px;
  }
  @media (prefers-color-scheme: dark){
    :root{
      --bg:#000000; --bg2:#0a0a0a; --card:#1c1c1e; --elev:#1c1c1e;
      --ink:#f5f5f7; --ink2:#d6d6da; --mut:#98989d; --line:#38383a; --line2:#2a2a2c;
      --accent:#2997ff; --accent-ink:#fff; --chip:#2c2c2e; --chip-ink:#f5f5f7;
      --shadow:0 1px 3px rgba(0,0,0,.5),0 10px 30px rgba(0,0,0,.45);
      --nav:rgba(0,0,0,.6);
    }
  }
  *{box-sizing:border-box;}
  html,body{overflow-x:hidden;}
  html{-webkit-text-size-adjust:100%;}
  body{
    margin:0; background:var(--bg); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Apple SD Gothic Neo","Pretendard","Malgun Gothic",system-ui,sans-serif;
    line-height:1.5; word-break:keep-all; overflow-wrap:anywhere;
    -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
    letter-spacing:-0.01em;
  }
  /* 프로스티드 글래스 네비 (애플 nav) */
  .nav{
    position:sticky; top:0; z-index:50;
    background:var(--nav); backdrop-filter:saturate(180%) blur(20px); -webkit-backdrop-filter:saturate(180%) blur(20px);
    border-bottom:1px solid var(--line2);
    padding:calc(env(safe-area-inset-top) + 11px) 20px 11px;
  }
  .nav-in{max-width:760px; margin:0 auto; display:flex; align-items:center; gap:8px; font-weight:600; font-size:17px;}
  .nav-in .logo{font-size:19px;}
  main{max-width:760px; margin:0 auto; padding:0 20px calc(env(safe-area-inset-bottom) + 56px);}
  /* 히어로 */
  .hero{padding:46px 2px 26px;}
  .hero h1{
    margin:0 0 12px; font-size:clamp(28px,7vw,44px); line-height:1.08;
    font-weight:700; letter-spacing:-0.03em;
  }
  .hero p{margin:0; font-size:clamp(16px,3.6vw,19px); color:var(--mut); line-height:1.45;}
  /* 카드 */
  .card{
    background:var(--card); border:1px solid var(--line2); border-radius:var(--radius);
    padding:18px; margin-bottom:16px; box-shadow:var(--shadow);
  }
  /* 세그먼트 컨트롤 (iOS) */
  .seg{position:relative; display:flex; background:var(--bg2); border-radius:11px; padding:3px; margin-bottom:16px;}
  .seg button{
    flex:1; position:relative; z-index:2; background:transparent; border:0; cursor:pointer;
    padding:9px 8px; font-size:14px; font-weight:590; color:var(--ink2);
    border-radius:9px; transition:color .25s; font-family:inherit; -webkit-tap-highlight-color:transparent;
  }
  .seg button[aria-selected="true"]{color:var(--ink);}
  .seg .thumb{
    position:absolute; top:3px; left:3px; height:calc(100% - 6px); width:calc(50% - 3px);
    background:var(--card); border-radius:9px; box-shadow:0 1px 4px rgba(0,0,0,.12);
    transition:transform .28s cubic-bezier(.4,0,.2,1); z-index:1;
  }
  .seg .thumb.r{transform:translateX(100%);}
  /* 폼 */
  .row{display:flex; gap:10px; flex-wrap:wrap;}
  .row>*{flex:1; min-width:130px;}
  label{display:block; font-size:12px; font-weight:590; color:var(--mut); margin:0 0 6px 2px; letter-spacing:0;}
  select,input{
    width:100%; padding:13px 14px; border:1px solid var(--line); border-radius:var(--radius-sm);
    font-size:17px; background:var(--card); color:var(--ink); font-family:inherit; appearance:none; -webkit-appearance:none;
    transition:border-color .15s, box-shadow .15s;
  }
  select{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%236e6e73' d='M1 1l5 5 5-5'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 14px center; padding-right:34px;}
  input:focus,select:focus{outline:none; border-color:var(--accent); box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 18%,transparent);}
  .field-search{position:relative;}
  .field-search input{padding-left:42px;}
  .field-search .ic{position:absolute; left:15px; top:50%; transform:translateY(-50%); color:var(--mut); pointer-events:none; font-size:16px;}
  /* 버튼 (애플 pill) */
  .btn{
    display:inline-flex; align-items:center; justify-content:center; gap:6px;
    border:0; border-radius:980px; padding:12px 20px; font-size:15px; font-weight:600;
    cursor:pointer; font-family:inherit; -webkit-tap-highlight-color:transparent;
    transition:transform .08s ease, background .2s, opacity .2s; white-space:nowrap; text-decoration:none;
  }
  .btn:active{transform:scale(.97);}
  .btn-primary{background:var(--accent); color:var(--accent-ink);}
  .btn-primary:disabled{opacity:.45; cursor:default;}
  .btn-soft{background:var(--chip); color:var(--accent);}
  .btn-line{background:transparent; color:var(--ink2); border:1px solid var(--line);}
  .btn-sm{padding:9px 15px; font-size:14px;}
  .full{width:100%;}
  /* 최근 본 학교 */
  .recent{margin-bottom:18px;}
  .recent .head{font-size:13px; font-weight:600; color:var(--mut); margin:0 2px 9px; display:flex; justify-content:space-between; align-items:center;}
  .recent .head a{color:var(--accent); text-decoration:none; font-weight:500; cursor:pointer;}
  .chips{display:flex; gap:8px; overflow-x:auto; padding:2px 2px 4px; -webkit-overflow-scrolling:touch; scrollbar-width:none;}
  .chips::-webkit-scrollbar{display:none;}
  .chip{
    display:inline-flex; align-items:center; gap:8px; flex:0 0 auto; max-width:80vw;
    background:var(--card); border:1px solid var(--line); border-radius:980px;
    padding:8px 8px 8px 15px; font-size:14px; color:var(--chip-ink); cursor:pointer; box-shadow:var(--shadow);
    transition:transform .08s; white-space:nowrap;
  }
  .chip:active{transform:scale(.97);}
  .chip b{font-weight:590; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
  .chip .x{display:flex; width:22px; height:22px; align-items:center; justify-content:center; border-radius:50%; background:var(--bg2); color:var(--mut); font-size:13px; line-height:1;}
  /* 학교 결과 카드 */
  .school{padding:16px 0; border-bottom:1px solid var(--line2);}
  .school:last-child{border-bottom:0; padding-bottom:2px;}
  .school h3{margin:0 0 4px; font-size:18px; font-weight:600; letter-spacing:-0.02em;}
  .school .tag{display:inline-block; font-size:12px; font-weight:600; color:var(--accent); background:var(--chip); padding:2px 9px; border-radius:980px; margin-left:7px; vertical-align:middle; letter-spacing:0;}
  .school .meta{font-size:14px; color:var(--mut); margin:0 0 12px;}
  .acts{display:flex; gap:8px; flex-wrap:wrap;}
  .count{font-size:13px; font-weight:600; color:var(--mut); margin:0 2px 4px;}
  /* 출력(마크다운) */
  .result-head{display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:6px;}
  .result-head h2{margin:0; font-size:21px; font-weight:700; letter-spacing:-0.02em;}
  .dls{display:flex; gap:8px; flex-wrap:wrap; margin:12px 0 4px;}
  .out{margin-top:8px; font-size:15px; color:var(--ink2);}
  .out :first-child{margin-top:0;}
  .out h2{font-size:19px; color:var(--ink); margin:22px 0 8px; letter-spacing:-0.02em;}
  .out h3{font-size:16px; color:var(--ink); margin:18px 0 6px;}
  .out p{margin:8px 0;}
  .out ul,.out ol{padding-left:20px;}
  .out hr{border:0; border-top:1px solid var(--line2); margin:18px 0;}
  .out blockquote{margin:12px 0; padding:10px 14px; background:var(--bg2); border-radius:var(--radius-sm); color:var(--ink2); border-left:3px solid var(--accent);}
  .out details{margin:14px 0; border:1px solid var(--line2); border-radius:var(--radius-sm); padding:6px 14px; background:var(--bg2);}
  .out summary{cursor:pointer; font-weight:590; color:var(--ink); padding:6px 0;}
  /* 표: 카드 안에서만 가로 스크롤 (페이지는 안 넘침) */
  .tablewrap{overflow-x:auto; -webkit-overflow-scrolling:touch; margin:10px 0; border:1px solid var(--line2); border-radius:var(--radius-sm);}
  .out table{border-collapse:collapse; width:100%; font-size:14px; min-width:max-content;}
  .out th,.out td{border-bottom:1px solid var(--line2); border-right:1px solid var(--line2); padding:9px 12px; text-align:left; white-space:nowrap;}
  .out tr:last-child td{border-bottom:0;}
  .out th{background:var(--bg2); font-weight:600; color:var(--ink);}
  .out th:last-child,.out td:last-child{border-right:0;}
  /* 상태 */
  .state{font-size:15px; color:var(--mut); display:flex; align-items:center; gap:10px;}
  .spinner{width:17px; height:17px; border:2px solid var(--line); border-top-color:var(--accent); border-radius:50%; animation:spin .7s linear infinite; flex:0 0 auto;}
  @keyframes spin{to{transform:rotate(360deg);}}
  .fade{animation:fade .4s ease;}
  @keyframes fade{from{opacity:0; transform:translateY(6px);} to{opacity:1; transform:none;}}
  footer{max-width:760px; margin:0 auto; padding:0 20px calc(env(safe-area-inset-bottom) + 40px); color:var(--mut); font-size:12px; line-height:1.6; text-align:center;}
  footer a{color:var(--mut);}
  .hidden{display:none !important;}
  @media (max-width:520px){
    .hero{padding:32px 2px 20px;}
    .row>*{min-width:100%;}
    .acts .btn{flex:1;}
  }
</style>
</head>
<body>
<nav class="nav"><div class="nav-in"><span class="logo">🏫</span><span>우리 학교 알리미</span></div></nav>
<main>
  <section class="hero">
    <h1>수행평가 계획부터 급식까지,<br/>학교 이름만 입력하세요.</h1>
    <p>전국 초·중·고 공시정보 — 설치도 가입도 인증키도 없이.</p>
  </section>

  <section class="card">
    <div class="seg" id="seg" role="tablist">
      <span class="thumb" id="thumb"></span>
      <button id="tabName" role="tab" aria-selected="true">이름으로 검색</button>
      <button id="tabRegion" role="tab" aria-selected="false">지역으로 검색</button>
    </div>

    <!-- 이름 검색 -->
    <div id="panelName">
      <div class="field-search">
        <svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input id="qname" placeholder="학교 이름 (예: 개포중, 한밭초)" maxlength="40" autocomplete="off" enterkeyhint="search" inputmode="search"/>
      </div>
      <button id="findName" class="btn btn-primary full" style="margin-top:12px">학교 찾기</button>
    </div>

    <!-- 지역 검색 -->
    <div id="panelRegion" class="hidden">
      <div class="row">
        <div><label>시도</label><select id="sido"><option value="">선택</option>${sidoOpts}</select></div>
        <div><label>시군구</label><select id="sgg"><option value="">시도 먼저</option></select></div>
        <div><label>학교급</label><select id="kind">${kindOpts}</select></div>
      </div>
      <div class="row" style="margin-top:12px">
        <div style="flex:1; min-width:100%"><label>학교명 (일부만 입력해도 됨)</label><input id="name" placeholder="예: 개포중학교" maxlength="40" autocomplete="off" enterkeyhint="search" inputmode="search"/></div>
      </div>
      <button id="findRegion" class="btn btn-primary full" style="margin-top:14px">학교 찾기</button>
    </div>
  </section>

  <section id="recent" class="recent hidden"></section>
  <section id="results"></section>
  <section id="output"></section>
</main>
<footer>데이터 출처: 학교알리미(schoolinfo.go.kr) · 공공누리 제1유형<br/>hwp 변환: kordoc · 같은 검색은 <b>최근 본 학교</b>에서 한 번에</footer>

<script>
const REGIONS = ${regionsJson};
const $ = (id) => document.getElementById(id);
const RECENT_KEY = "schoolinfo:recent";

/* HTML 컨텍스트 이스케이프 */
function h(s){ return String(s==null?"":s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function safeUrl(u){ return /^https?:\\/\\//i.test(String(u||"")) ? u : ""; }
function safeMd(md){
  // marked 로드 실패 시에도 최소 가독성 유지(줄바꿈만 <br>). 이스케이프/정제는 그대로.
  const html = (window.marked ? marked.parse(md) : h(md).replace(/\\n/g,'<br>'));
  return (window.DOMPurify ? DOMPurify.sanitize(html, {ADD_TAGS:['details','summary']}) : h(md));
}
function spinner(text){ return '<div class="card state fade"><span class="spinner"></span><span>'+text+'</span></div>'; }
function info(text){ return '<div class="card state fade">'+text+'</div>'; }

/* ── 세그먼트 컨트롤 ── */
function setMode(mode){
  const isName = mode === 'name';
  $('thumb').classList.toggle('r', !isName);
  $('tabName').setAttribute('aria-selected', String(isName));
  $('tabRegion').setAttribute('aria-selected', String(!isName));
  $('panelName').classList.toggle('hidden', !isName);
  $('panelRegion').classList.toggle('hidden', isName);
}
$('tabName').onclick = () => setMode('name');
$('tabRegion').onclick = () => setMode('region');

/* ── 지역 검색: 시군구 채우기 ── */
$('sido').onchange = () => {
  const sgg = REGIONS[$('sido').value] || [];
  $('sgg').innerHTML = '<option value="">전체</option>' + sgg.map(s => '<option>'+h(s)+'</option>').join('');
};

/* ── 학교 결과 카드 (검색 결과/최근학교 공용) ── */
function schoolCard(ctx, opts){
  opts = opts || {};
  const meta = opts.meta || '';
  const tag = opts.tag ? '<span class="tag">'+h(opts.tag)+'</span>' : '';
  const hp = safeUrl(opts.homepage);
  const d = 'data-sido="'+h(ctx.sido)+'" data-sgg="'+h(ctx.sgg)+'" data-kind="'+h(ctx.kind)+'" data-name="'+h(ctx.name)+'"';
  const hpBtn = hp ? '<a class="btn btn-line btn-sm" href="'+h(hp)+'" target="_blank" rel="noopener noreferrer">🌐 홈페이지</a>' : '';
  // 학교급(kind)을 모르면 공시/평가계획 조회가 불가하므로 버튼 대신 안내 (지역검색 유도)
  const acts = ctx.kind
    ? '<div class="acts">'
      + '<button class="btn btn-primary btn-sm" data-act="eval" '+d+'>📋 수행평가 계획</button>'
      + '<button class="btn btn-soft btn-sm" data-act="digest" '+d+'>📊 핵심 공시</button>'
      + hpBtn + '</div>'
    : '<p class="meta">학교급을 확인할 수 없어 조회가 제한돼요. <b>지역으로 검색</b> 탭을 이용하세요.</p>'
      + (hpBtn ? '<div class="acts">'+hpBtn+'</div>' : '');
  return '<div class="school fade">'
    + '<h3>'+h(ctx.name)+tag+'</h3>'
    + (meta ? '<p class="meta">'+meta+'</p>' : '')
    + acts + '</div>';
}
function ctxOf(el){ return {sido:el.getAttribute('data-sido'), sgg:el.getAttribute('data-sgg'), kind:el.getAttribute('data-kind'), name:el.getAttribute('data-name')}; }

/* ── 이름으로 검색 ── */
async function findByName(){
  const word = $('qname').value.trim();
  if (word.length < 2){ $('results').innerHTML = info('학교 이름을 2글자 이상 입력하세요.'); return; }
  $('results').innerHTML = spinner('전국에서 학교를 찾는 중…'); $('output').innerHTML='';
  try{
    const r = await fetch('/api/searchName?'+new URLSearchParams({word}));
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    const list = d.schools||[];
    if (!list.length){ $('results').innerHTML = info('검색 결과가 없습니다. 이름을 더 정확히 입력해 보세요.'); return; }
    const cards = list.map(s => schoolCard(
      {sido:s.sido, sgg:s.sgg, kind:s.kind, name:s.name},
      {tag:s.kind, meta:[[s.sido,s.sgg,s.dong].filter(Boolean).join(' '), s.foundation].filter(Boolean).map(h).join(' · ')}
    )).join('');
    $('results').innerHTML = '<div class="card"><div class="count">'+list.length+'개 학교</div>'+cards+'</div>';
  }catch(e){ $('results').innerHTML = info('검색 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.'); }
}
$('findName').onclick = findByName;
$('qname').addEventListener('keydown', e => { if(e.key==='Enter') findByName(); });

/* ── 지역으로 검색 ── */
async function findByRegion(){
  const sido=$('sido').value, sgg=$('sgg').value, kind=$('kind').value, name=$('name').value.trim();
  if (!sido || !sgg){ $('results').innerHTML = info('시도와 시군구를 선택하세요.'); return; }
  $('results').innerHTML = spinner('학교를 찾는 중…'); $('output').innerHTML='';
  try{
    const r = await fetch('/api/search?'+new URLSearchParams({sido,sgg,kind,name}));
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    const list = d.schools||[];
    if (!list.length){ $('results').innerHTML = info('검색 결과가 없습니다.'); return; }
    const cards = list.map(s => schoolCard(
      {sido, sgg, kind, name:s.name},
      {meta:[s.foundation, s.address, (s.tel?'☎ '+s.tel:'')].filter(Boolean).map(h).join(' · '), homepage:s.homepage}
    )).join('');
    $('results').innerHTML = '<div class="card"><div class="count">'+list.length+'개 학교</div>'+cards+'</div>';
  }catch(e){ $('results').innerHTML = info('검색 중 오류가 발생했습니다.'); }
}
$('findRegion').onclick = findByRegion;
$('name').addEventListener('keydown', e => { if(e.key==='Enter') findByRegion(); });

/* ── 이벤트 위임 ── */
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.getAttribute('data-act');
  if (act === 'eval'){ rememberFrom(b); loadEval(ctxOf(b)); }
  else if (act === 'digest'){ rememberFrom(b); loadDigest(ctxOf(b)); }
  else if (act === 'evalSeq'){ loadEval(ctxOf(b), b.getAttribute('data-seq'), b.getAttribute('data-year')); }
  else if (act === 'evalAll'){ loadAllEval(ctxOf(b), b.getAttribute('data-year')); }
});

function qp(ctx, extra){ return new URLSearchParams(Object.assign({sido:ctx.sido, sgg:ctx.sgg, kind:ctx.kind, name:ctx.name}, extra||{})); }
function dlUrl(ctx, seq, year){ const p = qp(ctx, {seq:String(seq)}); if(year) p.set('year', String(year)); return '/api/download?'+p; }

/* ── 원본 다운로드 버튼들 ── */
function downloadBar(ctx, downloads, year){
  if (!downloads || !downloads.length) return '';
  const btns = downloads.map(f => {
    const sz = f.sizeKB ? ' ('+f.sizeKB+'KB)' : '';
    return '<a class="btn btn-line btn-sm" href="'+h(dlUrl(ctx, f.seq, year))+'" download>⬇︎ '+h(f.filename)+sz+'</a>';
  }).join('');
  return '<div class="dls">'+btns+'</div>';
}

/* ── 수행평가 ── */
async function loadEval(ctx, seq, year){
  const what = seq ? '선택한 과목을' : '수행평가 계획을';
  $('output').innerHTML = spinner('📋 '+h(ctx.name)+' '+what+' 가져오는 중… (다운로드+변환, 5~10초)');
  try{
    const extra = {}; if (seq) extra.seq = seq; if (year) extra.year = year;
    const r = await fetch('/api/evaluation?'+qp(ctx, extra));
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    if (d.mode === 'list'){
      const yr = d.year ? ' data-year="'+h(d.year)+'"' : '';
      const rows = d.files.map(f => {
        const label = f.filename.replace(/\\.(pdf|hwpx?|docx|xlsx)$/i,'');
        return '<div class="acts" style="margin:8px 0">'
          + '<button class="btn btn-soft btn-sm" data-act="evalSeq" data-sido="'+h(ctx.sido)+'" data-sgg="'+h(ctx.sgg)+'" data-kind="'+h(ctx.kind)+'" data-name="'+h(ctx.name)+'" data-seq="'+h(f.seq)+'"'+yr+'>'+h(label)+'</button>'
          + '<a class="btn btn-line btn-sm" href="'+h(dlUrl(ctx, f.seq, d.year))+'" download>⬇︎ 원본'+(f.sizeKB?' ('+f.sizeKB+'KB)':'')+'</a>'
          + '</div>';
      }).join('');
      $('output').innerHTML = '<div class="card fade"><div class="result-head"><h2>📋 '+h(d.school)+'</h2></div>'
        + '<p class="state">과목별로 평가계획이 나뉘어 있어요. 과목을 누르면 표로 보여주고, <b>원본</b>도 받을 수 있어요.</p>'
        + rows
        + '<div style="margin-top:6px"><button class="btn btn-primary btn-sm" data-act="evalAll" data-sido="'+h(ctx.sido)+'" data-sgg="'+h(ctx.sgg)+'" data-kind="'+h(ctx.kind)+'" data-name="'+h(ctx.name)+'"'+yr+'>📚 전체 한꺼번에 보기</button></div></div>';
      $('output').scrollIntoView({behavior:'smooth', block:'start'});
      return;
    }
    render('📋 '+h(d.school)+' 수행평가 계획', d.markdown, downloadBar(ctx, d.downloads, d.year));
  }catch(e){ $('output').innerHTML = info('조회 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.'); }
}
async function loadAllEval(ctx, year){
  $('output').innerHTML = spinner('📚 '+h(ctx.name)+' 전체 과목을 가져오는 중… (과목 수만큼 시간이 걸려요)');
  try{
    const extra = {all:'1'}; if (year) extra.year = year;
    const r = await fetch('/api/evaluation?'+qp(ctx, extra));
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    render('📚 '+h(d.school)+' 수행평가 계획 (전체)', d.markdown, downloadBar(ctx, d.downloads, d.year));
  }catch(e){ $('output').innerHTML = info('조회 중 오류가 발생했습니다.'); }
}
/* ── 핵심 공시 ── */
async function loadDigest(ctx){
  $('output').innerHTML = spinner('📊 '+h(ctx.name)+' 공시정보를 가져오는 중…');
  try{
    const r = await fetch('/api/digest?'+qp(ctx));
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    render('📊 '+h(d.school)+' 핵심 공시', d.markdown, '');
  }catch(e){ $('output').innerHTML = info('조회 중 오류가 발생했습니다.'); }
}

function render(titleHtml, md, dlHtml){
  // 마크다운 렌더 후 표를 가로 스크롤 래퍼로 감싼다 (모바일에서 페이지 안 넘치게)
  const wrap = document.createElement('div'); wrap.className='out'; wrap.innerHTML = safeMd(md);
  wrap.querySelectorAll('table').forEach(t => { const w=document.createElement('div'); w.className='tablewrap'; t.parentNode.insertBefore(w,t); w.appendChild(t); });
  const card = document.createElement('div'); card.className='card fade';
  card.innerHTML = '<div class="result-head"><h2>'+titleHtml+'</h2></div>' + (dlHtml||'');
  card.appendChild(wrap);
  $('output').innerHTML=''; $('output').appendChild(card);
  $('output').scrollIntoView({behavior:'smooth', block:'start'});
}

/* ── 최근 본 학교 (localStorage) ── */
function loadRecent(){ try{ return JSON.parse(localStorage.getItem(RECENT_KEY)||'[]'); }catch{ return []; } }
function saveRecent(list){ try{ localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0,8))); }catch{} }
function rememberFrom(el){ remember(ctxOf(el)); }
function remember(ctx){
  if(!ctx || !ctx.name) return;
  let list = loadRecent().filter(x => !(x.name===ctx.name && x.sgg===ctx.sgg && x.kind===ctx.kind));
  list.unshift({sido:ctx.sido, sgg:ctx.sgg, kind:ctx.kind, name:ctx.name});
  saveRecent(list); renderRecent();
}
function renderRecent(){
  const list = loadRecent();
  if (!list.length){ $('recent').classList.add('hidden'); $('recent').innerHTML=''; return; }
  $('recent').classList.remove('hidden');
  const chips = list.map((x,i) =>
    '<div class="chip" data-recent="'+i+'"><b>'+h(x.name)+'</b>'
    + '<span style="color:var(--mut);font-size:12px">'+h(x.sgg||x.sido||'')+'</span>'
    + '<span class="x" data-del="'+i+'" role="button" aria-label="삭제">✕</span></div>'
  ).join('');
  $('recent').innerHTML = '<div class="head"><span>최근 본 학교</span><a id="clearRecent">전체 지우기</a></div><div class="chips">'+chips+'</div>';
}
/* 최근학교 클릭 → 그 학교 카드를 다시 띄움 (삭제 ✕는 별도 처리) */
$('recent').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]');
  if (del){ e.stopPropagation(); const i=+del.getAttribute('data-del'); const list=loadRecent(); list.splice(i,1); saveRecent(list); renderRecent(); return; }
  if (e.target.id === 'clearRecent'){ saveRecent([]); renderRecent(); return; }
  const chip = e.target.closest('[data-recent]');
  if (!chip) return;
  const x = loadRecent()[+chip.getAttribute('data-recent')]; if(!x) return;
  $('results').innerHTML = '<div class="card">'+schoolCard(x, {tag:x.kind, meta:h([x.sido,x.sgg].filter(Boolean).join(' '))})+'</div>';
  $('output').innerHTML='';
  $('results').scrollIntoView({behavior:'smooth', block:'start'});
});

renderRecent();
</script>
</body>
</html>`;
}
