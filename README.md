# parallelazy-vscode

VS Code extension designed to work with
[parallelazy](https://github.com/cesare-montresor/parallelazy) and overcome
limitations of debugpy when debugging processes started using the `spawn`
method instead of `fork`.

When a `parallelazy` worker starts its debugger, this extension automatically
attaches a VS Code `debugpy` session to that worker. Each worker can therefore
be debugged independently, without manually finding or forwarding its
debugging port.

## Requirements

- VS Code 1.80 or newer
- Python with [`parallelazy`](https://github.com/cesare-montresor/parallelazy)
  installed
- `debugpy`, installed as a dependency of `parallelazy`
- A `debugpy` launch configuration in the workspace

Install `parallelazy` in the same Python environment used by the debug
configuration:

```bash
python -m pip install parallelazy
```

For installation from source and the framework's complete documentation, see
the [`parallelazy` repository](https://github.com/cesare-montresor/parallelazy).

## Quick start

1. Install and enable this extension.
2. Create a VS Code `debugpy` **launch** configuration for the Python
   application that creates the `parallelazy` workers.
3. Enable worker debugging by constructing the manager with
   `PluginManager(worker_pydebug=True)`.
4. Start the application with **Run and Debug**.
5. When a worker calls `parallelazy.utils.init_debugger()`, this extension
   automatically starts an attach session for that worker.

Example `launch.json`:

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

See [the integration guide](docs/debugging.md) for the complete worker
example, the connection flow, configuration options, and troubleshooting.

## Configuration

The extension contributes these settings:

| Setting | Default | Description |
| --- | --- | --- |
| `debugpySpawn.host` | `localhost` | Host used when attaching to a worker. |
| `debugpySpawn.justMyCode` | `false` | Whether attached sessions debug only user code. |

The extension chooses a free local IPC port when it activates. It injects that
port into launched `debugpy` applications as `_DEBUG_SPAWN_EXT_PORT`; no
manual port configuration is required.

## Scope and limitations

- Automatic setup occurs for `debugpy` launch configurations.
- Worker attach requests are received over localhost TCP.
- Worker debugger ports are selected dynamically by `debugpy`.
- The extension does not start the Python application or install Python
  packages for you.
- Start the application from a `__main__` guard, as required by Python's
  `spawn` multiprocessing mode.

## Related documentation

- [Debugging guide](docs/debugging.md)
- [Troubleshooting](docs/troubleshooting.md)
- [`parallelazy` documentation](https://github.com/cesare-montresor/parallelazy/tree/main/docs)
