使い方
enttrypoint.txtにURLを設定

鍵を作成
ssh-keygen -b 4096 -m PKCS8 -t rsa -N '' -f id_rsa

環境変数ID_RSAに設定

deno deployにデプロイ

投稿やフォローの機能はこちらのソースを利用
https://github.com/yusukebe/minidon

実行方法
deno run -A --unstable-kv server.js 8015

テスト投稿
「テスト！」と投稿される
https://tama-city-test.deno.dev/add-note

マストドンでフォローするには左上の検索欄に
tama@tama-city-test.deno.dev
と入力