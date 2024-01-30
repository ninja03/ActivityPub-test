import * as t from "https://deno.land/std/testing/asserts.ts";
import { OrderedCollection, Note, ActivityCreate } from "./LinkedObject.js";

const baseid = "https://taisuke.fukuno.com/"
Deno.test("simple", () => {
  const items = [
    new ActivityCreate(new Note(baseid + "id1", "name1", "content1")),
    new ActivityCreate(new Note(baseid + "id2", "name2", "content2")),
  ];
  const c = new OrderedCollection(baseid + "outbox", items);
  console.log(c.toString());

  const page = c.getPage(1);
  console.log(page.toString());
});
