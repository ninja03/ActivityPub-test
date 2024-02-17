import { handleWeb } from "https://code4fukui.github.io/wsutil/handleWeb.js";
import { DateTime, TimeZone } from "https://js.sabae.cc/DateTime.js";
import { OrderedCollection, Note, ActivityCreate } from "./LinkedObject.js";

const kv = await Deno.openKv();

const port = Deno.args[0] || 8000;

const entrypoint = (await Deno.readTextFile("entrypoint.txt"))?.trim();
if (!entrypoint) console.log("set your domain name on entrypoint.txt");

const ID_RSA = Deno.env.get("ID_RSA");
if (!ID_RSA)  console.log("set ID_RSA");

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

const reply = async (fn, content) => {
  const ctype = getContextType(fn);
  const data = content ?? await Deno.readTextFile(fn);
  const data2 = entrypoint ? data.replace(/https:\/\/example.com\//g, entrypoint) : data;
  return new Response(data2, { status: 200, headers: { "Content-Type": ctype } });
};
const replyAJSON = (json) => {
  const data = JSON.stringify(json, null, 2);
  const ctype = map[".activity.json"];
  return new Response(data, { status: 200, headers: { "Content-Type": ctype } });
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

const baseid = entrypoint;

const items = [
  new ActivityCreate(new Note(baseid + "id1", "name1", "content1", "2024-01-29T07:48:29Z", baseid)),
  new ActivityCreate(new Note(baseid + "id2", "name2", "content2", "2024-01-30T06:48:29Z", baseid)),
];
const outbox = new OrderedCollection(baseid + "outbox", items);

Deno.serve({
  port,
  hostname: "[::]",
  handler: async (request, info) => {
    const url = new URL(request.url);
    const path = url.pathname;
    // console.log(request, request.headers.accept, path);
    console.log("-------" + path + "-------");
    if (path == "/add-note") {
      // const form = await request.formData();
      // const messageBody = form.get("message") ?? (new Date().toString() + "です");
      const messageBody = "テスト!";
      const messageId = crypto.randomUUID();
      const PRIVATE_KEY = await importprivateKey(ID_RSA);

      await kv.set(["messages", messageId], {
        id: messageId,
        body: messageBody
      });

      console.log("followers->");
      for await (const follower of kv.list({ prefix: ["followers"] })) {
        console.log("follower.value", follower.value);
        const x = await getInbox(follower.value.id);
        console.log("x", x);
        await createNote(messageId, x, messageBody, PRIVATE_KEY);
      }

      console.log("<-followers");
      return new Response("投稿しました");
    }if (path == "/nodeinfo/2.1") {
      if (true) return new Response(null, { status: 404});
      return await reply("./nodeinfo.json");
    } else if (path == "/") {
      const PRIVATE_KEY = await importprivateKey(ID_RSA)
      const PUBLIC_KEY = await privateKeyToPublicKey(PRIVATE_KEY)
      const public_key_pem = await exportPublicKey(PUBLIC_KEY)

      const content = {
        '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
        "id": "https://example.com/",
        "type": "Person",
        "inbox": "https://example.com/inbox",
        "followers": "https://example.com/followers",
        "preferredUsername": "tama",
        "name": "tama",
        "url": "https://example.com/",
        publicKey: {
          id: `https://example.com/`,
          type: 'Key',
          owner: `https://example.com/`,
          publicKeyPem: public_key_pem,
        },
        "icon": {
          "type": "Image",
          "mediaType": "image/webp",
          "url": "https://example.com/icon.webp"
        }
        // "summary": "tama city event",
        // "following": "https://example.com/following",
        // "outbox": "https://example.com/outbox",
      };
      return await reply("./person.activity.json", JSON.stringify(content));
    } else if (path == "/.well-known/host-meta") {
      if (true) return new Response(null, { status: 404});
      return await reply("./host-meta.xml");
    } else if (path == "/.well-known/webfinger") {
      return await reply("./webfinger.jrd.json");
    } else if (path == "/following") {
      if (true) return new Response(null, { status: 404});
      return await reply("./following.activity.json");
    } else if (path == "/followers") {
      const items = (await Array.fromAsync(kv.list({ prefix: ["followers"]}))).map(a => a.value.id);
      const content = JSON.stringify({
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: `${entryPoint}followers`,
        type: 'OrderedCollection',
        first: {
          type: 'OrderedCollectionPage',
          totalItems: items.length,
          partOf: `${entryPoint}followers`,
          orderedItems: items,
          id: `${entryPoint}followers?page=1`,
        }
      });
      return await reply("./followers.activity.json", content);
    } else if (path == "/outbox") {
      if (true) return new Response(null, { status: 404});
      // return await reply("./outbox.activity.json");
      const n = url.searchParams.get("page");
      if (n !== undefined) {
        return replyAJSON(outbox.getPage(n));
      }
      return replyAJSON(outbox);
    } else if (path == "/inbox") {
      const y = await getParam(request);
      console.log("★y", y);
      const x = await getInbox(y.actor);
      console.log("★x", x);
      const private_key = await importprivateKey(ID_RSA);
      
      if (y.type == "Follow") {
        await kv.set(["followers", y.actor], { id: y.actor });
        await acceptFollow(x, y, private_key);
        return new Response();
      } else if (y.type == 'Undo') {
        await kv.delete(["followers", y.actor]);
        return new Response();
      }
      // await writeLog("inbox", param);
      return new Response(null, { status: 500});
      return await reply("./inbox.activity.json");
    } else if (path == "/outbox") {
      if (true) return new Response(null, { status: 404});
      return await reply("./outbox.activity.json");
    } else if (path == "/items/note.1.activity.json") {
      if (true) return new Response(null, { status: 404});
      return await reply("./note.1.activity.json");
    } else {
      return handleWeb("static", request, path, info);
    }
  },
});

export function stob(s) {
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

export function btos(b) {
  return String.fromCharCode(...new Uint8Array(b))
}

export async function importprivateKey(pem) {
  const pemHeader = '-----BEGIN PRIVATE KEY-----'
  const pemFooter = '-----END PRIVATE KEY-----'
  if (pem.startsWith('"')) pem = pem.slice(1)
  if (pem.endsWith('"')) pem = pem.slice(0, -1)
  pem = pem.split('\\n').join('')
  pem = pem.split('\n').join('')
  const pemContents = pem.substring(pemHeader.length, pem.length - pemFooter.length)
  const der = stob(atob(pemContents))
  const r = await crypto.subtle.importKey(
    'pkcs8',
    der,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    true,
    ['sign']
  )
  return r
}

export async function privateKeyToPublicKey(key) {
  const jwk = await crypto.subtle.exportKey('jwk', key)
  if ('kty' in jwk) {
    delete jwk.d
    delete jwk.p
    delete jwk.q
    delete jwk.dp
    delete jwk.dq
    delete jwk.qi
    delete jwk.oth
    jwk.key_ops = ['verify']
  }
  const r = await crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    true,
    ['verify']
  )
  return r
}

export async function exportPublicKey(key) {
  const der = await crypto.subtle.exportKey('spki', key)
  if ('byteLength' in der) {
    let pemContents = btoa(btos(der))

    let pem = '-----BEGIN PUBLIC KEY-----\n'
    while (pemContents.length > 0) {
      pem += pemContents.substring(0, 64) + '\n'
      pemContents = pemContents.substring(64)
    }
    pem += '-----END PUBLIC KEY-----\n'
    return pem
  }
}

export async function getInbox(req) {
  const res = await fetch(req, {
    method: 'GET',
    headers: { Accept: 'application/activity+json' },
  })
  return res.json()
}

export async function postInbox(req, data, headers) {
  const res = await fetch(req, { method: 'POST', body: JSON.stringify(data), headers })
  return res
}

export async function signHeaders(res, strInbox, privateKey) {
  const strTime = new Date().toUTCString()
  const s = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(res)))
  const s256 = btoa(btos(s))
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    stob(
      `(request-target): post ${new URL(strInbox).pathname}\n` +
        `host: ${new URL(strInbox).hostname}\n` +
        `date: ${strTime}\n` +
        `digest: SHA-256=${s256}`
    )
  )
  const b64 = btoa(btos(sig))
  const headers = {
    Host: new URL(strInbox).hostname,
    Date: strTime,
    Digest: `SHA-256=${s256}`,
    Signature:
      `keyId="${entryPoint}",` +
      `algorithm="rsa-sha256",` +
      `headers="(request-target) host date digest",` +
      `signature="${b64}"`,
    Accept: 'application/activity+json',
    'Content-Type': 'application/activity+json',
    'Accept-Encoding': 'gzip',
    'User-Agent': `Minidon/0.0.0 (+${entryPoint})`,
  }
  return headers
}

export async function acceptFollow(x, y, privateKey) {
  console.log("★acceptFollow x = ", x);
  console.log("★acceptFollow y = ", y);
  console.log("★privateKey = ", privateKey);
  const strId = crypto.randomUUID()
  const strInbox = x.inbox
  console.log("strInbox", strInbox);
  const res = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: `${entryPoint}s/${strId}`,
    type: 'Accept',
    actor: `${entryPoint}`,
    object: y,
  }
  const headers = await signHeaders(res, strInbox, privateKey)
  console.log("headers", headers);
  await postInbox(strInbox, res, headers)
  console.log("★end acceptFollow");
}

export async function createNote(strId, x, y, privateKey) {
  console.log("★createNote");
  const strTime = new Date().toISOString().substring(0, 19) + 'Z'
  const strInbox = x.inbox
  console.log("createNote strInbox = ", strInbox);
  const res = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: `${entryPoint}s/${strId}/activity`,
    type: 'Create',
    actor: `${entryPoint}`,
    published: strTime,
    to: ['https://www.w3.org/ns/activitystreams#Public'],
    cc: [`${entryPoint}followers`],
    object: {
      id: `${entryPoint}s/${strId}`,
      type: 'Note',
      attributedTo: `${entryPoint}`,
      content: y,
      url: `${entryPoint}s/${strId}`,
      published: strTime,
      to: ['https://www.w3.org/ns/activitystreams#Public'],
      cc: [`${entryPoint}followers`],
    },
  }
  console.log("createNote res", res);
  const headers = await signHeaders(res, strInbox, privateKey)
  console.log("createNote headers", headers);
  await postInbox(strInbox, res, headers)
}

export async function deleteNote(x, y, privateKey) {
  const strId = crypto.randomUUID()
  const strInbox = x.inbox
  const res = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: `${entryPoint}s/${strId}/activity`,
    type: 'Delete',
    actor: `${entryPoint}`,
    object: {
      id: y,
      type: 'Note',
    },
  }
  const headers = await signHeaders(res, strInbox, privateKey)
  await postInbox(strInbox, res, headers)
}

function formatDTS(date) {
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}
