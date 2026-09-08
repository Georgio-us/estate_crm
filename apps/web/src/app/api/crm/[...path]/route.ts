import { getApiUrl } from "@/lib/api";

const allowedMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

async function proxyCrmRequest(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;

  if (!allowedMethods.has(request.method) || path.some((segment) => !/^[a-z0-9-]+$/i.test(segment))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const sourceUrl = new URL(request.url);
  const apiUrl = new URL(`/${path.join("/")}`, getApiUrl());
  apiUrl.search = sourceUrl.search;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const cookie = request.headers.get("cookie");

  if (contentType) headers.set("content-type", contentType);
  if (cookie) headers.set("cookie", cookie);

  try {
    const apiResponse = await fetch(apiUrl, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : await request.text(),
      cache: "no-store",
    });
    const responseHeaders = new Headers();
    const responseContentType = apiResponse.headers.get("content-type");

    if (responseContentType) responseHeaders.set("content-type", responseContentType);

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

export const GET = proxyCrmRequest;
export const POST = proxyCrmRequest;
export const PUT = proxyCrmRequest;
export const PATCH = proxyCrmRequest;
export const DELETE = proxyCrmRequest;
