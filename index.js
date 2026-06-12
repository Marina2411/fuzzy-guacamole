const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        
        if (data.type === 'join') {
            ws.roomID = data.roomID;
            console.log(`Пользователь зашел в комнату: ${ws.roomID}`);
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

console.log('Сервер с поддержкой комнат запущен!');
