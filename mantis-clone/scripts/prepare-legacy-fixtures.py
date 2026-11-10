#!/usr/bin/env python3
"""Read-only extraction of the two legacy cases; never computes standings."""
import argparse
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
CASES = {"132": (10, 4), "134": (7, 3)}


def adapt(tournament_id, players, matches, database_hash):
    expected_players, expected_rounds = CASES[tournament_id]
    enrolled = [p for p in players if p["TournamentID"] == tournament_id]
    ids = sorted(p["PlayerID"] for p in enrolled)
    if len(ids) != expected_players or len(set(ids)) != len(ids):
        raise ValueError(f"{tournament_id}: unexpected or duplicate enrollments")
    if any(p["DropRound"] not in ("", "0") for p in enrolled):
        raise ValueError(f"{tournament_id}: drops require a different replay scenario")
    aliases = {pid: f"P{i + 1:02}" for i, pid in enumerate(ids)}
    rows = [m for m in matches if m["Tournament"] == tournament_id]
    if {int(m["MatchNo"]) for m in rows} != set(range(1, expected_rounds + 1)):
        raise ValueError(f"{tournament_id}: missing or unexpected round")
    rounds = []
    for number in range(1, expected_rounds + 1):
        current = [m for m in rows if int(m["MatchNo"]) == number]
        groups = {}
        for row in current:
            pid, opponent = row["PlayerID"], row["OpponentID"]
            if pid not in aliases and pid != "BYE" or opponent not in aliases and opponent != "BYE":
                raise ValueError(f"{tournament_id}/{number}: unknown participant")
            if pid == opponent:
                raise ValueError("Self pairing")
            groups.setdefault(tuple(sorted((pid, opponent))), []).append(row)
        seen, encounters = set(), []
        for pair in sorted(groups, key=lambda key: int(groups[key][0]["TableNo"])):
            pair_rows = groups[pair]
            if len(pair_rows) != 2:
                raise ValueError(f"{tournament_id}/{number}: missing reciprocal row")
            a, b = sorted(pair_rows, key=lambda row: int(row["Placement"]))
            if (a["Placement"], b["Placement"]) != ("1", "2"):
                raise ValueError("Placement must identify seats 1 and 2, not ranking")
            if a["PlayerID"] != b["OpponentID"] or b["PlayerID"] != a["OpponentID"]:
                raise ValueError("Non-reciprocal pairing")
            if a["TableNo"] != b["TableNo"]:
                raise ValueError("Different tables in reciprocal rows")
            if (a["GamesWon"], a["GamesLost"]) not in (("1", "0"), ("0", "1")):
                raise ValueError("Unsupported or unreported legacy result")
            if (a["GamesWon"], a["GamesLost"]) != (b["GamesLost"], b["GamesWon"]):
                raise ValueError("Conflicting reciprocal results")
            participants = [row["PlayerID"] for row in (a, b) if row["PlayerID"] != "BYE"]
            if any(pid in seen for pid in participants):
                raise ValueError("Participant paired twice in a round")
            seen.update(participants)
            winner = a["PlayerID"] if a["GamesWon"] == "1" else b["PlayerID"]
            if winner == "BYE":
                raise ValueError("The BYE sentinel cannot win")
            is_bye = "BYE" in pair
            p1 = aliases[participants[0]] if is_bye else aliases[a["PlayerID"]]
            p2 = None if is_bye else aliases[b["PlayerID"]]
            encounters.append({
                "tableNumber": int(a["TableNo"]), "player1Id": p1, "player2Id": p2,
                "winnerId": aliases[winner], "isBye": is_bye,
                "legacyRows": [{"playerId": aliases.get(row["PlayerID"], "BYE"),
                    "gamesWon": int(row["GamesWon"]), "gamesLost": int(row["GamesLost"]),
                    "matchPts": int(row["MatchPts"]), "placement": int(row["Placement"])}
                    for row in (a, b)],
            })
        if seen != set(ids):
            raise ValueError(f"{tournament_id}/{number}: participant missing from round")
        if sum(m["isBye"] for m in encounters) != expected_players % 2:
            raise ValueError("Unexpected number of byes")
        rounds.append({"number": number, "matches": encounters})
    return {"schemaVersion": 1, "legacyTournamentId": tournament_id,
        "sourceDatabaseSha256": database_hash, "game": "YU", "type": "SWISS",
        "format": "CONSTRUCTED", "players": list(aliases.values()), "rounds": rounds}, aliases


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mdb", type=Path, default=ROOT.parent / "Mantis/Mantis.mdb")
    parser.add_argument("--output", type=Path, default=ROOT / "tests/fixtures/legacy")
    args = parser.parse_args()
    local = ROOT.parent / ".mdbtools-local/extracted"
    binary = local / "usr/bin/mdb-export"
    env = os.environ.copy()
    if binary.exists():
        env["LD_LIBRARY_PATH"] = ":".join(str(local / p) for p in
            ("usr/lib/x86_64-linux-gnu", "lib/x86_64-linux-gnu")) + ":" + env.get("LD_LIBRARY_PATH", "")
    else:
        binary = shutil.which("mdb-export")
        if not binary:
            raise RuntimeError("mdb-export unavailable; install mdbtools")
    def export(table):
        data = subprocess.check_output([str(binary), str(args.mdb), table], env=env, text=True)
        return list(csv.DictReader(io.StringIO(data)))
    players, matches, tournaments = export("TournamentPlayer"), export("TournamentMatch"), export("Tournament")
    digest = hashlib.sha256(args.mdb.read_bytes()).hexdigest()
    private = ROOT / ".legacy-local"
    private.mkdir(mode=0o700, exist_ok=True)
    args.output.mkdir(parents=True, exist_ok=True)
    for tid in CASES:
        metadata = next(t for t in tournaments if t["TournamentID"] == tid)
        if (metadata["Game"], metadata["TournamentTypeID"], metadata["Format"]) != ("YU", "1", "1"):
            raise ValueError(f"{tid}: unexpected game, pairing structure or format")
        fixture, mapping = adapt(tid, players, matches, digest)
        (args.output / f"{tid}.json").write_text(json.dumps(fixture, indent=2) + "\n")
        mapping_file = private / f"{tid}.identities.json"
        fd = os.open(mapping_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as output:
            json.dump(mapping, output, indent=2)
        print(f"{tid}: {len(fixture['players'])} aliases, {len(fixture['rounds'])} rounds; standings NOT generated")


if __name__ == "__main__":
    main()
