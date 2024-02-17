/*
1時間に一回多摩市のイベント情報をつぶやく

・https://github.com/code4fukui/ActivityPub-test
・https://github.com/yusukebe/minidon

deno run -A --unstable-kv --unstable-cron --watch tama.js
*/

import { escape } from "https://deno.land/std@0.216.0/html/mod.ts";

const domain = "tama-city.deno.dev";
const entrypoint = "https://tama-city.deno.dev/";

const kv = await Deno.openKv();

Deno.serve(async (req) => {
  const url = new URL(req.url);
  console.log("-------" + url.pathname + "-------");
  if (url.pathname == "/") {
    return topHandler(req);
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

// 起動時にイベント情報を取得
let eventData;
await updateEventData();

Deno.cron("data update", "0 0 * * *", updateEventData);
Deno.cron("teiki housou", "0 * * * *", teiki);

/**
 * イベント情報を取ってきてアップデート
 */
async function updateEventData() {
  const tamaEventApi = "https://www.city.tama.lg.jp/event.js";
  const eventJs = await (await fetch(tamaEventApi)).text();
  try {
    const eventDataTmp = eval(`${eventJs};event_data`);
    // 昨日以前のイベントを取り除く
    const today = getYmd(new Date());
    eventData = eventDataTmp.events
      .filter(event => event.opendays.some(day => day >= today))
      .map(event => ({
        title: event.eventtitle,
        opendays: event.opendays.filter(day => day >= today) }
      ));
    console.log("イベントDB更新完了");
  } catch (e) {
    console.log(e);
  }
}

/**
 * イベントの情報を定期ツイートする
 */
async function teiki() {
  const today = getYmd(new Date());
  const todayEvents = eventData.filter(event => event.opendays.includes(today));
  const eventsStr = todayEvents.map(event => `<li>${escape(event.title)}</li>`).join("");
  const message = `本日のイベント<br><br><ul>${eventsStr}</ul>`;
  console.log("投稿: " + message);
  await addNote(message);
}

/**
 * Date型を「2024/02/18」などに変換する
 * @param {Date} date 
 * @returns {string}
 */
function getYmd(date) {
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  return `${year}/${month}/${day}`;
}

/**
 * ツイートする
 * @param {string} messageBody 
 */
async function addNote(messageBody) {
  const messageId = crypto.randomUUID();
  const PRIVATE_KEY = await getPrivateKey();

  await kv.set(["messages", messageId], {
    id: messageId,
    body: messageBody
  });

  for await (const follower of kv.list({ prefix: ["followers"] })) {
    const x = await getInbox(follower.value.id);
    await createNote(messageId, x, messageBody, PRIVATE_KEY);
  }
}

/**
 * トップページ（フォロー方法の案内）
 * @param {Request} req 
 * @returns {Response}
 */
function topHandler(req) {
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

/**
 * マストドンなどでevent@tama-city.devと検索したときに来るところ
 * hrefの先で詳細情報を返す
 * https://tama-city.deno.dev/.well-known/webfinger?resource=acct:event@tama-city.dev
 * @param {Request} req
 * @return {Response}
 */
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

/**
 * DBをリセット
 * @param {*} req 
 * @returns 
 */
async function resetHandler(req) {
  for await (const message of kv.list({ prefix: ["messages"]})) {
    await kv.delete(message.key);
  }
  for await (const follower of kv.list({ prefix: ["followers"]})) {
    await kv.delete(follower.key);
  }
  return new Response("リセットしました");
}

/**
 * 動作確認用テスト
 * @param {Request} req 
 * @returns {Promise<Response>}
 */
async function testHandler(req) {
  await teiki();
  return new Response("投稿しました");
}

/**
 * ユーザの情報 (/u/event)
 * @param {Request} req 
 * @returns {Promise<Response>}
 */
async function rootHandler(req) {
  const public_key_pem = await getPublicKey();
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

/**
 * フォロワーリスト (/u/event/followers)
 * @param {Request} req 
 * @returns {Promise<Response>}
 */
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

/**
 * マストドンでフォローなどしたときの投稿先inbox (/u/event/inbox)
 * @param {Request} req 
 * @returns {Promise<Response>}
 */
async function inboxHandler(req) {
  const y = await req.json()
  const x = await getInbox(y.actor);
  const private_key = await getPrivateKey();
  
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

function stob(s) {
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

function btos(b) {
  return String.fromCharCode(...new Uint8Array(b))
}

async function importprivateKey(pem) {
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

async function privateKeyToPublicKey(key) {
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

async function exportPublicKey(key) {
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

async function getInbox(req) {
  const res = await fetch(req, {
    method: 'GET',
    headers: { Accept: 'application/activity+json' },
  })
  return res.json()
}

async function postInbox(req, data, headers) {
  const res = await fetch(req, { method: 'POST', body: JSON.stringify(data), headers })
  return res
}

async function signHeaders(res, strInbox, privateKey) {
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

async function acceptFollow(x, y, privateKey) {
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

async function createNote(strId, x, y, privateKey, hostname) {
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


/**
 * 秘密鍵
 * @returns {Promise<string>}
 */
async function getPrivateKey() {
  const ID_RSA = Deno.env.get("ID_RSA");
  return await importprivateKey(ID_RSA);
}

/**
 * 公開鍵
 * @returns {Promise<string>}
 */
async function getPublicKey() {
  const ID_RSA = Deno.env.get("ID_RSA");
  const PRIVATE_KEY = await importprivateKey(ID_RSA)
  const PUBLIC_KEY = await privateKeyToPublicKey(PRIVATE_KEY)
  return await exportPublicKey(PUBLIC_KEY);
}
