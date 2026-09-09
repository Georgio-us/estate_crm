import { getApiUrl } from "@/lib/api";

async function proxyInvitationRequest(request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await context.params;
  const valid = (request.method === "GET" && path.length === 1)
    || (request.method === "POST" && path.length === 2 && path[1] === "accept");
  if (!valid || !path[0] || !/^[A-Za-z0-9_-]{40,100}$/.test(path[0])) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const headers = new Headers();
  if (request.headers.get("content-type")) headers.set("content-type", request.headers.get("content-type")!);
  try {
    const apiResponse = await fetch(`${getApiUrl()}/auth/invitations/${path.map(encodeURIComponent).join("/")}`, {
      method: request.method,
      headers,
      body: request.method === "POST" ? await request.text() : undefined,
      cache: "no-store",
    });
    const responseHeaders = new Headers();
    const contentType = apiResponse.headers.get("content-type");
    const setCookie = apiResponse.headers.get("set-cookie");
    if (contentType) responseHeaders.set("content-type", contentType);
    if (setCookie) responseHeaders.set("set-cookie", setCookie);
    return new Response(await apiResponse.text(), { status: apiResponse.status, headers: responseHeaders });
  } catch {
    return Response.json({ error: "api_unavailable", message: "Сервер CRM временно недоступен." }, { status: 502 });
  }
}

export const GET = proxyInvitationRequest;
export const POST = proxyInvitationRequest;
