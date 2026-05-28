-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "udeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SWISS',
    "format" TEXT NOT NULL DEFAULT 'CONSTRUCTED',
    "gameId" INTEGER NOT NULL DEFAULT 1,
    "roundCount" INTEGER NOT NULL DEFAULT 4,
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "progress" TEXT NOT NULL DEFAULT 'ACTIVE',
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "dropped" BOOLEAN NOT NULL DEFAULT false,
    "droppedRound" INTEGER,
    CONSTRAINT "Enrollment_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Enrollment_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "tableNumber" INTEGER,
    "player1Id" TEXT,
    "player2Id" TEXT,
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "gamesWon1" INTEGER NOT NULL DEFAULT 0,
    "gamesWon2" INTEGER NOT NULL DEFAULT 0,
    "isBye" BOOLEAN NOT NULL DEFAULT false,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Match_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Standing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "matchPoints" INTEGER NOT NULL DEFAULT 0,
    "omwPct" REAL NOT NULL DEFAULT 0,
    "gwPct" REAL NOT NULL DEFAULT 0,
    "ogwPct" REAL NOT NULL DEFAULT 0,
    "gamesWon" INTEGER NOT NULL DEFAULT 0,
    "gamesLost" INTEGER NOT NULL DEFAULT 0,
    "gamesDrawn" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    CONSTRAINT "Standing_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Standing_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_playerId_tournamentId_key" ON "Enrollment"("playerId", "tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "Standing_playerId_tournamentId_roundNumber_key" ON "Standing"("playerId", "tournamentId", "roundNumber");
