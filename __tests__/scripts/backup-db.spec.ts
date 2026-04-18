import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Tests for the deployed encrypted backup pipeline (scripts/backup-db.sh)
 * and the encrypted-only restore wrapper (scripts/backup-restore.sh).
 *
 * The backup script chains pg_dump → gpg → rclone → swift, none of which
 * are present in CI. We stub each with a tiny shell script on PATH so the
 * pipeline runs end-to-end against a local "fake Swift" directory. The
 * encryption step is real — we then independently decrypt the produced
 * file with the same passphrase to prove the ciphertext round-trips.
 */

const hasGpg = (() => {
    try {
        execFileSync("which", ["gpg"], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
})();

describe("Encrypted database backup pipeline", () => {
    const testRoot = path.join(os.tmpdir(), `backup-db-test-${Date.now()}`);
    const mockBin = path.join(testRoot, "bin");
    const fakeRemote = path.join(testRoot, "swift");
    const backupScript = path.join(process.cwd(), "scripts/backup-db.sh");
    const restoreScript = path.join(process.cwd(), "scripts/backup-restore.sh");
    const passphrase = "test-passphrase-only-used-in-vitest-suite-32chars";
    const mockDumpPayload = "MOCK_PG_DUMP_PAYLOAD_FOR_VITEST_SUITE";

    beforeAll(() => {
        if (!hasGpg) {
            console.warn("⚠️  Skipping backup pipeline tests: gpg is not installed");
            return;
        }

        fs.mkdirSync(mockBin, { recursive: true });
        fs.mkdirSync(fakeRemote, { recursive: true });

        // Stub pg_dump: emit a fixed payload to stdout.
        fs.writeFileSync(
            path.join(mockBin, "pg_dump"),
            `#!/bin/bash\nprintf '%s' '${mockDumpPayload}'\n`,
        );

        // Stub pg_restore: --list mode prints >10 TOC-looking lines so the
        // validation content-line check passes; everything else is a no-op.
        fs.writeFileSync(
            path.join(mockBin, "pg_restore"),
            `#!/bin/bash
if [ "$1" = "--list" ]; then
    cat <<'EOF'
;
; Archive created at 2026-04-14
; dbname: matkassen
;
1; 0 0 ENCODING - ENCODING
2; 0 0 STDSTRINGS - STDSTRINGS
3; 0 0 SEARCHPATH - SEARCHPATH
4; 200 1259 TABLE public households matkassen
5; 200 1259 TABLE public food_parcels matkassen
6; 200 1259 TABLE public users matkassen
7; 200 1259 TABLE public pets matkassen
8; 200 1259 TABLE public pickup_locations matkassen
9; 200 1259 TABLE public household_members matkassen
10; 200 1259 TABLE public sessions matkassen
11; 200 1259 TABLE public accounts matkassen
12; 200 1259 TABLE public verification_tokens matkassen
EOF
    exit 0
fi
cat >/dev/null
exit 0
`,
        );

        // Stub rclone: copy/copyto write into the fake remote dir; lsf and
        // size emit deterministic output for the script's status summary.
        fs.writeFileSync(
            path.join(mockBin, "rclone"),
            `#!/bin/bash
case "$1" in
    version)
        echo "rclone v0.0.0-mock"
        ;;
    copy)
        # rclone copy <src> <remote-spec>. Strip our flags.
        SRC="$2"
        cp "$SRC" "${fakeRemote}/$(basename "$SRC")"
        ;;
    copyto)
        # rclone copyto <remote-spec> <dest>.
        SRC_NAME=$(basename "$2")
        cp "${fakeRemote}/$SRC_NAME" "$3"
        ;;
    about)
        echo "Total: 1 GiB"
        ;;
    lsf)
        ls "${fakeRemote}" 2>/dev/null | grep -E 'matkassen_backup_.*\\.dump\\.gpg$' || true
        ;;
    size)
        echo "Total objects: 1"
        echo "Total size: 1.0 KiB"
        ;;
    *)
        ;;
esac
exit 0
`,
        );

        // Stub swift: X-Delete-After header set is a no-op.
        fs.writeFileSync(path.join(mockBin, "swift"), "#!/bin/bash\nexit 0\n");

        // Stub curl: silence Slack notifications.
        fs.writeFileSync(path.join(mockBin, "curl"), "#!/bin/bash\necho '{\"ok\":true}'\nexit 0\n");

        for (const exe of ["pg_dump", "pg_restore", "rclone", "swift", "curl"]) {
            fs.chmodSync(path.join(mockBin, exe), 0o755);
        }
    });

    afterAll(() => {
        if (fs.existsSync(testRoot)) {
            fs.rmSync(testRoot, { recursive: true, force: true });
        }
    });

    function runBackup(extraEnv: Record<string, string> = {}): {
        stdout: string;
        stderr: string;
    } {
        try {
            const result = execFileSync(backupScript, [], {
                env: {
                    ...process.env,
                    PATH: `${mockBin}:${process.env.PATH}`,
                    DB_BACKUP_PASSPHRASE: passphrase,
                    POSTGRES_HOST: "db",
                    POSTGRES_USER: "matkassen",
                    POSTGRES_DB: "matkassen",
                    POSTGRES_PASSWORD: "test-pw",
                    SWIFT_CONTAINER: "test-container",
                    SWIFT_PREFIX: "backups",
                    BACKUP_RETENTION_DAYS: "14",
                    ...extraEnv,
                },
                stdio: "pipe",
                encoding: "utf-8",
            });
            return { stdout: result, stderr: "" };
        } catch (e: any) {
            return { stdout: e.stdout?.toString() ?? "", stderr: e.stderr?.toString() ?? "" };
        }
    }

    it("aborts when DB_BACKUP_PASSPHRASE is missing", () => {
        if (!hasGpg) return;

        const env = { ...process.env, PATH: `${mockBin}:${process.env.PATH}` };
        delete (env as any).DB_BACKUP_PASSPHRASE;

        let exitCode = 0;
        try {
            execFileSync(backupScript, [], {
                env: {
                    ...env,
                    POSTGRES_HOST: "db",
                    POSTGRES_USER: "matkassen",
                    POSTGRES_DB: "matkassen",
                    POSTGRES_PASSWORD: "test-pw",
                    SWIFT_CONTAINER: "test-container",
                },
                stdio: "pipe",
            });
        } catch (e: any) {
            exitCode = e.status ?? 1;
        }
        expect(exitCode).not.toBe(0);
    });

    it("encrypts the dump, uploads to Swift, and validates the round-trip", () => {
        if (!hasGpg) return;

        // Clean fake remote between tests
        for (const f of fs.readdirSync(fakeRemote)) {
            fs.rmSync(path.join(fakeRemote, f));
        }

        const { stdout } = runBackup();

        expect(stdout).toContain("Backup process completed successfully");
        expect(stdout).toContain("Backup validation OK");

        const uploaded = fs
            .readdirSync(fakeRemote)
            .filter(f => /^matkassen_backup_\d+_\d+\.dump\.gpg$/.test(f));
        expect(uploaded.length).toBe(1);

        // Ciphertext on the remote must not contain the plaintext payload
        const cipherBytes = fs.readFileSync(path.join(fakeRemote, uploaded[0]));
        expect(cipherBytes.includes(Buffer.from(mockDumpPayload))).toBe(false);

        // Independent decrypt with the same passphrase recovers the plaintext.
        // This is the property the production restore depends on.
        const recoveredPath = path.join(testRoot, "recovered.bin");
        try {
            execFileSync(
                "gpg",
                [
                    "--decrypt",
                    "--batch",
                    "--quiet",
                    "--passphrase-fd",
                    "0",
                    "--pinentry-mode",
                    "loopback",
                    "--output",
                    recoveredPath,
                    path.join(fakeRemote, uploaded[0]),
                ],
                { input: passphrase, stdio: ["pipe", "pipe", "pipe"] },
            );
        } catch (e: any) {
            throw new Error(`gpg decrypt failed: ${e.stderr?.toString()}`);
        }
        const recovered = fs.readFileSync(recoveredPath, "utf-8");
        expect(recovered).toBe(mockDumpPayload);
        fs.rmSync(recoveredPath);
    });

    it("decryption fails with the wrong passphrase", () => {
        if (!hasGpg) return;

        for (const f of fs.readdirSync(fakeRemote)) {
            fs.rmSync(path.join(fakeRemote, f));
        }
        runBackup();
        const uploaded = fs.readdirSync(fakeRemote).filter(f => /\.dump\.gpg$/.test(f))[0];

        let failed = false;
        try {
            execFileSync(
                "gpg",
                [
                    "--decrypt",
                    "--batch",
                    "--quiet",
                    "--passphrase-fd",
                    "0",
                    "--pinentry-mode",
                    "loopback",
                    path.join(fakeRemote, uploaded),
                ],
                { input: "wrong-passphrase", stdio: ["pipe", "pipe", "pipe"] },
            );
        } catch {
            failed = true;
        }
        expect(failed).toBe(true);
    });
});

describe("Restore script argument handling", () => {
    it("rejects filenames that don't end in .dump.gpg", () => {
        const restoreScript = path.join(process.cwd(), "scripts/backup-restore.sh");
        let exitCode = 0;
        let stderr = "";
        try {
            execFileSync(restoreScript, ["matkassen_backup_20250101_020000.dump"], {
                env: {
                    ...process.env,
                    ENV_NAME: "production",
                    DB_BACKUP_PASSPHRASE: "anything",
                    SWIFT_CONTAINER: "x",
                },
                stdio: "pipe",
            });
        } catch (e: any) {
            exitCode = e.status ?? 1;
            stderr = (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "");
        }
        expect(exitCode).not.toBe(0);
        expect(stderr).toMatch(/must end in \.dump\.gpg/);
    });

    it("refuses to run outside ENV_NAME=production", () => {
        const restoreScript = path.join(process.cwd(), "scripts/backup-restore.sh");
        let exitCode = 0;
        let stderr = "";
        try {
            execFileSync(restoreScript, ["matkassen_backup_20250101_020000.dump.gpg"], {
                env: {
                    ...process.env,
                    ENV_NAME: "staging",
                    DB_BACKUP_PASSPHRASE: "anything",
                    SWIFT_CONTAINER: "x",
                },
                stdio: "pipe",
            });
        } catch (e: any) {
            exitCode = e.status ?? 1;
            stderr = (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "");
        }
        expect(exitCode).not.toBe(0);
        expect(stderr).toMatch(/ENV_NAME=production/);
    });
});
