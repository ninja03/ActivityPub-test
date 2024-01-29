const url = Deno.args[0];
if (!url) {
  console.log("client.js [url]");
  Deno.exit();
}
const opt = {
  method: "GET",
  headers: { "Accept": "application/activity+json" },
};
const json = await (await fetch(url, opt)).json();
console.log(json);
const fn0 = url.substring(url.lastIndexOf("/") + 1);
const fn = fn0.endsWith(".json") ? fn0 : fn0 + ".json";
await Deno.writeTextFile(fn, JSON.stringify(json, null, 2));
