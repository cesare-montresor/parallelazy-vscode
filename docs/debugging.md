# Debugging parallelazy workers

This extension connects VS Code to workers created by
[`parallelazy`](https://github.com/cesare-montresor/parallelazy). The
framework starts isolated workers with Python's `spawn` multiprocessing mode.
When worker debugging is enabled, each worker opens a temporary `debugpy`
listener and notifies this extension.

## How the integration works

The connection is automatic:

1. The extension starts a localhost TCP server on a free port.
2. When VS Code resolves a `debugpy` launch configuration, the extension adds
   that server port to the child environment as `_DEBUG_SPAWN_EXT_PORT`.
3. `parallelazy` workers read that environment variable.
4. `parallelazy.utils.init_debugger()` asks `debugpy` for a free worker port.
5. The worker sends `<worker-port>:<process-name>` to the extension.
6. The extension starts a `debugpy` attach session for that worker.

The extension listens only on `127.0.0.1`. The worker notification is a local
control message; the actual debugger connection uses the configured host and
the worker's dynamically assigned port.

## Application setup

Install the framework and create a normal Python debug configuration:

```bash
python -m pip install parallelazy
```

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug parallelazy",
      "type": "debugpy",
      "request": "launch",
      "program": "${workspaceFolder}/main.py",
      "console": "integratedTerminal"
    }
  ]
}
```

Enable worker debugging on the manager. `parallelazy` then initializes
`debugpy` inside each worker; application code should not call
`init_debugger()` a second time:

```python
import time

from parallelazy.plugin import Plugin
from parallelazy.plugin_manager import PluginManager


class Worker(Plugin):
    def main(self):
        time.sleep(10)


def main():
    manager = PluginManager(worker_pydebug=True)
    descriptor = Worker.Descriptor(
        version="1.0.0",
        author="Application team",
        description="Debuggable worker",
    )
    if not manager.load_plugin(descriptor):
        raise RuntimeError("Worker failed to load")
    if not manager.start_plugin(descriptor.name):
        raise RuntimeError("Worker failed to start")
    try:
        time.sleep(30)
    finally:
        manager.unload_plugin(descriptor.name)


if __name__ == "__main__":
    main()
```

The exact worker lifecycle belongs to `parallelazy`; consult its
[documentation](https://github.com/cesare-montresor/parallelazy/tree/main/docs)
for plugin descriptors, lifecycle management, and messaging.

## Settings

Set these in VS Code settings when needed:

```json
{
  "debugpySpawn.host": "localhost",
  "debugpySpawn.justMyCode": false
}
```

`debugpySpawn.host` is used for the attach connection to each worker. The
extension always uses localhost for its internal notification server.

## Important details

- Start debugging with a `debugpy` launch configuration, not only an attach
  configuration. The environment injection is performed during launch
  resolution.
- Keep the `if __name__ == "__main__":` guard around application startup.
  This is required for `spawn`.
- `wait_for_client=True` pauses the worker until VS Code attaches. Use
  `False` when a worker should continue without a debugger.
- Each worker gets a separate attach session named after the process name sent
  by `parallelazy`.
