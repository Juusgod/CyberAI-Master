#!/usr/bin/env python3
"""Rebuild the ready-to-open PC distribution with Python's standard library."""

from pathlib import Path
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parent
subprocess.run([sys.executable, str(ROOT / "src" / "assemble.py")], check=True)
for name in (
    "Cybersecurity_AI_Lab.html",
    "Cybersecurity_AI_Lab_Offline.zip",
    "README.txt",
    "Open_Lab.cmd",
    "Open_Lab.command",
    "Start_Local_Server.py",
    "Create_Desktop_Shortcut.cmd",
):
    shutil.copyfile(ROOT / "dist" / "downloads" / name, ROOT / name)
print("Ready-to-open PC files refreshed at the repository root.")
