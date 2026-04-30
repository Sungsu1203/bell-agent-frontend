// lib/useLogs.ts
// 백엔드 /api/logs를 2초마다 폴링해서 새 로그 줄을 모아두는 React 훅.
// 사용: const { lines, clear } = useLogs(true);  // true면 폴링 켬

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLogs } from "./api";

const POLL_INTERVAL_MS = 2000; // 2초마다 새 로그 가져오기
const MAX_LINES = 1000;        // 메모리 보호: 1000줄 넘으면 오래된 것 버림

export interface LogLine {
  seq: number;
  line: string;
}

export function useLogs(enabled: boolean = true) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const cursorRef = useRef<number>(0);    // 마지막으로 받은 seq 번호
  const isFetchingRef = useRef<boolean>(false); // 중복 요청 방지

  // 한 번 폴링하는 함수
  const pollOnce = useCallback(async () => {
    if (isFetchingRef.current) return; // 이전 요청이 아직 안 끝났으면 건너뜀
    isFetchingRef.current = true;
    try {
      const res = await fetchLogs(cursorRef.current, 200);
      if (res.lines.length > 0) {
        cursorRef.current = res.next_cursor;
        setLines((prev) => {
          const merged = [...prev, ...res.lines];
          // 너무 길어지면 오래된 것 자르기
          if (merged.length > MAX_LINES) {
            return merged.slice(merged.length - MAX_LINES);
          }
          return merged;
        });
      }
    } catch {
      // 네트워크 오류는 조용히 무시 (다음 폴링 때 다시 시도)
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  // enabled가 true면 2초마다 폴링 시작
  useEffect(() => {
    if (!enabled) return;
    pollOnce(); // 마운트 즉시 한 번
    const timer = setInterval(pollOnce, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, pollOnce]);

  // 화면 비우기 (로그 표시만 비움, 서버 데이터는 그대로)
  const clear = useCallback(() => {
    setLines([]);
  }, []);

  return { lines, clear };
}