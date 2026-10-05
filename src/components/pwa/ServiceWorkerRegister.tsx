"use client";

import { useEffect } from "react";

/**
 * 서비스 워커 등록. 화면에는 아무것도 그리지 않는다.
 *
 * 개발 서버에서는 등록하지 않는다. 캐시가 HMR보다 먼저 응답해
 * 고친 코드가 화면에 안 보이는 혼란을 막기 위해서다.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error) => console.error("[pwa] 서비스 워커 등록 실패", error));
  }, []);

  return null;
}
