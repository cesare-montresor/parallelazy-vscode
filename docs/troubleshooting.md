# Troubleshooting

## No worker attach session appears

Check the following:

1. The extension is enabled and appears as activated in the **Log (Extension
   Host)** output.
2. The application was started with a `debugpy` **launch** configuration.
3. `PluginManager(worker_pydebug=True)` is enabled.
4. The worker calls `init_debugger()`.
5. The Python process uses the same environment where `parallelazy` and
   `debugpy` are installed.

The extension logs its IPC port and received attach requests in the Extension
Host output.

## The worker continues instead of waiting

`init_debugger()` may have been called with `wait_for_client=False`, or
debugger initialization may have failed. Inspect the Python application's
logs for the `parallelazy` warning.

## Attach fails

Verify that:

- `debugpySpawn.host` resolves to the interface where the worker listens;
- local firewall rules permit the worker connection;
- the worker is still alive when the attach request is received; and
- another debugger is not already attached to that worker.

The extension removes a failed worker port from its retry set, so restart the
debug session after correcting the underlying issue.

## Multiple workers

Each worker selects its own free `debugpy` port and sends its process name.
The extension creates one attach session per worker and ignores duplicate
notifications for a port during the current debug session.

For framework-level issues such as plugin loading, lifecycle, multiprocessing,
or CUDA behavior, consult
[`parallelazy` troubleshooting](https://github.com/cesare-montresor/parallelazy/blob/main/docs/troubleshooting.md).
