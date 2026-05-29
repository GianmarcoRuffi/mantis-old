-- CreateTable
CREATE TABLE "TournamentSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "roundNumber" INTEGER,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TournamentSnapshot_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TournamentSnapshot_tournamentId_createdAt_idx" ON "TournamentSnapshot"("tournamentId", "createdAt");