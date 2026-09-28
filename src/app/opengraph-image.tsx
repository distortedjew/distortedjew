import { ImageResponse } from "next/og";
import { APP_NAME } from "@/lib/constants";
import { TAGLINE, SUBLINE } from "@/lib/brand";

export const runtime = "edge";
export const alt = `${APP_NAME} — ${TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Same wisp path as the app icon (src/components/brand/logo.tsx), scaled up.
const WISP_PATH =
  "M17 47 C 15 33, 22 19, 36 16 C 46 14, 53 20, 52 27 C 51 33, 44 35, 41 30 C 39 27, 41 23, 45 24";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #FCFBFF 0%, #EDE8FB 55%, #FBE3F0 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 140,
            height: 140,
            borderRadius: 999,
            background: "linear-gradient(135deg, #A78BFA, #FBCFE8)",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 40,
          }}
        >
          <svg width="72" height="72" viewBox="0 0 64 64" fill="none">
            <path
              d={WISP_PATH}
              stroke="white"
              strokeWidth="6.5"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="17" cy="47" r="3.6" fill="white" />
          </svg>
        </div>
        <div style={{ display: "flex", fontSize: 88, fontWeight: 700, color: "#252433" }}>
          {APP_NAME}
        </div>
        <div style={{ display: "flex", fontSize: 34, color: "#4A4760", marginTop: 16 }}>
          {TAGLINE}
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#8B87A0", marginTop: 12 }}>
          {SUBLINE}
        </div>
      </div>
    ),
    { ...size },
  );
}
