// 타임아웃 + 지수백오프 재시도 fetch 래퍼.
//
// korean-law-mcp(src/lib/fetch-with-retry.ts)의 패턴을 이식하되, law.go.kr 전용
// 로직(Referer 주입·detectBadBody의 response.clone().text())은 제거했다.
// detectBadBody 제거 이유: 거대 응답(이름검색 4MB·평가계획 50MB)을 본문 검사 위해
// 이중 버퍼링하면 호출부의 크기 상한 방어를 우회하기 때문.
//
// 정부 OpenAPI(학교알리미·NEIS)의 간헐 장애(429/503/504/타임아웃)에 1회 즉시 실패하던
// 단발 fetch를 자동 재시도로 보강한다. 멱등 조회(GET·검색 POST)에만 사용.

/** URL/에러 메시지의 인증키(apiKey/KEY/oc 등) 마스킹 — 로그·에러 유출 방지 */
export function maskSensitiveUrl(text: string): string {
  if (!text) return text;
  return text.replace(/([?&](?:apikey|api_key|authkey|auth_key|key|oc|token)=)[^&\s]+/gi, "$1***");
}

export interface RetryOptions {
  /** 요청 타임아웃(ms). 기본 15000 */
  timeout?: number;
  /** 추가 재시도 횟수(첫 시도 제외). 기본 2 */
  retries?: number;
  /** 지수백오프 기준 지연(ms). 기본 500 */
  retryDelay?: number;
  /** 재시도할 HTTP 상태. 기본 [429,502,503,504] */
  retryOn?: number[];
  /** 에러 메시지 라벨 (예: "학교알리미 OpenAPI", "NEIS") */
  label?: string;
}

const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY = 500;
const DEFAULT_RETRY_ON = [429, 502, 503, 504];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry-After 헤더 우선, 없으면 지수백오프 + jitter */
function getRetryDelay(res: Response | null, base: number, attempt: number): number {
  const ra = res?.headers.get("Retry-After");
  if (ra) {
    const sec = Number(ra);
    if (Number.isFinite(sec) && sec > 0) return sec * 1000;
  }
  const d = base * Math.pow(2, attempt);
  return d + Math.random() * d * 0.5;
}

export async function fetchWithRetry(
  url: string | URL,
  init: RequestInit = {},
  opts: RetryOptions = {}
): Promise<Response> {
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT;
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const retryDelay = opts.retryDelay ?? DEFAULT_RETRY_DELAY;
  const retryOn = opts.retryOn ?? DEFAULT_RETRY_ON;
  const label = opts.label ?? "외부 API";

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeout);
    try {
      const res = await fetch(url, { ...init, signal: ac.signal });
      clearTimeout(timer);
      // 성공이거나 재시도 대상이 아닌 상태 → 그대로 반환(호출부가 !res.ok 처리)
      if (res.ok || !retryOn.includes(res.status)) return res;
      lastErr = new Error(`HTTP ${res.status} — ${label}`);
      if (attempt < retries) {
        await sleep(getRetryDelay(res, retryDelay, attempt));
        continue;
      }
      return res; // 재시도 소진 → 호출부가 상태로 판단하도록 반환
    } catch (e: any) {
      clearTimeout(timer);
      lastErr =
        e?.name === "AbortError"
          ? new Error(`${label} 응답 시간이 초과되었습니다.`)
          : new Error(maskSensitiveUrl(String(e?.message ?? e)));
      if (attempt < retries) {
        await sleep(getRetryDelay(null, retryDelay, attempt));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr ?? new Error(`${label} 요청 실패`);
}
