import { adsTxt } from "@/lib/ads";

/**
 * /ads.txt: tells ad buyers which ad accounts may sell space on this site.
 * AdSense withholds or limits ads until it's present. 404 while ads are off.
 */
export function GET() {
  const body = adsTxt();
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
