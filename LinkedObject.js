const createID = (base) => base + Math.random();

class LinkedObject {
  constructor(type, id) {
    this.type = type;
    this.id = id;
  }
  toJSON() {
    const json = { "@context": "https://www.w3.org/ns/activitystreams" };
    for (const name in this) {
      if (name[0] == "_") continue; // skip private members
      const o = this[name];
      if (o === null || o === undefined) continue;
      json[name] = o instanceof LinkedObject ? o.toJSON() : o;
    }
    return json;
  }
  toString() {
    return JSON.stringify(this.toJSON(), null, 2);
  }
}

const base = "https://taisuke.fukuno.com/items/";

const nitemspp = 20;

export class OrderedCollectionPage extends LinkedObject {
  constructor(id, parentid, items, page) {
    super("OrderedCollectionPage", id);
    this.partOf = parentid;
    this.totalItems = items.length;
    this.next = id + "?page=" + (page + 1);
    this.prev = id + "?page=" + (page - 1);
    const items2 = [];
    for (let i = 0; i < nitemspp; i++) {
      const idx = (page - 1) * nitemspp + i;
      const item = items[idx];
      if (!item) break;
      items2.push(item);
    }
    this.orderedItems = items2;
  }
}

export class OrderedCollection extends LinkedObject {
  constructor(id, items) {
    super("OrderedCollection", id);
    this.totalItems = items.length;
    this.first = id + "?page=1";
    const n = 1 + Math.floor(items.length / nitemspp);
    this.last = id + "?page=" + (n + 1);
    this._items = items;
    //this.orderedItems = items;
  }
  getPage(page) {
    return new OrderedCollectionPage(this.id + "page" + page, this.id, this._items, page);
  }
}

export class Note extends LinkedObject {
  constructor(id, name, content, published, actor) {
    super("Note", id);
    this.name = name;
    this.content = content;
    this.published = published;
    this.actor = actor;
  }
}

export class ActivityCreate extends LinkedObject {
  constructor(object) {
    super("Create", object.id + ".create");
    this.published = object.published;
    this.actor = object.actor;
    this.to = "https://www.w3.org/ns/activitystreams#Public";
    this.object = object;
  }
}

/*
export class OrderedCollection extends LinkedObject {
  constructor(id) {
    if (!id) id = createID(base);
    super("OredredCollection", id);

  }
}
*/

/*
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    "https://w3id.org/security/v1",
    {
      "manuallyApprovesFollowers": "as:manuallyApprovesFollowers",
      "sensitive": "as:sensitive",
      "Hashtag": "as:Hashtag",
      "quoteUrl": "as:quoteUrl",
      "toot": "http://joinmastodon.org/ns#",
      "Emoji": "toot:Emoji",
      "featured": "toot:featured",
      "discoverable": "toot:discoverable",
      "schema": "http://schema.org#",
      "PropertyValue": "schema:PropertyValue",
      "value": "schema:value",
      "misskey": "https://misskey-hub.net/ns#",
      "_misskey_content": "misskey:_misskey_content",
      "_misskey_quote": "misskey:_misskey_quote",
      "_misskey_reaction": "misskey:_misskey_reaction",
      "_misskey_votes": "misskey:_misskey_votes",
      "_misskey_summary": "misskey:_misskey_summary",
      "isCat": "misskey:isCat",
      "vcard": "http://www.w3.org/2006/vcard/ns#"
    }
  ],
  "id": "https://misskey.io/users/9p1vxd282w5e02ft/outbox?page=true&until_id=9p1vzfmek2xk0347",
  "partOf": "https://misskey.io/users/9p1vxd282w5e02ft/outbox",
  "type": "OrderedCollectionPage",
  "totalItems": 2,
  "orderedItems": []
}
*/
