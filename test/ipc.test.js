const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');

const { parseAttachMessage, createIpcServer } = require('../ipc');

test('parseAttachMessage parses valid messages', () => {
    assert.deepEqual(parseAttachMessage('45982:worker-1'), {
        port: 45982,
        name: 'worker-1'
    });
    assert.deepEqual(parseAttachMessage('  12345:worker:gpu:0 \r\n'), {
        port: 12345,
        name: 'worker:gpu:0'
    });
});

test('parseAttachMessage rejects invalid messages', () => {
    assert.equal(parseAttachMessage(''), null);
    assert.equal(parseAttachMessage('   '), null);
    assert.equal(parseAttachMessage('45982'), null);
    assert.equal(parseAttachMessage(':worker-1'), null);
    assert.equal(parseAttachMessage('45982:'), null);
    assert.equal(parseAttachMessage('45982:   '), null);
    assert.equal(parseAttachMessage('0:worker-1'), null);
    assert.equal(parseAttachMessage('65536:worker-1'), null);
    assert.equal(parseAttachMessage('45982abc:worker-1'), null);
    assert.equal(parseAttachMessage('-1:worker-1'), null);
});

test('createIpcServer handles chunked EOF-terminated message', async () => {
    const received = [];
    const errors = [];

    const ipc = createIpcServer({
        onAttach: (req) => received.push(req),
        onError: (err) => errors.push(err)
    });

    const port = await ipc.listen('127.0.0.1', 0);
    assert.ok(port > 0);

    try {
        await new Promise((resolve, reject) => {
            const client = net.createConnection({ host: '127.0.0.1', port }, () => {
                client.write('459');
                setTimeout(() => {
                    client.write('82:worker:1');
                    client.end();
                }, 15);
            });
            client.on('close', resolve);
            client.on('error', reject);
        });

        await new Promise((r) => setTimeout(r, 20));
        assert.deepEqual(received, [{ port: 45982, name: 'worker:1' }]);
        assert.equal(errors.length, 0);
    } finally {
        await ipc.close();
    }
});

test('createIpcServer handles multiple newline-delimited messages in one chunk', async () => {
    const received = [];

    const ipc = createIpcServer({
        onAttach: (req) => received.push(req)
    });

    const port = await ipc.listen('127.0.0.1', 0);

    try {
        await new Promise((resolve, reject) => {
            const client = net.createConnection({ host: '127.0.0.1', port }, () => {
                client.end('40001:worker-a\n40002:worker-b\n');
            });
            client.on('close', resolve);
            client.on('error', reject);
        });

        await new Promise((r) => setTimeout(r, 20));
        assert.deepEqual(received, [
            { port: 40001, name: 'worker-a' },
            { port: 40002, name: 'worker-b' }
        ]);
    } finally {
        await ipc.close();
    }
});

test('createIpcServer rejects oversized payloads', async () => {
    const received = [];
    const errors = [];

    const ipc = createIpcServer({
        onAttach: (req) => received.push(req),
        onError: (err) => errors.push(err),
        maxBufferBytes: 32
    });

    const port = await ipc.listen('127.0.0.1', 0);

    try {
        await new Promise((resolve) => {
            const client = net.createConnection({ host: '127.0.0.1', port }, () => {
                client.write('40001:' + 'x'.repeat(100));
            });
            client.on('close', resolve);
            client.on('error', () => resolve());
        });

        await new Promise((r) => setTimeout(r, 20));
        assert.equal(received.length, 0);
        assert.ok(errors.length >= 1);
        assert.match(errors[0].message, /exceeded maximum size/);
    } finally {
        await ipc.close();
    }
});
