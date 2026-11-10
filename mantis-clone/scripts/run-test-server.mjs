import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");
const targetDb = resolve(rootDir, "prisma", "test.db");
const nextBin = resolve(rootDir, "node_modules", "next", "dist", "bin", "next");
const subcommand = process.argv[2];
const portValue = process.env.MANTIS_TEST_PORT ?? "3000";
const port = Number(portValue);

if (!["dev", "start"].includes(subcommand)) {
  console.error('Comando non valido. Usa "npm run dev:test" oppure "npm run start:test".');
  process.exit(1);
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("MANTIS_TEST_PORT deve essere un numero compreso tra 1 e 65535.");
  process.exit(1);
}

if (!existsSync(targetDb)) {
  console.error(
    `Database di test non trovato: ${targetDb}. Esegui prima "npm run db:test:prepare".`,
  );
  process.exit(1);
}

if (!existsSync(nextBin)) {
  console.error(`Eseguibile Next.js non trovato: ${nextBin}`);
  process.exit(1);
}

const env = {
  ...process.env,
  DATABASE_URL: "file:./test.db",
  HOST: "127.0.0.1",
  PORT: String(port),
};

const child = spawn(
  process.execPath,
  [nextBin, subcommand, "--hostname", "127.0.0.1", "--port", String(port)],
  {
    cwd: rootDir,
    env,
    stdio: "inherit",
    shell: false,
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error("Errore nell avvio del server di test:", error.message);
  process.exit(1);
});
