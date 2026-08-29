const { startServer } = require("./ducthinh_app/server");
const { exec } = require("child_process");

const PORT = 3000;
startServer(PORT);

const url = `http://localhost:${PORT}`;
console.log(`[*] Đang tự động mở Dashboard trên trình duyệt: ${url}...`);

// Mở trình duyệt mặc định trên Windows
if (process.platform === "win32") {
    exec(`start ${url}`);
} else if (process.platform === "darwin") {
    exec(`open ${url}`);
} else {
    exec(`xdg-open ${url}`);
}
