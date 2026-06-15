// 인메모리 LRU + TTL 캐시. korean-law-mcp(src/lib/cache.ts) 패턴 이식.
//
// 학교 검색·공시·NEIS 학교코드는 같은 (지역/학교/연도)로 반복 조회되므로(예: /api/digest
// 1회 = 지역검색 + 공시 5회 fan-out), 캐시로 latency와 정부 OpenAPI 부하를 줄인다.
// 모듈 전역 싱글톤이라 stateless /mcp 요청 간에도 프로세스 수명 동안 공유된다.

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // ms
}

export class SimpleCache {
  private cache = new Map<string, CacheEntry<any>>();
  constructor(private maxSize = 500) {}

  set<T>(key: string, data: T, ttl: number = 12 * 60 * 60 * 1000): void {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) this.evictOne();
    // 기존 키 갱신 시 Map 순서 끝으로 (LRU 정합)
    this.cache.delete(key);
    this.cache.set(key, { data, timestamp: Date.now(), ttl });
  }

  /** 만료 엔트리 우선 제거, 없으면 LRU(가장 오래된) 제거 */
  private evictOne(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        return;
      }
    }
    const oldest = this.cache.keys().next().value;
    if (oldest !== undefined) this.cache.delete(oldest);
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    // LRU 승격
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data as T;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }
  clear(): void {
    this.cache.clear();
  }
  size(): number {
    return this.cache.size;
  }
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) this.cache.delete(key);
    }
  }
}

/** 전역 학교 데이터 캐시 (검색/공시/NEIS 공용, prefix로 분리) */
export const schoolCache = new SimpleCache(500);

// 만료 엔트리 주기 정리 (프로세스 종료를 막지 않도록 unref)
setInterval(() => schoolCache.cleanup(), 60 * 60 * 1000).unref();
