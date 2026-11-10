"""Build the hosted lesson and its byte-identical, dependency-free offline edition.

Run from any directory with Python 3: python path/to/src/assemble.py
Only Python's standard library is used. All source fragments remain editable.
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
import zipfile
from html import escape
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
DIST = ROOT / "dist"
DOWNLOADS = DIST / "downloads"
HTML_NAME = "Cybersecurity_AI_Lab.html"
ZIP_NAME = "Cybersecurity_AI_Lab_Offline.zip"

VISUALS = {
    "brief": ("cyber-prompt-brief.html", "Explore the five parts of BRIEF", "Interactive prompt anatomy"),
    "loop": ("cyber-investigation-loop.html", "Predict, then step through the investigation", "Interactive investigation loop"),
    "boundary": ("cyber-trust-boundary.html", "Change the proposal and watch the policy gate", "Interactive trust boundary"),
}
STYLES = ("styles.css", "scenario.css", "visual-standalone.css")
SCRIPTS = ("lab-engine.js", "lab-ui.js", "app.js")
CATALOGS = ("scenarios-identity.json", "scenarios-systems.json")
PACKAGE_FILES = (
    "README.txt", "Open_Lab.cmd", "Open_Lab.command", "Start_Local_Server.py",
    "Create_Desktop_Shortcut.cmd",
)
PACKAGE_ROOT_FILES = ("LICENSE", "assets/cyberai-master.ico", "assets/cyberai-master.png")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def inline_script(code: str, label: str) -> str:
    # HTML's script end tag is recognized even inside a JavaScript string or
    # comment. Escape its slash before embedding; JavaScript preserves the value.
    safe = re.sub(r"</script", lambda match: "<\\/" + match.group(0)[2:], code, flags=re.I)
    return f'<script data-bundle="{escape(label, quote=True)}">\n{safe}\n</script>'


def inline_style(css: str, label: str) -> str:
    if re.search(r"</style", css, flags=re.I):
        raise ValueError(f"Unexpected HTML style terminator in {label}")
    return f'<style data-bundle="{escape(label, quote=True)}">\n{css}\n</style>'


class OfflineAudit(HTMLParser):
    """Reject resource loading; ordinary research/download anchors are allowed."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.errors: list[str] = []
        self.scripts: list[str] = []
        self.styles: list[str] = []
        self.ids: set[str] = set()
        self._content: list[str] = []
        self._in: str | None = None

    def handle_starttag(self, tag: str, attributes: list[tuple[str, str | None]]) -> None:
        attrs = dict(attributes)
        if attrs.get("id"):
            if attrs["id"] in self.ids:
                self.errors.append(f"Duplicate element id: {attrs['id']}")
            self.ids.add(attrs["id"])
        if tag in {"iframe", "frame", "object", "embed", "base"}:
            self.errors.append(f"Forbidden external-container element: <{tag}>")
        for attr in ("src", "srcset", "poster", "data", "manifest"):
            value = attrs.get(attr)
            if value and not value.startswith(("data:", "#")):
                self.errors.append(f"External resource attribute: <{tag} {attr}={value!r}>")
        if tag == "link" and attrs.get("href") and not (
            attrs.get("rel") == "icon" and attrs["href"].startswith("data:image/png;base64,")
        ):
            self.errors.append(f"External link resource: {attrs['href']}")
        if tag in {"image", "use"}:
            for attr in ("href", "xlink:href"):
                value = attrs.get(attr)
                if value and not value.startswith(("#", "data:")):
                    self.errors.append(f"External SVG resource: {value}")
        if tag in {"script", "style"}:
            self._in = tag
            self._content = []
        if "style" in attrs:
            self.styles.append(attrs["style"] or "")

    def handle_endtag(self, tag: str) -> None:
        if tag == self._in:
            (self.scripts if tag == "script" else self.styles).append("".join(self._content))
            self._in = None
            self._content = []

    def handle_data(self, data: str) -> None:
        if self._in:
            self._content.append(data)

    def validate(self) -> None:
        forbidden_js = {
            "network/API request": r"\b(?:fetch|WebSocket|EventSource|XMLHttpRequest|importScripts)\s*\(",
            "dynamic module import": r"\bimport\s*\(",
            "module import": r"(?m)^\s*import\s+(?:[\w*{]|[\"'])",
            "service worker": r"\b(?:navigator\s*\.\s*)?serviceWorker\b",
            "beacon request": r"\bsendBeacon\s*\(",
            "host integration": r"\b(?:window|globalThis)\s*\.\s*openai\b",
        }
        for number, script in enumerate(self.scripts, start=1):
            # Catalog evidence is JSON data, so a quoted example such as
            # "fetch(...)" is not a runtime network call. Require that this
            # entire script is exactly one JSON assignment before exempting it.
            catalog_assignment = re.fullmatch(
                r"\s*window\.FIELDGUIDE_SCENARIOS\s*=\s*(\[.*\])\s*;\s*", script, flags=re.S
            )
            if catalog_assignment:
                json.loads(catalog_assignment.group(1))
                continue
            for label, pattern in forbidden_js.items():
                if re.search(pattern, script):
                    self.errors.append(f"Script {number} contains a {label} dependency")
        for css in self.styles:
            if re.search(r"@import\b", css, flags=re.I):
                self.errors.append("CSS contains an external import")
            for match in re.finditer(r"url\s*\(\s*(['\"]?)(.*?)\1\s*\)", css, flags=re.I):
                if not match.group(2).startswith(("#", "data:")):
                    self.errors.append(f"CSS contains an external asset: {match.group(2)}")
        required = {"mission-1", "mission-2", "mission-3", "mission-4", "mission-5", "mission-6", "recall", "sources"}
        for missing in sorted(required - self.ids):
            self.errors.append(f"Missing original lesson section: {missing}")
        if self.errors:
            raise ValueError("Offline validation failed:\n- " + "\n- ".join(self.errors))


def load_catalog() -> list[dict]:
    combined: list[dict] = []
    for filename in CATALOGS:
        entries = json.loads(read(SRC / filename))
        if not isinstance(entries, list) or not entries:
            raise ValueError(f"Expected a nonempty scenario list in {filename}")
        if not all(isinstance(entry, dict) and isinstance(entry.get("id"), str) for entry in entries):
            raise ValueError(f"Each scenario in {filename} must be an object with a string id")
        combined.extend(entries)
    identifiers = [entry["id"] for entry in combined]
    if len(identifiers) != len(set(identifiers)):
        raise ValueError("Scenario family ids must be unique across catalogs")
    return combined


def make_lesson() -> str:
    lesson = read(SRC / "lesson-body.html")
    for key, (filename, caption, title) in VISUALS.items():
        fragment = read(SRC / "visuals" / filename)
        replacement = (
            f'<div class="visual-shell"><div class="visual-caption">'
            f'<span>{escape(caption)}</span><span>INTERACTIVE · OFFLINE READY</span></div>'
            f'<div class="visual-content" role="group" aria-label="{escape(title, quote=True)}">'
            f'{fragment}</div></div>'
        )
        lesson, count = re.subn(
            rf'<div\s+class="visual-slot"\s+data-visual="{key}"\s*>\s*</div>',
            lambda _match: replacement,
            lesson,
        )
        if count != 1:
            raise ValueError(f"Expected exactly one {key} visualization placeholder, found {count}")
    scenario = read(SRC / "scenario-section.html")
    recall = r'<section\b(?=[^>]*\bid\s*=\s*[\"\']recall[\"\'])[^>]*>'
    lesson, count = re.subn(recall, lambda match: scenario + "\n\n" + match.group(0), lesson)
    if count != 1:
        raise ValueError(f"Expected one recall section, found {count}")
    return lesson


def assemble() -> tuple[str, int, OfflineAudit]:
    shell = read(SRC / "shell.html")
    logo = base64.b64encode((ROOT / "assets" / "cyberai-master.png").read_bytes()).decode("ascii")
    favicon = base64.b64encode((ROOT / "assets" / "cyberai-master-favicon.png").read_bytes()).decode("ascii")
    if shell.count("__APP_LOGO_DATA_URI__") != 1 or shell.count("<!--APP_FAVICON-->") != 1:
        raise ValueError("Expected one embedded logo and one embedded favicon placeholder")
    shell = shell.replace("__APP_LOGO_DATA_URI__", "data:image/png;base64," + logo)
    shell = shell.replace("<!--APP_FAVICON-->", '<link rel="icon" type="image/png" href="data:image/png;base64,' + favicon + '">')
    if shell.count("<!--LESSON_CONTENT-->") != 1:
        raise ValueError("Expected exactly one lesson placeholder in the shell")
    # The same document is used at HTTPS, localhost, and file:// locations.
    shell = re.sub(r'<link\b(?=[^>]*\brel=[\"\']canonical[\"\'])[^>]*>\s*', "", shell, flags=re.I)
    shell, removed_styles = re.subn(
        r'<link\b(?=[^>]*\brel=[\"\']stylesheet[\"\'])(?=[^>]*\bhref=[\"\'](?:\./|/)?styles\.css[\"\'])[^>]*>',
        lambda _match: "\n".join(inline_style(read(DIST / filename), filename) for filename in STYLES),
        shell,
        flags=re.I,
    )
    if removed_styles != 1:
        raise ValueError(f"Expected one styles.css reference, found {removed_styles}")
    shell, removed_scripts = re.subn(
        r'<script\b(?=[^>]*\bsrc=[\"\'](?:\./|/)?app\.js[\"\'])[^>]*>\s*</script>',
        "",
        shell,
        flags=re.I,
    )
    if removed_scripts != 1:
        raise ValueError(f"Expected one app.js reference, found {removed_scripts}")
    output = shell.replace("<!--LESSON_CONTENT-->", make_lesson())
    catalog = load_catalog()
    # JSON escapes HTML-significant characters, preserving evidence text while
    # preventing it from being interpreted as markup in the enclosing document.
    catalog_json = json.dumps(catalog, ensure_ascii=False, separators=(",", ":"))
    catalog_json = catalog_json.replace("<", r"\u003c").replace(">", r"\u003e").replace("&", r"\u0026")
    catalog_json = catalog_json.replace("\u2028", r"\u2028").replace("\u2029", r"\u2029")
    scripts = [inline_script("window.FIELDGUIDE_SCENARIOS = " + catalog_json + ";", "scenario-catalogs")]
    scripts.extend(inline_script(read(DIST / filename), filename) for filename in SCRIPTS)
    if output.lower().count("</body>") != 1:
        raise ValueError("Expected exactly one body end tag")
    output = re.sub(r"</body>", lambda _match: "\n".join(scripts) + "\n</body>", output, flags=re.I)
    if "visual-slot" in output or "<!--LESSON_CONTENT-->" in output:
        raise ValueError("An unresolved build placeholder remains")
    audit = OfflineAudit()
    audit.feed(output)
    audit.close()
    audit.validate()
    return output, len(catalog), audit


def write_package(html: str) -> None:
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    data = html.encode("utf-8")
    (DIST / "index.html").write_bytes(data)
    (DOWNLOADS / HTML_NAME).write_bytes(data)
    entries = {HTML_NAME: data}
    for filename in PACKAGE_FILES:
        content = read(SRC / "portable" / filename)
        if filename.endswith(".cmd"):
            content = content.replace("\r\n", "\n").replace("\n", "\r\n")
        entries[filename] = content.encode("utf-8")
        (DOWNLOADS / filename).write_bytes(entries[filename])
    for filename in PACKAGE_ROOT_FILES:
        entries[filename] = (ROOT / filename).read_bytes()
        destination = DOWNLOADS / filename
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(entries[filename])
    # Stable metadata makes identical source builds produce identical archives.
    with zipfile.ZipFile(DOWNLOADS / ZIP_NAME, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for filename, content in entries.items():
            info = zipfile.ZipInfo(filename, date_time=(2026, 1, 1, 0, 0, 0))
            info.create_system = 3
            mode = 0o755 if filename.endswith((".command", ".py")) else 0o644
            info.external_attr = (0o100000 | mode) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, content, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def main() -> None:
    html, families, audit = assemble()
    write_package(html)
    digest = hashlib.sha256(html.encode("utf-8")).hexdigest()
    print(f"Standalone HTML: {len(html.encode('utf-8')):,} bytes; SHA-256 {digest}")
    print(f"Identical outputs: dist/index.html and dist/downloads/{HTML_NAME}")
    print(f"Catalog: {families} scenario families; original six missions and three inline visualizations retained")
    print(f"Offline audit passed: {len(audit.scripts)} inline scripts, {len(audit.styles)} local style blocks; no external resource dependencies")
    print(f"Offline ZIP: dist/downloads/{ZIP_NAME} ({(DOWNLOADS / ZIP_NAME).stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
