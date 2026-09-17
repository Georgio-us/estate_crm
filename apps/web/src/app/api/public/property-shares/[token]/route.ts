import { getApiUrl } from "@/lib/api";

const tokenPattern = /^[A-Za-z0-9_-]{40,64}$/;

async function proxyPublicShare(request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await context.params;
  if (!tokenPattern.test(token) || !new Set(["GET", "POST"]).has(request.method)) return Response.json({ error: "not_found" }, { status: 404 });

  const suffix = request.method === "POST" ? "/open" : "";
  try {
    const apiResponse = await fetch(new URL(`/public/property-shares/${token}${suffix}`, getApiUrl()), {
      method: request.method,
      cache: "no-store",
    });
    const headers = new Headers({ "cache-control": "public, no-store" });
    const contentType = apiResponse.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    return new Response(apiResponse.body, { status: apiResponse.status, headers });
  } catch {
    return Response.json({ error: "api_unavailable", message: "Подборка временно недоступна." }, { status: 502 });
  }
}

export const GET = proxyPublicShare;
export const POST = proxyPublicShare;
