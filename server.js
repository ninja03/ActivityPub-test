import { handleWeb } from "https://code4fukui.github.io/wsutil/handleWeb.js";
import { DateTime, TimeZone } from "https://js.sabae.cc/DateTime.js";

const port = Deno.args[0] || 8000;

const entrypoint = (await Deno.readTextFile("entrypoint.txt"))?.trim();
if (!entrypoint) console.log("set your domain name on entrypoint.txt");

const map = {
  ".activity.json": "application/activity+json; charset=utf-8",
  ".jrd.json": "application/jrd+json; charset=utf-8",
  ".json": "application/json",
  ".xml": "application/xml; charset=utf-8",
};

const getContextType = (fn) => {
  for (const name in map) {
    if (fn.endsWith(name)) {
      return map[name];
    }
  }
  console.log("not found in context-type map:", fn);
  return "text/plain";
};

const reply = async (fn) => {
  const ctype = getContextType(fn);
  const data = await Deno.readTextFile(fn);
  const data2 = entrypoint ? data.replace(/https:\/\/example.com\//g, entrypoint) : data;
  return new Response(data2, { status: 200, headers: { "Content-Type": ctype } });
};

const getParam = async (request) => {
  if (request.method != "POST") return null;
  return await request.json();
};

const writeLog = async (name, param) => {
  if (!param) return;
  console.log("get", name, param);
  const d = new DateTime().toLocal(TimeZone.JST);
  await Deno.mkdir(name, { recursive: true });
  const fn = name + "/" + d.day.toStringYMD() + "_" + d.time.toStringHMS() + ".json";
  await Deno.writeTextFile(fn, JSON.stringify(param, null, 2));
};

Deno.serve({
  port,
  hostname: "[::]",
  handler: async (request, info) => {
    const path = new URL(request.url).pathname;
    console.log(request, request.headers.accept, path);
    if (path == "/nodeinfo/2.1") {
      return await reply("./nodeinfo.json");
    } else if (path == "/") {
      return await reply("./person.activity.json");
    } else if (path == "/.well-known/host-meta") {
      return await reply("./host-meta.xml");
    } else if (path == "/.well-known/webfinger") {
      return await reply("./webfinger.jrd.json");
    } else if (path == "/following") {
      return await reply("./following.activity.json");
    } else if (path == "/followers") {
      return await reply("./followers.activity.json");
    } else if (path == "/outbox") {
      return await reply("./outbox.activity.json");
    } else if (path == "/inbox") {
      const param = await getParam(request);
      await writeLog("inbox", param);
      return await reply("./inbox.activity.json");
    } else if (path == "/outbox") {
      return await reply("./outbox.activity.json");
    } else if (path == "/items/note.1.activity.json") {
      return await reply("./note.1.activity.json");
    } else {
      return handleWeb("static", request, path, info);
    }
  },
});
