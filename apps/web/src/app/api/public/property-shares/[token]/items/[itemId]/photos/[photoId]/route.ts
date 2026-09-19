import { getApiUrl } from "@/lib/api";

const tokenPattern = /^[A-Za-z0-9_-]{40,64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, context: { params: Promise<{ token: string; itemId: string; photoId: string }> }) {
  const { token, itemId, photoId } = await context.params;
  if (!tokenPattern.test(token) || !uuidPattern.test(itemId) || !uuidPattern.test(photoId)) return new Response(null, { status: 404 });
  try {
    const apiResponse = await fetch(new URL(`/public/property-shares/${token}/items/${itemId}/photos/${photoId}`, getApiUrl()), { cache: "no-store" });
    if (!apiResponse.ok) return new Response(null, { status: apiResponse.status });
    const headers = new Headers({ "cache-control": "private, max-age=60" });
    const contentType = apiResponse.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    return new Response(apiResponse.body, { status: 200, headers });
  } catch {
    return new Response(null, { status: 502 });
  }
}
