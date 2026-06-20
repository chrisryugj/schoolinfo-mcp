// 웹 UI 페이지 (단일 HTML). 학부모용 — 학교 이름만으로(또는 지역 선택으로) 검색 → 수행평가·공시.
//
// 디자인: 에디토리얼 미니멀 (Pretendard, 큰 타이포 위계, 넉넉한 여백, 거의 모노톤 + 악센트 1개(테라코타),
//         하단보더 구분선, 라운드 절제). iA Writer·Bear 노선.
// 모바일: 가로 스크롤 없음, 단어단위 줄바꿈(keep-all), 표는 카드 안에서만 스크롤,
//         입력 17px(iOS 자동확대 방지), safe-area.
//
// 보안: 외부(공공API/공문서) 데이터를 그대로 DOM에 넣지 않는다.
//  - 모든 동적 텍스트는 escapeHtml(h), href는 같은 출처/https만 허용
//  - 인라인 onclick 대신 data-* 속성 + 이벤트 위임
//  - 문서 마크다운은 DOMPurify로 정제 후 렌더

type Regions = Record<string, { code: string; sgg: Record<string, string> }>;

export function renderPage(regions: Regions, kinds: string[]): string {
  const regionsJson = JSON.stringify(
    Object.fromEntries(Object.entries(regions).map(([k, v]) => [k, Object.keys(v.sgg)]))
  );
  const kindOpts = kinds.map((k) => `<option>${k}</option>`).join("");
  const sidoOpts = Object.keys(regions).map((s) => `<option>${s}</option>`).join("");

  // 공시정보 카테고리 (학교 이름 하나로 알 수 있는 것들). 한 줄 요약으로 접이식 안에 정리.
  const CATS: { title: string; items: string[] }[] = [
    { title: "학생", items: ["학년별·학급별 학생수", "성별 학생수", "전·출입/학업중단", "입학생"] },
    { title: "급식·건강", items: ["급식 실시 현황", "급식비 집행", "보건관리", "환경위생", "체력 증진"] },
    { title: "활동", items: ["동아리", "방과후학교", "자유학기제", "특색사업", "상담"] },
    { title: "교원", items: ["직위별 교원", "표시과목별 교원", "자격종별 교원", "직원 현황"] },
    { title: "시설·안전", items: ["교사·용지·지원시설", "시설 개방", "장애인 편의시설", "안전교육", "시설안전 점검"] },
    { title: "회계", items: ["예·결산서", "교비회계", "학교발전기금", "장학금", "교복 단가"] },
    { title: "학교폭력·수업", items: ["학교폭력 예방교육", "수업일수·시수"] },
  ];
  const catRows = CATS.map(
    (c) => `<div class="cat-row"><span class="cat-title">${c.title}</span><span class="cat-items">${c.items.join(", ")}</span></div>`
  ).join("");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<meta name="theme-color" content="#fdfcfa"/>
<title>우리 학교 알리미 — 학교 비교·수행평가, 흩어진 공시를 한 표로</title>
<meta name="description" content="같은 동네 학교를 한 표로 비교하고, hwp 첨부에 묻힌 수행평가 계획을 표로 풀어 드려요. 전국 초·중·고 공시를 학교 이름만으로. 설치·가입 없이."/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="우리 학교 알리미"/>
<meta property="og:locale" content="ko_KR"/>
<meta property="og:url" content="https://school-mcp.fly.dev/"/>
<meta property="og:title" content="우리 학교 알리미 — 학교 비교·수행평가, 흩어진 공시를 한 표로"/>
<meta property="og:description" content="같은 동네 학교를 한 표로 비교하고, hwp 첨부에 묻힌 수행평가 계획을 표로 풀어 드려요. 학교 이름만 입력하면 한 번에. 설치·가입 없이."/>
<meta property="og:image" content="https://school-mcp.fly.dev/og.png"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="우리 학교 알리미"/>
<meta name="twitter:description" content="같은 동네 학교를 한 표로 비교하고, 수행평가는 표로. 학교 이름 하나로."/>
<meta name="twitter:image" content="https://school-mcp.fly.dev/og.png"/>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js" integrity="sha384-/TQbtLCAerC3jgaim+N78RZSDYV7ryeoBCVqTuzRrFec2akfBkHS7ACQ3PQhvMVi" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js" integrity="sha384-+VfUPEb0PdtChMwmBcBmykRMDd+v6D/oFmB3rZM/puCMDYcIvF968OimRh4KQY9a" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<style>
  :root{
    --bg:#fdfcfa; --bg2:#faf8f5; --surface:#ffffff; --surface-2:#f7f3ee; --card:#ffffff;
    --ink:#201d1a; --ink-dim:#6b635c; --mut:#8a817a; --ink-dimmer:#a39a91;
    --hair:#f0ebe4; --hair-strong:#e6ded4; --line:#efe9e2;
    --accent:#b5562a; --accent-ink:#8a3f1c; --accent-soft:rgba(181,86,42,.09); --accent-line:rgba(181,86,42,.30);
    --hl-bg:rgba(181,86,42,.13);
    --warn:#b8472c; --safe:#3f7a48;
    --font:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Apple SD Gothic Neo",system-ui,sans-serif;
    --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
    --radius:14px; --radius-sm:10px;
    --maxw:1040px;
  }
  *{box-sizing:border-box; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;}
  html,body{overflow-x:hidden;}
  html{-webkit-text-size-adjust:100%;}
  body{
    margin:0; background:var(--bg); color:var(--ink); font-family:var(--font); font-weight:400;
    line-height:1.6; letter-spacing:-0.01em; word-break:keep-all; overflow-wrap:anywhere;
  }
  ::selection{background:var(--hl-bg); color:var(--accent-ink);}
  a{color:inherit; text-decoration:none;}
  b{font-weight:600;}
  .nb{white-space:nowrap;}
  :focus-visible{outline:2px solid var(--accent); outline-offset:2px;}

  /* ===== Nav ===== */
  .nav{
    position:sticky; top:0; z-index:50;
    background:rgba(253,252,250,.82); backdrop-filter:saturate(180%) blur(16px); -webkit-backdrop-filter:saturate(180%) blur(16px);
    border-bottom:1px solid var(--hair);
    padding:calc(env(safe-area-inset-top) + 12px) 22px 12px;
  }
  .nav-in{max-width:var(--maxw); margin:0 auto; display:flex; align-items:center; justify-content:space-between; gap:10px;}
  .brand{display:flex; align-items:center; gap:9px; font-weight:700; font-size:15px; letter-spacing:-0.02em;}
  .brand .dot{width:6px; height:6px; border-radius:50%; background:var(--accent);}
  .nav-link{font-size:12.5px; color:var(--ink-dim); transition:.2s; white-space:nowrap; border-bottom:1px solid transparent; padding-bottom:1px;}
  .nav-link:hover{color:var(--ink); border-color:var(--ink-dimmer);}

  main{max-width:var(--maxw); margin:0 auto; padding:0 22px;}

  /* ===== Mode tabs (우리 학교 / 대학 진학) ===== */
  .modetab{display:flex; gap:9px; max-width:var(--maxw); margin:0 auto; padding:22px 22px 0;}
  .mt-btn{flex:1; display:inline-flex; align-items:center; justify-content:center; gap:7px;
    padding:13px 12px; border:1px solid var(--hair-strong); border-radius:12px; background:var(--surface);
    font-family:inherit; font-weight:700; font-size:14.5px; color:var(--ink-dim); cursor:pointer;
    transition:background .2s, color .2s, border-color .2s; -webkit-tap-highlight-color:transparent;}
  .mt-btn[aria-selected="true"]{background:var(--accent); color:#fff; border-color:var(--accent);}
  .mt-btn:not([aria-selected="true"]):hover{background:var(--bg2); color:var(--ink);}

  /* ===== Hero ===== */
  .hero{padding:72px 0 36px;}
  .eyebrow{
    display:inline-flex; align-items:center; gap:9px; margin-bottom:26px;
    font-family:var(--mono); font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--mut); font-weight:500;
  }
  .eyebrow .pulse{width:5px; height:5px; border-radius:50%; background:var(--accent);}
  h1.display{
    margin:0 0 20px; font-size:clamp(34px,8vw,60px); line-height:1.04; font-weight:800; letter-spacing:-0.045em; color:var(--ink);
  }
  h1.display .accent{color:var(--accent);}
  .hero-sub{margin:0; font-size:clamp(15px,2.4vw,18px); color:var(--ink-dim); line-height:1.7; max-width:520px;}
  .hero-sub b{color:var(--ink); font-weight:600;}

  /* ===== Surface card ===== */
  .surface,.card{
    background:var(--surface); border:1px solid var(--hair-strong); border-radius:var(--radius);
    padding:20px; margin-bottom:18px;
  }

  /* ===== Segmented control ===== */
  .seg{position:relative; display:flex; background:var(--bg2); border:1px solid var(--hair-strong); border-radius:11px; padding:4px; margin-bottom:18px;}
  .seg button{flex:1; position:relative; z-index:2; background:transparent; border:0; cursor:pointer;
    padding:10px 8px; font-size:14px; font-weight:600; color:var(--ink-dim); border-radius:8px; transition:color .25s; font-family:inherit; -webkit-tap-highlight-color:transparent;}
  .seg button[aria-selected="true"]{color:var(--ink);}
  .seg .thumb{position:absolute; top:4px; left:4px; height:calc(100% - 8px); width:calc(50% - 4px);
    background:var(--surface); border:1px solid var(--hair-strong); border-radius:8px;
    box-shadow:0 1px 3px rgba(32,29,26,.06);
    transition:transform .28s cubic-bezier(.4,0,.2,1); z-index:1;}
  .seg .thumb.r{transform:translateX(100%);}

  /* ===== Form ===== */
  .row{display:flex; gap:10px; flex-wrap:wrap;}
  .row>*{flex:1; min-width:130px;}
  label{display:block; font-family:var(--mono); font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; color:var(--mut); margin:0 0 7px 2px;}
  select,input{width:100%; padding:13px 14px; border:1px solid var(--hair-strong); border-radius:var(--radius-sm);
    font-size:17px; background:var(--bg2); color:var(--ink); font-family:inherit; appearance:none; -webkit-appearance:none; transition:border-color .15s, box-shadow .15s;}
  select{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%238a817a' d='M1 1l5 5 5-5'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 14px center; padding-right:34px;}
  input::placeholder{color:var(--ink-dimmer);}
  input:focus,select:focus{outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft);}
  .field-search{position:relative;}
  .field-search input{padding-left:44px;}
  .field-search .ic{position:absolute; left:15px; top:50%; transform:translateY(-50%); color:var(--mut); pointer-events:none;}

  /* ===== Buttons ===== */
  .btn{display:inline-flex; align-items:center; justify-content:center; gap:6px; text-decoration:none;
    border:1px solid transparent; border-radius:999px; padding:12px 20px; font-size:15px; font-weight:600;
    cursor:pointer; font-family:inherit; -webkit-tap-highlight-color:transparent; white-space:nowrap;
    transition:transform .08s, background .2s, border-color .2s, opacity .2s;}
  .btn:active{transform:scale(.97);}
  .btn-primary{background:var(--accent); color:#fff;}
  .btn-primary:hover{background:#9e4a23;}
  .btn-primary:disabled{opacity:.45; cursor:default;}
  .btn-soft{background:var(--accent-soft); color:var(--accent); border-color:var(--accent-line);}
  .btn-soft:hover{background:rgba(181,86,42,.15);}
  .btn-line{background:var(--surface); color:var(--ink); border-color:var(--hair-strong);}
  .btn-line:hover{background:var(--bg2); border-color:var(--ink-dimmer);}
  .btn-sm{padding:9px 15px; font-size:14px;}
  .full{width:100%;}

  /* ===== Recent chips ===== */
  .recent{margin-bottom:20px;}
  .recent .head{font-family:var(--mono); font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--mut);
    margin:0 2px 10px; display:flex; justify-content:space-between; align-items:center;}
  .recent .head a{color:var(--ink-dim); cursor:pointer; text-transform:none; letter-spacing:0; font-family:var(--font); font-size:12px;}
  .recent .head a:hover{color:var(--ink);}
  .recent .chips{display:flex; gap:8px; overflow-x:auto; padding:2px 2px 4px; -webkit-overflow-scrolling:touch; scrollbar-width:none;}
  .recent .chips::-webkit-scrollbar{display:none;}
  .recent .chip{display:inline-flex; align-items:center; gap:8px; flex:0 0 auto; max-width:80vw; white-space:nowrap; overflow:hidden;
    background:var(--surface); border:1px solid var(--hair-strong); border-radius:999px;
    padding:8px 8px 8px 15px; font-size:14px; color:var(--ink); cursor:pointer; transition:background .2s, transform .08s;}
  .recent .chip:hover{background:var(--bg2);}
  .recent .chip:active{transform:scale(.97);}
  .recent .chip b{font-weight:600; min-width:0; overflow:hidden; text-overflow:ellipsis;}
  .recent .chip .x{display:flex; width:22px; height:22px; align-items:center; justify-content:center; border-radius:50%; background:var(--bg2); color:var(--mut); font-size:12px; line-height:1;}
  .recent .chip .x:hover{color:var(--ink);}

  /* ===== School result rows ===== */
  .school{padding:18px 0; border-bottom:1px solid var(--hair);}
  .school:first-child{padding-top:2px;}
  .school:last-child{border-bottom:0; padding-bottom:2px;}
  .school h3{margin:0 0 5px; font-size:19px; font-weight:700; letter-spacing:-0.02em;}
  .school .tag{display:inline-block; font-family:var(--mono); font-size:11px; color:var(--mut); margin-left:8px; vertical-align:middle; letter-spacing:.04em; text-transform:uppercase;}
  .school .meta{font-size:14px; color:var(--ink-dim); margin:0 0 13px;}
  .acts{display:flex; gap:8px; flex-wrap:wrap;}
  .count{font-family:var(--mono); font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--mut); margin:0 2px 6px;}

  /* ===== Output (markdown) ===== */
  .result-head{display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:4px;}
  .result-head h2{margin:0; font-size:22px; font-weight:700; letter-spacing:-0.025em;}
  .dls{display:flex; gap:8px; flex-wrap:wrap; margin:12px 0 4px;}
  .dls .btn{max-width:100%; min-width:0; white-space:normal; word-break:break-word; text-align:left; justify-content:flex-start; line-height:1.35;}
  .evalpick{display:flex; flex-wrap:wrap; gap:8px; margin:8px 0;}
  .evalpick .pick{flex:1 1 100%; min-width:0; white-space:normal; word-break:break-word; text-align:left; justify-content:flex-start; line-height:1.35;}
  .meal-filter{display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin:10px 0; font-size:.9em;}
  .meal-filter input{flex:1; min-width:130px; padding:7px 10px; border:1px solid var(--hair-strong); border-radius:8px; font-size:.95em;}
  .meal-list{padding:2px 0 6px;}
  .dish{padding:6px 2px; border-bottom:1px solid var(--hair);}
  .dish:last-child{border-bottom:none;}
  .dish.bad{color:var(--warn); font-weight:600;}
  .dish .al{font-size:.8em; color:var(--ink-dimmer); margin-left:4px;}
  .meal-tag{font-weight:700; margin:10px 0 2px; font-size:.92em;}
  .meal-tag.warn{color:var(--warn);}
  .meal-tag.safe{color:var(--safe);}
  .meal-disc{font-size:.8em; color:var(--mut); margin-top:14px; line-height:1.5;}
  .sched-hi{background:var(--accent-soft); border:1px solid var(--accent-line); border-radius:var(--radius-sm); padding:10px 14px; margin:6px 0 14px; font-weight:600; font-size:.92em; color:var(--accent-ink); display:flex; flex-wrap:wrap; gap:4px 14px;}
  .out{margin-top:12px; font-size:15px; color:var(--ink-dim);}
  .out :first-child{margin-top:0;}
  .out h2{font-size:20px; color:var(--ink); margin:26px 0 8px; letter-spacing:-0.02em; font-weight:700;}
  .out h3{font-size:16px; color:var(--accent); margin:20px 0 6px; font-weight:600;}
  .out p{margin:8px 0;} .out b,.out strong{color:var(--ink);}
  .out ul,.out ol{padding-left:20px;}
  .out hr{border:0; border-top:1px solid var(--hair); margin:20px 0;}
  .out blockquote{margin:12px 0; padding:12px 16px; background:var(--bg2); border-radius:var(--radius-sm); color:var(--ink-dim);}
  .out details{margin:14px 0; border:1px solid var(--hair-strong); border-radius:var(--radius-sm); padding:6px 14px; background:var(--bg2);}
  .out summary{cursor:pointer; font-weight:600; color:var(--ink); padding:6px 0;}
  .out table{border-collapse:collapse; width:100%; font-size:14px; background:var(--surface);}
  .out th,.out td{border-bottom:1px solid var(--hair); border-right:1px solid var(--hair); padding:10px 13px; text-align:left; vertical-align:top;}
  .out tr:last-child td{border-bottom:0;}
  .out th{background:var(--bg2); font-family:var(--mono); font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-dim); font-weight:600;}
  .out th:last-child,.out td:last-child{border-right:0;}
  /* 넓은 표(3열+ · 수행평가): 가로 스크롤 + 첫 열 고정 + 끝 페이드 + 힌트 */
  .tablewrap{position:relative; overflow-x:auto; -webkit-overflow-scrolling:touch; margin:12px 0; border:1px solid var(--hair-strong); border-radius:var(--radius-sm);}
  .tablewrap::after{content:""; position:absolute; top:0; right:0; bottom:0; width:22px; pointer-events:none; background:linear-gradient(90deg,transparent,rgba(32,29,26,.10)); border-radius:0 var(--radius-sm) var(--radius-sm) 0; opacity:1; transition:opacity .2s;}
  .tablewrap[data-fade="off"]::after{opacity:0;}
  .out table.wide{min-width:max-content;}
  .out table.wide th,.out table.wide td{white-space:nowrap;}
  .out table.wide th:first-child,.out table.wide td:first-child{position:sticky; left:0; z-index:1;}
  .out table.wide td:first-child{background:var(--surface-2); color:var(--ink); font-weight:600;}
  .out table.wide th:first-child{background:#efe7dc;}
  /* 비교표: 선택한 내 학교 행 강조 (sticky 첫 열 배경도 함께) */
  .out table.wide tr.mine td{background:var(--hl-bg); color:var(--accent-ink);}
  .out table.wide tr.mine td:first-child{background:rgba(181,86,42,.2);}
  .scroll-hint{display:none; font-family:var(--mono); font-size:10.5px; letter-spacing:.05em; color:var(--mut); margin:-6px 2px 14px; text-align:center;}
  /* 학생수 비교 가로 막대 (표 위 한눈 요약) */
  .barlist{margin:14px 0 6px; display:flex; flex-direction:column; gap:9px;}
  .barrow{display:grid; grid-template-columns:minmax(78px,32%) 1fr auto; align-items:center; gap:10px; font-size:13px;}
  .barrow .bl{color:var(--ink-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0;}
  .barrow .bt{height:12px; border-radius:999px; background:var(--surface-2); overflow:hidden;}
  .barrow .bf{display:block; height:100%; min-width:3px; border-radius:999px; background:var(--accent); opacity:.42; transition:width .6s cubic-bezier(.2,.8,.2,1);}
  .barrow .bv{font-variant-numeric:tabular-nums; color:var(--ink); font-weight:600; white-space:nowrap;}
  .barrow.mine .bl{color:var(--accent-ink); font-weight:700;}
  .barrow.mine .bf{opacity:1;}
  /* 수행평가 표: "NN%" 셀에만 깔리는 인라인 비율 게이지 (표 구조 해석 없음 → 어떤 학교 표든 안전) */
  .out td.hasgauge{position:relative;}
  .out td.hasgauge .cellgauge{position:absolute; left:0; top:2px; bottom:2px; background:var(--accent-soft); border-right:2px solid var(--accent); border-radius:3px; z-index:0;}
  .out td.hasgauge .cellgval{position:relative; z-index:1; font-variant-numeric:tabular-nums; font-weight:600; color:var(--accent-ink);}
  /* 2열 항목·값 표(공시 다이제스트 등): 모바일에선 카드형 스택으로 가로스크롤 없이 */
  @media (max-width:560px){
    .out table.kv{display:block; background:transparent; font-size:15px;}
    .out table.kv thead{display:none;}
    .out table.kv tbody,.out table.kv tr{display:block;}
    .out table.kv tr{border-bottom:1px solid var(--hair); padding:3px 0;}
    .out table.kv tr:last-child{border-bottom:0;}
    .out table.kv td{display:flex; justify-content:space-between; gap:18px; align-items:baseline; border:0; padding:8px 4px; white-space:normal;}
    .out table.kv td:first-child{color:var(--ink-dim); flex:1 1 auto; min-width:0;}
    .out table.kv td:last-child{color:var(--ink); font-weight:600; text-align:right; flex:0 0 auto; max-width:58%; word-break:break-word;}
    .scroll-hint{display:block;}
    .out table.wide th:first-child,.out table.wide td:first-child{max-width:42vw; white-space:normal; word-break:keep-all; overflow-wrap:anywhere;}
  }

  /* ===== State / spinner ===== */
  .state{font-size:15px; color:var(--ink-dim); display:flex; align-items:center; gap:10px;}
  .desc{font-size:15px; color:var(--ink-dim); line-height:1.6; margin:0 0 8px;}
  .desc b{color:var(--ink);}
  .spinner{width:17px; height:17px; border:2px solid var(--hair-strong); border-top-color:var(--accent); border-radius:50%; animation:spin .7s linear infinite; flex:0 0 auto;}
  @keyframes spin{to{transform:rotate(360deg);}}
  .fade{animation:fade .4s ease;}
  @keyframes fade{from{opacity:0; transform:translateY(6px);} to{opacity:1; transform:none;}}

  /* ===== Modal (전체 원문 보기) ===== */
  .modal-bg{position:fixed; inset:0; z-index:100; background:rgba(32,29,26,.4);
    backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px);
    display:flex; align-items:flex-end; justify-content:center; padding:0;}
  .modal{background:var(--surface); border:1px solid var(--hair-strong); border-radius:18px 18px 0 0;
    width:100%; max-width:680px; max-height:90vh; display:flex; flex-direction:column; animation:slideup .28s ease;
    box-shadow:0 -8px 40px rgba(32,29,26,.16);}
  @keyframes slideup{from{transform:translateY(28px);} to{transform:none;}}
  .modal-head{display:flex; align-items:center; justify-content:space-between; gap:12px;
    padding:15px 18px; border-bottom:1px solid var(--hair); flex:0 0 auto;}
  .modal-head h3{margin:0; font-size:15px; font-weight:700; letter-spacing:-0.01em; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
  .modal-x{flex:0 0 auto; width:32px; height:32px; border-radius:50%; border:1px solid var(--hair-strong);
    background:var(--bg2); color:var(--ink-dim); display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:15px; -webkit-tap-highlight-color:transparent;}
  .modal-x:hover{color:var(--ink); background:var(--surface-2);}
  .modal-body{padding:16px 18px calc(env(safe-area-inset-bottom) + 22px); overflow-y:auto; -webkit-overflow-scrolling:touch; min-height:0;}
  body.no-scroll{overflow:hidden;}
  @media (min-width:560px){
    .modal-bg{align-items:center; padding:24px;}
    .modal{border-radius:18px; max-height:85vh;}
  }

  /* ===== Disclosure section (대폭 축소) ===== */
  .section{padding:48px 0 8px; border-top:1px solid var(--hair); margin-top:40px;}
  .chapter-label{display:block; font-family:var(--mono); font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--mut); margin-bottom:14px;}
  .section h2{margin:0 0 14px; font-size:clamp(24px,5vw,34px); line-height:1.12; font-weight:700; letter-spacing:-0.03em; color:var(--ink);}
  .section .lead{margin:0 0 28px; color:var(--ink-dim); font-size:15.5px; line-height:1.65; max-width:520px;}

  /* 핵심 두 줄 요약 (수행평가 / 급식) */
  .feat{padding:18px 0; border-top:1px solid var(--hair);}
  .feat:first-of-type{border-top:0;}
  .feat .k{font-family:var(--mono); font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; color:var(--accent); margin-bottom:7px;}
  .feat h3{margin:0 0 6px; font-size:18px; font-weight:700; letter-spacing:-0.02em;}
  .feat p{margin:0; color:var(--ink-dim); font-size:14.5px; line-height:1.65;}
  .feat p b{color:var(--ink);}

  /* 공시 35종 접이식 목록 */
  .cat-list{margin-top:26px; border:1px solid var(--hair-strong); border-radius:var(--radius-sm); background:var(--surface); overflow:hidden;}
  .cat-list summary{cursor:pointer; padding:14px 18px; font-size:14.5px; font-weight:600; color:var(--ink); list-style:none; display:flex; align-items:center; justify-content:space-between; -webkit-tap-highlight-color:transparent;}
  .cat-list summary::-webkit-details-marker{display:none;}
  .cat-list summary .mk{color:var(--mut); font-size:13px; transition:transform .2s;}
  .cat-list[open] summary .mk{transform:rotate(180deg);}
  .cat-row{display:flex; gap:14px; padding:11px 18px; border-top:1px solid var(--hair); font-size:13.5px; line-height:1.55;}
  .cat-title{flex:0 0 78px; font-weight:600; color:var(--ink);}
  .cat-items{flex:1; color:var(--ink-dim);}

  /* ===== 학년/과목 필터 칩 (structured 평가표) ===== */
  .filters{display:flex; flex-direction:column; gap:11px; margin:16px 0 10px;}
  .frow{display:flex; flex-wrap:wrap; gap:7px; align-items:center; min-width:0;}
  .frow .flabel{font-family:var(--mono); font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; color:var(--mut); margin-right:2px; flex:0 0 auto;}
  .fchip{font-size:13px; padding:7px 13px; border-radius:999px; border:1px solid var(--hair-strong); color:var(--ink-dim); background:var(--surface); cursor:pointer; transition:background .15s,color .15s,border-color .15s; -webkit-tap-highlight-color:transparent; white-space:normal; max-width:100%; font-family:inherit;}
  .detail-head{margin:22px 0 10px; font-size:15px; font-weight:700; color:var(--ink); letter-spacing:-0.01em;}
  table.sched{width:100%; border-collapse:collapse;}
  table.sched td{padding:8px 4px; border-bottom:1px solid var(--hair); font-size:14px; vertical-align:top; line-height:1.45;}
  table.sched td:first-child{color:var(--ink-dim); white-space:nowrap; padding-right:14px; width:1%; font-variant-numeric:tabular-nums;}
  .sched-note{color:var(--mut); font-size:13px;}
  .fchip:hover{color:var(--ink); background:var(--bg2);}
  .fchip[aria-pressed="true"]{color:#fff; background:var(--accent); border-color:var(--accent);}
  /* 대학 전공별 권장 이수과목 */
  .adm{margin-top:18px;}
  .adm-head{font-size:17px; font-weight:700; letter-spacing:-0.01em; color:var(--ink);}
  .adm-sub{margin:6px 0 14px; color:var(--ink-dim); font-size:14px; line-height:1.55;}
  .adm-card{margin-top:16px;}
  .adm-result-head{font-size:15px; font-weight:700; color:var(--ink); margin-bottom:2px;}
  .adm-src{font-size:12px; color:var(--mut); margin-bottom:10px;}
  .adm-guide{background:var(--accent-soft); border:1px solid var(--accent-line); border-radius:var(--radius-sm); padding:10px 13px; margin:10px 0 14px; font-size:12.5px; line-height:1.5; color:var(--accent-ink);}
  .adm-major{padding:12px 0; border-top:1px solid var(--hair);}
  .adm-major:first-of-type{border-top:none;}
  .adm-major .mu{font-weight:600; font-size:14.5px; color:var(--ink);}
  .adm-major .mc{font-size:12px; color:var(--mut); margin-left:6px;}
  .adm-major .mcampus{font-size:11px; color:var(--accent); background:var(--accent-soft); border:1px solid var(--accent-line); border-radius:6px; padding:1px 6px; margin-left:6px;}
  .adm-loc{font-size:12px; font-weight:500; color:var(--mut);}
  .adm-row{display:flex; flex-wrap:wrap; gap:6px; align-items:baseline; margin-top:7px;}
  .adm-row .lab{font-family:var(--mono); font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--mut); margin-right:2px; flex:0 0 auto;}
  .subj{font-size:12.5px; padding:4px 10px; border-radius:999px; border:1px solid var(--hair-strong); background:var(--surface); color:var(--ink-dim); white-space:nowrap;}
  .subj.core{background:var(--accent); color:#fff; border-color:var(--accent);}
  .subj-text{font-size:13px; color:var(--ink-dim); line-height:1.5; flex:1; min-width:0;}
  .adm-row.note .subj-text{color:var(--mut); font-size:12.5px;}
  .adm-none{color:var(--mut); font-size:13px; margin-top:6px;}
  /* 내 이수 과목 체크리스트 */
  .mysubj{padding:0; overflow:hidden; margin-bottom:14px;}
  .mysubj>summary{cursor:pointer; padding:15px 18px; font-size:14.5px; font-weight:700; color:var(--ink); list-style:none; display:flex; align-items:center; gap:8px; -webkit-tap-highlight-color:transparent;}
  .mysubj>summary::-webkit-details-marker{display:none;}
  .mysubj>summary .ms-count{font-family:var(--mono); font-size:11px; font-weight:600; color:var(--accent); margin-left:auto;}
  .mysubj>summary .mk{color:var(--mut); font-size:13px; transition:transform .2s;}
  .mysubj[open]>summary .mk{transform:rotate(180deg);}
  .ms-body{padding:0 18px 18px; border-top:1px solid var(--hair);}
  .ms-help{margin:13px 0 12px; font-size:12.5px; color:var(--ink-dim); line-height:1.55;}
  .ms-palette{display:flex; flex-wrap:wrap; gap:7px; margin-bottom:13px;}
  .ms-chip{font-size:12.5px; padding:6px 12px; border-radius:999px; border:1px solid var(--hair-strong); background:var(--surface); color:var(--ink-dim); cursor:pointer; transition:background .15s, color .15s, border-color .15s; font-family:inherit; -webkit-tap-highlight-color:transparent;}
  .ms-chip:hover{background:var(--bg2); color:var(--ink);}
  .ms-chip[aria-pressed="true"]{background:var(--accent); color:#fff; border-color:var(--accent);}
  .ms-add{display:flex; gap:7px;}
  .ms-add input{flex:1; padding:9px 12px; border:1px solid var(--hair-strong); border-radius:var(--radius-sm); font-size:15px; background:var(--bg2); color:var(--ink); font-family:inherit;}
  .ms-add input:focus{outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft);}
  /* 권장과목 칩: 내가 보유한 과목은 초록으로 강조, 모집단위엔 커버리지 배지 */
  .subj.have{background:var(--safe); color:#fff; border-color:var(--safe);}
  .adm-cov{display:inline-block; font-family:var(--mono); font-size:10.5px; letter-spacing:.03em; color:var(--safe); margin-left:8px; font-weight:700; vertical-align:middle;}
  .adm-cov.none{color:var(--ink-dimmer);}
  /* 학년 바로가기 (긴 평가계획 마크다운 상단 고정) */
  .gradenav{position:sticky; top:0; z-index:5; display:flex; flex-wrap:wrap; gap:7px; align-items:center;
    margin:14px 0 4px; padding:9px 0; background:var(--surface); border-bottom:1px solid var(--hair);}
  .fchip.sub[aria-pressed="true"]{background:var(--accent-soft); color:var(--accent); border-color:var(--accent-line);}

  /* ===== Reveal on scroll ===== */
  .reveal{opacity:0; transform:translateY(18px); transition:opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1);}
  .reveal.in{opacity:1; transform:none;}

  /* ===== Footer ===== */
  footer{max-width:var(--maxw); margin:0 auto; padding:52px 22px calc(env(safe-area-inset-bottom) + 44px); text-align:center; border-top:1px solid var(--hair); margin-top:44px;}
  footer .f-line{font-family:var(--mono); font-size:11.5px; letter-spacing:.03em; color:var(--mut); line-height:1.9;}
  footer .f-actions{margin-top:13px; display:flex; justify-content:center;}
  .copy-mcp{display:inline-flex; align-items:center; gap:7px; font-family:var(--mono); font-size:12px; letter-spacing:.02em; color:var(--ink-dim);
    background:var(--surface); border:1px solid var(--hair-strong); border-radius:999px; padding:7px 14px; cursor:pointer; transition:.2s; -webkit-tap-highlight-color:transparent;}
  .copy-mcp:hover{color:var(--accent); background:var(--accent-soft); border-color:var(--accent-line);}
  .copy-mcp .cm-ic{opacity:.7;}
  .copy-mcp.copied{color:var(--safe); border-color:rgba(63,122,72,.4); background:rgba(63,122,72,.08);}
  footer .f-sig{margin-top:16px; font-family:var(--font); font-size:13px; color:var(--ink-dim);}
  footer .f-sig a{color:var(--ink); border-bottom:1px solid var(--hair-strong); padding-bottom:1px;}
  footer .f-sig a:hover{color:var(--ink); border-color:var(--ink);}
  footer .counter{margin-top:18px; display:flex; justify-content:center;}
  footer .counter a{display:inline-flex; align-items:center; padding:5px 7px; border:1px solid var(--hair); border-radius:9px; background:var(--surface); opacity:.92; transition:opacity .2s, background .2s, border-color .2s;}
  footer .counter a:hover{opacity:1; background:var(--bg2); border-color:var(--hair-strong);}

  .hidden{display:none !important;}
  @media (max-width:520px){
    .hero{padding:48px 0 26px;}
    .row>*{min-width:100%;}
    .acts .btn{flex:1;}
    .cat-row{flex-direction:column; gap:3px;}
    .cat-title{flex:none;}
  }
</style>
<noscript><style>.reveal{opacity:1 !important; transform:none !important;}</style></noscript>
</head>
<body>
<nav class="nav"><div class="nav-in">
  <span class="brand"><span class="dot"></span>우리 학교 알리미</span>
  <a class="nav-link" href="https://chris.gomdori.app" target="_blank" rel="noopener noreferrer">딴짓하는 류주임 ↗</a>
</div></nav>
<main>
  <div class="modetab" role="tablist" aria-label="보기 전환">
    <button id="mvCompare" class="mt-btn" role="tab" aria-selected="true">📊 학교 비교</button>
    <button id="mvSchool" class="mt-btn" role="tab" aria-selected="false">📋 수행평가·내신</button>
    <button id="mvUni" class="mt-btn" role="tab" aria-selected="false">🎓 대학 진학</button>
  </div>

  <div id="viewCompare">
  <section class="hero">
    <span class="eyebrow"><span class="pulse"></span>같은 동네 학교 한눈에 비교</span>
    <h1 class="display">우리 동네 학교를,<br/><span class="accent">한 표로.</span></h1>
    <p class="hero-sub">지역과 학교급만 고르면 <b>학생수·학급당 인원·교사 1인당</b>까지 같은 동네 학교를 한 표로 견줘 드립니다. 학교를 고르거나 옮길 때, 계정 없이 바로.</p>
  </section>
  <section class="surface">
    <div class="row">
      <div><label>시도</label><select id="csido"><option value="">선택</option>${sidoOpts}</select></div>
      <div><label>시군구</label><select id="csgg"><option value="">시도 먼저</option></select></div>
      <div><label>학교급</label><select id="ckind">${kindOpts}</select></div>
    </div>
    <button id="findCompare" class="btn btn-primary full" style="margin-top:14px">학교 비교표 보기</button>
  </section>
  </div><!-- /viewCompare -->

  <div id="viewSchool" class="hidden">
  <section class="hero">
    <span class="eyebrow"><span class="pulse"></span>학교 이름으로 · 수행평가·내신·공시</span>
    <h1 class="display">내신 챙길 때,<br/><span class="accent">학교 이름 하나로.</span></h1>
    <p class="hero-sub">hwp 첨부에 묻힌 <b>수행평가 계획</b>을 표로 풀어 드립니다. 학생수·동아리 같은 <b>공시</b>와 <b>시험 <span class="nb">D-day</span></b>도 학교 이름만 넣으면 됩니다.</p>
  </section>

  <section class="surface">
    <div class="seg" id="seg" role="tablist">
      <span class="thumb" id="thumb"></span>
      <button id="tabName" role="tab" aria-selected="true" aria-controls="panelName">이름으로 검색</button>
      <button id="tabRegion" role="tab" aria-selected="false" aria-controls="panelRegion">지역으로 검색</button>
    </div>

    <div id="panelName" role="tabpanel" aria-labelledby="tabName">
      <div class="field-search">
        <svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input id="qname" placeholder="학교 이름 (예: 개포중, 한밭초)" maxlength="40" autocomplete="off" enterkeyhint="search" inputmode="search"/>
      </div>
      <button id="findName" class="btn btn-primary full" style="margin-top:12px">학교 찾기</button>
    </div>

    <div id="panelRegion" class="hidden" role="tabpanel" aria-labelledby="tabRegion">
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

  <section class="section">
    <span class="chapter-label">무엇을 알 수 있나요</span>
    <h2>학교 이름 하나면<br/>이만큼 나옵니다.</h2>
    <p class="lead">학교알리미 공시 35종, 첨부파일에 묻혀 있던 수행평가 계획, 그리고 NEIS의 매일 급식과 학사일정까지 한자리에 모았어요.</p>

    <div class="feat reveal">
      <div class="k">학부모가 제일 많이 찾는 것</div>
      <h3>수행평가 계획</h3>
      <p>아이가 무엇으로 평가받는지 — <b>평가 주제·기준·반영비율</b>. 학교알리미엔 hwp 첨부로만 들어 있어 열어보기 번거로운 이 자료를, 자동으로 받아 표로 정리해 드려요. 원본 파일도 그대로 내려받을 수 있고요.</p>
    </div>
    <div class="feat reveal">
      <div class="k">매일 들여다보게 되는 것</div>
      <h3>오늘 급식, 알레르기는 걸러서</h3>
      <p>날짜별 <b>식단과 칼로리</b>는 기본. 아이가 피해야 할 알레르기(우유·땅콩 등)를 적어 두면 위험한 메뉴만 따로 갈라 보여줘요. 이번주 브리핑과 학사일정, 시험 <span class="nb">D-day</span>도 같이 챙겨 드립니다.</p>
    </div>

    <details class="cat-list reveal">
      <summary>공시 35종 전체 보기 <span class="mk">▾</span></summary>
      ${catRows}
    </details>
  </section>
  </div><!-- /viewSchool -->

  <div id="viewUni" class="hidden">
  <section class="hero">
    <span class="eyebrow"><span class="pulse"></span>전국 49개 대학 · 전공별 권장과목</span>
    <h1 class="display">가고 싶은 대학이<br/><span class="accent">권하는 과목.</span></h1>
    <p class="hero-sub">목표한 <b>대학·학과</b>가 고등학교 때 어떤 선택과목을 들어 두길 바라는지 모았어요. 수도권·영남·중부·호남 <b>49개 대학</b>의 전공별 권장·반영 과목입니다.</p>
  </section>

  <details class="surface mysubj" id="mySubj">
    <summary>📚 내가 들은·들을 과목 <span class="ms-count" id="msCount"></span><span class="mk">▾</span></summary>
    <div class="ms-body">
      <p class="ms-help">미리 골라 두면 아래 권장과목과 자동으로 맞춰 ✓로 표시해 드려요. 어느 학과가 내 선택과목과 잘 맞는지 한눈에 보입니다. (선택은 이 기기에만 저장돼요)</p>
      <div class="ms-palette" id="msPalette"></div>
      <div class="ms-add">
        <input id="msInput" placeholder="목록에 없으면 직접 추가 (예: 미적분Ⅱ)" maxlength="20" autocomplete="off"/>
        <button class="btn btn-soft btn-sm" id="msAdd">추가</button>
      </div>
    </div>
  </details>

  <section class="surface adm">
    <div class="row">
      <div style="flex:1; min-width:46%"><label>대학</label><input id="admUni" list="admUniList" placeholder="예: 서울대, 연세대" maxlength="30" autocomplete="off" enterkeyhint="search"/></div>
      <div style="flex:1; min-width:46%"><label>학과·계열 (선택)</label><input id="admMajor" placeholder="예: 컴퓨터공학부, 의예과" maxlength="30" autocomplete="off" enterkeyhint="search"/></div>
    </div>
    <datalist id="admUniList"></datalist>
    <button id="admFind" class="btn btn-primary full" style="margin-top:14px">권장과목 보기</button>
    <div id="admOut"></div>
  </section>
  </div><!-- /viewUni -->

  <!-- 출력 영역: 모든 뷰 공용 (viewUni는 자체 #admOut 사용) -->
  <section id="recent" class="recent hidden"></section>
  <section id="results"></section>
  <section id="output"></section>
</main>

<footer>
  <div class="f-line">데이터 출처 · 학교알리미(schoolinfo.go.kr) · NEIS 교육정보 개방(open.neis.go.kr) · 공공누리 제1유형<br/>hwp 변환 · kordoc</div>
  <div class="f-actions">
    <button type="button" id="copyMcp" class="copy-mcp" title="클릭하면 원격 MCP 주소 복사">
      <span class="cm-text">원격 MCP · /mcp</span>
      <svg class="cm-ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V5a2 2 0 0 1 2-2h10"></path></svg>
    </button>
  </div>
  <div class="f-sig">만든 사람 · <a href="https://chris.gomdori.app" target="_blank" rel="noopener noreferrer">딴짓하는 류주임</a></div>
  <div class="counter">
    <a href="https://hitscounter.dev/history?url=https://school-mcp.fly.dev" target="_blank" rel="noopener noreferrer" aria-label="방문 통계 보기">
      <img src="https://hitscounter.dev/api/hit?url=https%3A%2F%2Fschool-mcp.fly.dev&label=visits&icon=mortarboard&color=%23b5562a&style=flat&tz=Asia%2FSeoul" alt="visits" height="20"/>
    </a>
  </div>
</footer>

<script>
const REGIONS = ${regionsJson};
const $ = (id) => document.getElementById(id);
const RECENT_KEY = "schoolinfo:recent";

/* HTML 컨텍스트 이스케이프 */
function h(s){ return String(s==null?"":s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function safeUrl(u){ return /^https?:\\/\\//i.test(String(u||"")) ? u : ""; }
function safeMd(md){
  // 날짜 범위(예: 6/24~6/26)의 ~가 GFM 취소선 마커로 오인돼 구간이 통째로 취소선 처리되는 문제 차단.
  // 이 앱은 의도적 취소선을 쓰지 않으므로 ~를 일괄 escape(\~)해 리터럴로 렌더한다(MCP/CLI는 marked 미사용이라 무관).
  const src = String(md==null?"":md).replace(/~/g, '\\\\~');
  // marked 로드 실패 시에도 최소 가독성 유지(줄바꿈만 <br>). 이스케이프/정제는 그대로.
  const html = (window.marked ? marked.parse(src) : h(md).replace(/\\n/g,'<br>'));
  return (window.DOMPurify ? DOMPurify.sanitize(html, {ADD_TAGS:['details','summary']}) : h(md));
}
/* structured 평가표는 이미 HTML(<table>) — marked 없이 정제만. data-* 속성은 DOMPurify 기본 허용. */
function safeHtml(html){ return window.DOMPurify ? DOMPurify.sanitize(String(html||'')) : ''; }
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

/* ── 최상위 모드: 학교 비교 / 수행평가·내신 / 대학 진학 ── */
function setView(v){
  const views = {compare:'viewCompare', school:'viewSchool', uni:'viewUni'};
  const tabs  = {compare:'mvCompare',   school:'mvSchool',   uni:'mvUni'};
  if (!views[v]) v = 'compare';
  for (const k in views){
    $(views[k]).classList.toggle('hidden', k !== v);
    $(tabs[k]).setAttribute('aria-selected', String(k === v));
  }
  // 출력영역은 모든 뷰 공용 → 탭을 넘기면 이전 결과·검색 잔상을 정리
  $('output').innerHTML=''; $('results').innerHTML='';
  // 최근 본 학교는 수행평가·내신(school) 맥락에서만 노출
  if (v === 'school') renderRecent(); else { $('recent').classList.add('hidden'); $('recent').innerHTML=''; }
  const hash = v === 'compare' ? location.pathname : '#'+v;
  try{ history.replaceState(null, '', hash); }catch(_){}
  window.scrollTo({top:0});
}
$('mvCompare').onclick = () => setView('compare');
$('mvSchool').onclick = () => setView('school');
$('mvUni').onclick = () => setView('uni');
const _vh = location.hash.toLowerCase();
setView(_vh.indexOf('uni')>=0 ? 'uni' : (_vh.indexOf('school')>=0 ? 'school' : 'compare'));

/* ── 지역 검색: 시군구 채우기 ── */
$('sido').onchange = () => {
  const sgg = REGIONS[$('sido').value] || [];
  $('sgg').innerHTML = '<option value="">전체</option>' + sgg.map(s => '<option>'+h(s)+'</option>').join('');
};

/* ── 학교 비교(viewCompare): 지역+학교급만으로 비교표 (학교를 먼저 안 찾아도 됨) ── */
$('csido').onchange = () => {
  const sgg = REGIONS[$('csido').value] || [];
  $('csgg').innerHTML = '<option value="">선택</option>' + sgg.map(s => '<option>'+h(s)+'</option>').join('');
};
$('findCompare').onclick = () => {
  const sido=$('csido').value, sgg=$('csgg').value, kind=$('ckind').value;
  if (!sido || !sgg){ $('output').innerHTML = info('시도와 시군구를 선택하세요.'); return; }
  // 학생수 구조화 비교표(정렬·학년열·가로막대) = 비교 첫인상. name 없으면 ★ 하이라이트만 비고 표는 정상.
  loadCompare({sido, sgg, kind, name:''});
};

/* ── 학교 결과 카드 (검색 결과/최근학교 공용) ── */
function schoolCard(ctx, opts){
  opts = opts || {};
  const meta = opts.meta || '';
  const tag = opts.tag ? '<span class="tag">'+h(opts.tag)+'</span>' : '';
  const hp = safeUrl(opts.homepage);
  const d = 'data-sido="'+h(ctx.sido)+'" data-sgg="'+h(ctx.sgg)+'" data-kind="'+h(ctx.kind)+'" data-name="'+h(ctx.name)+'" data-shlidfcd="'+h(ctx.shlIdfCd||'')+'"';
  // 홈페이지: 지역검색은 주소를 이미 알아 바로 링크. 이름검색은 데이터에 없어 클릭 시 해석(resolveHome).
  const hpBtn = hp
    ? '<a class="btn btn-line btn-sm" href="'+h(hp)+'" target="_blank" rel="noopener noreferrer">🌐 홈페이지</a>'
    : (opts.resolveHome && ctx.kind ? '<button class="btn btn-line btn-sm" data-act="home" '+d+'>🌐 홈페이지</button>' : '');
  // 학교급(kind)을 모르면 공시/평가계획 조회가 불가하므로 버튼 대신 안내 (지역검색 유도)
  // 두 묶음으로 — 그 학교 하나만 보는 것 / 동네 학교끼리 견줘 보는 것.
  // 핵심(수행평가·내신·공시)은 전면. 일상정보(급식·학사일정·이번주)는 incumbent와 겹쳐 접이식으로 격하.
  const ownBtns = '<button class="btn btn-primary btn-sm" data-act="eval" '+d+'>📋 수행평가 계획</button>'
    + '<button class="btn btn-soft btn-sm" data-act="digest" '+d+'>📊 핵심 공시</button>'
    // 학업성취(교과별 성적)는 중·고만 공시. 캡차로 자동조회 불가 → 학교알리미 딥링크 안내.
    + ((ctx.kind && (ctx.kind.indexOf('중학교')>=0 || ctx.kind.indexOf('고등학교')>=0))
        ? '<button class="btn btn-soft btn-sm" data-act="achievement" '+d+'>📈 학업성취도</button>' : '')
    + hpBtn;
  const dailyDetails = '<details class="more-daily"><summary>🍱 급식·학사일정·이번주 더보기</summary>'
    + '<div class="acts" style="margin-top:8px">'
    + '<button class="btn btn-soft btn-sm" data-act="week" '+d+'>📅 이번주</button>'
    + '<button class="btn btn-soft btn-sm" data-act="meal" '+d+'>🍚 급식</button>'
    + '<button class="btn btn-soft btn-sm" data-act="schedule" '+d+'>🗓 학사일정</button>'
    + '</div></details>';
  const nearBtns = '<button class="btn btn-soft btn-sm" data-act="compare" '+d+'>🏫 주변 비교</button>'
    + '<button class="btn btn-soft btn-sm" data-act="report" '+d+'>📋 학교 비교표</button>'
    + '<button class="btn btn-soft btn-sm" data-act="exams" '+d+'>📝 시험 캘린더</button>';
  const acts = ctx.kind
    ? '<div class="count">이 학교 보기</div><div class="acts">' + ownBtns + '</div>' + dailyDetails
      + '<div class="count" style="margin-top:13px">동네 학교끼리 비교</div><div class="acts">' + nearBtns + '</div>'
    : '<p class="meta">학교급을 확인할 수 없어 조회가 제한돼요. <b>지역으로 검색</b> 탭을 이용하세요.</p>'
      + (hpBtn ? '<div class="acts">'+hpBtn+'</div>' : '');
  return '<div class="school fade">'
    + '<h3>'+h(ctx.name)+tag+'</h3>'
    + (meta ? '<p class="meta">'+meta+'</p>' : '')
    + acts + '</div>';
}
function ctxOf(el){ return {sido:el.getAttribute('data-sido'), sgg:el.getAttribute('data-sgg'), kind:el.getAttribute('data-kind'), name:el.getAttribute('data-name'), shlIdfCd:el.getAttribute('data-shlidfcd')}; }

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
    if (!list.length){ $('results').innerHTML = info('찾는 학교가 없어요. 이름을 조금 더 정확히 적어보세요.'); return; }
    const cards = list.map(s => schoolCard(
      {sido:s.sido, sgg:s.sgg, kind:s.kind, name:s.name, shlIdfCd:s.shlIdfCd},
      {tag:s.kind, resolveHome:true, meta:[[s.sido,s.sgg,s.dong].filter(Boolean).join(' '), s.foundation].filter(Boolean).map(h).join(' · ')}
    )).join('');
    $('results').innerHTML = '<div class="card"><div class="count">'+list.length+'개 학교</div>'+cards+'</div>';
  }catch(e){ $('results').innerHTML = info('지금은 학교를 찾지 못했어요. 잠깐 뒤에 다시 해주세요.'); }
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
      {sido, sgg, kind, name:s.name, shlIdfCd:s.shlIdfCd},
      {meta:[s.foundation, s.address, (s.tel?'☎ '+s.tel:'')].filter(Boolean).map(h).join(' · '), homepage:s.homepage}
    )).join('');
    $('results').innerHTML = '<div class="card"><div class="count">'+list.length+'개 학교</div>'+cards+'</div>';
  }catch(e){ $('results').innerHTML = info('지금은 학교를 찾지 못했어요. 잠깐 뒤에 다시 해주세요.'); }
}
$('findRegion').onclick = findByRegion;
$('name').addEventListener('keydown', e => { if(e.key==='Enter') findByRegion(); });

/* ── 내 이수 과목 체크리스트 (이 기기 localStorage) ──
   매칭은 정규화 후 완전일치 — 로마자(Ⅰ/Ⅱ)만 숫자로 통일하고 공백·구분자를 떼어 비교한다.
   학생은 자유 입력 대신 서버가 준 인기 과목 칩에서 고르므로 표기가 권장과목과 어긋나지 않는다. */
const MY_KEY = "schoolinfo:mysubj";
const ROMAN_C = {'Ⅰ':'1','Ⅱ':'2','Ⅲ':'3','Ⅳ':'4','Ⅴ':'5'};
function normSubj(s){ return String(s||'').replace(/[ⅠⅡⅢⅣⅤ]/g,m=>ROMAN_C[m]||m).replace(/[\\s·∙‧・]/g,'').toLowerCase(); }
function loadMy(){ try{ return JSON.parse(localStorage.getItem(MY_KEY)||'[]'); }catch{ return []; } }
let myList = loadMy();
let myKeys = new Set(myList.map(normSubj));
let admSubjects = [];   // 서버가 준 인기 과목 팔레트
let lastAdm = null;     // 마지막 결과 — 내 과목이 바뀌면 다시 그린다
function saveMy(){ try{ localStorage.setItem(MY_KEY, JSON.stringify(myList.slice(0,80))); }catch{} myKeys = new Set(myList.map(normSubj)); }
// 2015개정 표기 → 2022개정 과목 별칭. 대학 문서가 옛 표기로 적었어도 학생의 현행 과목과 매칭되게 한다.
// 근거(교육부/신구 교육과정): 미적분Ⅰ=수학Ⅱ 계승(동일), 미적분Ⅱ←2015 미적분(일반→진로 이동),
//   물리학Ⅰ/화학Ⅰ/생명과학Ⅰ/지구과학Ⅰ(일반)→동명 2022 일반선택, Ⅱ과목(진로)→2022 진로선택 2과목으로 분화.
//   한국지리/세계지리/동아시아사→한국지리 탐구/세계시민과 지리/동아시아 역사 기행.
const SUBJ_ALIAS_RAW = [
  ['수학Ⅰ', ['대수']],
  ['수학Ⅱ', ['미적분Ⅰ']],
  ['미적분', ['미적분Ⅱ']],
  ['물리학Ⅰ', ['물리학']],
  ['물리학Ⅱ', ['역학과 에너지', '전자기와 양자']],
  ['화학Ⅰ', ['화학']],
  ['화학Ⅱ', ['물질과 에너지', '화학 반응의 세계']],
  ['생명과학Ⅰ', ['생명과학']],
  ['생명과학Ⅱ', ['세포와 물질대사', '생물의 유전']],
  ['지구과학Ⅰ', ['지구과학']],
  ['지구과학Ⅱ', ['지구시스템과학', '행성우주과학']],
  ['한국지리', ['한국지리 탐구']],
  ['세계지리', ['세계시민과 지리']],
  ['동아시아사', ['동아시아 역사 기행']],
];
const SUBJ_ALIAS = {};
SUBJ_ALIAS_RAW.forEach(p => { SUBJ_ALIAS[normSubj(p[0])] = p[1].map(normSubj); });
// 두 과목 키가 같거나, 한쪽이 다른쪽의 2015↔2022 별칭이면 동일 과목으로 본다.
function subjMatch(a, b){
  if (a === b) return true;
  const ea = SUBJ_ALIAS[a]; if (ea && ea.indexOf(b) >= 0) return true;
  const eb = SUBJ_ALIAS[b]; if (eb && eb.indexOf(a) >= 0) return true;
  return false;
}
function hasMy(name){
  const k = normSubj(name);
  if (myKeys.has(k)) return true;
  for (const mk of myKeys) if (subjMatch(k, mk)) return true;
  return false;
}
function renderPalette(){
  const pal = $('msPalette'); if(!pal) return;
  // 팔레트 = 서버 인기 과목 + 내가 직접 추가했지만 목록에 없던 과목
  const extra = myList.filter(n => !admSubjects.some(s => normSubj(s)===normSubj(n)));
  pal.innerHTML = admSubjects.concat(extra)
    .map(s => '<button class="ms-chip" data-subj="'+h(s)+'" aria-pressed="'+hasMy(s)+'">'+(hasMy(s)?'✓ ':'')+h(s)+'</button>').join('');
  const cnt = $('msCount'); if(cnt) cnt.textContent = myList.length ? myList.length+'개 선택' : '';
}
function toggleMy(name){
  const k = normSubj(name);
  myList = hasMy(name) ? myList.filter(x => normSubj(x)!==k) : myList.concat([name]);
  saveMy(); renderPalette(); if (lastAdm) renderAdmission(lastAdm);
}
function addMyCustom(){
  const inp = $('msInput'); if(!inp) return;
  const v = inp.value.trim();
  if (v && !hasMy(v)){ myList = myList.concat([v]); saveMy(); renderPalette(); if (lastAdm) renderAdmission(lastAdm); }
  inp.value = '';
}
(function initMySubj(){
  const pal = $('msPalette');
  if (pal) pal.addEventListener('click', e => { const b = e.target.closest('[data-subj]'); if (b) toggleMy(b.getAttribute('data-subj')); });
  const add = $('msAdd'); if (add) add.onclick = addMyCustom;
  const inp = $('msInput'); if (inp) inp.addEventListener('keydown', e => { if (e.key==='Enter') addMyCustom(); });
})();

/* ── 대학 전공별 권장 이수과목 (학교 검색과 독립) ── */
(async function initAdmission(){
  try{
    const r = await fetch('/api/admission'); const d = await r.json();
    const dl = $('admUniList');
    if (dl && d.universities) dl.innerHTML = d.universities.map(u => '<option value="'+h(u.name)+'">').join('');
    if (d.subjects){ admSubjects = d.subjects; renderPalette(); }
  }catch{}
})();
// 핵심/권장 과목은 대학마다 형식이 달라(과목 나열·교과명·일반/진로선택 구분) 원문 문자열.
// 쉼표를 1차 구분자로 토막낸 뒤, 토막마다 칩/설명을 가른다:
//  - 짧은 과목명(예: 미적분Ⅱ, 기술·가정) → 칩. '·'는 과목명 안에 들어가므로 구분자로 쓰지 않는다.
//  - 조건문(예: "물리학/화학 중 1과목 이상") → 설명 텍스트로 한 줄 차지.
// 콜론이 든 통짜 안내문(예: "공통: …")은 가르지 않고 그대로 텍스트.
function subjCell(text, cls){
  const t = (text||'').trim();
  if (!t) return '<span class="subj">—</span>';
  if (t.indexOf(':') >= 0) return '<span class="subj-text">'+h(t)+'</span>';
  const isPhrase = s => s.length > 16 || /(이상|이하|중\\s*\\d|택\\s*\\d|과목|또는|권장|필수|\\/|\\()/.test(s);
  return t.split(',').map(s => s.trim()).filter(Boolean)
    .map(s => {
      if (isPhrase(s)) return '<span class="subj-text" style="flex:1 1 100%">'+h(s)+'</span>';
      const have = hasMy(s);
      return '<span class="subj'+(cls?' '+cls:'')+(have?' have':'')+'">'+(have?'✓ ':'')+h(s)+'</span>';
    }).join('');
}
// 내가 고른 과목으로 이 모집단위의 핵심과목을 몇 개나 채우는지 (칩으로 떨어지는 과목만 분모).
function coverage(text){
  const t = (text||'').trim();
  if (!t || t.indexOf(':') >= 0) return null;
  const isPhrase = s => s.length > 16 || /(이상|이하|중\\s*\\d|택\\s*\\d|과목|또는|권장|필수|\\/|\\()/.test(s);
  const toks = t.split(',').map(s => s.trim()).filter(Boolean).filter(s => !isPhrase(s));
  if (!toks.length) return null;
  return { have: toks.filter(hasMy).length, total: toks.length };
}
function renderAdmission(d){
  lastAdm = d;
  if (!d.majors || !d.majors.length){
    $('admOut').innerHTML = info('"'+h(d.query||'')+'"에 해당하는 학과를 찾지 못했어요. 학과명을 바꾸거나 대학만 입력해 전체를 보세요.'); return;
  }
  const src = safeUrl(d.sourceUrl);
  const loc = [d.region, d.area].filter(Boolean).join(' · ');
  const head = '<div class="adm-result-head">🎓 '+h(d.university)+(loc?' <span class="adm-loc">'+h(loc)+'</span>':'')+' 전공 연계 권장 이수과목</div>'
    + '<div class="adm-src">출처: '+h(d.source)+(src?' · <a href="'+h(src)+'" target="_blank" rel="noopener noreferrer">홈페이지</a>':'')+(d.query?' · 검색: "'+h(d.query)+'"':'')+' · '+d.majors.length+'개 모집단위</div>';
  const guide = d.guide ? '<div class="adm-guide">'+h(d.guide)+'</div>' : '';
  const body = d.majors.map(m => {
    const empty = !(m.core||'').trim() && !(m.recommended||'').trim() && !(m.note||'').trim();
    const tag = (m.campus?'<span class="mcampus">'+h(m.campus)+'</span>':'') + (m.college?'<span class="mc">'+h(m.college)+'</span>':'');
    let rows = '';
    if (empty){
      rows = '<div class="adm-none">별도 권장과목 없음 — 진로·적성에 따른 선택과목 이수 권장</div>';
    } else {
      if ((m.core||'').trim()) rows += '<div class="adm-row"><span class="lab">핵심</span>'+subjCell(m.core,'core')+'</div>';
      if ((m.recommended||'').trim()) rows += '<div class="adm-row"><span class="lab">권장</span>'+subjCell(m.recommended)+'</div>';
      if ((m.note||'').trim()) rows += '<div class="adm-row note"><span class="lab">기준</span><span class="subj-text">'+h(m.note)+'</span></div>';
    }
    const cov = (myList.length && !empty) ? coverage(m.core) : null;
    const covBadge = cov ? '<span class="adm-cov'+(cov.have?'':' none')+'" title="내 과목으로 채운 핵심과목">✓ '+cov.have+'/'+cov.total+'</span>' : '';
    return '<div class="adm-major"><span class="mu">'+h(m.unit)+'</span>'+covBadge+tag+rows+'</div>';
  }).join('');
  $('admOut').innerHTML = '<div class="card fade adm-card">'+head+guide+body+'</div>';
}
async function loadAdmission(){
  const university = $('admUni').value.trim();
  const major = $('admMajor').value.trim();
  if (!university){ $('admOut').innerHTML = info('대학명을 입력하세요. (예: 서울대, 연세대)'); return; }
  $('admOut').innerHTML = spinner('권장 이수과목을 찾는 중…');
  try{
    const r = await fetch('/api/admission?'+new URLSearchParams({university, major}));
    const d = await r.json();
    if (d.error){
      const have = (d.universities||[]).map(u => u.name).join(', ');
      $('admOut').innerHTML = info(h(d.error)+(have?'<br>현재 제공: '+h(have):'')); return;
    }
    renderAdmission(d);
  }catch(e){ $('admOut').innerHTML = info('지금은 정보를 불러오지 못했어요. 잠깐 뒤에 다시 해주세요.'); }
}
$('admFind').onclick = loadAdmission;
$('admUni').addEventListener('keydown', e => { if(e.key==='Enter') loadAdmission(); });
$('admMajor').addEventListener('keydown', e => { if(e.key==='Enter') loadAdmission(); });

/* ── 이벤트 위임 ── */
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.getAttribute('data-act');
  if (act === 'eval'){ rememberFrom(b); loadEval(ctxOf(b)); }
  else if (act === 'digest'){ rememberFrom(b); loadDigest(ctxOf(b)); }
  else if (act === 'schedule'){ rememberFrom(b); loadSchedule(ctxOf(b)); }
  else if (act === 'meal'){ rememberFrom(b); loadMeal(ctxOf(b)); }
  else if (act === 'week'){ rememberFrom(b); loadWeek(ctxOf(b)); }
  else if (act === 'compare'){ rememberFrom(b); loadCompare(ctxOf(b)); }
  else if (act === 'report'){ rememberFrom(b); loadReport(ctxOf(b)); }
  else if (act === 'exams'){ rememberFrom(b); loadExams(ctxOf(b)); }
  else if (act === 'evalSeq'){ loadEval(ctxOf(b), b.getAttribute('data-seq'), b.getAttribute('data-year')); }
  else if (act === 'evalAll'){ loadAllEval(ctxOf(b), b.getAttribute('data-year')); }
  else if (act === 'achievement'){ rememberFrom(b); showAchievement(ctxOf(b)); }
  else if (act === 'home'){ openHomepage(ctxOf(b), b); }
});

/* ── 교과별 학업성취 사항 ── 학교알리미가 캡차로 보호 → 자동조회 불가, 딥링크로 직접 안내 */
function achievementUrl(ctx){
  const BASE = 'https://www.schoolinfo.go.kr';
  return ctx.shlIdfCd
    ? BASE+'/ei/ss/Pneiss_b01_s0.do?SHL_IDF_CD='+encodeURIComponent(ctx.shlIdfCd)
    : BASE+'/ei/ss/pneiss_a03_s0.do';
}
function showAchievement(ctx){
  const url = achievementUrl(ctx);
  $('output').innerHTML = '<div class="card">'
    + '<h3>📈 '+h(ctx.name)+' — 교과별 학업성취 사항</h3>'
    + '<p class="lead">과목별 <b>평균점수</b>와 <b>성취도(A~E) 분포비율</b>입니다. 이 항목은 학교알리미가 '
    + '<b>보안문자(캡차)</b>로 보호하고 있어 자동으로 가져올 수 없어, 학교알리미에서 직접 확인하셔야 합니다.</p>'
    + '<div class="acts"><a class="btn btn-primary btn-sm" href="'+h(url)+'" target="_blank" rel="noopener noreferrer">학교알리미에서 열기 ↗</a></div>'
    + '<p class="meta">화면이 열리면 “학업성취사항 → 교과별 학업성취 사항”을 선택하고 보안문자를 입력하면 학년·학기·과목별 성적을 볼 수 있어요. (중·고등학교만 공시)</p>'
    + '</div>';
}

/* 이름검색 결과의 홈페이지: 클릭 시에만 해석(검색 시 N번 호출 방지).
   팝업차단 회피 위해 클릭 제스처 안에서 빈 탭을 먼저 연다(handle 필요 → noopener 금지,
   대신 navigate 전에 w.opener=null로 보안 처리). */
async function openHomepage(ctx, btn){
  const w = window.open('about:blank', '_blank');
  const prev = btn ? btn.textContent : '';
  if (btn) btn.textContent = '🌐 여는 중…';
  try{
    const r = await fetch('/api/search?'+qp(ctx));
    const d = await r.json();
    const list = d.schools||[];
    const s = list.find(x => x.name===ctx.name) || list[0];
    const hp = s && safeUrl(s.homepage);
    if (hp){
      if (w){ try{ w.opener = null; }catch(_){} w.location.replace(hp); }
      else { window.open(hp, '_blank'); }            // 빈 탭 못 열었으면(차단) 직접 시도
    } else {
      if (w) w.close();
      if (btn){ btn.textContent = '홈페이지 없음'; setTimeout(()=>{ btn.textContent = prev; }, 1500); return; }
    }
  }catch(e){ if (w) w.close(); }
  if (btn) btn.textContent = prev;
}

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
        return '<div class="evalpick">'
          + '<button class="btn btn-soft btn-sm pick" data-act="evalSeq" data-sido="'+h(ctx.sido)+'" data-sgg="'+h(ctx.sgg)+'" data-kind="'+h(ctx.kind)+'" data-name="'+h(ctx.name)+'" data-seq="'+h(f.seq)+'"'+yr+'>'+h(label)+'</button>'
          + '<a class="btn btn-line btn-sm" href="'+h(dlUrl(ctx, f.seq, d.year))+'" download>⬇︎ 원본'+(f.sizeKB?' ('+f.sizeKB+'KB)':'')+'</a>'
          + '</div>';
      }).join('');
      $('output').innerHTML = '<div class="card fade"><div class="result-head"><h2>📋 '+h(d.school)+'</h2></div>'
        + '<p class="desc">과목별로 평가계획이 나뉘어 있어요. 과목을 누르면 표로 보여주고, <b>원본</b>도 받을 수 있어요.</p>'
        + rows
        + '<div style="margin-top:6px"><button class="btn btn-primary btn-sm" data-act="evalAll" data-sido="'+h(ctx.sido)+'" data-sgg="'+h(ctx.sgg)+'" data-kind="'+h(ctx.kind)+'" data-name="'+h(ctx.name)+'"'+yr+'>📚 전체 한꺼번에 보기</button></div></div>';
      $('output').scrollIntoView({behavior:'smooth', block:'start'});
      return;
    }
    if (d.mode === 'structured'){ renderStructured(ctx, d); return; }
    render('📋 '+h(d.school)+' 수행평가 계획', d.markdown, downloadBar(ctx, d.downloads, d.year));
  }catch(e){ $('output').innerHTML = info('지금은 정보를 불러오지 못했어요. 잠깐 뒤에 다시 해주세요.'); }
}

/* 셀 전체가 "NN%"인 칸에만 비율 게이지를 깐다(오탐 방지로 순수 백분율 셀만).
   표 구조를 해석하지 않으므로 학교마다 다른 평가표에도 안전하고, %가 없으면 아무 일도 안 한다. */
function gaugePercentCells(root){
  if (!root) return;
  root.querySelectorAll('td').forEach(td=>{
    if (td.classList.contains('hasgauge') || td.children.length) return; // 처리 완료/중첩 셀 제외
    const m = td.textContent.trim().match(/^(\\d{1,3})\\s*%$/);
    if (!m) return;
    const p = Math.min(+m[1], 100);
    td.classList.add('hasgauge');
    td.innerHTML = '<span class="cellgauge" style="width:'+p+'%"></span><span class="cellgval">'+h(m[0])+'</span>';
  });
}

/* ── 학년/과목 선택 평가표 (통합형 학교) ──
   거대한 전체 문서를 한꺼번에 그리지 않고, 학년 종합표(작음)만 받아 선택한 학년/과목만 렌더.
   과목 칩은 표의 data-subject 행을 토글한다(다시 다운로드/파싱하지 않음). */
function renderStructured(ctx, d){
  const grades = (d.grades||[]).filter(g => g && g.tableHtml);
  if (!grades.length){ $('output').innerHTML = info('표시할 평가표를 찾지 못했어요. 원본을 받아 확인해 주세요.'); return; }
  let gi = 0, subj = '전체';
  // 파싱된 전체 원문이 오면 hwp 다운로드 없이 모달로 인앱 열람
  const fullDocBtn = d.markdown ? '<div class="acts" style="margin-top:8px"><button class="btn btn-soft btn-sm" data-fulldoc="1">📄 전체 평가계획 원문 보기</button></div>' : '';
  const head = '<div class="result-head"><h2>📋 '+h(d.school)+' 수행평가 계획</h2></div>' + downloadBar(ctx, d.downloads, d.year) + fullDocBtn;
  const card = document.createElement('div'); card.className='card fade';
  $('output').innerHTML=''; $('output').appendChild(card);

  const gradeChips = () => grades.map((g,i) =>
    '<button class="fchip" data-g="'+i+'" aria-pressed="'+(i===gi)+'">'+h(g.label||('표 '+(i+1)))+'</button>').join('');
  const subjChips = () => {
    const subs = grades[gi].subjects || [];
    return ['<button class="fchip sub" data-s="전체" aria-pressed="'+(subj==='전체')+'">전체</button>']
      .concat(subs.map(s => '<button class="fchip sub" data-s="'+h(s)+'" aria-pressed="'+(subj===s)+'">'+h(s)+'</button>')).join('');
  };
  const applyFilter = (t) => {
    t.querySelectorAll('tr[data-subject]').forEach(r => {
      r.style.display = (subj==='전체' || r.getAttribute('data-subject')===subj) ? '' : 'none';
    });
  };
  // 선택한 과목의 상세 평가표(성취기준·평가기준)를 종합표 아래에 펼친다
  const drawDetail = () => {
    const box = card.querySelector('#stDetail');
    if (!box) return;
    if (subj === '전체'){ box.innerHTML = ''; return; }
    const html = (grades[gi].details || {})[subj];
    if (!html){
      // 이 문서엔 과목별 성취기준 상세표가 따로 없을 수 있음(종합표가 평가 내용 전부). 막다른 안내 대신 종합표/전체원문으로 유도.
      box.innerHTML = '<p class="desc" style="margin-top:16px">' + h(subj) + '의 평가요소·반영비율은 위 종합표에 정리돼 있어요.'
        + (d.markdown ? ' 더 자세한 내용은 위 <b>📄 전체 평가계획 원문 보기</b>에서 확인할 수 있어요.' : '') + '</p>';
      return;
    }
    box.innerHTML = '<div class="detail-head">📑 ' + h(subj) + ' 성취기준·평가기준</div><div class="out" id="stDetailTbl"></div>';
    const dt = box.querySelector('#stDetailTbl');
    dt.innerHTML = safeHtml(html);
    // render()와 동일하게 열 수로 wide/kv 분기 — 2열 서술형 표가 nowrap으로 가로폭주하지 않게
    dt.querySelectorAll('table').forEach(t => {
      let cols=0; for (const r of t.rows) cols=Math.max(cols, r.cells.length);
      if (cols>2){
        t.classList.add('wide');
        const w=document.createElement('div'); w.className='tablewrap'; t.parentNode.insertBefore(w,t); w.appendChild(t);
        const hint=document.createElement('div'); hint.className='scroll-hint'; hint.textContent='← 성취기준 표를 좌우로 →';
        w.parentNode.insertBefore(hint, w.nextSibling);
      } else { t.classList.add('kv'); }
    });
    gaugePercentCells(dt);
  };
  const draw = () => {
    card.innerHTML = head
      + '<div class="filters">'
      + (grades.length>1 ? '<div class="frow"><span class="flabel">학년</span>'+gradeChips()+'</div>' : '')
      + '<div class="frow"><span class="flabel">과목</span>'+subjChips()+'</div>'
      + '</div>'
      + '<div class="tablewrap"><div class="out" id="stTable"></div></div>'
      + '<div class="scroll-hint">← 표를 좌우로 넘겨보세요 →</div>'
      + '<div id="stDetail"></div>';
    const out = card.querySelector('#stTable');
    out.innerHTML = safeHtml(grades[gi].tableHtml);
    const t = out.querySelector('table');
    if (t){ t.classList.add('wide'); applyFilter(t); gaugePercentCells(t); }
    drawDetail();
  };
  card.addEventListener('click', (e) => {
    if (e.target.closest('[data-fulldoc]')){ openModal('📄 '+h(d.school)+' 평가계획 원문', mdWithGradeNav(d.markdown)); return; }
    const gb = e.target.closest('[data-g]');
    if (gb){ gi = +gb.getAttribute('data-g'); subj = '전체'; draw(); return; }
    const sb = e.target.closest('[data-s]');
    if (sb){
      subj = sb.getAttribute('data-s');
      card.querySelectorAll('[data-s]').forEach(x => x.setAttribute('aria-pressed', String(x.getAttribute('data-s')===subj)));
      const t = card.querySelector('#stTable table'); if (t) applyFilter(t);
      drawDetail();
    }
  });
  draw();
  $('output').scrollIntoView({behavior:'smooth', block:'start'});
}
async function loadAllEval(ctx, year){
  $('output').innerHTML = spinner('📚 '+h(ctx.name)+' 전체 과목을 가져오는 중… (과목 수만큼 시간이 걸려요)');
  try{
    const extra = {all:'1'}; if (year) extra.year = year;
    const r = await fetch('/api/evaluation?'+qp(ctx, extra));
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    render('📚 '+h(d.school)+' 수행평가 계획 (전체)', d.markdown, downloadBar(ctx, d.downloads, d.year));
  }catch(e){ $('output').innerHTML = info('지금은 정보를 불러오지 못했어요. 잠깐 뒤에 다시 해주세요.'); }
}
/* ── 학사일정 (NEIS) ── */
async function loadSchedule(ctx){
  $('output').innerHTML = spinner('🗓 '+h(ctx.name)+' 학사일정을 가져오는 중…');
  try{
    const r = await fetch('/api/schedule?'+qp(ctx));
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    renderSchedule(d);
  }catch(e){ $('output').innerHTML = info('지금은 정보를 불러오지 못했어요. 잠깐 뒤에 다시 해주세요.'); }
}
function renderSchedule(d){
  const items = d.items || [];
  const title = '🗓 '+h(d.school)+' '+(d.year?h(d.year)+'학년도 ':'')+'학사일정';
  if (!items.length){
    $('output').innerHTML = '<div class="card fade"><div class="result-head"><h2>'+title+'</h2></div>'
      + '<p class="state">'+h(d.note||'표시할 학사일정이 없습니다.')+'</p></div>';
    $('output').scrollIntoView({behavior:'smooth', block:'start'});
    return;
  }
  const byMonth = {};
  for (const it of items){ const m = it.date.slice(0,6); (byMonth[m] = byMonth[m] || []).push(it); }
  let html = '';
  const up = d.upcoming;
  if (up && (up.exam || up.vacation)){
    const dl = (e)=> h(e.name)+' <span class="nb">'+(e.dday===0?'D-DAY':'D-'+e.dday)+'</span>';
    const chips = [];
    if (up.exam) chips.push('📝 다음 시험: '+dl(up.exam));
    if (up.vacation) chips.push('🏖 다음 방학: '+dl(up.vacation));
    html += '<p class="sched-hi">'+chips.map(c=>'<span class="nb">'+c+'</span>').join('')+'</p>';
  }
  for (const m of Object.keys(byMonth).sort()){
    const rows = byMonth[m].map(it =>
      '<tr><td>'+(+it.date.slice(6,8))+'일</td><td>'+h(it.name)
      + (it.content ? ' <span class="sched-note">'+h(it.content)+'</span>' : '')+'</td></tr>').join('');
    html += '<div class="detail-head">'+(+m.slice(4,6))+'월</div>'
      + '<div class="out"><table class="sched"><tbody>'+rows+'</tbody></table></div>';
  }
  $('output').innerHTML = '<div class="card fade"><div class="result-head"><h2>'+title+'</h2></div>'+html+'</div>';
  $('output').scrollIntoView({behavior:'smooth', block:'start'});
}
/* ── 급식 (NEIS) — 서버는 알레르기 번호를 구조화해 내려주고, 회피 필터는 클라이언트에서 적용 ── */
const ALLERGEN_NM = {1:'난류',2:'우유',3:'메밀',4:'땅콩',5:'대두',6:'밀',7:'고등어',8:'게',9:'새우',10:'돼지고기',11:'복숭아',12:'토마토',13:'아황산류',14:'호두',15:'닭고기',16:'쇠고기',17:'오징어',18:'조개류'};
function mealDayLabel(ymd){
  const WD=['일','월','화','수','목','금','토'];
  const y=+ymd.slice(0,4), m=+ymd.slice(4,6), dd=+ymd.slice(6,8);
  return m+'/'+dd+'('+WD[new Date(Date.UTC(y,m-1,dd)).getUTCDay()]+')';
}
function avoidSet(str){
  const out = new Set();
  (str||'').split(/[,\\s]+/).filter(Boolean).forEach(tok => {
    if (/^\\d+$/.test(tok)){ if(ALLERGEN_NM[+tok]) out.add(+tok); }
    else { for (const k in ALLERGEN_NM){ const nm=ALLERGEN_NM[k]; if(nm.indexOf(tok)===0||tok.indexOf(nm)===0) out.add(+k); } }
  });
  return out;
}
function alStr(arr){ return (arr||[]).map(n=>ALLERGEN_NM[n]||('?'+n)).join('·'); }
async function loadMeal(ctx){
  $('output').innerHTML = spinner('🍚 '+h(ctx.name)+' 급식을 가져오는 중…');
  try{
    const r = await fetch('/api/meal?'+qp(ctx, {days:'7'}));
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    renderMeal(ctx, d);
  }catch(e){ $('output').innerHTML = info('지금은 정보를 불러오지 못했어요. 잠깐 뒤에 다시 해주세요.'); }
}
/* ── 이번주 브리핑 (NEIS 급식+학사일정+D-day) — 마크다운 렌더 ── */
async function loadWeek(ctx){
  $('output').innerHTML = spinner('📅 '+h(ctx.name)+' 이번주 브리핑을 가져오는 중…');
  try{
    const r = await fetch('/api/week?'+qp(ctx));
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    render('📅 '+h(d.school||ctx.name)+' 이번주', d.markdown, '');
  }catch(e){ $('output').innerHTML = info('지금은 정보를 불러오지 못했어요. 잠깐 뒤에 다시 해주세요.'); }
}
function renderMeal(ctx, d){
  const items = d.items||[];
  const title = '🍚 '+h(d.school||ctx.name)+' 급식';
  if (!items.length){
    $('output').innerHTML = '<div class="card fade"><div class="result-head"><h2>'+title+'</h2></div>'
      + '<p class="state">'+h(d.note||'표시할 급식이 없습니다 (주말·방학일 수 있어요).')+'</p></div>';
    $('output').scrollIntoView({behavior:'smooth', block:'start'}); return;
  }
  const card = document.createElement('div'); card.className='card fade';
  $('output').innerHTML=''; $('output').appendChild(card);
  const dishRow = (x, bad) => '<div class="dish'+(bad?' bad':'')+'">'+h(x.name)
    + ((x.allergens&&x.allergens.length)?' <span class="al">'+h(alStr(x.allergens))+'</span>':'')+'</div>';
  const draw = (avoidStr) => {
    const avoid = avoidSet(avoidStr);
    let html = '<div class="result-head"><h2>'+title+'</h2></div>'
      + '<div class="meal-filter">🚫 알레르기 회피 '
      + '<input id="mealAvoid" type="text" placeholder="예: 우유, 땅콩" value="'+h(avoidStr||'')+'">'
      + '<button class="btn btn-soft btn-sm" id="mealApply">적용</button></div>';
    for (const it of items){
      const ds = it.dishes||[];
      html += '<div class="detail-head">'+h(mealDayLabel(it.date))+' '+h(it.meal)+(it.kcal?' · '+h(it.kcal):'')+'</div>';
      html += '<div class="out meal-list">';
      if (avoid.size){
        const hit = ds.filter(x=>(x.allergens||[]).some(a=>avoid.has(a)));
        const safe = ds.filter(x=>!(x.allergens||[]).some(a=>avoid.has(a)));
        if (hit.length) html += '<div class="meal-tag warn">⚠️ 회피 해당</div>' + hit.map(x=>dishRow(x,true)).join('');
        html += '<div class="meal-tag safe">✅ 안전</div>' + safe.map(x=>dishRow(x,false)).join('');
      } else {
        html += ds.map(x=>dishRow(x,false)).join('');
      }
      html += '</div>';
    }
    html += '<p class="meal-disc">※ 알레르기 정보는 참고용입니다. 최종 확인은 학교 영양(교)사에게 하세요.</p>';
    card.innerHTML = html;
    const inp = card.querySelector('#mealAvoid');
    const apply = ()=>{ const v=inp.value; draw(v); const ni=card.querySelector('#mealAvoid'); if(ni){ ni.focus(); ni.setSelectionRange(v.length,v.length); } };
    card.querySelector('#mealApply').onclick = apply;
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter') apply(); });
  };
  draw('');
  $('output').scrollIntoView({behavior:'smooth', block:'start'});
}
/* ── 주변 학교 학생수 비교 (같은 시군구·학교급) ── */
async function loadCompare(ctx){
  $('output').innerHTML = spinner('🏫 '+h(ctx.sgg||'')+' '+h(ctx.kind||'')+' 학생수를 비교하는 중…');
  try{
    const r = await fetch('/api/compare?'+qp(ctx));
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    renderCompare(ctx, d);
  }catch(e){ $('output').innerHTML = info('지금은 정보를 불러오지 못했어요. 잠깐 뒤에 다시 해주세요.'); }
}
function renderCompare(ctx, d){
  const schools = d.schools || [];
  const title = '🏫 '+h(d.sgg||ctx.sgg||'')+' '+h(d.kind||ctx.kind||'')+' 학생수 비교'+(d.year?' ('+h(d.year)+')':'');
  if (!schools.length){
    $('output').innerHTML = '<div class="card fade"><div class="result-head"><h2>'+title+'</h2></div>'
      + '<p class="desc">'+h(d.note||'표시할 학교가 없습니다.')+'</p></div>';
    $('output').scrollIntoView({behavior:'smooth', block:'start'}); return;
  }
  const grades = d.grades || [];
  const myName = (ctx.name||'').replace(/\\s/g,'');
  const fmt = (n)=> (n==null ? '—' : String(n));
  const ths = ['학교','총학생수'].concat(grades.map(g=>g+'학년')).concat(['학급수','학급당','교사1인당']);
  const thead = '<thead><tr>'+ths.map(t=>'<th>'+h(t)+'</th>').join('')+'</tr></thead>';
  const tbody = schools.map((s,i)=>{
    const mine = (s.name||'').replace(/\\s/g,'')===myName && myName;
    const cells = ['<td>'+(i+1)+'. '+h(s.name)+(mine?' <b>★</b>':'')+'</td>', '<td>'+fmt(s.total)+'</td>']
      .concat(grades.map(g=>'<td>'+fmt(s.byGrade ? (s.byGrade[g] ?? null) : null)+'</td>'))
      .concat(['<td>'+fmt(s.classes)+'</td>','<td>'+fmt(s.perClass)+'</td>','<td>'+fmt(s.perTeacher)+'</td>']);
    return '<tr'+(mine?' class="mine"':'')+'>'+cells.join('')+'</tr>';
  }).join('');
  const table = '<table class="wide">'+thead+'<tbody>'+tbody+'</tbody></table>';
  // 총학생수 가로 막대 — 이미 학생수 순 정렬, 내 학교만 진한 테라코타
  const maxTotal = Math.max(1, ...schools.map(s=>+s.total||0));
  const bars = schools.map((s,i)=>{
    const mine = (s.name||'').replace(/\\s/g,'')===myName && myName;
    const w = ((+s.total||0)/maxTotal*100).toFixed(1);
    return '<div class="barrow'+(mine?' mine':'')+'">'
      + '<span class="bl" title="'+h(s.name)+'">'+(i+1)+'. '+h(s.name)+(mine?' ★':'')+'</span>'
      + '<span class="bt"><span class="bf" style="width:'+w+'%"></span></span>'
      + '<span class="bv">'+(s.total==null?'—':(s.total.toLocaleString()+'명'))+'</span></div>';
  }).join('');
  const card = document.createElement('div'); card.className='card fade';
  card.innerHTML = '<div class="result-head"><h2>'+title+'</h2></div>'
    + '<p class="desc">같은 시군구 '+h(d.kind||ctx.kind||'')+' '+schools.length+'곳을 학생수 순으로 정리했어요. <b>★</b>는 선택한 학교.</p>'
    + '<div class="barlist">'+bars+'</div>'
    + '<div class="out"><div class="tablewrap">'+table+'</div><div class="scroll-hint">← 표를 좌우로 넘겨보세요 →</div></div>';
  $('output').innerHTML=''; $('output').appendChild(card);
  $('output').scrollIntoView({behavior:'smooth', block:'start'});
}
/* ── 학교 비교표 (같은 시군구·학교급 핵심 지표) — 서버가 markdown으로 내려줌 ── */
async function loadReport(ctx){
  $('output').innerHTML = spinner('📋 '+h(ctx.sgg||'')+' '+h(ctx.kind||'')+' 학교를 비교하는 중…');
  try{
    const r = await fetch('/api/report?'+qp(ctx));
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    render('📋 '+h(ctx.sgg||'')+' '+h(ctx.kind||'')+' 비교', d.markdown || (d.note||'표시할 학교가 없습니다.'), '');
  }catch(e){ $('output').innerHTML = info('지금은 정보를 불러오지 못했어요. 잠깐 뒤에 다시 해주세요.'); }
}
/* ── 지역 시험 캘린더 (인근 학교 중간·기말 집계, NEIS) ── */
async function loadExams(ctx){
  $('output').innerHTML = spinner('📝 '+h(ctx.sgg||'')+' '+h(ctx.kind||'')+' 시험 일정을 모으는 중… (여러 학교라 조금 걸려요)');
  try{
    const r = await fetch('/api/exams?'+qp(ctx));
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    render('📝 '+h(ctx.sgg||'')+' 시험 캘린더', d.markdown || (d.note||'표시할 시험 일정이 없습니다.'), '');
  }catch(e){ $('output').innerHTML = info('지금은 정보를 불러오지 못했어요. 잠깐 뒤에 다시 해주세요.'); }
}
/* ── 핵심 공시 ── */
async function loadDigest(ctx){
  $('output').innerHTML = spinner('📊 '+h(ctx.name)+' 공시정보를 가져오는 중…');
  try{
    const r = await fetch('/api/digest?'+qp(ctx));
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    render('📊 '+h(d.school)+' 핵심 공시', d.markdown, '');
  }catch(e){ $('output').innerHTML = info('지금은 정보를 불러오지 못했어요. 잠깐 뒤에 다시 해주세요.'); }
}

// 마크다운 → .out 컨테이너(표 모바일 가공 포함). render()와 모달이 공용.
//  - 2열(항목·값)  → kv: 모바일 카드형 스택 (가로스크롤 없이)
//  - 3열 이상      → wide: 가로 스크롤 래퍼 + 첫 열 고정 + 넘김 힌트
function mdToOut(md){
  const wrap = document.createElement('div'); wrap.className='out'; wrap.innerHTML = safeMd(md);
  wrap.querySelectorAll('table').forEach(t => {
    let cols = 0; for (const r of t.rows) cols = Math.max(cols, r.cells.length);
    if (cols > 2){
      t.classList.add('wide');
      const w=document.createElement('div'); w.className='tablewrap';
      t.parentNode.insertBefore(w,t); w.appendChild(t);
      const hint=document.createElement('div'); hint.className='scroll-hint'; hint.textContent='← 표를 좌우로 넘겨보세요 →';
      w.parentNode.insertBefore(hint, w.nextSibling);
    } else {
      t.classList.add('kv');
    }
  });
  return wrap;
}
// 긴 평가계획 마크다운(학년이 3→2→1 순으로 길게 이어짐)에서 학년 섹션을 찾아
// 상단에 1·2·3학년 바로가기 칩을 만든다. 학년 표제를 못 찾으면(2개 미만) 생략.
function gradeNav(wrap){
  const re = /^\s*([1-6])\s*학년/;
  const seen = new Map();
  // 평가계획 hwp 변환물엔 마크다운 헤딩(#)이 없고 학년 구분이 평범한 <p>("N학년 교과별 평가 계획")
  // 또는 표 머리(<th>)로 나온다. 짧은 텍스트가 'N학년'으로 시작하는 첫 요소를 학년 섹션 시작으로 본다.
  wrap.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b,caption,summary,p,th').forEach(el => {
    const t = (el.textContent||'').trim();
    const m = re.exec(t);
    if (!m || t.length > 20 || seen.has(m[1])) return;
    if (!el.id) el.id = 'gnav-'+m[1];
    el.style.scrollMarginTop = '52px';
    seen.set(m[1], el.id);
  });
  if (seen.size < 2) return null;
  const bar = document.createElement('div'); bar.className='gradenav';
  bar.innerHTML = '<span class="flabel">바로가기</span>'
    + [...seen.keys()].sort().map(n => '<button class="fchip" data-gnav="'+seen.get(n)+'">'+n+'학년</button>').join('');
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-gnav]'); if (!b) return;
    const t = document.getElementById(b.getAttribute('data-gnav'));
    if (t) t.scrollIntoView({behavior:'smooth', block:'start'});
  });
  return bar;
}
// 평가계획 본문 + (학년 표제가 2개 이상이면) 상단 학년 바로가기를 묶어 반환.
function mdWithGradeNav(md){
  const out = mdToOut(md);
  const nav = gradeNav(out);
  const box = document.createElement('div');
  if (nav) box.appendChild(nav);
  box.appendChild(out);
  return box;
}
function render(titleHtml, md, dlHtml){
  const card = document.createElement('div'); card.className='card fade';
  card.innerHTML = '<div class="result-head"><h2>'+titleHtml+'</h2></div>' + (dlHtml||'');
  card.appendChild(mdWithGradeNav(md));
  $('output').innerHTML=''; $('output').appendChild(card);
  $('output').scrollIntoView({behavior:'smooth', block:'start'});
}

/* ── 모달 (전체 원문 등) ── */
function openModal(titleHtml, contentEl){
  closeModal();
  const bg = document.createElement('div'); bg.className='modal-bg'; bg.id='modalBg';
  const m = document.createElement('div'); m.className='modal';
  const head = document.createElement('div'); head.className='modal-head';
  head.innerHTML = '<h3>'+titleHtml+'</h3>';
  const x = document.createElement('button'); x.type='button'; x.className='modal-x'; x.setAttribute('aria-label','닫기'); x.textContent='✕';
  head.appendChild(x);
  const body = document.createElement('div'); body.className='modal-body';
  if (typeof contentEl === 'string') body.innerHTML = contentEl; else body.appendChild(contentEl);
  m.appendChild(head); m.appendChild(body); bg.appendChild(m);
  document.body.appendChild(bg); document.body.classList.add('no-scroll');
  x.onclick = closeModal;
  bg.addEventListener('click', (e) => { if (e.target === bg) closeModal(); });
}
function closeModal(){ const bg=$('modalBg'); if(bg) bg.remove(); document.body.classList.remove('no-scroll'); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

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
  $('results').innerHTML = '<div class="card">'+schoolCard(x, {tag:x.kind, resolveHome:true, meta:h([x.sido,x.sgg].filter(Boolean).join(' '))})+'</div>';
  $('output').innerHTML='';
  $('results').scrollIntoView({behavior:'smooth', block:'start'});
});

/* ── 원격 MCP 주소 복사 ── */
(function(){
  const btn = $('copyMcp'); if(!btn) return;
  const url = location.origin + '/mcp';
  btn.addEventListener('click', async () => {
    let ok = false;
    try{ await navigator.clipboard.writeText(url); ok = true; }
    catch(_){ try{ const ta=document.createElement('textarea'); ta.value=url; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); ok=document.execCommand('copy'); ta.remove(); }catch(__){} }
    const t = btn.querySelector('.cm-text'); const prev = t ? t.textContent : '';
    if (t) t.textContent = ok ? '주소 복사됨 ✓' : url;
    btn.classList.toggle('copied', ok);
    setTimeout(()=>{ if(t) t.textContent = prev; btn.classList.remove('copied'); }, 1800);
  });
})();

/* ── reveal on scroll ── */
try{
  const io = new IntersectionObserver((es)=>{ es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } }); }, {threshold:0.12});
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
}catch(_){ document.querySelectorAll('.reveal').forEach(el => el.classList.add('in')); }

/* ── 표 우측 페이드: 스크롤 끝이거나 스크롤이 필요 없으면 숨김(더 볼 게 없는데 affordance가 남는 문제) ── */
function updTableFade(w){ if(!w) return; w.dataset.fade = (w.scrollWidth - w.clientWidth - w.scrollLeft <= 1) ? 'off' : 'on'; }
document.addEventListener('scroll', (e)=>{ const w = e.target && e.target.closest && e.target.closest('.tablewrap'); if(w) updTableFade(w); }, true);
addEventListener('resize', ()=>document.querySelectorAll('.tablewrap').forEach(updTableFade));
try{ new MutationObserver(()=>document.querySelectorAll('.tablewrap').forEach(updTableFade)).observe(document.body, {childList:true, subtree:true}); }catch(_){}
</script>
</body>
</html>`;
}
