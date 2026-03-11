const WebSocket = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

let leader = null;

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'claim_leader') {
            leader = ws;
            wss.clients.forEach(client => {
                client.send(JSON.stringify({ type: 'status', text: 'Ведущий назначен' }));
            });
        } 
        
        // Рассылка скролла (только от ведущего)
        if (data.type === 'scroll' && ws === leader) {
            wss.clients.forEach(client => {
                if (client !== leader && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'sync', percent: data.percent }));
                }
            });
        }

        // Рассылка сообщений чата (от любого пользователя)
        if (data.type === 'chat') {
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'chat', text: data.text, sender: data.sender }));
                }
            });
        }
    });

    ws.on('close', () => { if (ws === leader) leader = null; });
});
console.log(`Сервер запущен на порту ${port}`);
