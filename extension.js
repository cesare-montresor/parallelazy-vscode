const vscode = require('vscode');
const { createIpcServer } = require('./ipc');

let ipcServer = null;
let serverReady = null;
let output = null;
let activeParentSession = undefined;
let lastLaunchFolder = undefined;

const attachedPorts = new Set();
const sessionPorts = new Map();

function getConfig(folder) {
    return vscode.workspace.getConfiguration('debugpySpawn', folder?.uri);
}

async function attachToWorker(port, name) {
    if (attachedPorts.has(port)) {
        return;
    }
    attachedPorts.add(port);

    const folder = activeParentSession?.workspaceFolder || lastLaunchFolder;
    const config = getConfig(folder);
    const host = config.get('host', '127.0.0.1');
    const justMyCode = config.get('justMyCode', false);
    const options = activeParentSession
        ? { parentSession: activeParentSession }
        : undefined;

    try {
        const started = await vscode.debug.startDebugging(
            folder,
            {
                type: 'debugpy',
                request: 'attach',
                name: `${name}`,
                connect: { host, port },
                justMyCode
            },
            options
        );

        if (!started) {
            attachedPorts.delete(port);
            output?.warn(`Failed to start attach session for ${name} on ${host}:${port}`);
        }
    } catch (err) {
        attachedPorts.delete(port);
        output?.error(`Failed to attach to ${name} on ${host}:${port}: ${err?.message || err}`);
    }
}

function cleanup() {
    if (ipcServer) {
        ipcServer.close();
        ipcServer = null;
    }
    serverReady = null;
    activeParentSession = undefined;
    lastLaunchFolder = undefined;
    attachedPorts.clear();
    sessionPorts.clear();
}

function activate(context) {
    output = vscode.window.createOutputChannel('parallelazy', { log: true });
    context.subscriptions.push(output);
    output.info('parallelazy extension activated');

    // 1. Start the IPC server on a dynamic localhost port
    ipcServer = createIpcServer({
        onAttach: ({ port, name }) => {
            output.info(`Received attach request for ${name} on port ${port}`);
            attachToWorker(port, name);
        },
        onError: (err) => {
            output.error(`IPC server error: ${err?.message || err}`);
        }
    });

    serverReady = ipcServer.listen('127.0.0.1', 0).then(
        (port) => {
            output.info(`IPC server listening on 127.0.0.1:${port}`);
            return port;
        },
        (err) => {
            output.error(`Failed to start IPC server: ${err?.message || err}`);
            return 0;
        }
    );

    context.subscriptions.push({ dispose: cleanup });

    // 2. Inject the dynamic IPC port into Python debugpy launch configurations
    // Using resolveDebugConfigurationWithSubstitutedVariables ensures quick-run
    // ("Debug Python File") launches without a launch.json are also handled.
    context.subscriptions.push(
        vscode.debug.registerDebugConfigurationProvider('debugpy', {
            async resolveDebugConfigurationWithSubstitutedVariables(folder, config) {
                if (config && config.request === 'launch') {
                    lastLaunchFolder = folder;
                    const port = serverReady ? await serverReady : 0;
                    if (port > 0) {
                        config.env = {
                            ...config.env,
                            _DEBUG_SPAWN_EXT_PORT: String(port)
                        };
                    }
                }
                return config;
            }
        })
    );

    // 3. Track parent launch sessions and attached worker session ports
    context.subscriptions.push(
        vscode.debug.onDidStartDebugSession((session) => {
            if (session.type !== 'debugpy') {
                return;
            }

            if (session.configuration?.request === 'launch') {
                activeParentSession = session;
                if (session.workspaceFolder) {
                    lastLaunchFolder = session.workspaceFolder;
                }
            } else if (session.configuration?.request === 'attach') {
                const port = session.configuration?.connect?.port;
                if (typeof port === 'number' && attachedPorts.has(port)) {
                    sessionPorts.set(session.id, port);
                }
            }
        })
    );

    // 4. Clean up only the terminated session's port
    context.subscriptions.push(
        vscode.debug.onDidTerminateDebugSession((session) => {
            if (sessionPorts.has(session.id)) {
                const port = sessionPorts.get(session.id);
                sessionPorts.delete(session.id);
                attachedPorts.delete(port);
            }

            if (activeParentSession && activeParentSession.id === session.id) {
                activeParentSession = undefined;
            }
        })
    );
}

function deactivate() {
    cleanup();
}

module.exports = { activate, deactivate };
