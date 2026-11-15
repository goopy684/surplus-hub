import { useEffect, useState } from "react";

// 권한 팝업을 띄우지 않는다 — 위치 권한이 이미 허용된 경우에만 좌표를 읽는다.
// navigator.permissions가 없는 환경(JSDOM·일부 브라우저)에서는 null 그대로 둔다.
export function useGrantedCoords(): { lat: number; lng: number } | null {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query || !navigator.geolocation) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (cancelled || status.state !== "granted") return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!cancelled) setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          },
          () => undefined
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return coords;
}
