#!/usr/bin/env python3
"""Serve Signal Lab from dist/ on this computer and open it in the browser.

Usage: python3 run_signal_app.py [--port 8770] [--no-browser]
Ctrl+C stops the server. Only the standard library is used.
"""
import argparse
import functools
import http.server
import platform
import shutil
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path

DIST = Path(__file__).resolve().parent / "dist"


def open_browser(url):
    # Inside WSL the Linux browser hooks usually point nowhere; hand the URL to Windows instead.
    if "microsoft" in platform.release().lower():
        for command in (["wslview", url], ["explorer.exe", url]):
            if shutil.which(command[0]):
                subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                return True
    return webbrowser.open(url)


def make_server(port):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
    handler.log_message = lambda *args: None
    try:
        return http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    except OSError:
        # The preferred port is taken (for example by the signal-lab service); use any free one.
        return http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=8770)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if not (DIST / "index.html").is_file():
        sys.exit(f"Signal Lab files not found in {DIST}")
    server = make_server(args.port)
    url = f"http://127.0.0.1:{server.server_address[1]}/"
    print(f"Signal Lab running at {url}  (Ctrl+C to stop)", flush=True)
    if not args.no_browser:
        threading.Timer(0.3, lambda: open_browser(url) or print("Open the address above in your browser.")).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
