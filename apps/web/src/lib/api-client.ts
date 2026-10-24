export function getSavedToken(): string | null {
  if (typeof window === "undefined") return null;
  const urlParams = new URLSearchParams(window.location.search);
  const qToken = urlParams.get("token");
  if (qToken) {
    try {
      localStorage.setItem("occ_token", qToken);
      document.cookie = `occ_session=${encodeURIComponent(qToken)}; path=/; samesite=lax`;
    } catch {
      // ignore storage error
    }
    return qToken;
  }
  try {
    return localStorage.getItem("occ_token");
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("occ_token", token);
    document.cookie = `occ_session=${encodeURIComponent(token)}; path=/; samesite=lax`;
  } catch {
    // ignore
  }
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set("x-occ-csrf", "1");

  const token = getSavedToken();
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }

  if (!headers.has("content-type") && options.body && typeof options.body === "string") {
    headers.set("content-type", "application/json");
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errMessage = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && data.error) errMessage = data.error;
    } catch {
      // not json
    }
    throw new Error(errMessage);
  }

  return res.json() as Promise<T>;
}
