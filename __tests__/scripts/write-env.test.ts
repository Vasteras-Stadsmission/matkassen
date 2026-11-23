import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const baseEnv = {
    AUTH_GITHUB_ID: "id",
    AUTH_GITHUB_SECRET: "secret",
    AUTH_GITHUB_APP_ID: "1",
    AUTH_GITHUB_APP_PRIVATE_KEY: "key",
    AUTH_GITHUB_APP_INSTALLATION_ID: "2",
    AUTH_SECRET: "auth",
    DOMAIN_NAME: "example.test",
    EMAIL: "ops@example.test",
    GITHUB_ORG: "org",
    DATABASE_URL: "postgres://u:p@db:5432/d",
    DATABASE_URL_EXTERNAL: "postgres://u:p@localhost:5432/d",
    POSTGRES_DB: "d",
    POSTGRES_PASSWORD: "p",
    POSTGRES_USER: "u",
    BRAND_NAME: "Brand",
};

const backupEnv = {
    DB_BACKUP_PASSPHRASE: "backup-passphrase",
    OS_AUTH_TYPE: "v3applicationcredential",
    OS_AUTH_URL: "https://ops.example.test:5000/v3",
    OS_REGION_NAME: "se-sto",
    OS_INTERFACE: "public",
    OS_IDENTITY_API_VERSION: "3",
    OS_APPLICATION_CREDENTIAL_ID: "cred-id",
    OS_APPLICATION_CREDENTIAL_SECRET: "cred-secret",
    SWIFT_CONTAINER: "container",
    SWIFT_PREFIX: "backups/production",
};

function writeEnv(dir: string, env: Record<string, string>) {
    execFileSync("bash", ["-c", 'source scripts/write-env.sh && write_env_file "$TARGET"'], {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH, NODE_ENV: "test", TARGET: path.join(dir, ".env"), ...env },
        stdio: "pipe",
    });
}

function keys(file: string): string[] {
    return fs
        .readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map(line => line.split("=")[0]);
}

describe("write_env_file", () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "write-env-"));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it("keeps backup secrets out of .env, which the web container loads", () => {
        writeEnv(dir, { ...baseEnv, ...backupEnv, ENV_NAME: "production" });

        const envKeys = keys(path.join(dir, ".env"));
        for (const name of Object.keys(backupEnv)) {
            expect(envKeys).not.toContain(name);
        }

        const backupFile = path.join(dir, ".env.backup");
        expect(keys(backupFile).sort()).toEqual(Object.keys(backupEnv).sort());
        expect(fs.statSync(backupFile).mode & 0o777).toBe(0o600);
    });

    it("writes no backup file on staging", () => {
        writeEnv(dir, { ...baseEnv, ENV_NAME: "staging" });

        expect(fs.existsSync(path.join(dir, ".env"))).toBe(true);
        expect(fs.existsSync(path.join(dir, ".env.backup"))).toBe(false);
    });
});
