import { ensureDemo, DEMO_SLUG } from "../src/lib/seed.ts";

ensureDemo();
console.log(`示範店家已就緒：/b/${DEMO_SLUG}（後台請從首頁「免註冊體驗」進入）`);
