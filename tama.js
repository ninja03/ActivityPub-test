/*
1時間に一回多摩市のイベント情報をつぶやく

・https://github.com/code4fukui/ActivityPub-test
・https://github.com/yusukebe/minidon

deno run -A --unstable-kv --unstable-cron --watch tama.js
*/

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
  } else if (url.pathname == "/reset") {
    return await resetHandler(req);
  } else if (url.pathname == "/test") {
    return await testHandler(req);
  }
  return new Response(null, { status: 404 });
});

let eventData;;
async function updateEventData() {
  eventData = eval(await (await fetch("https://www.city.tama.lg.jp/event.js")).text() + ";event_data");
}

async function teiki() {
  const todayEvents = eventData.events.filter(event => event.opendays.includes(getYmd(new Date())));
  const message = `本日のイベント<br><br><ul>${todayEvents.map(event => `<li>${event.eventtitle}</li>`).join("")}</ul>`;
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
        ActivitiyPubに対応したSNS(Mastdon)でフォローしてイベント情報を得よう！<br>
        event@tama-city.deno.dev<br>
        <br>
        <a href="https://dash.deno.com/playground/tama-city">オープンソースです</a>
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

async function testHandler(req) {
  await teiki();
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
      "mediaType": "image/jpeg",
      "url": "https://res.cloudinary.com/dp8x1rtwn/image/upload/v1708208658/deno/tama_of1lfh.jpg"
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

function getYmd(date) {
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  return `${year}/${month}/${day}`;
}