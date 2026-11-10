PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Standing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "matchPoints" INTEGER NOT NULL DEFAULT 0,
    "tiebreaker1" INTEGER NOT NULL DEFAULT 0,
    "tiebreaker2" INTEGER NOT NULL DEFAULT 0,
    "tiebreaker3" INTEGER NOT NULL DEFAULT 0,
    "gamesWon" INTEGER NOT NULL DEFAULT 0,
    "gamesLost" INTEGER NOT NULL DEFAULT 0,
    "gamesDrawn" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    CONSTRAINT "Standing_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Standing_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Standing" (
    "id",
    "playerId",
    "tournamentId",
    "roundNumber",
    "matchPoints",
    "tiebreaker1",
    "tiebreaker2",
    "tiebreaker3",
    "gamesWon",
    "gamesLost",
    "gamesDrawn",
    "rank"
)
SELECT
    "id",
    "playerId",
    "tournamentId",
    "roundNumber",
    "matchPoints",
    "tiebreaker1",
    "tiebreaker2",
    "tiebreaker3",
    "gamesWon",
    "gamesLost",
    "gamesDrawn",
    "rank"
FROM "Standing";

DROP TABLE "Standing";

ALTER TABLE "new_Standing" RENAME TO "Standing";

CREATE UNIQUE INDEX "Standing_playerId_tournamentId_roundNumber_key" ON "Standing"("playerId", "tournamentId", "roundNumber");

PRAGMA foreign_keys=ON;