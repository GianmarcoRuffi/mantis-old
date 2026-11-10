import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");
const prismaDir = resolve(rootDir, "prisma");
const targetDb = resolve(prismaDir, "test.db");
const envFile = resolve(rootDir, ".env");

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (!existsSync(envFile)) return "file:./dev.db";

  const line = readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .find((value) => /^\s*DATABASE_URL\s*=/.test(value));
  if (!line) return "file:./dev.db";

  const value = line.slice(line.indexOf("=") + 1).trim();
  return value.replace(
    /^(?:"([\s\S]*)"|'([\s\S]*)')\s*(?:#.*)?$/,
    (_, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted,
  );
}

function resolveSqlitePath(databaseUrl) {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL deve indicare un file SQLite (file:...).");
  }

  const rawPath = databaseUrl.slice("file:".length).split(/[?#]/, 1)[0];
  if (!rawPath) throw new Error("DATABASE_URL non contiene il percorso del database.");

  const decodedPath = decodeURIComponent(rawPath);
  return resolve(prismaDir, decodedPath);
}

const sourceDb = resolveSqlitePath(readDatabaseUrl());

if (!existsSync(sourceDb)) {
  console.error(`Database sorgente non trovata: ${sourceDb}`);
  process.exit(1);
}

if (existsSync(targetDb)) {
  console.error(
    `Il database di test esiste già: ${targetDb}. Rimuovilo prima di rigenerare la copia.`,
  );
  process.exit(1);
}

if (sourceDb === targetDb) {
  console.error("Il database sorgente coincide con quello di test; copia annullata.");
  process.exit(1);
}

let targetCreated = false;
try {
  const backup = execFileSync(
    "python3",
    [
      "-c",
      `import json, os, sqlite3, sys, tempfile
source, target = sys.argv[1:]
temporary = None
try:
    fd, temporary = tempfile.mkstemp(prefix=".mantis-test-", suffix=".db", dir=os.path.dirname(target))
    os.close(fd)
    with sqlite3.connect(source) as origin, sqlite3.connect(temporary) as copy:
        origin.backup(copy)
        integrity = copy.execute("PRAGMA integrity_check").fetchone()[0]
        violations = copy.execute("PRAGMA foreign_key_check").fetchall()
        if integrity != "ok" or violations:
            raise RuntimeError("verifica integrita o chiavi esterne non superata")
        counts = {table: copy.execute('SELECT COUNT(*) FROM "' + table + '"').fetchone()[0] for table in ("Player", "Tournament", "Enrollment", "Match", "Standing", "TournamentSnapshot")}
    os.link(temporary, target)
    print(json.dumps({"integrity": integrity, "foreignKeyViolations": len(violations), "counts": counts}))
finally:
    if temporary and os.path.exists(temporary):
        os.unlink(temporary)`,
      sourceDb,
      targetDb,
    ],
    { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  targetCreated = true;
  const result = JSON.parse(backup);
  console.log(`Copia SQLite consistente creata: ${targetDb}`);
  console.log(`Integrita: ${result.integrity}; violazioni FK: ${result.foreignKeyViolations}.`);
  console.log(
    `Record copiati: ${Object.entries(result.counts).map(([table, count]) => `${table}=${count}`).join(", ")}.`,
  );
} catch (error) {
  console.error("Creazione o verifica della copia di test non riuscita.", error.message);
  if (targetCreated && existsSync(targetDb)) unlinkSync(targetDb);
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: "file:./test.db" };
try {
  execFileSync("npx", ["prisma", "migrate", "status"], {
    cwd: rootDir,
    env,
    stdio: "inherit",
  });
} catch (error) {
  console.error("Controllo migrazioni fallito: la copia di test è stata rimossa.", error.message);
  if (existsSync(targetDb)) unlinkSync(targetDb);
  process.exit(1);
}

console.log("Database di test pronto: integrità e migrazioni verificati.");
