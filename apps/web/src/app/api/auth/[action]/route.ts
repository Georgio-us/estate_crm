import { getApiUrl } from "@/lib/api";

const allowedMethods = {
  login: "POST",
  session: "GET",
  logout: "POST",
} as const;

type AuthAction = keyof typeof allowedMethods;

async function proxyAuthRequest(
  request: Request,
  context: { params: Promise<{ action: string }> },
): Promise<Response> {
  const { action } = await context.params;

  if (!(action in allowedMethods)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const authAction = action as AuthAction;
  if (request.method !== allowedMethods[authAction]) {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const cookie = request.headers.get("cookie");

  if (contentType) headers.set("content-type", contentType);
  if (cookie) headers.set("cookie", cookie);

  try {
    const apiResponse = await fetch(`${getApiUrl()}/auth/${authAction}`, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : await request.text(),
      cache: "no-store",
    });
    const responseHeaders = new Headers();
    const responseContentType = apiResponse.headers.get("content-type");
    const setCookie = apiResponse.headers.get("set-cookie");

    if (responseContentType) responseHeaders.set("content-type", responseContentType);
    if (setCookie) responseHeaders.set("set-cookie", setCookie);

    return new Response(await apiResponse.text(), {
      status: apiResponse.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json({
      error: "api_unavailable",
      message: "Сервер CRM временно недоступен.",
    }, { status: 502 });
  }
}

export const GET = proxyAuthRequest;
export const POST = proxyAuthRequest;
