import { handleWeb } from "https://code4fukui.github.io/wsutil/handleWeb.js";

const port = Deno.args[0] || 8000;

Deno.serve({
  port,
  hostname: "[::]",
  handler: async (request, info) => {
    const path = new URL(request.url).pathname;
    console.log(request, path);
    if (path == "/nodeinfo/2.1") {
      const data = await Deno.readTextFile("./nodeinfo.json");
      return new Response(data, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } else if (path == "/") {
      const data = await Deno.readTextFile("./person.activity.json");
      return new Response(data, {
        status: 200,
        headers: { "Content-Type": "application/activity+json; charset=utf-8" },
      });
    } else if (path == "/.well-known/host-meta") {
      const data = await Deno.readTextFile("./host-meta.xml");
      return new Response(data, {
        status: 200,
        headers: { "Content-Type": "application/xml; charset=utf-8" },
      });
    } else if (path == "/.well-known/webfinger") {
      const data = await Deno.readTextFile("./webfinger.jrd.json");
      return new Response(data, {
        status: 200,
        headers: { "Content-Type": "application/jrd+json; charset=utf-8" },
      });
    } else if (path == "/inbox") {
      const data = await Deno.readTextFile("inbox.activity.json");
      return new Response(data, {
        status: 200,
        headers: { "Content-Type": "application/activity+json; charset=utf-8" },
      });
    } else if (path == "/outbox") {
      const data = await Deno.readTextFile("outbox.activity.json");
      return new Response(data, {
        status: 200,
        headers: { "Content-Type": "application/activity+json; charset=utf-8" },
      });
    } else if (path == "/items/note.1.activity.json") {
      const data = await Deno.readTextFile("note.1.activity.json");
      return new Response(data, {
        status: 200,
        headers: { "Content-Type": "application/activity+json; charset=utf-8" },
      });
    } else {
      return handleWeb("static", request, path, info);
    }
  },
});
