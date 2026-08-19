const http = require('http');
const WebSocket = require('ws');

// Обычный HTTP-сервер нужен, чтобы Render видел, что сервис "живой"
// (иначе health-check от Render не получает ответа и Render перезапускает сервис)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Manga sync server is running');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            return; // игнорируем битые сообщения, не роняем сервер
        }

        if (data.type === 'join') {
            ws.roomID = data.roomID;
            console.log(`Пользователь зашел в комнату: ${ws.roomID}`);
        }

        if (data.type === 'claim_leader') {
            // Кто-то заявляет себя ведущим — рассылаем это ВСЕМ в комнате,
            // включая самого отправителя. Двух ведущих одновременно быть не
            // может: получив это сообщение, все остальные автоматически
            // становятся читателями (см. content.js).
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN && client.roomID === ws.roomID) {
                    client.send(JSON.stringify({ type: 'leader_changed', leaderName: data.sender, roomID: ws.roomID }));
                }
            });
            return;
        }

        // Рассылаем сообщения ТОЛЬКО тем, кто в той же комнате
        wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN && client.roomID === ws.roomID) {
                client.send(JSON.stringify(data));
            }
        });
    });

    ws.on('close', () => console.log('Кто-то отключился'));
});

// Проверяем "зомби"-подключения (например, телефон свернули/потерял сеть)
// и закрываем их, чтобы комната не засорялась мёртвыми клиентами
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Сервер с поддержкой комнат запущен на порту ${PORT}`);
});
