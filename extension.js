const vscode = require('vscode');
const net = require('net');

let server = null;
let ipcPort = 0;
const attachedPorts = new Set();

function getConfig() {
    return vscode.workspace.getConfiguration('debugpySpawn');
}

async function attachToWorker(port, name) {
    if (attachedPorts.has(port)) return;
    attachedPorts.add(port);

    const config = getConfig();
    
    try {
        await vscode.debug.startDebugging(undefined, {
            type: "debugpy",
            request: "attach",
            name: `${name}`,
            connect: { host: config.get('host'), port: port },
            justMyCode: config.get('justMyCode')
        });
    } catch (e) {
        // If attachment fails, remove from the set so it can be retried later
        attachedPorts.delete(port);
        console.error(`debugpy-spawn: Failed to attach to ${name} on port ${port}`, e);
    }
}

function activate(context) {
    console.log('debugpy-spawn: activated');

    // 1. Start the IPC Server on a dynamic port (Port 0)
    server = net.createServer((socket) => {
        socket.on('data', (data) => {
            // Expecting data in format: "port:name" (e.g., "45982:worker-1")
            const message = data.toString().trim();
            const [portStr, name] = message.split(':');
            
            const port = parseInt(portStr, 10);
            if (!isNaN(port) && name) {
                console.log(`debugpy-spawn: Received attach request for ${name} on port ${port}`);
                attachToWorker(port, name);
            }
        });
        
        // Handle socket errors gracefully so the server doesn't crash
        socket.on('error', (err) => {
            console.error('debugpy-spawn: IPC socket error:', err);
        });
    });

    // Let the OS pick a guaranteed-free port on localhost
    server.listen(0, '127.0.0.1', () => {
        ipcPort = server.address().port;
        console.log(`debugpy-spawn: IPC server listening on port ${ipcPort}`);
    });

    // 2. Inject the dynamic port into the Python launch environment
    context.subscriptions.push(
        vscode.debug.registerDebugConfigurationProvider('debugpy', {
            resolveDebugConfiguration(folder, config) {
                if (config.request === 'launch') {
                    // Ensure the env object exists
                    if (!config.env) {
                        config.env = {};
                    }
                    // Pass the IPC port down so Python knows where to ping
                    if (ipcPort > 0) {
                        config.env._DEBUG_SPAWN_EXT_PORT = ipcPort.toString();
                    }
                }
                return config;
            }
        })
    );

    // 3. Clear tracked ports when a debug session ends
    context.subscriptions.push(
        vscode.debug.onDidTerminateDebugSession(() => {
            attachedPorts.clear();
        })
    );
}

function deactivate() {
    if (server) {
        server.close();
    }
}

module.exports = { activate, deactivate };