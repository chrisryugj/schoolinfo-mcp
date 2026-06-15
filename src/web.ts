// 웹 UI 페이지 (단일 HTML). 학부모용 — 학교 이름만으로(또는 지역 선택으로) 검색 → 수행평가·공시.
//
// 디자인: 다크 프리미엄 (Pretendard + SF Pro, 그라데이션 디스플레이 헤드라인, mono 라벨,
//         hairline 카드, eyebrow pulse, reveal-on-scroll). chris.gomdori.app 포트폴리오 디자인 언어.
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

  // 공시정보 카테고리 (학교 이름 하나로 알 수 있는 것들) — 위계: 수행평가(핵심) → 7개 분류
  const CATS: { key: string; tone: string; title: string; items: string[] }[] = [
    { key: "01", tone: "blue", title: "학생", items: ["학년별·학급별 학생수", "성별 학생수", "전·출입/학업중단", "입학생"] },
    { key: "02", tone: "green", title: "급식·건강", items: ["급식 실시 현황", "급식비 집행", "보건관리", "환경위생", "체력 증진"] },
    { key: "03", tone: "orange", title: "활동", items: ["동아리", "방과후학교", "자유학기제", "특색사업", "상담"] },
    { key: "04", tone: "violet", title: "교원", items: ["직위별 교원", "표시과목별 교원", "자격종별 교원", "직원 현황"] },
    { key: "05", tone: "teal", title: "시설·안전", items: ["교사·용지·지원시설", "시설 개방", "장애인 편의시설", "안전교육", "시설안전 점검"] },
    { key: "06", tone: "pink", title: "회계", items: ["예·결산서", "교비회계", "학교발전기금", "장학금", "교복 단가"] },
    { key: "07", tone: "yellow", title: "학교폭력·수업", items: ["학교폭력 예방교육", "수업일수·시수"] },
  ];
  const catCards = CATS.map(
    (c) => `<article class="cat reveal">
      <div class="cat-head"><span class="cat-num">${c.key}</span><h4>${c.title}</h4></div>
      <div class="chips">${c.items.map((i) => `<span class="chip">${i}</span>`).join("")}</div>
    </article>`
  ).join("");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<meta name="theme-color" content="#000000"/>
<title>우리 학교 알리미 — 수행평가·급식·공시정보를 학교 이름 하나로</title>
<meta name="description" content="전국 초·중·고의 수행평가 계획·급식·학생수·동아리까지. 학교 이름만 입력하면 학교알리미 공시정보를 한 번에. 설치·가입 없이."/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="우리 학교 알리미"/>
<meta property="og:locale" content="ko_KR"/>
<meta property="og:url" content="https://school-mcp.fly.dev/"/>
<meta property="og:title" content="우리 학교 알리미 — 학교 이름 하나로 수행평가·급식·공시"/>
<meta property="og:description" content="전국 초·중·고 공시정보 35종 + 수행평가 계획까지. 학교 이름만 입력하면 한 번에. 설치·가입 없이."/>
<meta property="og:image" content="https://school-mcp.fly.dev/og.png"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="우리 학교 알리미"/>
<meta name="twitter:description" content="학교 이름 하나로 수행평가·급식·공시정보를 한 번에."/>
<meta name="twitter:image" content="https://school-mcp.fly.dev/og.png"/>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js" integrity="sha384-/TQbtLCAerC3jgaim+N78RZSDYV7ryeoBCVqTuzRrFec2akfBkHS7ACQ3PQhvMVi" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js" integrity="sha384-+VfUPEb0PdtChMwmBcBmykRMDd+v6D/oFmB3rZM/puCMDYcIvF968OimRh4KQY9a" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<style>
  :root{
    --bg:#000; --bg2:#0a0a0c; --surface:#111113; --surface-2:#1a1a1c; --card:#111113;
    --ink:#f5f5f7; --ink-dim:#a1a1a6; --mut:#8b8b90; --ink-dimmer:#6e6e73;
    --hair:rgba(255,255,255,.08); --hair-strong:rgba(255,255,255,.14); --line:rgba(255,255,255,.14);
    --blue:#2997ff; --violet:#bf5af2; --green:#30d158; --orange:#ff9f0a; --teal:#64d2ff; --pink:#ff375f; --yellow:#ffd60a;
    --accent:#2997ff;
    --font:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Apple SD Gothic Neo",system-ui,sans-serif;
    --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
    --radius:18px; --radius-sm:12px;
  }
  *{box-sizing:border-box; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;}
  html,body{overflow-x:hidden;}
  html{-webkit-text-size-adjust:100%;}
  body{
    margin:0; background:var(--bg); color:var(--ink); font-family:var(--font); font-weight:400;
    line-height:1.5; letter-spacing:-0.01em; word-break:keep-all; overflow-wrap:anywhere;
  }
  ::selection{background:rgba(41,151,255,.35); color:#fff;}
  a{color:inherit; text-decoration:none;}
  b{font-weight:600;}
  :focus-visible{outline:2px solid var(--accent); outline-offset:2px;}

  /* ===== Nav (frosted glass) ===== */
  .nav{
    position:sticky; top:0; z-index:50;
    background:rgba(0,0,0,.7); backdrop-filter:saturate(180%) blur(20px); -webkit-backdrop-filter:saturate(180%) blur(20px);
    border-bottom:1px solid var(--hair);
    padding:calc(env(safe-area-inset-top) + 10px) 20px 10px;
  }
  .nav-in{max-width:760px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; gap:10px;}
  .brand{display:flex; align-items:center; gap:9px; font-weight:600; font-size:15px; letter-spacing:-0.02em;}
  .brand .dot{width:7px; height:7px; border-radius:50%; background:var(--green); box-shadow:0 0 9px var(--green);}
  .nav-link{font-size:12px; color:var(--ink-dim); border:1px solid var(--hair); padding:5px 12px; border-radius:999px; transition:.2s; white-space:nowrap;}
  .nav-link:hover{color:#fff; background:rgba(255,255,255,.06); border-color:var(--hair-strong);}

  main{max-width:760px; margin:0 auto; padding:0 20px;}

  /* ===== Hero ===== */
  .hero{position:relative; padding:64px 0 30px; overflow:hidden;}
  .grid-bg{position:absolute; inset:-40px 0 0; z-index:0; pointer-events:none;
    background-image:linear-gradient(var(--hair) 1px,transparent 1px),linear-gradient(90deg,var(--hair) 1px,transparent 1px);
    background-size:54px 54px;
    -webkit-mask-image:radial-gradient(ellipse 80% 60% at 50% 12%, #000 0%, transparent 72%);
            mask-image:radial-gradient(ellipse 80% 60% at 50% 12%, #000 0%, transparent 72%);}
  .hero > *{position:relative; z-index:1;}
  .eyebrow{
    display:inline-flex; align-items:center; gap:9px; margin-bottom:22px;
    font-size:12px; color:var(--ink-dim); font-weight:500; letter-spacing:.01em;
    padding:6px 14px; border-radius:999px; border:1px solid var(--hair); background:rgba(255,255,255,.03);
  }
  .eyebrow .pulse{width:6px; height:6px; border-radius:50%; background:var(--blue); box-shadow:0 0 0 0 rgba(41,151,255,.5); animation:pulse 2.2s infinite;}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(41,151,255,.5)} 70%{box-shadow:0 0 0 8px transparent} 100%{box-shadow:0 0 0 0 transparent}}
  h1.display{
    margin:0 0 18px; font-size:clamp(30px,7.6vw,58px); line-height:1.05; font-weight:800; letter-spacing:-0.042em;
  }
  h1.display .grad{background:linear-gradient(180deg,#fff 0%,#9b9ba1 130%); -webkit-background-clip:text; background-clip:text; color:transparent;}
  h1.display .accent{color:var(--blue);}
  .hero-sub{margin:0; font-size:clamp(15px,2.4vw,18px); color:var(--ink-dim); line-height:1.55; max-width:540px;}

  /* ===== Surface card ===== */
  .surface,.card{
    background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.012));
    border:1px solid var(--hair-strong); border-radius:var(--radius);
    padding:18px; margin-bottom:16px;
  }

  /* ===== Segmented control ===== */
  .seg{position:relative; display:flex; background:var(--bg2); border:1px solid var(--hair); border-radius:12px; padding:4px; margin-bottom:16px;}
  .seg button{flex:1; position:relative; z-index:2; background:transparent; border:0; cursor:pointer;
    padding:10px 8px; font-size:14px; font-weight:600; color:var(--ink-dim); border-radius:9px; transition:color .25s; font-family:inherit; -webkit-tap-highlight-color:transparent;}
  .seg button[aria-selected="true"]{color:#fff;}
  .seg .thumb{position:absolute; top:4px; left:4px; height:calc(100% - 8px); width:calc(50% - 4px);
    background:rgba(255,255,255,.10); border:1px solid var(--hair-strong); border-radius:9px;
    transition:transform .28s cubic-bezier(.4,0,.2,1); z-index:1;}
  .seg .thumb.r{transform:translateX(100%);}

  /* ===== Form ===== */
  .row{display:flex; gap:10px; flex-wrap:wrap;}
  .row>*{flex:1; min-width:130px;}
  label{display:block; font-family:var(--mono); font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; color:var(--mut); margin:0 0 7px 2px;}
  select,input{width:100%; padding:13px 14px; border:1px solid var(--hair-strong); border-radius:var(--radius-sm);
    font-size:17px; background:var(--bg2); color:var(--ink); font-family:inherit; appearance:none; -webkit-appearance:none; transition:border-color .15s, box-shadow .15s;}
  select{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%238b8b90' d='M1 1l5 5 5-5'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 14px center; padding-right:34px;}
  input::placeholder{color:var(--mut);}
  input:focus,select:focus{outline:none; border-color:var(--accent); box-shadow:0 0 0 4px rgba(41,151,255,.22);}
  .field-search{position:relative;}
  .field-search input{padding-left:44px;}
  .field-search .ic{position:absolute; left:15px; top:50%; transform:translateY(-50%); color:var(--ink-dim); pointer-events:none;}

  /* ===== Buttons ===== */
  .btn{display:inline-flex; align-items:center; justify-content:center; gap:6px; text-decoration:none;
    border:1px solid transparent; border-radius:999px; padding:12px 20px; font-size:15px; font-weight:600;
    cursor:pointer; font-family:inherit; -webkit-tap-highlight-color:transparent; white-space:nowrap;
    transition:transform .08s, background .2s, border-color .2s, opacity .2s;}
  .btn:active{transform:scale(.97);}
  .btn-primary{background:var(--accent); color:#fff;}
  .btn-primary:hover{background:#1f86ec;}
  .btn-primary:disabled{opacity:.45; cursor:default;}
  .btn-soft{background:rgba(41,151,255,.12); color:var(--blue); border-color:rgba(41,151,255,.28);}
  .btn-soft:hover{background:rgba(41,151,255,.2);}
  .btn-line{background:rgba(255,255,255,.03); color:var(--ink); border-color:var(--hair-strong);}
  .btn-line:hover{background:rgba(255,255,255,.08);}
  .btn-sm{padding:9px 15px; font-size:14px;}
  .full{width:100%;}

  /* ===== Recent chips ===== */
  .recent{margin-bottom:18px;}
  .recent .head{font-family:var(--mono); font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--mut);
    margin:0 2px 10px; display:flex; justify-content:space-between; align-items:center;}
  .recent .head a{color:var(--ink-dim); cursor:pointer; text-transform:none; letter-spacing:0; font-family:var(--font); font-size:12px;}
  .recent .head a:hover{color:#fff;}
  .recent .chips{display:flex; gap:8px; overflow-x:auto; padding:2px 2px 4px; -webkit-overflow-scrolling:touch; scrollbar-width:none;}
  .recent .chips::-webkit-scrollbar{display:none;}
  .recent .chip{display:inline-flex; align-items:center; gap:8px; flex:0 0 auto; max-width:80vw; white-space:nowrap; overflow:hidden;
    background:rgba(255,255,255,.04); border:1px solid var(--hair-strong); border-radius:999px;
    padding:8px 8px 8px 15px; font-size:14px; color:var(--ink); cursor:pointer; transition:background .2s, transform .08s;}
  .recent .chip:hover{background:rgba(255,255,255,.08);}
  .recent .chip:active{transform:scale(.97);}
  .recent .chip b{font-weight:600; min-width:0; overflow:hidden; text-overflow:ellipsis;}
  .recent .chip .x{display:flex; width:22px; height:22px; align-items:center; justify-content:center; border-radius:50%; background:var(--bg2); color:var(--ink-dim); font-size:12px; line-height:1;}
  .recent .chip .x:hover{color:#fff;}

  /* ===== School result rows ===== */
  .school{padding:16px 0; border-bottom:1px solid var(--hair);}
  .school:first-child{padding-top:2px;}
  .school:last-child{border-bottom:0; padding-bottom:2px;}
  .school h3{margin:0 0 5px; font-size:18px; font-weight:600; letter-spacing:-0.02em;}
  .school .tag{display:inline-block; font-family:var(--mono); font-size:11px; color:var(--blue); background:rgba(41,151,255,.1); border:1px solid rgba(41,151,255,.25); padding:1px 9px; border-radius:999px; margin-left:8px; vertical-align:middle; letter-spacing:.02em;}
  .school .meta{font-size:14px; color:var(--ink-dim); margin:0 0 12px;}
  .acts{display:flex; gap:8px; flex-wrap:wrap;}
  .count{font-family:var(--mono); font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--mut); margin:0 2px 6px;}

  /* ===== Output (markdown) ===== */
  .result-head{display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:4px;}
  .result-head h2{margin:0; font-size:21px; font-weight:700; letter-spacing:-0.02em;}
  .dls{display:flex; gap:8px; flex-wrap:wrap; margin:12px 0 4px;}
  /* 다운로드 버튼: 파일명이 길어도 카드 밖으로 넘치지 않게 줄바꿈 허용 + 폭 제한 */
  .dls .btn{max-width:100%; min-width:0; white-space:normal; word-break:break-word; text-align:left; justify-content:flex-start; line-height:1.35;}
  /* 평가계획 과목 선택: 긴 파일명 버튼은 한 줄 전체 차지(줄바꿈 허용), 원본 다운로드는 아래 줄로 */
  .evalpick{display:flex; flex-wrap:wrap; gap:8px; margin:8px 0;}
  .evalpick .pick{flex:1 1 100%; min-width:0; white-space:normal; word-break:break-word; text-align:left; justify-content:flex-start; line-height:1.35;}
  .out{margin-top:10px; font-size:15px; color:var(--ink-dim);}
  .out :first-child{margin-top:0;}
  .out h2{font-size:19px; color:#fff; margin:24px 0 8px; letter-spacing:-0.02em;}
  .out h3{font-size:16px; color:var(--blue); margin:18px 0 6px;}
  .out p{margin:8px 0;} .out b,.out strong{color:#fff;}
  .out ul,.out ol{padding-left:20px;}
  .out hr{border:0; border-top:1px solid var(--hair); margin:18px 0;}
  .out blockquote{margin:12px 0; padding:10px 14px; background:rgba(255,255,255,.03); border-radius:var(--radius-sm); color:var(--ink-dim); border-left:3px solid var(--accent);}
  .out details{margin:14px 0; border:1px solid var(--hair); border-radius:var(--radius-sm); padding:6px 14px; background:rgba(255,255,255,.02);}
  .out summary{cursor:pointer; font-weight:600; color:#fff; padding:6px 0;}
  .out table{border-collapse:collapse; width:100%; font-size:14px; background:rgba(255,255,255,.02);}
  .out th,.out td{border-bottom:1px solid var(--hair); border-right:1px solid var(--hair); padding:10px 13px; text-align:left; vertical-align:top;}
  .out tr:last-child td{border-bottom:0;}
  .out th{background:rgba(255,255,255,.04); font-family:var(--mono); font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-dim); font-weight:600;}
  .out th:last-child,.out td:last-child{border-right:0;}
  /* 넓은 표(3열+ · 수행평가): 가로 스크롤 + 첫 열 고정 + 끝 페이드 + 힌트 */
  .tablewrap{position:relative; overflow-x:auto; -webkit-overflow-scrolling:touch; margin:12px 0; border:1px solid var(--hair); border-radius:var(--radius-sm);}
  .tablewrap::after{content:""; position:absolute; top:0; right:0; bottom:0; width:22px; pointer-events:none; background:linear-gradient(90deg,transparent,rgba(0,0,0,.6)); border-radius:0 var(--radius-sm) var(--radius-sm) 0;}
  .out table.wide{min-width:max-content;}
  .out table.wide th,.out table.wide td{white-space:nowrap;}
  .out table.wide th:first-child,.out table.wide td:first-child{position:sticky; left:0; z-index:1;}
  .out table.wide td:first-child{background:#0b0b0d; color:var(--ink); font-weight:600;}
  .out table.wide th:first-child{background:#151517;}
  /* 비교표: 선택한 내 학교 행 강조 (sticky 첫 열 배경도 함께) */
  .out table.wide tr.mine td{background:rgba(41,151,255,.16); color:#fff;}
  .out table.wide tr.mine td:first-child{background:#13233a;}
  .scroll-hint{display:none; font-family:var(--mono); font-size:10.5px; letter-spacing:.05em; color:var(--mut); margin:-6px 2px 14px; text-align:center;}
  /* 2열 항목·값 표(공시 다이제스트 등): 모바일에선 카드형 스택으로 가로스크롤 없이 */
  @media (max-width:560px){
    .out table.kv{display:block; background:transparent; font-size:15px;}
    .out table.kv thead{display:none;}
    .out table.kv tbody,.out table.kv tr{display:block;}
    .out table.kv tr{border-bottom:1px solid var(--hair); padding:3px 0;}
    .out table.kv tr:last-child{border-bottom:0;}
    .out table.kv td{display:flex; justify-content:space-between; gap:18px; align-items:baseline; border:0; padding:8px 4px; white-space:normal;}
    .out table.kv td:first-child{color:var(--ink-dim); flex:1 1 auto; min-width:0;}
    .out table.kv td:last-child{color:#fff; font-weight:600; text-align:right; flex:0 0 auto; max-width:58%; word-break:break-word;}
    .scroll-hint{display:block;}
    /* 좁은 폭: wide표 sticky 첫 열이 긴 한글이면 본문을 가리므로 첫 열만 폭 제한+줄바꿈 (나머지 셀은 nowrap 유지) */
    .out table.wide th:first-child,.out table.wide td:first-child{max-width:42vw; white-space:normal; word-break:keep-all; overflow-wrap:anywhere;}
  }

  /* ===== State / spinner ===== */
  .state{font-size:15px; color:var(--ink-dim); display:flex; align-items:center; gap:10px;}
  /* 설명 문단: state(flex)와 달리 인라인 <b> 등을 한 줄로 흐르게 (flex면 글자 단위로 쪼개짐) */
  .desc{font-size:15px; color:var(--ink-dim); line-height:1.55; margin:0 0 8px;}
  .desc b{color:#fff;}
  .spinner{width:17px; height:17px; border:2px solid var(--hair-strong); border-top-color:var(--accent); border-radius:50%; animation:spin .7s linear infinite; flex:0 0 auto;}
  @keyframes spin{to{transform:rotate(360deg);}}
  .fade{animation:fade .4s ease;}
  @keyframes fade{from{opacity:0; transform:translateY(6px);} to{opacity:1; transform:none;}}

  /* ===== Modal (전체 원문 보기) ===== */
  .modal-bg{position:fixed; inset:0; z-index:100; background:rgba(0,0,0,.62);
    backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px);
    display:flex; align-items:flex-end; justify-content:center; padding:0;}
  .modal{background:var(--surface); border:1px solid var(--hair-strong); border-radius:18px 18px 0 0;
    width:100%; max-width:720px; max-height:90vh; display:flex; flex-direction:column; animation:slideup .28s ease;}
  @keyframes slideup{from{transform:translateY(28px);} to{transform:none;}}
  .modal-head{display:flex; align-items:center; justify-content:space-between; gap:12px;
    padding:15px 18px; border-bottom:1px solid var(--hair); flex:0 0 auto;}
  .modal-head h3{margin:0; font-size:15px; font-weight:700; letter-spacing:-0.01em; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
  .modal-x{flex:0 0 auto; width:32px; height:32px; border-radius:50%; border:1px solid var(--hair-strong);
    background:rgba(255,255,255,.04); color:var(--ink-dim); display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:15px; -webkit-tap-highlight-color:transparent;}
  .modal-x:hover{color:#fff; background:rgba(255,255,255,.08);}
  .modal-body{padding:16px 18px calc(env(safe-area-inset-bottom) + 22px); overflow-y:auto; -webkit-overflow-scrolling:touch; min-height:0;}
  body.no-scroll{overflow:hidden;}
  @media (min-width:560px){
    .modal-bg{align-items:center; padding:24px;}
    .modal{border-radius:18px; max-height:85vh;}
  }

  /* ===== Disclosure section ===== */
  .section{padding:40px 0 8px; border-top:1px solid var(--hair); margin-top:30px;}
  .chapter-label{display:inline-flex; align-items:center; gap:10px; font-family:var(--mono); font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--mut); margin-bottom:16px;}
  .chapter-label .num{color:#fff; font-weight:600; padding:3px 8px; border:1px solid var(--hair-strong); border-radius:5px; background:rgba(255,255,255,.03);}
  .section h2{margin:0 0 10px; font-size:clamp(26px,5vw,38px); line-height:1.08; font-weight:700; letter-spacing:-0.03em;}
  .section .lead{margin:0 0 26px; color:var(--ink-dim); font-size:15.5px; line-height:1.55; max-width:560px;}

  /* 핵심 하이라이트 카드 (수행평가) */
  .hl{position:relative; overflow:hidden; padding:26px 24px; border-radius:var(--radius);
    border:1px solid rgba(41,151,255,.32); background:linear-gradient(135deg, rgba(41,151,255,.14), rgba(41,151,255,.03)); margin-bottom:18px;}
  .hl::after{content:""; position:absolute; right:-60px; top:-60px; width:200px; height:200px; border-radius:50%; background:radial-gradient(circle, rgba(41,151,255,.22), transparent 70%); pointer-events:none;}
  .hl .badge{display:inline-flex; align-items:center; gap:6px; font-family:var(--mono); font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; color:var(--blue); background:rgba(41,151,255,.16); border:1px solid rgba(41,151,255,.3); padding:4px 10px; border-radius:999px; margin-bottom:14px;}
  .hl h3{margin:0 0 8px; font-size:20px; font-weight:700; letter-spacing:-0.02em;}
  .hl p{margin:0; color:var(--ink-dim); font-size:14.5px; line-height:1.55;}
  .hl p b{color:#fff;}

  .cat-grid{display:grid; grid-template-columns:repeat(2,1fr); gap:12px;}
  .cat{padding:18px; border-radius:var(--radius-sm); border:1px solid var(--hair); background:rgba(255,255,255,.02); transition:background .25s, border-color .25s, transform .25s;}
  .cat:hover{background:rgba(255,255,255,.045); border-color:var(--hair-strong); transform:translateY(-2px);}
  .cat-head{display:flex; align-items:center; gap:10px; margin-bottom:12px;}
  .cat-num{font-family:var(--mono); font-size:11px; color:var(--mut); border:1px solid var(--hair); border-radius:5px; padding:2px 7px;}
  .cat h4{margin:0; font-size:16px; font-weight:600; letter-spacing:-0.01em;}
  .chips{display:flex; flex-wrap:wrap; gap:7px;}
  .chip{font-size:12px; padding:5px 11px; border-radius:999px; border:1px solid var(--hair-strong); color:var(--ink-dim); background:rgba(255,255,255,.03);}
  .chip.blue{color:var(--blue); border-color:rgba(41,151,255,.28); background:rgba(41,151,255,.08);}
  .chip.violet{color:var(--violet); border-color:rgba(191,90,242,.28); background:rgba(191,90,242,.08);}
  .chip.green{color:var(--green); border-color:rgba(48,209,88,.28); background:rgba(48,209,88,.08);}
  .chip.orange{color:var(--orange); border-color:rgba(255,159,10,.28); background:rgba(255,159,10,.08);}
  .chip.teal{color:var(--teal); border-color:rgba(100,210,255,.28); background:rgba(100,210,255,.08);}
  .chip.pink{color:var(--pink); border-color:rgba(255,55,95,.28); background:rgba(255,55,95,.08);}
  .chip.yellow{color:var(--yellow); border-color:rgba(255,214,10,.28); background:rgba(255,214,10,.08);}

  /* ===== 학년/과목 필터 칩 (structured 평가표) ===== */
  .filters{display:flex; flex-direction:column; gap:11px; margin:16px 0 10px;}
  .frow{display:flex; flex-wrap:wrap; gap:7px; align-items:center; min-width:0;}
  .frow .flabel{font-family:var(--mono); font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; color:var(--mut); margin-right:2px; flex:0 0 auto;}
  .fchip{font-size:13px; padding:7px 13px; border-radius:999px; border:1px solid var(--hair-strong); color:var(--ink-dim); background:rgba(255,255,255,.03); cursor:pointer; transition:background .15s,color .15s,border-color .15s; -webkit-tap-highlight-color:transparent; white-space:normal; max-width:100%; font-family:inherit;}
  .detail-head{margin:22px 0 10px; font-size:15px; font-weight:700; color:#fff; letter-spacing:-0.01em;}
  table.sched{width:100%; border-collapse:collapse;}
  table.sched td{padding:8px 4px; border-bottom:1px solid var(--hair); font-size:14px; vertical-align:top; line-height:1.45;}
  table.sched td:first-child{color:var(--ink-dim); white-space:nowrap; padding-right:14px; width:1%; font-variant-numeric:tabular-nums;}
  .sched-note{color:var(--mut); font-size:13px;}
  .fchip:hover{color:#fff; background:rgba(255,255,255,.07);}
  .fchip[aria-pressed="true"]{color:#fff; background:var(--accent); border-color:var(--accent);}
  .fchip.sub[aria-pressed="true"]{background:rgba(41,151,255,.18); color:var(--blue); border-color:rgba(41,151,255,.45);}

  /* ===== Reveal on scroll ===== */
  .reveal{opacity:0; transform:translateY(20px); transition:opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1);}
  .reveal.in{opacity:1; transform:none;}

  /* ===== Footer ===== */
  footer{max-width:760px; margin:0 auto; padding:48px 20px calc(env(safe-area-inset-bottom) + 44px); text-align:center; border-top:1px solid var(--hair); margin-top:36px;}
  footer .f-line{font-family:var(--mono); font-size:11.5px; letter-spacing:.03em; color:var(--mut); line-height:1.9;}
  footer .f-actions{margin-top:11px; display:flex; justify-content:center;}
  .copy-mcp{display:inline-flex; align-items:center; gap:7px; font-family:var(--mono); font-size:12px; letter-spacing:.02em; color:var(--ink-dim);
    background:rgba(255,255,255,.03); border:1px solid var(--hair-strong); border-radius:999px; padding:7px 14px; cursor:pointer; transition:.2s; -webkit-tap-highlight-color:transparent;}
  .copy-mcp:hover{color:#fff; background:rgba(41,151,255,.1); border-color:rgba(41,151,255,.4);}
  .copy-mcp .cm-ic{opacity:.7;}
  .copy-mcp.copied{color:var(--green); border-color:rgba(48,209,88,.45); background:rgba(48,209,88,.1);}
  footer .f-sig{margin-top:14px; font-family:var(--font); font-size:13px; color:var(--ink-dim);}
  footer .f-sig a{color:var(--ink); border-bottom:1px solid var(--hair-strong); padding-bottom:1px;}
  footer .f-sig a:hover{color:#fff; border-color:var(--ink);}
  footer .counter{margin-top:18px; display:flex; justify-content:center;}
  footer .counter a{display:inline-flex; align-items:center; padding:5px 7px; border:1px solid var(--hair); border-radius:9px; background:rgba(255,255,255,.03); opacity:.92; transition:opacity .2s, background .2s, border-color .2s;}
  footer .counter a:hover{opacity:1; background:rgba(255,255,255,.06); border-color:var(--hair-strong);}

  .hidden{display:none !important;}
  @media (max-width:520px){
    .hero{padding:44px 0 22px;}
    .row>*{min-width:100%;}
    .acts .btn{flex:1;}
    .cat-grid{grid-template-columns:1fr;}
  }
</style>
<noscript><style>.reveal{opacity:1 !important; transform:none !important;}</style></noscript>
</head>
<body>
<nav class="nav"><div class="nav-in">
  <span class="brand"><span class="dot"></span>🏫 우리 학교 알리미</span>
  <a class="nav-link" href="https://chris.gomdori.app" target="_blank" rel="noopener noreferrer">딴짓하는 류주임 ↗</a>
</div></nav>
<main>
  <section class="hero">
    <div class="grid-bg"></div>
    <span class="eyebrow"><span class="pulse"></span>전국 초·중·고 · 공시정보 35종</span>
    <h1 class="display"><span class="grad">수행평가 계획부터 급식까지,</span><br/><span class="accent">학교 이름 하나로.</span></h1>
    <p class="hero-sub">학교알리미에 흩어진 공시정보를, 학교 이름만 입력하면 한 번에. 수행평가 hwp는 표로 변환하고 원본도 그대로 받습니다.</p>
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

  <section id="recent" class="recent hidden"></section>
  <section id="results"></section>
  <section id="output"></section>

  <section class="section">
    <span class="chapter-label"><span class="num">35종</span> 무엇을 알 수 있나요</span>
    <h2>학교 이름 하나로,<br/>이만큼 알려드려요.</h2>
    <p class="lead">학교알리미 OpenAPI 정형 데이터 35종에, 첨부파일로만 공개되는 <b style="color:var(--ink)">수행평가 계획</b>까지 더했습니다.</p>

    <article class="hl reveal">
      <span class="badge">이 도구의 핵심</span>
      <h3>교과별 교수·학습 및 평가 운영 계획</h3>
      <p>학부모가 가장 궁금해하는 <b>수행평가 주제·평가기준·반영비율</b>. 학교알리미엔 hwp 첨부로만 숨어 있는 이 항목을 <b>자동으로 내려받아 표로 변환</b>하고, 원본 파일도 그대로 드립니다.</p>
    </article>

    <div class="cat-grid">${catCards}</div>
  </section>
</main>

<footer>
  <div class="f-line">데이터 출처 · 학교알리미(schoolinfo.go.kr) · 공공누리 제1유형<br/>hwp 변환 · kordoc</div>
  <div class="f-actions">
    <button type="button" id="copyMcp" class="copy-mcp" title="클릭하면 원격 MCP 주소 복사">
      <span class="cm-text">원격 MCP · /mcp</span>
      <svg class="cm-ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V5a2 2 0 0 1 2-2h10"></path></svg>
    </button>
  </div>
  <div class="f-sig">만든 사람 · <a href="https://chris.gomdori.app" target="_blank" rel="noopener noreferrer">딴짓하는 류주임</a></div>
  <div class="counter">
    <a href="https://hitscounter.dev/history?url=https://school-mcp.fly.dev" target="_blank" rel="noopener noreferrer" aria-label="방문 통계 보기">
      <img src="https://hitscounter.dev/api/hit?url=https%3A%2F%2Fschool-mcp.fly.dev&label=visits&icon=mortarboard&color=%232997ff&style=flat&tz=Asia%2FSeoul" alt="visits" height="20"/>
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
  // marked 로드 실패 시에도 최소 가독성 유지(줄바꿈만 <br>). 이스케이프/정제는 그대로.
  const html = (window.marked ? marked.parse(md) : h(md).replace(/\\n/g,'<br>'));
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
  // 홈페이지: 지역검색은 주소를 이미 알아 바로 링크. 이름검색은 데이터에 없어 클릭 시 해석(resolveHome).
  const hpBtn = hp
    ? '<a class="btn btn-line btn-sm" href="'+h(hp)+'" target="_blank" rel="noopener noreferrer">🌐 홈페이지</a>'
    : (opts.resolveHome && ctx.kind ? '<button class="btn btn-line btn-sm" data-act="home" '+d+'>🌐 홈페이지</button>' : '');
  // 학교급(kind)을 모르면 공시/평가계획 조회가 불가하므로 버튼 대신 안내 (지역검색 유도)
  const acts = ctx.kind
    ? '<div class="acts">'
      + '<button class="btn btn-primary btn-sm" data-act="eval" '+d+'>📋 수행평가 계획</button>'
      + '<button class="btn btn-soft btn-sm" data-act="digest" '+d+'>📊 핵심 공시</button>'
      + '<button class="btn btn-soft btn-sm" data-act="schedule" '+d+'>🗓 학사일정</button>'
      + '<button class="btn btn-soft btn-sm" data-act="compare" '+d+'>🏫 주변 비교</button>'
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
      {tag:s.kind, resolveHome:true, meta:[[s.sido,s.sgg,s.dong].filter(Boolean).join(' '), s.foundation].filter(Boolean).map(h).join(' · ')}
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
  else if (act === 'schedule'){ rememberFrom(b); loadSchedule(ctxOf(b)); }
  else if (act === 'compare'){ rememberFrom(b); loadCompare(ctxOf(b)); }
  else if (act === 'evalSeq'){ loadEval(ctxOf(b), b.getAttribute('data-seq'), b.getAttribute('data-year')); }
  else if (act === 'evalAll'){ loadAllEval(ctxOf(b), b.getAttribute('data-year')); }
  else if (act === 'home'){ openHomepage(ctxOf(b), b); }
});

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
  }catch(e){ $('output').innerHTML = info('조회 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.'); }
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
    if (t){ t.classList.add('wide'); applyFilter(t); }
    drawDetail();
  };
  card.addEventListener('click', (e) => {
    if (e.target.closest('[data-fulldoc]')){ openModal('📄 '+h(d.school)+' 평가계획 원문', mdToOut(d.markdown)); return; }
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
  }catch(e){ $('output').innerHTML = info('조회 중 오류가 발생했습니다.'); }
}
/* ── 학사일정 (NEIS) ── */
async function loadSchedule(ctx){
  $('output').innerHTML = spinner('🗓 '+h(ctx.name)+' 학사일정을 가져오는 중…');
  try{
    const r = await fetch('/api/schedule?'+qp(ctx));
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    renderSchedule(d);
  }catch(e){ $('output').innerHTML = info('조회 중 오류가 발생했습니다.'); }
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
/* ── 주변 학교 학생수 비교 (같은 시군구·학교급) ── */
async function loadCompare(ctx){
  $('output').innerHTML = spinner('🏫 '+h(ctx.sgg||'')+' '+h(ctx.kind||'')+' 학생수를 비교하는 중…');
  try{
    const r = await fetch('/api/compare?'+qp(ctx));
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    renderCompare(ctx, d);
  }catch(e){ $('output').innerHTML = info('비교 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.'); }
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
  const card = document.createElement('div'); card.className='card fade';
  card.innerHTML = '<div class="result-head"><h2>'+title+'</h2></div>'
    + '<p class="desc">같은 시군구 '+h(d.kind||ctx.kind||'')+' '+schools.length+'곳을 학생수 순으로 정리했어요. <b>★</b>는 선택한 학교.</p>'
    + '<div class="out"><div class="tablewrap">'+table+'</div><div class="scroll-hint">← 표를 좌우로 넘겨보세요 →</div></div>';
  $('output').innerHTML=''; $('output').appendChild(card);
  $('output').scrollIntoView({behavior:'smooth', block:'start'});
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
function render(titleHtml, md, dlHtml){
  const card = document.createElement('div'); card.className='card fade';
  card.innerHTML = '<div class="result-head"><h2>'+titleHtml+'</h2></div>' + (dlHtml||'');
  card.appendChild(mdToOut(md));
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

renderRecent();

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
</script>
</body>
</html>`;
}
