const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
    });

    res.end('Manga sync server is running');
});

const wss = new WebSocket.Server({
    server,
    perMessageDeflate: false
});


// ========================================
// ОТПРАВКА СООБЩЕНИЯ
// ========================================

function send(ws, data) {
    if (ws.readyState !== WebSocket.OPEN) {
        return false;
    }

    try {
        ws.send(JSON.stringify(data));
        return true;
    } catch (error) {
        console.log(
            'Ошибка отправки:',
            error.message
        );

        return false;
    }
}


// ========================================
// ОТПРАВКА ВСЕМ В КОМНАТЕ
// ========================================

function broadcastToRoom(
    roomID,
    data,
    except = null
) {
    if (!roomID) {
        return;
    }

    wss.clients.forEach((client) => {

        if (
            client !== except &&
            client.readyState === WebSocket.OPEN &&
            client.roomID === roomID
        ) {
            send(client, data);
        }

    });
}


// ========================================
// ПОДКЛЮЧЕНИЕ ПОЛЬЗОВАТЕЛЯ
// ========================================

wss.on('connection', (ws, request) => {

    ws.isAlive = true;

    ws.roomID = null;
    ws.userName = null;
    ws.chapter = '';

    console.log(
        'Новое WebSocket-подключение'
    );


    // ====================================
    // PONG ОТ КЛИЕНТА
    // ====================================

    ws.on('pong', () => {
        ws.isAlive = true;
    });


    // ====================================
    // ПОЛУЧЕНИЕ СООБЩЕНИЙ
    // ====================================

    ws.on('message', (message) => {

        let data;

        try {
            data = JSON.parse(
                message.toString()
            );
        } catch (error) {

            console.log(
                'Получено некорректное JSON-сообщение'
            );

            return;
        }


        // ==================================
        // HEARTBEAT
        // ==================================

        if (data.type === 'heartbeat') {

            ws.isAlive = true;

            send(ws, {
                type: 'heartbeat_ack'
            });

            return;
        }


        // ==================================
        // ПОДКЛЮЧЕНИЕ К КОМНАТЕ
        // ==================================

        if (data.type === 'join') {

            const newRoomID =
                String(
                    data.roomID || ''
                ).trim();

            const newUserName =
                String(
                    data.sender || ''
                ).trim();

            const newChapter =
                String(
                    data.chapter || ''
                );

            if (!newRoomID) {
                return;
            }


            // Если пользователь
            // переподключился к другой комнате
            if (
                ws.roomID &&
                ws.roomID !== newRoomID
            ) {

                broadcastToRoom(
                    ws.roomID,
                    {
                        type:
                            'participant_left',

                        sender:
                            ws.userName
                    },
                    ws
                );
            }


            ws.roomID = newRoomID;
            ws.userName = newUserName;
            ws.chapter = newChapter;


            console.log(
                `JOIN: ${ws.userName} -> ${ws.roomID}`
            );


            // =================================
            // ОТПРАВЛЯЕМ НОВОМУ ПОЛЬЗОВАТЕЛЮ
            // ДАННЫЕ О СУЩЕСТВУЮЩИХ УЧАСТНИКАХ
            // =================================

            wss.clients.forEach((client) => {

                if (
                    client !== ws &&
                    client.readyState ===
                        WebSocket.OPEN &&
                    client.roomID ===
                        ws.roomID &&
                    client.userName
                ) {

                    send(ws, {
                        type:
                            'participant',

                        sender:
                            client.userName,

                        chapter:
                            client.chapter || ''
                    });

                }

            });


            // =================================
            // СООБЩАЕМ ОСТАЛЬНЫМ
            // О НОВОМ ПОЛЬЗОВАТЕЛЕ
            // =================================

            broadcastToRoom(
                ws.roomID,
                {
                    type:
                        'participant',

                    sender:
                        ws.userName,

                    chapter:
                        ws.chapter
                },
                ws
            );


            return;
        }


        // Без комнаты остальные
        // сообщения не обрабатываем
        if (!ws.roomID) {
            return;
        }


        // ==================================
        // СТАТЬ ВЕДУЩИМ
        // ==================================

        if (
            data.type ===
            'claim_leader'
        ) {

            const leaderName =
                String(
                    data.sender || ''
                ).trim();

            if (!leaderName) {
                return;
            }


            console.log(
                `Новый ведущий комнаты ${ws.roomID}: ${leaderName}`
            );


            broadcastToRoom(
                ws.roomID,
                {
                    type:
                        'leader_changed',

                    leaderName,

                    roomID:
                        ws.roomID
                }
            );


            return;
        }


        // ==================================
        // URL ВЕДУЩЕГО
        // ==================================

        if (
            data.type ===
            'leader_url'
        ) {

            ws.chapter =
                data.chapter ||
                ws.chapter;


            broadcastToRoom(
                ws.roomID,
                {
                    type:
                        'leader_url',

                    url:
                        data.url,

                    roomID:
                        ws.roomID,

                    sender:
                        ws.userName,

                    chapter:
                        ws.chapter
                },
                ws
            );


            return;
        }


        // ==================================
        // СИНХРОНИЗАЦИЯ
        // ==================================

        if (
            data.type ===
            'sync'
        ) {

            ws.chapter =
                data.chapter ||
                ws.chapter;


            broadcastToRoom(
                ws.roomID,
                {
                    type:
                        'sync',

                    percent:
                        data.percent,

                    url:
                        data.url,

                    roomID:
                        ws.roomID,

                    sender:
                        ws.userName,

                    chapter:
                        ws.chapter
                },
                ws
            );


            return;
        }


        // ==================================
        // ЧАТ
        // ==================================

        if (
            data.type ===
            'chat'
        ) {

            ws.chapter =
                data.chapter ||
                ws.chapter;


            broadcastToRoom(
                ws.roomID,
                {
                    type:
                        'chat',

                    text:
                        String(
                            data.text || ''
                        ).slice(0, 2000),

                    sender:
                        ws.userName,

                    chapter:
                        ws.chapter,

                    roomID:
                        ws.roomID
                },
                ws
            );


            return;
        }


        // ==================================
        // ПРОЧИЕ СООБЩЕНИЯ
        // ==================================

        broadcastToRoom(
            ws.roomID,
            data,
            ws
        );
    });


    // ====================================
    // ЗАКРЫТИЕ СОЕДИНЕНИЯ
    // ====================================

    ws.on('close', () => {

        console.log(
            `Отключение: ${ws.userName || 'unknown'}`
        );


        if (
            ws.roomID &&
            ws.userName
        ) {

            broadcastToRoom(
                ws.roomID,
                {
                    type:
                        'participant_left',

                    sender:
                        ws.userName
                },
                ws
            );
        }
    });


    // ====================================
    // ОШИБКА
    // ====================================

    ws.on('error', (error) => {

        console.log(
            `WebSocket error: ${error.message}`
        );

    });

});


// ========================================
// SERVER HEARTBEAT
// ========================================
//
// Render / мобильная сеть могут оставить
// "мертвое" соединение открытым.
// Каждые 30 секунд проверяем клиентов.
//

const heartbeatInterval =
    setInterval(() => {

        wss.clients.forEach((ws) => {

            if (ws.isAlive === false) {

                console.log(
                    `Удаляем мёртвое соединение: ${
                        ws.userName || 'unknown'
                    }`
                );

                try {
                    ws.terminate();
                } catch (_) {}

                return;
            }


            ws.isAlive = false;


            try {
                ws.ping();
            } catch (_) {}

        });

    }, 30000);


// ========================================
// ЗАКРЫТИЕ WEBSOCKET SERVER
// ========================================

wss.on('close', () => {

    clearInterval(
        heartbeatInterval
    );

});


// ========================================
// HTTP SERVER
// ========================================

server.listen(
    PORT,
    '0.0.0.0',
    () => {

        console.log(
            `Manga sync server запущен на порту ${PORT}`
        );

    }
);


// ========================================
// RENDER SIGTERM
// ========================================
//
// Render может перезапускать контейнер.
// Закрываем соединения корректно,
// после чего content.js автоматически
// подключится снова.
//

process.on(
    'SIGTERM',
    () => {

        console.log(
            'Получен SIGTERM. Сервер останавливается...'
        );


        // Запрещаем новые подключения
        wss.close();


        // Сообщаем клиентам,
        // что сервер перезапускается
        wss.clients.forEach((ws) => {

            try {

                ws.close(
                    1001,
                    'Server restarting'
                );

            } catch (_) {}

        });


        server.close(() => {

            console.log(
                'HTTP сервер остановлен'
            );

            process.exit(0);

        });


        // Если Render слишком долго
        // ждёт закрытия — завершаемся
        setTimeout(() => {

            process.exit(0);

        }, 5000);

    }
);


// ========================================
// ОБРАБОТКА SIGINT
// ========================================

process.on(
    'SIGINT',
    () => {

        console.log(
            'Получен SIGINT...'
        );

        process.exit(0);

    }
);                    client.send(JSON.stringify({ type: 'leader_changed', leaderName: data.sender, roomID: ws.roomID }));
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
