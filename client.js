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
await Deno.writeTextFile("mastodon_taisukef.json", JSON.stringify(json, null, 2));
