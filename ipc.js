const net = require('net');

const MAX_BUFFER_BYTES = 4096;

/**
 * Parse a worker attach notification in "<port>:<name>" format.
 * Preserves colons inside the worker name and validates port range.
 *
 * @param {string} raw
 * @returns {{ port: number, name: string } | null}
 */
function parseAttachMessage(raw) {
    if (typeof raw !== 'string') {
        return null;
    }

    const message = raw.trim();
    if (!message) {
        return null;
    }

    const sep = message.indexOf(':');
    if (sep <= 0) {
        return null;
    }

    const portStr = message.slice(0, sep);
    const name = message.slice(sep + 1).trim();

    if (!/^\d+$/.test(portStr) || !name) {
        return null;
    }

    const port = Number(portStr);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return null;
    }

    return { port, name };
}

/**
 * Create a localhost TCP IPC server that receives "<port>:<name>" notifications.
 * Supports both newline-delimited messages and EOF-terminated single messages.
 *
 * @param {{
 *   onAttach: (req: { port: number, name: string }) => void,
 *   onError?: (err: Error) => void,
 *   maxBufferBytes?: number
 * }} options
 */
function createIpcServer({ onAttach, onError, maxBufferBytes = MAX_BUFFER_BYTES }) {
    const sockets = new Set();

    const handleLine = (line) => {
        const parsed = parseAttachMessage(line);
        if (parsed) {
            onAttach(parsed);
        }
    };

    const server = net.createServer((socket) => {
        sockets.add(socket);

        let buffer = '';
        let byteLength = 0;

        socket.on('data', (chunk) => {
            byteLength += chunk.length;
            if (byteLength > maxBufferBytes) {
                onError?.(new Error(`IPC message exceeded maximum size of ${maxBufferBytes} bytes`));
                socket.destroy();
                return;
            }

            buffer += chunk.toString('utf8');

            let newlineIdx;
            while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newlineIdx);
                buffer = buffer.slice(newlineIdx + 1);
                byteLength = Buffer.byteLength(buffer, 'utf8');
                handleLine(line);
            }
        });

        socket.on('end', () => {
            if (buffer.length > 0) {
                handleLine(buffer);
                buffer = '';
                byteLength = 0;
            }
        });

        socket.on('error', (err) => {
            onError?.(err);
        });

        socket.on('close', () => {
            sockets.delete(socket);
        });
    });

    server.on('error', (err) => {
        onError?.(err);
    });

    function listen(host = '127.0.0.1', port = 0) {
        return new Promise((resolve, reject) => {
            const onListenError = (err) => {
                reject(err);
            };
            server.once('error', onListenError);
            server.listen(port, host, () => {
                server.removeListener('error', onListenError);
                const addr = server.address();
                resolve(typeof addr === 'object' && addr ? addr.port : 0);
            });
        });
    }

    function close() {
        for (const socket of sockets) {
            socket.destroy();
        }
        sockets.clear();

        return new Promise((resolve) => {
            if (!server.listening) {
                resolve();
                return;
            }
            server.close(() => resolve());
        });
    }

    return { server, listen, close };
}

module.exports = {
    MAX_BUFFER_BYTES,
    parseAttachMessage,
    createIpcServer
};
