import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("adapter", Path(__file__).resolve().parents[2] / "scripts/prepare-legacy-fixtures.py")
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.players = [{"TournamentID": "132", "PlayerID": str(i), "DropRound": "0"} for i in range(10)]
        self.matches = []
        for number in range(1, 5):
            for pair in range(5):
                for seat in (0, 1):
                    self.matches.append({"Tournament": "132", "MatchNo": str(number),
                        "PlayerID": str(pair * 2 + seat), "OpponentID": str(pair * 2 + 1 - seat),
                        "TableNo": str(pair), "Placement": str(seat + 1), "GamesWon": str(1 - seat),
                        "GamesLost": str(seat), "MatchPts": "-1"})

    def test_merge_reciprocals(self):
        fixture, identities = adapter.adapt("132", self.players, self.matches, "a" * 64)
        self.assertEqual(len(fixture["rounds"][0]["matches"]), 5)
        self.assertEqual(len(identities), 10)

    def test_missing_reciprocal(self):
        with self.assertRaisesRegex(ValueError, "reciprocal"):
            adapter.adapt("132", self.players, self.matches[1:], "a" * 64)

    def test_conflicting_reciprocal(self):
        self.matches[1]["GamesWon"] = "1"
        with self.assertRaisesRegex(ValueError, "Conflicting"):
            adapter.adapt("132", self.players, self.matches, "a" * 64)

    def test_unknown_participant(self):
        self.matches[0]["OpponentID"] = "NOT_ENROLLED"
        with self.assertRaisesRegex(ValueError, "unknown"):
            adapter.adapt("132", self.players, self.matches, "a" * 64)

    def test_bye_sentinel_is_not_enrolled_or_counted_as_a_player(self):
        players = [{"TournamentID": "134", "PlayerID": str(i), "DropRound": "0"} for i in range(7)]
        matches = []
        for number in range(1, 4):
            for table, pair in enumerate((("0", "1"), ("2", "3"), ("4", "5"), ("6", "BYE"))):
                for seat in (0, 1):
                    matches.append({"Tournament": "134", "MatchNo": str(number),
                        "PlayerID": pair[seat], "OpponentID": pair[1 - seat], "TableNo": str(table),
                        "Placement": str(seat + 1), "GamesWon": str(1 - seat),
                        "GamesLost": str(seat), "MatchPts": "0"})
        fixture, mapping = adapter.adapt("134", players, matches, "a" * 64)
        self.assertNotIn("BYE", mapping)
        for round_data in fixture["rounds"]:
            byes = [m for m in round_data["matches"] if m["isBye"]]
            self.assertEqual(len(byes), 1)
            self.assertIsNone(byes[0]["player2Id"])
            self.assertEqual(byes[0]["winnerId"], byes[0]["player1Id"])


if __name__ == "__main__":
    unittest.main()
