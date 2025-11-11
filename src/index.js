/// <reference types="@fastly/js-compute" />

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/health") {
    return new Response("ok\n", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (path === "/article/kittens") {
    return handleArticleKittens(request, url);
  }

  if (path.startsWith("/paywall")) {
    return handlePaywall(request, url);
  }

  // Fallback for any other paths
  return new Response("not found\n", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * This simulates the "content origin" (F_origin_0) for /article/kittens.
 * It always marks the content as paywalled by emitting a Paywall header
 * pointing back at this same service's /paywall endpoint.
 */
function handleArticleKittens(request, url) {
  const origin = `${url.protocol}//${url.host}`;

  // Paywall URL the VCL will call on restart
  const paywallUrl = `${origin}/paywall?articleid=premium-kittens`;

  const headers = new Headers();
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Paywall", paywallUrl);

  // Body includes "paywall:" so your Fiddle test
  // events.byVCLFlow[0].groupBy(fnName).deliver[0].originFetch.resp includes "paywall:"
  // will match on the originFetch response.
  const body =
    `<!doctype html>
<html>
  <head><title>Kittens</title></head>
  <body>
    <h1>Cute premium kittens 🐱</h1>
    <p>This article is paywalled.</p>
    <p>paywall: ${paywallUrl}</p>
  </body>
</html>
`;

  return new Response(body, {
    status: 200,
    headers,
  });
}

/**
 * This simulates the "paywall backend" (F_origin_1).
 * It looks at auth-sessionid (set in VCL from the Cookie) and
 * returns Paywall-Result + Paywall-Meta.
 *
 * Rule:
 *   - If auth-sessionid is missing or empty => BLOCK
 *   - Otherwise => ALLOW
 */
function handlePaywall(request, url) {
  const articleId = url.searchParams.get("articleid") || "unknown";
  const sessionId = request.headers.get("auth-sessionid") || "anon";

  const isAnon = !sessionId || sessionId === "anon";
  const isPremium = articleId.toLowerCase().startsWith("premium");

  let result;
  if (isPremium && isAnon) {
    result = "BLOCK";
  } else {
    result = "ALLOW";
  }

  const meta = [
    `article=${articleId}`,
    `session=${sessionId}`,
    `decision=${result}`,
  ].join(";");

  const headers = new Headers();
  headers.set("Paywall-Result", result);
  headers.set("Paywall-Meta", meta);
  headers.set("Content-Type", "text/plain; charset=utf-8");

  // Body includes "paywall-result:" so your Fiddle test
  // events.byVCLFlow[1].groupBy(fnName).recv[0].originFetch.resp includes "paywall-result: "
  // will match.
  const body =
    `paywall-result: ${result}
paywall-meta: ${meta}
`;

  return new Response(body, {
    status: 200,
    headers,
  });
}
