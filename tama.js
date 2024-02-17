/*
1時間に一回多摩市のイベント情報をつぶやく

・https://github.com/code4fukui/ActivityPub-test
・https://github.com/yusukebe/minidon

deno run -A --unstable-kv --unstable-cron --watch tama.js
*/

import { decodeBase64 } from "https://deno.land/std@0.215.0/encoding/base64.ts";

const domain = "tama-city.deno.dev";
const entrypoint = "https://tama-city.deno.dev/";

const kv = await Deno.openKv();

Deno.serve(async (req) => {
  const url = new URL(req.url);
  console.log("-------" + url.pathname + "-------");
  if (url.pathname == "/") {
    return await topHandler(req);
  } else if (url.pathname == "/.well-known/webfinger") {
    return webfingerHandler(req);
  } else if (url.pathname == "/u/event") {
    return await rootHandler(req);
  } else if (url.pathname == "/u/event/followers") {
    return await followersHandler(req);
  } else if (url.pathname == "/u/event/inbox") {
    return await inboxHandler(req);
  } else if (url.pathname == "/u/event/icon.png") {
    return new Response(
      decodeBase64(ICON_DATA),
      { headers: { "Content-Type": "image/png" } }
    );
  } else if (url.pathname == "/reset") {
    return await resetHandler(req);
  } else if (url.pathname == "/add-note") {
    return await addNoteHandler(req);
  }
  return new Response(null, { status: 404 });
});

let eventData;;
async function updateEventData() {
  eventData = eval(await (await fetch("https://www.city.tama.lg.jp/event.js")).text() + ";event_data");
}

async function teiki() {
  const todayEvents = eventData.events.filter(event => event.opendays.includes("2024/02/23"));
  const message = `本日のイベント\n${todayEvents.map(event => event.eventtitle).join("\n")}`;
  await addNote(message);
}

async function addNote(messageBody) {
  const ID_RSA = Deno.env.get("ID_RSA");
  const messageId = crypto.randomUUID();
  const PRIVATE_KEY = await importprivateKey(ID_RSA);

  await kv.set(["messages", messageId], {
    id: messageId,
    body: messageBody
  });

  for await (const follower of kv.list({ prefix: ["followers"] })) {
    const x = await getInbox(follower.value.id);
    await createNote(messageId, x, messageBody, PRIVATE_KEY);
  }
}

await updateEventData();

Deno.cron("data update", "0 0 * * *", updateEventData);
Deno.cron("teiki housou", "0 * * * *", teiki);

async function topHandler(req) {
  return new Response(`
    <html lang="ja">
    <head>
      <meta charset="utf-8">
      <title>たまイベント</title>
      <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text x=%2250%%22 y=%2250%%22 style=%22dominant-baseline:central;text-anchor:middle;font-size:90px;%22>🕊</text></svg>">
      <style>
        a {
          text-decoration: none;
        }
        body {
          background-color: #F0F0FF;
        }
        .title {
          text-align: center;
        }
        .main {
          background-color: white;
          padding: 2em;
          border-radius: 1em;
          width: 480px;
          margin-left: auto;
          margin-right: auto;
        }
      </style>
    </head>
    <body>
      <div class="title">たまイベント</div><br>
      <div class="main">
        フォローしてイベント情報を得よう！<br>
        event@tama-city.deno.dev
      </div>
    </body>
    </html>
  `, {
    headers: {
      "Content-Type": "text/html; charset=utf-8"
    }
  });
}

function webfingerHandler(req) {
  return Response.json({
    "subject": `acct:event@${domain}`,
    "links": [
      {
        "rel":  "self",
        "type": "application/activity+json",
        "href": `${entrypoint}u/event`
      }
    ]
  }, {
    headers: {
      "Content-Type": "application/jrd+json; charset=utf-8"
    }
  });
}

async function resetHandler(req) {
  for await (const message of kv.list({ prefix: ["messages"]})) {
    await kv.delete(message.key);
  }
  for await (const follower of kv.list({ prefix: ["followers"]})) {
    await kv.delete(follower.key);
  }
  return new Response("リセットしました");
}

async function addNoteHandler(req) {
  await addNote("テスト！");
  return new Response("投稿しました");
}

async function rootHandler(req) {
  const ID_RSA = Deno.env.get("ID_RSA");
  const PRIVATE_KEY = await importprivateKey(ID_RSA)
  const PUBLIC_KEY = await privateKeyToPublicKey(PRIVATE_KEY)
  const public_key_pem = await exportPublicKey(PUBLIC_KEY)
  return Response.json({
    '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
    "id": `${entrypoint}u/event`,
    "type": "Person",
    "inbox": `${entrypoint}u/event/inbox`,
    "followers": `${entrypoint}u/event/followers`,
    "preferredUsername": "たまイベント",
    "name": "たまイベント",
    "url": `${entrypoint}u/event`,
    publicKey: {
      id: `${entrypoint}u/event`,
      type: 'Key',
      owner: `${entrypoint}u/event`,
      publicKeyPem: public_key_pem,
    },
    "icon": {
      "type": "Image",
      "mediaType": "image/png",
      "url": `${entrypoint}u/event/icon.png`
    }
  }, {
    headers: {
      "Content-Type": "application/activity+json; charset=utf-8"
    }
  });
}

async function followersHandler() {
  const items = (await Array.fromAsync(kv.list({ prefix: ["followers"]}))).map(a => a.value.id);
  return Response.json({
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: `${entrypoint}u/event/followers`,
    type: 'OrderedCollection',
    first: {
      type: 'OrderedCollectionPage',
      totalItems: items.length,
      partOf: `${entrypoint}u/event/followers`,
      orderedItems: items,
      id: `${entrypoint}u/event/followers?page=1`,
    }
  }, {
    headers: {
      "Content-Type": "application/activity+json; charset=utf-8"
    }
  });
}

async function inboxHandler(req) {
  const ID_RSA = Deno.env.get("ID_RSA");
  const y = await req.json()
  const x = await getInbox(y.actor);
  const private_key = await importprivateKey(ID_RSA);
  
  if (req.method == "POST") {
    if (y.type == "Follow") {
      await kv.set(["followers", y.actor], { id: y.actor });
      await acceptFollow(x, y, private_key);
      return new Response();
    } else if (y.type == 'Undo') {
      await kv.delete(["followers", y.actor]);
      return new Response();
    }
  }
  return new Response(null, { status: 400 });
}

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
      `keyId="${entrypoint}u/event",` +
      `algorithm="rsa-sha256",` +
      `headers="(request-target) host date digest",` +
      `signature="${b64}"`,
    Accept: 'application/activity+json',
    'Content-Type': 'application/activity+json',
    'Accept-Encoding': 'gzip',
    'User-Agent': `Minidon/0.0.0 (+${entrypoint})`,
  }
  return headers;
}

export async function acceptFollow(x, y, privateKey) {
  const strId = crypto.randomUUID()
  const strInbox = x.inbox
  const res = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: `${entrypoint}u/event/s/${strId}`,
    type: 'Accept',
    actor: `${entrypoint}u/event`,
    object: y,
  }
  const headers = await signHeaders(res, strInbox, privateKey)
  await postInbox(strInbox, res, headers)
}

export async function createNote(strId, x, y, privateKey, hostname) {
  const strTime = new Date().toISOString().substring(0, 19) + 'Z'
  const strInbox = x.inbox
  const res = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: `${entrypoint}u/event/s/${strId}/activity`,
    type: 'Create',
    actor: `${entrypoint}u/event`,
    published: strTime,
    to: ['https://www.w3.org/ns/activitystreams#Public'],
    cc: [`${entrypoint}u/event/followers`],
    object: {
      id: `${entrypoint}u/event/s/${strId}`,
      type: 'Note',
      attributedTo: `${entrypoint}u/event`,
      content: y,
      url: `${entrypoint}u/event/s/${strId}`,
      published: strTime,
      to: ['https://www.w3.org/ns/activitystreams#Public'],
      cc: [`${entrypoint}u/event/followers`],
    },
  }
  const headers = await signHeaders(res, strInbox, privateKey)
  await postInbox(strInbox, res, headers)
}

const ICON_DATA = "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";