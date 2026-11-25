# parallelazy-vscode

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/CesareMontresor.parallelazy-vscode?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=CesareMontresor.parallelazy-vscode)
[![Open VSX](https://img.shields.io/open-vsx/v/CesareMontresor/parallelazy-vscode?label=Open%20VSX)](https://open-vsx.org/extension/CesareMontresor/parallelazy-vscode)
[![License: MPL-2.0](https://img.shields.io/badge/License-MPL--2.0-blue.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.80.0-007ACC.svg)](https://code.visualstudio.com/)

Automatic VS Code debugger attachment for [`parallelazy`](https://github.com/cesare-montresor/parallelazy) worker processes started with Python's `spawn` multiprocessing mode.

## Why?

Standard `debugpy` subprocess debugging works reliably with `fork`, but struggles with isolated processes created via `spawn` (common in PyTorch, CUDA, and cross-platform multiprocessing). `parallelazy-vscode` bridges this gap automatically: when a `parallelazy` worker initializes its `debugpy` listener, this extension detects it and attaches a dedicated VS Code debug session—no manual port forwarding or attach configs required.

## Features

- **Zero-config port discovery** — Binds an ephemeral local IPC port on activation and injects `_DEBUG_SPAWN_EXT_PORT` into launched `debugpy` sessions automatically.
- **Automatic multi-worker attachment** — Spawns an independent `debugpy` attach session for each worker, named after the worker process and nested under the parent session in the Call Stack view.
- **Works with or without `launch.json`** — Supports both explicit `debugpy` launch configurations and VS Code's quick **Debug Python File** action.
- **Per-session lifecycle tracking** — Cleans up individual worker ports as each worker exits without disturbing other active workers.
- **Dedicated logging** — Streams connection and attach events to the **parallelazy** Output channel (`Output` → `parallelazy`).

## Requirements

- **VS Code** `1.80.0` or newer (or compatible editor such as VSCodium / Cursor)
- **[Python Debugger (`ms-python.debugpy`)](https://marketplace.visualstudio.com/items?itemName=ms-python.debugpy)** extension (installed automatically as a dependency)
- **Python** environment with [`parallelazy`](https://github.com/cesare-montresor/parallelazy) installed:

```bash
python -m pip install parallelazy
```

## Installation

- **VS Code Marketplace:** Search for `parallelazy-vscode` in the Extensions view, or install via CLI:
  ```bash
  code --install-extension CesareMontresor.parallelazy-vscode
  ```
- **Open VSX (VSCodium, Cursor, etc.):** Search for `parallelazy-vscode` in the Extensions view or install from [Open VSX](https://open-vsx.org/extension/CesareMontresor/parallelazy-vscode).
- **Manual `.vsix`:** Download the latest `.vsix` from [GitHub Releases](https://github.com/cesare-montresor/parallelazy-vscode/releases) and run **Extensions: Install from VSIX...** in the Command Palette.

## Quick Start

1. Enable worker debugging in your `parallelazy` application by passing `worker_pydebug=True` to `PluginManager`:

   ```python
   import time
   from parallelazy.plugin import Plugin
   from parallelazy.plugin_manager import PluginManager


   class Worker(Plugin):
       def main(self):
           # Set a breakpoint here — VS Code attaches automatically
           time.sleep(10)


   def main():
       manager = PluginManager(worker_pydebug=True)
       descriptor = Worker.Descriptor(
           version="1.0.0",
           author="Your Name",
           description="Debuggable worker",
       )
       manager.load_plugin(descriptor)
       manager.start_plugin(descriptor.name)
       try:
           time.sleep(30)
       finally:
           manager.unload_plugin(descriptor.name)


   if __name__ == "__main__":
       main()
   ```

2. Launch your script using **Debug Python File**, or add a `debugpy` launch configuration in `.vscode/launch.json`:

   ```json
   {
     "version": "0.2.0",
     "configurations": [
       {
         "name": "Python: parallelazy application",
         "type": "debugpy",
         "request": "launch",
         "program": "${workspaceFolder}/main.py",
         "console": "integratedTerminal"
       }
     ]
   }
   ```

3. Start debugging (**F5**). When `parallelazy` spawns a worker, this extension automatically attaches a debug session for it and stops at your breakpoints.

> **Note:** Always guard your application entrypoint with `if __name__ == "__main__":`, as required by Python's `spawn` start method.

## How It Works

```text
VS Code (parallelazy-vscode)                  Python (parallelazy)
────────────────────────────                  ────────────────────
1. Listen on 127.0.0.1:<ipc_port>
2. Inject _DEBUG_SPAWN_EXT_PORT=<ipc_port> ──► 3. Main process launches with env var
                                               4. Spawned worker starts debugpy on <worker_port>
6. Start debugpy attach session ◄──────────── 5. Worker sends "<worker_port>:<name>" to <ipc_port>
   nested under parent session
```

The internal notification server binds strictly to `127.0.0.1` on an OS-assigned free port. No manual port configuration is needed.

## Configuration

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `debugpySpawn.host` | `string` | `"127.0.0.1"` | Host address used when attaching to worker `debugpy` listeners. |
| `debugpySpawn.justMyCode` | `boolean` | `false` | When `true`, attached worker sessions debug only user code and skip library internals. |

## Documentation & Troubleshooting

- [Debugging Guide](docs/debugging.md) — Detailed integration flow and setup notes.
- [Troubleshooting](docs/troubleshooting.md) — Diagnosing attach failures, missing sessions, and multi-worker issues.
- [`parallelazy` Documentation](https://github.com/cesare-montresor/parallelazy/tree/main/docs) — Framework architecture, plugin lifecycle, and multiprocessing details.

If a worker fails to attach, open **Output** → **parallelazy** in VS Code to inspect the IPC port and incoming attach requests.

## Development

```bash
# Run unit tests (Node.js >= 18)
npm test

# Package a local .vsix
npx @vscode/vsce package
```

To test interactively in VS Code, open this repository and press **F5** to launch an Extension Development Host.

## License

This project is licensed under the [Mozilla Public License 2.0](LICENSE).
