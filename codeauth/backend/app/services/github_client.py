"""
GitHub access layer.

Talks to the GitHub REST API over HTTPS only — no `git` binary, no shell, no
clone. That keeps the attack surface to "we download a zip and read text files".

Hardening applied here, because every input is a user-supplied URL:

  * Host allow-list. Only api.github.com and codeload.github.com are ever
    contacted, so a crafted URL cannot turn this into an SSRF probe of the
    internal network.
  * owner/repo/ref are validated against GitHub's own naming rules before they
    reach a URL, so no path traversal or query injection.
  * The archive download is streamed with a hard byte ceiling and aborted the
    moment it is exceeded, so a huge or self-inflating repository cannot exhaust
    memory or disk.
  * Zip entries are checked for traversal and for total uncompressed size before
    extraction, which stdlib extractall does not do for you.
  * Tokens are read from the environment or passed per-request, sent only in the
    Authorization header, and never logged or persisted.
"""
from __future__ import annotations

import logging
import os
import re
import shutil
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import requests

logger = logging.getLogger(__name__)

API_HOST = "api.github.com"
CODELOAD_HOST = "codeload.github.com"
ALLOWED_HOSTS = {API_HOST, CODELOAD_HOST}
API_BASE = f"https://{API_HOST}"

# GitHub's own constraints on these identifiers.
OWNER_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$")
REPO_RE = re.compile(r"^[A-Za-z0-9._-]{1,100}$")
REF_RE = re.compile(r"^[A-Za-z0-9._/-]{1,255}$")

DEFAULT_TIMEOUT = (10, 60)  # (connect, read)
MAX_ARCHIVE_BYTES = 120 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 600 * 1024 * 1024
MAX_ZIP_ENTRIES = 20_000


class GitHubError(Exception):
    """Raised for anything the caller should see as a 4xx."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


@dataclass
class RepoRef:
    owner: str
    repo: str
    ref: Optional[str] = None

    @property
    def slug(self) -> str:
        return f"{self.owner}/{self.repo}"


def parse_repo_reference(value: str) -> RepoRef:
    """
    Accept the shapes people actually paste:
        https://github.com/owner/repo
        https://github.com/owner/repo.git
        https://github.com/owner/repo/tree/branch/name
        git@github.com:owner/repo.git
        owner/repo
    """
    raw = (value or "").strip()
    if not raw:
        raise GitHubError("Provide a repository URL or owner/repo.")

    ref: Optional[str] = None

    if raw.startswith("git@"):
        # git@github.com:owner/repo.git
        _, _, tail = raw.partition(":")
        parts = tail.removesuffix(".git").split("/")
    elif "://" in raw:
        parsed = urlparse(raw)
        host = (parsed.hostname or "").lower()
        if host not in {"github.com", "www.github.com", API_HOST}:
            raise GitHubError(
                f"Only github.com repositories are supported (got '{host or 'unknown host'}')."
            )
        segments = [s for s in parsed.path.split("/") if s]
        if len(segments) >= 4 and segments[2] in {"tree", "blob"}:
            ref = "/".join(segments[3:])
            segments = segments[:2]
        parts = [s.removesuffix(".git") for s in segments[:2]]
    else:
        parts = [s.removesuffix(".git") for s in raw.split("/") if s]

    if len(parts) < 2:
        raise GitHubError("Could not read owner and repository from that value.")

    owner, repo = parts[0], parts[1]
    if not OWNER_RE.match(owner):
        raise GitHubError(f"Invalid repository owner: '{owner}'.")
    if not REPO_RE.match(repo):
        raise GitHubError(f"Invalid repository name: '{repo}'.")
    if ref is not None and not REF_RE.match(ref):
        raise GitHubError(f"Invalid git ref: '{ref}'.")

    return RepoRef(owner=owner, repo=repo, ref=ref)


class GitHubClient:
    """Thin, defensive wrapper over the handful of endpoints CodeAuth needs."""

    def __init__(self, token: Optional[str] = None):
        # An explicit per-request token wins; otherwise fall back to the env.
        self.token = (token or os.getenv("GITHUB_TOKEN") or "").strip() or None
        self.session = requests.Session()
        self.session.headers.update({
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "CodeAuth-Authorship-Analyzer",
        })
        if self.token:
            self.session.headers["Authorization"] = f"Bearer {self.token}"

        self.rate_limit_remaining: Optional[int] = None

    # ── internals ────────────────────────────────────────────────────

    def _guard_url(self, url: str) -> None:
        host = (urlparse(url).hostname or "").lower()
        if host not in ALLOWED_HOSTS:
            raise GitHubError(f"Refusing to contact host '{host}'.", status=400)

    def _get(self, endpoint: str, params: Optional[dict] = None) -> dict | list:
        # `endpoint`, not `path`: GitHub takes a `path` query parameter, and a
        # **kwargs signature let it collide with the positional argument.
        url = endpoint if endpoint.startswith("http") else f"{API_BASE}{endpoint}"
        self._guard_url(url)
        try:
            resp = self.session.get(url, params=params or None, timeout=DEFAULT_TIMEOUT)
        except requests.RequestException as exc:
            raise GitHubError(f"Could not reach GitHub: {exc}", status=502) from exc

        remaining = resp.headers.get("X-RateLimit-Remaining")
        if remaining is not None:
            try:
                self.rate_limit_remaining = int(remaining)
            except ValueError:
                pass

        if resp.status_code == 404:
            raise GitHubError(
                "Repository, ref, or path not found. Private repositories need a token.",
                status=404,
            )
        if resp.status_code in (401, 403):
            if self.rate_limit_remaining == 0:
                raise GitHubError(
                    "GitHub rate limit exhausted. Set GITHUB_TOKEN on the backend to raise it "
                    "from 60 to 5000 requests/hour.",
                    status=429,
                )
            raise GitHubError(
                "GitHub denied the request. A token with 'repo' scope is required for private "
                "repositories.",
                status=403,
            )
        if resp.status_code >= 400:
            raise GitHubError(f"GitHub returned {resp.status_code}.", status=502)

        return resp.json()

    # ── public API ───────────────────────────────────────────────────

    def get_repository(self, ref: RepoRef) -> dict:
        data = self._get(f"/repos/{ref.owner}/{ref.repo}")
        assert isinstance(data, dict)
        return {
            "full_name": data.get("full_name"),
            "description": data.get("description"),
            "default_branch": data.get("default_branch"),
            "language": data.get("language"),
            "size_kb": data.get("size"),
            "stars": data.get("stargazers_count"),
            "forks": data.get("forks_count"),
            "is_private": data.get("private"),
            "is_fork": data.get("fork"),
            "created_at": data.get("created_at"),
            "pushed_at": data.get("pushed_at"),
            "license": (data.get("license") or {}).get("spdx_id"),
            "html_url": data.get("html_url"),
        }

    def list_commits(self, ref: RepoRef, path: Optional[str] = None, limit: int = 30) -> list[dict]:
        """Commit history, newest first. `path` narrows it to one file."""
        params: dict = {"per_page": max(1, min(limit, 100))}
        if ref.ref:
            params["sha"] = ref.ref
        if path:
            params["path"] = path

        data = self._get(f"/repos/{ref.owner}/{ref.repo}/commits", params=params)
        if not isinstance(data, list):
            return []

        out = []
        for item in data[:limit]:
            commit = item.get("commit") or {}
            author = commit.get("author") or {}
            out.append({
                "sha": item.get("sha", ""),
                "short_sha": (item.get("sha") or "")[:8],
                # Author name/email come from the public commit object. Names are
                # retained because they are the authorship signal; nothing else
                # about the person is stored.
                "author_name": author.get("name"),
                "date": author.get("date"),
                "message": (commit.get("message") or "").split("\n")[0][:200],
                "html_url": item.get("html_url"),
            })
        return out

    def get_file_at_commit(self, ref: RepoRef, path: str, sha: str) -> Optional[str]:
        """Raw text of one file at one commit, or None if absent/binary/too big."""
        if not path or ".." in path.split("/"):
            raise GitHubError("Invalid file path.")
        if not re.match(r"^[0-9a-fA-F]{7,40}$", sha):
            raise GitHubError("Invalid commit sha.")

        try:
            data = self._get(f"/repos/{ref.owner}/{ref.repo}/contents/{path}", params={"ref": sha})
        except GitHubError as exc:
            if exc.status == 404:
                return None
            raise

        if not isinstance(data, dict) or data.get("type") != "file":
            return None
        if (data.get("size") or 0) > 1_000_000:
            return None

        import base64
        try:
            return base64.b64decode(data.get("content", "")).decode("utf-8", errors="replace")
        except Exception:
            return None

    def list_tree_paths(self, ref: RepoRef, branch: str) -> list[str]:
        """Every blob path at a ref, via one recursive tree call."""
        data = self._get(f"/repos/{ref.owner}/{ref.repo}/git/trees/{branch}", params={"recursive": "1"})
        if not isinstance(data, dict):
            return []
        return [
            node["path"] for node in data.get("tree", [])
            if node.get("type") == "blob" and node.get("path")
        ]

    def download_archive(self, ref: RepoRef, branch: str) -> Path:
        """
        Stream the zipball into a temp dir and extract it safely.

        Returns the directory holding the extracted tree. The caller owns it and
        must remove it. Raises GitHubError if any ceiling is breached.
        """
        url = f"{API_BASE}/repos/{ref.owner}/{ref.repo}/zipball/{branch}"
        self._guard_url(url)

        temp_dir = Path(tempfile.mkdtemp(prefix="codeauth_gh_"))
        archive = temp_dir / "repo.zip"

        try:
            with self.session.get(url, stream=True, timeout=DEFAULT_TIMEOUT,
                                  allow_redirects=True) as resp:
                for hop in resp.history:
                    self._guard_url(hop.headers.get("Location", url) or url)
                if resp.status_code >= 400:
                    raise GitHubError(
                        f"Could not download archive (HTTP {resp.status_code}).",
                        status=502 if resp.status_code >= 500 else 404,
                    )

                written = 0
                with archive.open("wb") as fh:
                    for chunk in resp.iter_content(chunk_size=1 << 16):
                        if not chunk:
                            continue
                        written += len(chunk)
                        if written > MAX_ARCHIVE_BYTES:
                            raise GitHubError(
                                f"Archive exceeds the {MAX_ARCHIVE_BYTES // (1024 * 1024)} MB limit.",
                                status=413,
                            )
                        fh.write(chunk)

            extracted = temp_dir / "extracted"
            extracted.mkdir()
            _safe_extract(archive, extracted)
            archive.unlink(missing_ok=True)
            return extracted
        except Exception:
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise


def _safe_extract(archive: Path, destination: Path) -> None:
    """Extract a zip, refusing traversal, links, and decompression bombs."""
    with zipfile.ZipFile(archive) as zf:
        infos = zf.infolist()
        if len(infos) > MAX_ZIP_ENTRIES:
            raise GitHubError(f"Archive has more than {MAX_ZIP_ENTRIES} entries.", status=413)

        total = sum(i.file_size for i in infos)
        if total > MAX_UNCOMPRESSED_BYTES:
            raise GitHubError(
                f"Archive expands to {total // (1024 * 1024)} MB, over the "
                f"{MAX_UNCOMPRESSED_BYTES // (1024 * 1024)} MB limit.",
                status=413,
            )

        root = destination.resolve()
        for info in infos:
            if info.is_dir():
                continue
            # Symlinks are stored with this mode; following them escapes the sandbox.
            if (info.external_attr >> 16) & 0o170000 == 0o120000:
                continue
            target = (root / info.filename).resolve()
            if not str(target).startswith(str(root) + os.sep):
                raise GitHubError(f"Archive entry escapes the extraction root: {info.filename}", status=400)
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, target.open("wb") as dst:
                shutil.copyfileobj(src, dst, length=1 << 16)
