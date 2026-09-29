import { ImageResponse } from "next/og";
import { APP_NAME } from "@/lib/constants";
import { TAGLINE } from "@/lib/brand";

export const alt = `${APP_NAME}: ${TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Same wisp path as the app icon (src/components/brand/logo.tsx).
const WISP_PATH =
  "M17 47 C 15 33, 22 19, 36 16 C 46 14, 53 20, 52 27 C 51 33, 44 35, 41 30 C 39 27, 41 23, 45 24";

const INK = "#1D1838";
const PAPER = "#F4F3F9";
const VIOLET = "#6B4EFF";
const GLOW = "#2BD4A0";

function Bubble({ text, you }: { text: string; you?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignSelf: you ? "flex-end" : "flex-start",
        padding: "22px 30px",
        fontSize: 34,
        borderRadius: 34,
        borderBottomLeftRadius: you ? 34 : 8,
        borderBottomRightRadius: you ? 8 : 34,
        background: you ? VIOLET : GLOW,
        color: you ? "white" : "#0B3D2E",
      }}
    >
      {text}
    </div>
  );
}

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: 72,
          background: PAPER,
          fontFamily: "sans-serif",
          color: INK,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 600 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                display: "flex",
                width: 64,
                height: 64,
                borderRadius: 19,
                background: VIOLET,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="38" height="38" viewBox="0 0 64 64" fill="none">
                <path d={WISP_PATH} stroke="white" strokeWidth="6.5" strokeLinecap="round" fill="none" />
                <circle cx="17" cy="47" r="4.4" fill={GLOW} />
              </svg>
            </div>
            <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>{APP_NAME}</div>
          </div>
          <div style={{ display: "flex", fontSize: 96, fontWeight: 800, lineHeight: 0.95, letterSpacing: -3 }}>
            {TAGLINE}
          </div>
          <div style={{ display: "flex", fontSize: 28, color: "#5F5A78" }}>
            Text, voice or video with someone new.
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 20, flex: 1, paddingLeft: 40 }}>
          <Bubble text="hi! first time here?" />
          <Bubble text="yes 😅 hi from Toronto" you />
          <Bubble text="Lisbon here. what are you listening to?" />
        </div>
      </div>
    ),
    { ...size },
  );
}
