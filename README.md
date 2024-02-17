使い方

鍵を作成
ssh-keygen -b 4096 -m PKCS8 -t rsa -N '' -f id_rsa

環境変数ID_RSAに設定

deno deployにデプロイ    
変数のdomainとentrypointを変える  

実行方法  
deno run -A --unstable-kv --unstable-cron tama.js

テスト投稿  
https://tama-city.deno.dev/test

マストドンでフォローするには左上の検索欄に  
tama@tama-city.deno.dev
と入力