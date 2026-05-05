// lib/useEvents.ts
// 백엔드 /api/events 를 1.5초마다 폴링해서 사용자 관점 진행 이벤트를 모아두는 훅.
// useLogs 와 별도 cursor — 백엔드는 명령(api_run)마다 이벤트 버퍼를 clear 하므로
// frontend 도 cursor 가 next_cursor 보다 크면 백엔드 reset 으로 간주하고 0 으로 되돌린다.

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchEvents, type EventItem } from "./api";

const POLL_INTERVAL_MS = 1500;
const MAX_EVENTS = 200;

export function useEvents(enabled: boolean = true) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const cursorRef = useRef<number>(0);
  const isFetchingRef = useRef<boolean>(false);

  const pollOnce = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const res = await fetchEvents(cursorRef.current, MAX_EVENTS);

      // 백엔드 reset 감지: next_cursor 가 이전 cursor 보다 작으면 새 명령 시작
      if (res.next_cursor < cursorRef.current) {
        cursorRef.current = 0;
        setEvents([]);
        // 다음 폴링에서 처음부터 다시 가져옴
        return;
      }

      if (res.events.length > 0) {
        cursorRef.current = res.next_cursor;
        setEvents((prev) => {
          const merged = [...prev, ...res.events];
          if (merged.length > MAX_EVENTS) {
            return merged.slice(merged.length - MAX_EVENTS);
          }
          return merged;
        });
      }
    } catch {
      /* ignore */
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    pollOnce();
    const timer = setInterval(pollOnce, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, pollOnce]);

  const latest = events.length > 0 ? events[events.length - 1] : null;

  return { events, latest };
}
