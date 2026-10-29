#!/usr/bin/env python3
"""Cut a match into 서브 → 랠리 → 랠리종료 and concatenate those clips.

The scoring rules live in rules.js. This script asks node for the clip list,
then trims the source with ffmpeg.

Usage:
  python3 export_edit.py 프로젝트.json 영상.mp4 -o 편집.mp4
  python3 export_edit.py 프로젝트.json --dry-run
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def node_bin() -> str:
    return shutil.which("node") or "/exec-daemon/node"


def compute(project_path: Path) -> dict:
    rules = Path(__file__).with_name("rules.js")
    script = r"""
const fs = require('fs');
const rules = require(process.argv[1]);
const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const body = raw && raw.match && Array.isArray(raw.match.points) ? raw.match : raw;
const normalized = rules.normalize(body);
if (!normalized.ok) {
  console.error(normalized.reason);
  process.exit(2);
}
const view = rules.project(normalized.match);
const built = rules.buildClips(view.annotated);
if (!built.ok) {
  console.error(built.reason);
  process.exit(3);
}
if (!built.clips.length) {
  console.error('자를 포인트가 없습니다.');
  process.exit(4);
}
process.stdout.write(JSON.stringify({
  names: normalized.match.names,
  clips: built.clips,
  warning: rules.timelineWarning(built.clips)
}));
"""
    proc = subprocess.run(
        [node_bin(), "-e", script, str(rules), str(project_path)],
        check=False,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        message = (proc.stderr or proc.stdout or "규칙 계산에 실패했습니다.").strip()
        raise SystemExit(message)
    return json.loads(proc.stdout)


def find_font(explicit: str | None) -> str | None:
    if explicit:
        if Path(explicit).is_file():
            return explicit
        raise SystemExit("글꼴 파일을 찾을 수 없습니다: " + explicit)
    candidates = [
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
        "/usr/share/fonts/truetype/nanum/NanumBarunGothic.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    ]
    for candidate in candidates:
        if Path(candidate).is_file():
            return candidate
    try:
        matched = subprocess.check_output(
            ["fc-match", "-f", "%{file}", ":lang=ko"],
            text=True,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return None
    if matched and Path(matched).is_file() and "wqy" not in matched.lower():
        return matched
    return None


def srt_time(seconds: float) -> str:
    total = max(0, int(round(seconds * 1000)))
    hours, total = divmod(total, 3_600_000)
    minutes, total = divmod(total, 60_000)
    secs, millis = divmod(total, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def clip_caption(clip: dict, names: dict) -> str:
    score = clip["scoreAfter"] if clip["phase"] == "end" else clip["scoreBefore"]
    lines = [
        clip["label"],
        f"{names['near']} {score['near']} - {score['far']} {names['far']}",
    ]
    if clip["phase"] == "serve":
        side = "화면 왼쪽" if clip["camera"] == "left" else "화면 오른쪽"
        lines.append(side + "에서 서브")
    elif clip["phase"] == "end":
        who = names[clip["winner"]]
        lines.append(who + " 득점")
    return "\n".join(lines)


def write_srt(clips: list, names: dict, path: Path) -> None:
    cursor = 0.0
    blocks = []
    for index, clip in enumerate(clips, start=1):
        length = clip["end"] - clip["start"]
        blocks.append(
            "\n".join(
                [
                    str(index),
                    srt_time(cursor) + " --> " + srt_time(cursor + length),
                    clip_caption(clip, names),
                    "",
                ]
            )
        )
        cursor += length
    path.write_text("\n".join(blocks), encoding="utf-8")


def concat_line(path: Path) -> str:
    return "file '" + str(path).replace("'", "'\\''") + "'\n"


def run_ffmpeg(args: list[str]) -> None:
    proc = subprocess.run(args, check=False, capture_output=True, text=True)
    if proc.returncode != 0:
        tail = (proc.stderr or "").strip().splitlines()[-20:]
        raise SystemExit("ffmpeg 실패\n" + "\n".join(tail))


def export_video(video: Path, clips: list, names: dict, output: Path, font: str | None) -> None:
    if not shutil.which("ffmpeg"):
        raise SystemExit("ffmpeg이 없습니다.")
    if not video.is_file():
        raise SystemExit("영상 파일을 찾을 수 없습니다: " + str(video))
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="rally-edit-") as tmp:
        folder = Path(tmp)
        parts = []
        for index, clip in enumerate(clips):
            part = folder / f"clip-{index:03d}.mp4"
            caption = folder / f"clip-{index:03d}.txt"
            caption.write_text(clip_caption(clip, names), encoding="utf-8")
            start = float(clip["start"])
            duration = float(clip["end"]) - start
            preroll = min(1.0, start)
            filters = [
                "scale=1280:720:force_original_aspect_ratio=decrease",
                "pad=1280:720:(ow-iw)/2:(oh-ih)/2:black",
                "setsar=1",
            ]
            if font:
                filters.append(
                    "drawtext=fontfile='{}':textfile='{}':fontsize=32:fontcolor=white:"
                    "box=1:boxcolor=black@0.55:boxborderw=14:x=28:y=28:line_spacing=8".format(
                        font.replace("'", r"\'"),
                        str(caption).replace("'", r"\'"),
                    )
                )
            cmd = [
                "ffmpeg", "-y",
                "-ss", f"{start - preroll:.3f}",
                "-i", str(video),
                "-ss", f"{preroll:.3f}",
                "-t", f"{duration:.3f}",
                "-map", "0:v:0",
                "-map", "0:a:0?",
                "-vf", ",".join(filters),
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-crf", "20",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-ar", "48000",
                "-movflags", "+faststart",
                str(part),
            ]
            run_ffmpeg(cmd)
            parts.append(part)
        listing = folder / "concat.txt"
        listing.write_text("".join(concat_line(part) for part in parts), encoding="utf-8")
        run_ffmpeg(
            [
                "ffmpeg", "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", str(listing),
                "-c", "copy",
                "-movflags", "+faststart",
                str(output),
            ]
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="서브, 랠리, 랠리종료 순서로 배드민턴 영상을 자릅니다.")
    parser.add_argument("project", type=Path, help="편집 화면에서 저장한 JSON")
    parser.add_argument("video", nargs="?", type=Path, help="원본 영상")
    parser.add_argument("-o", "--output", type=Path, default=Path("편집.mp4"))
    parser.add_argument("--font", help="한글 글꼴 파일")
    parser.add_argument("--dry-run", action="store_true", help="자르지 않고 구간만 출력합니다.")
    args = parser.parse_args()

    payload = compute(args.project)
    if payload.get("warning"):
        print(payload["warning"], file=sys.stderr)
    if args.dry_run:
        json.dump(payload["clips"], sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return
    if args.video is None:
        raise SystemExit("영상 파일 경로가 필요합니다.")
    font = find_font(args.font)
    if font is None:
        print("한글 글꼴이 없어 점수 글자 없이 자르고, 자막 파일은 따로 만듭니다.", file=sys.stderr)
    srt_path = args.output.with_suffix(".srt")
    write_srt(payload["clips"], payload["names"], srt_path)
    export_video(args.video, payload["clips"], payload["names"], args.output, font)
    print(str(args.output))
    print(str(srt_path))


if __name__ == "__main__":
    main()
