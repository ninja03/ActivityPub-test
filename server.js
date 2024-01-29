import { handleWeb } from "https://code4fukui.github.io/wsutil/handleWeb.js";

const port = Deno.args[0] || 8000;

Deno.serve({
  port,
  hostname: "[::]",
  handler: async (request, info) => {
    const path = new URL(request.url).pathname;
    console.log(request, path);
    if (path == "/") {
      const data = await Deno.readTextFile("./person.activity.json");
      return new Response(data, {
        status: 200,
        headers: { "Content-Type": "application/activity+json" },
      });
    } else if (path == "/.well-known/host-meta") {
      const data = await Deno.readTextFile("./host-meta.xml");
      return new Response(data, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    } else if (path == "/.well-known/webfinger") {
      const data = await Deno.readTextFile("./webfinger.json");
      return new Response(data, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      return handleWeb("static", request, path, info);
    }
  },
});
