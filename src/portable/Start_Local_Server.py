#!/usr/bin/env python3
"""Optional no-dependency launcher; opening the HTML directly also works."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote
import threading
import webbrowser


HTML_NAME = "Cybersecurity_AI_Lab.html"


class LocalLabHandler(SimpleHTTPRequestHandler):
    """Send fresh files and keep the server explicitly local to this computer."""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


def main():
    folder = Path(__file__).resolve().parent
    if not (folder / HTML_NAME).is_file():
        raise SystemExit(
            "The lab HTML is missing. Extract the complete offline ZIP, then "
            "run this script from beside Cybersecurity_AI_Lab.html."
        )
    handler = partial(LocalLabHandler, directory=str(folder))
    # Port 0 asks the operating system for a currently available port.
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        server.daemon_threads = True
        address = f"http://127.0.0.1:{server.server_address[1]}/{quote(HTML_NAME)}"
        print("Cybersecurity AI Lab is running locally.", flush=True)
        print(address, flush=True)
        print("Keep this terminal open. Press Ctrl+C to stop.", flush=True)
        print("You can also open the HTML directly without Python.", flush=True)

        def open_browser():
            try:
                if not webbrowser.open(address, new=2):
                    print("Open the address above in your browser.", flush=True)
            except Exception:
                print("Open the address above in your browser.", flush=True)

        # Some desktop browser launchers block. A daemon thread ensures the
        # local HTTP server starts serving immediately in either case.
        threading.Thread(target=open_browser, daemon=True).start()
        try:
            server.serve_forever(poll_interval=0.25)
        except KeyboardInterrupt:
            print("\nLab server stopped.", flush=True)


if __name__ == "__main__":
    main()
