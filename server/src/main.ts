import { startServer } from "./gateway/ws";

const port = Number(process.env.PORT ?? 8790);
startServer(port);
console.log(`KDS対戦サーバーを起動しました: http://localhost:${port} （/healthz で確認できます）`);
