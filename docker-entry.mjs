// 容器進入點：以 root 啟動只為了確保資料磁碟可寫，接著降成一般使用者再啟動伺服器。
// （掛載進來的磁碟常常屬於 root；應用程式本身不需要 root 權限。）
import fs from "node:fs";
import path from "node:path";

const dataDir = path.dirname(process.env.DATABASE_PATH || "/data/yuehao.db");
if (process.getuid?.() === 0) {
  const uid = 1000; // node 映像內建的 node 使用者
  // 不跟隨符號連結，也不處理根目錄，避免設定錯誤時改到資料磁碟以外的檔案
  const chown = (p) => {
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) return;
    fs.lchownSync(p, uid, uid);
    if (st.isDirectory()) for (const f of fs.readdirSync(p)) chown(path.join(p, f));
  };
  if (path.resolve(dataDir) === "/") throw new Error("DATABASE_PATH 不能放在根目錄，請放在專用的資料夾（例如 /data）");
  fs.mkdirSync(dataDir, { recursive: true });
  chown(dataDir);
  process.setgid(uid);
  process.setuid(uid);
  process.env.HOME = "/home/node";
}
await import("./server.js");
