export type MediaErrorKind = "insecure" | "denied" | "not_found" | "in_use" | "unknown";

export class MediaAccessError extends Error {
  constructor(
    public readonly kind: MediaErrorKind,
    cause?: unknown,
  ) {
    super(kind, { cause });
    this.name = "MediaAccessError";
  }
}

/**
 * getUserMedia with errors normalized into something the UI can explain.
 * Browsers only expose `navigator.mediaDevices` in a secure context (HTTPS or
 * localhost) — over plain http://<ip> it is undefined and the naive call
 * throws a TypeError synchronously.
 */
export async function requestUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  if (typeof window === "undefined" || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new MediaAccessError("insecure");
  }
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") throw new MediaAccessError("denied", err);
    if (name === "NotFoundError" || name === "OverconstrainedError") throw new MediaAccessError("not_found", err);
    if (name === "NotReadableError" || name === "AbortError") throw new MediaAccessError("in_use", err);
    throw new MediaAccessError("unknown", err);
  }
}

export function mediaErrorKind(err: unknown): MediaErrorKind {
  return err instanceof MediaAccessError ? err.kind : "unknown";
}

export const MEDIA_ERROR_COPY: Record<MediaErrorKind, { title: string; body: string }> = {
  insecure: {
    title: "Camera and mic need a secure connection",
    body: "Browsers only allow calls over HTTPS (or localhost). Open Wisp through its https:// address to use voice and video.",
  },
  denied: {
    title: "Camera or mic access was blocked",
    body: "Allow access in your browser's site settings (the icon next to the address bar), then try again.",
  },
  not_found: {
    title: "No camera or microphone found",
    body: "Plug one in or check that your device isn't disabled, then try again.",
  },
  in_use: {
    title: "Your camera or mic is busy",
    body: "Another app or tab may be using it. Close it and try again.",
  },
  unknown: {
    title: "Couldn't start your camera or mic",
    body: "Check your device and browser permissions, then try again.",
  },
};
