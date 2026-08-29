const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const WorkerManager = require("./worker_manager");
const config = require("./config");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// Tạo thư mục public nếu chưa có
if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

// 1. Tạo HTTP Server phục vụ giao diện tĩnh và API
const server = http.createServer((req, res) => {
    let reqUrl = req.url.split("?")[0];
    if (reqUrl === "/" || reqUrl === "") reqUrl = "/index.html";

    const filePath = path.join(PUBLIC_DIR, reqUrl);
    const ext = path.extname(filePath).toLowerCase();

    const mimeTypes = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon"
    };

    const contentType = mimeTypes[ext] || "text/plain; charset=utf-8";

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === "ENOENT") {
                res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
                res.end("404 Not Found");
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { "Content-Type": contentType });
            res.end(content);
        }
    });
});

// 2. Tạo WebSocket Server để giao tiếp thời gian thực
const wss = new WebSocket.Server({ server });

function broadcastMessage(data) {
    const jsonStr = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(jsonStr);
        }
    });
}

const manager = new WorkerManager(broadcastMessage);

// Khởi tạo tài khoản mẫu đầu tiên từ config
manager.createWorker({
    username: config.account.username || "035099002016",
    password: config.account.password || "123",
    mode: "video",
    course: "Kỹ thuật lái xe",
    headless: false
});

wss.on("connection", (ws) => {
    console.log("[WS] Client kết nối vào Dashboard!");

    // Gửi toàn bộ trạng thái hiện tại cho client vừa kết nối
    ws.send(JSON.stringify({
        event: "init",
        workers: manager.getAllState()
    }));

    ws.on("message", async (msgStr) => {
        try {
            const data = JSON.parse(msgStr);
            const { action, id, options } = data;

            switch (action) {
                case "create":
                    manager.createWorker(options || {});
                    break;
                case "update":
                    manager.updateWorker(id, options || {});
                    break;
                case "delete":
                    await manager.deleteWorker(id);
                    break;
                case "scan":
                    manager.scanWorkerProgress(id);
                    break;
                case "start":
                    manager.startWorker(id);
                    break;
                case "stop":
                    await manager.stopWorker(id);
                    break;
                case "start_all":
                    manager.startAll();
                    break;
                case "stop_all":
                    await manager.stopAll();
                    break;
                case "get_state":
                    ws.send(JSON.stringify({
                        event: "state_update",
                        workers: manager.getAllState()
                    }));
                    break;
            }
        } catch (e) {
            console.error("[WS] Lỗi xử lý tin nhắn client:", e);
        }
    });

    ws.on("close", () => {
        console.log("[WS] Client đã ngắt kết nối.");
    });
});

function startServer(port = PORT) {
    server.listen(port, () => {
        console.log(`\n================================================================================`);
        console.log(`🚀 DASHBOARD ĐA TÀI KHOẢN ĐÃ SẴN SÀNG: http://localhost:${port}`);
        console.log(`================================================================================\n`);
    });
    return server;
}

module.exports = { server, startServer, manager };

if (require.main === module) {
    startServer();
}
